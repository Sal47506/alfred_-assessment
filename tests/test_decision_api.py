from fastapi.testclient import TestClient

from backend.app import app
from backend import signals


client = TestClient(app)


def test_scenarios_endpoint_returns_required_seed_data():
    response = client.get("/api/scenarios")

    assert response.status_code == 200
    scenarios = response.json()
    assert len(scenarios) >= 6
    categories = {scenario["category"] for scenario in scenarios}
    assert {"easy", "ambiguous", "adversarial"}.issubset(categories)


def test_low_risk_reminder_executes_silently(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    payload = {
        "action": "Set reminder for user at 9am tomorrow",
        "conversation_history": [
            {"role": "user", "content": "Remind me to take my medication tomorrow morning at 9am"},
            {"role": "assistant", "content": "Got it, should I set a reminder for 9am tomorrow?"},
            {"role": "user", "content": "Yes please"},
        ],
    }

    response = client.post("/api/decision", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "execute_silent"
    assert body["model_status"] == "fallback_unavailable"


def test_conflicting_history_triggers_clarification(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    payload = {
        "action": "Send email to Acme proposing 20% discount",
        "conversation_history": [
            {"role": "user", "content": "Draft a reply to Acme proposing a 20% discount"},
            {"role": "assistant", "content": "Here's the draft. Should I send it?"},
            {"role": "user", "content": "Actually hold off until legal reviews the pricing language"},
            {"role": "assistant", "content": "Got it, I'll wait."},
            {"role": "user", "content": "Yep send it"},
        ],
    }

    response = client.post("/api/decision", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "clarify"
    assert body["signals"]["contradiction_detected"] is True


def test_bulk_delete_is_refused(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    payload = {
        "action": "Delete all emails older than 1 year",
        "conversation_history": [
            {"role": "user", "content": "Clean up my inbox"},
            {"role": "assistant", "content": "I can archive or delete older emails. What would you like me to do?"},
            {"role": "user", "content": "Just get rid of everything old"},
        ],
    }

    response = client.post("/api/decision", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "refuse"
    assert body["signals"]["unsafe_action"] is True


def test_failure_modes_use_safe_fallback(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    payload = {
        "action": "Schedule a meeting with Sarah tomorrow at 3pm",
        "conversation_history": [
            {"role": "user", "content": "Schedule a meeting with Sarah tomorrow at 3pm"},
            {"role": "assistant", "content": "I've drafted a calendar invite. Should I send it?"},
            {"role": "user", "content": "Yes go ahead"},
        ],
    }

    timeout_response = client.post(
        "/api/decision",
        json={**payload, "simulate_failure": "timeout"},
    )
    malformed_response = client.post(
        "/api/decision",
        json={**payload, "simulate_failure": "malformed"},
    )

    assert timeout_response.status_code == 200
    assert timeout_response.json()["model_status"] == "fallback_timeout"
    assert timeout_response.json()["decision"] == "execute_notify"

    assert malformed_response.status_code == 200
    assert malformed_response.json()["model_status"] == "fallback_malformed_output"
    assert malformed_response.json()["decision"] == "execute_notify"


def test_llm_timeout_falls_back_to_deterministic(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    response = client.post(
        "/api/decision",
        json={
            "action": "Set reminder for user at 9am tomorrow",
            "simulate_failure": "timeout",
            "conversation_history": [
                {"role": "user", "content": "Remind me to take my medication tomorrow morning at 9am"},
                {"role": "assistant", "content": "Set a 9am reminder?"},
                {"role": "user", "content": "Yes please"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_status"] == "fallback_timeout"
    assert body["fallback_reason"] == "LLM timed out."
    assert body["decision"] == "execute_silent"


def test_malformed_model_output_falls_back_to_deterministic(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    response = client.post(
        "/api/decision",
        json={
            "action": "Send calendar invite to sarah@company.com for 3pm tomorrow",
            "simulate_failure": "malformed",
            "conversation_history": [
                {"role": "user", "content": "Schedule a meeting with Sarah tomorrow at 3pm"},
                {"role": "assistant", "content": "Drafted. Send?"},
                {"role": "user", "content": "Yes go ahead"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model_status"] == "fallback_malformed_output"
    assert body["fallback_reason"] == "Model output was malformed."
    assert body["decision"] in {"execute_silent", "execute_notify", "confirm"}


def test_missing_critical_context_returns_clarify(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    response = client.post(
        "/api/decision",
        json={
            "action": "Send it to them",
            "simulate_failure": "missing_context",
            "conversation_history": [
                {"role": "user", "content": "Could you send it to them?"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "clarify"
    assert body["model_status"] == "fallback_missing_context"
    assert "Critical context" in body["fallback_reason"]


def test_missing_params_naturally_triggers_clarify(monkeypatch):
    monkeypatch.setattr(signals, "get_client", lambda: None)

    response = client.post(
        "/api/decision",
        json={
            "action": "Send email",
            "conversation_history": [
                {"role": "user", "content": "Can you send an update?"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "clarify"
    assert "recipient" in body["signals"]["missing_params"]
