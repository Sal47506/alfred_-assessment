import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter
from openai import OpenAI

from backend.models import AgentResponse, DecideRequest, Decision, FailureMode, Signals

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
SCENARIOS_PATH = BASE_DIR / "scenarios.json"
CONTRADICTIONS_PATH = BASE_DIR / "contradictions.json"
MODEL_NAME = "gpt-4o-mini"

RISK_LEVELS = {
    "send_email": 6,
    "schedule_meeting": 4,
    "cancel_meeting": 5,
    "set_reminder": 2,
    "delete": 9,
    None: 3,
}

ACTION_KEYWORDS = {
    "delete": ["delete", "remove", "purge"],
    "send_email": ["send", "email", "reply", "forward"],
    "schedule_meeting": ["schedule", "book", "meeting", "invite"],
    "cancel_meeting": ["cancel", "decline"],
    "set_reminder": ["remind", "reminder"],
}

TIME_PATTERN = re.compile(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b", re.IGNORECASE)
DATE_HINTS = (
    "today",
    "tomorrow",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "next week",
    "this week",
)

DECISION_ORDER = {
    Decision.EXECUTE_SILENT: 0,
    Decision.EXECUTE_NOTIFY: 1,
    Decision.CONFIRM: 2,
    Decision.CLARIFY: 3,
    Decision.REFUSE: 4,
}


def dump_model(model: Any) -> Any:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_env_value(key: str) -> Optional[str]:
    value = os.environ.get(key)
    if value:
        return value

    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        current_key, current_value = line.split("=", 1)
        if current_key.strip() == key:
            return current_value.strip().strip("'\"")
    return None


@lru_cache(maxsize=1)
def get_client() -> Optional[OpenAI]:
    api_key = load_env_value("OPEN_AI_KEY") or load_env_value("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, timeout=8.0)


def infer_action(action_text: str, full_text: str) -> Optional[str]:
    combined = f"{action_text} {full_text}".lower()
    for action, keywords in ACTION_KEYWORDS.items():
        if any(keyword in combined for keyword in keywords):
            return action
    return None


def latest_user_message(request: DecideRequest) -> str:
    for message in reversed(request.conversation_history):
        if message.role.lower() == "user":
            return message.content.lower()
    return request.action.lower()


def has_time_or_date(full_text: str) -> bool:
    return bool(TIME_PATTERN.search(full_text) or any(hint in full_text for hint in DATE_HINTS))


def has_recipient(full_text: str) -> bool:
    if EMAIL_PATTERN.search(full_text):
        return True
    return any(token in full_text for token in ("team", "everyone", "sarah", "john", "acme"))


def find_missing_params(action: Optional[str], action_text: str, full_text: str) -> list[str]:
    missing: list[str] = []
    combined = f"{action_text} {full_text}"

    if action == "send_email" and not has_recipient(combined.lower()):
        missing.append("recipient")

    if action in {"schedule_meeting", "set_reminder"} and not has_time_or_date(combined.lower()):
        missing.append("time")

    if not action_text.strip():
        missing.append("action")

    return missing


def find_unresolved_entities(request: DecideRequest) -> list[str]:
    latest_user = latest_user_message(request)
    history = " ".join(message.content.lower() for message in request.conversation_history)
    unresolved: list[str] = []

    if re.search(r"\b(it|them|everyone)\b", latest_user) or any(
        phrase in latest_user for phrase in ("the one", "that one")
    ):
        unresolved.append("ambiguous reference")

    if "which one" in history and any(token in latest_user for token in ("this week", "the one", "it")):
        unresolved.append("assistant asked for disambiguation")

    return unresolved


def find_contradiction(request: DecideRequest) -> bool:
    contradiction_words = load_json_file(CONTRADICTIONS_PATH)
    hold_phrases = contradiction_words.get("hold_phrases", [])
    resume_phrases = contradiction_words.get("resume_phrases", [])

    hold_seen = False
    for message in request.conversation_history:
        content = message.content.lower()
        if any(phrase in content for phrase in hold_phrases):
            hold_seen = True
        if hold_seen and any(phrase in content for phrase in resume_phrases):
            return True
    return False


def is_external_or_sensitive(full_text: str) -> bool:
    return bool(
        any(token in full_text for token in ("external", "partner", "client", "customer", "acme", "legal"))
        or EMAIL_PATTERN.search(full_text)
    )


def compute_risk(
    action: Optional[str],
    full_text: str,
    unresolved_entities: list[str],
    contradiction_detected: bool,
    user_state: Optional[str],
) -> tuple[int, bool]:
    risk = RISK_LEVELS.get(action, 3)
    unsafe_action = False
    lowered_state = (user_state or "").lower()

    if action == "delete":
        risk += 1
        if any(token in full_text for token in ("delete all", "all emails", "everything old", "bulk")):
            unsafe_action = True
            risk = 10

    if any(
        phrase in full_text
        for phrase in (
            "wire transfer",
            "initiate wire",
            "wire $",
            "send the wire",
            "transfer of $",
            "transfer $",
        )
    ):
        unsafe_action = True
        risk = 10

    if action == "send_email" and is_external_or_sensitive(full_text):
        risk += 2

    if contradiction_detected:
        risk += 1

    if unresolved_entities:
        risk += 1

    if any(token in lowered_state for token in ("legal", "sensitive", "prefer confirm", "never silently")):
        risk += 1

    return min(risk, 10), unsafe_action


def choose_deterministic_decision(signals: Signals) -> tuple[Decision, list[str]]:
    if signals.unsafe_action:
        return Decision.REFUSE, ["Unsafe bulk or destructive action."]

    if signals.missing_params:
        return Decision.CLARIFY, [f"Missing parameters: {', '.join(signals.missing_params)}."]

    if signals.unresolved_entities:
        return Decision.CLARIFY, ["Conversation still has an unresolved target or reference."]

    if signals.contradiction_detected:
        return Decision.CLARIFY, ["Conversation contains conflicting instructions."]

    if not signals.intent_clear:
        return Decision.CLARIFY, ["Intent is still unclear."]

    if signals.risk_score >= 8:
        return Decision.CONFIRM, ["Resolved action is above the silent execution risk threshold."]

    if signals.risk_score <= 3 and signals.reversibility == "reversible":
        return Decision.EXECUTE_SILENT, ["Low-risk and reversible action."]

    return Decision.EXECUTE_NOTIFY, ["Resolved action should execute with user-visible follow-up."]


def build_signals(request: DecideRequest) -> tuple[Signals, list[str]]:
    full_text = " ".join(message.content.lower() for message in request.conversation_history)
    action_text = request.action.lower()
    action = infer_action(action_text, full_text)
    missing_params = find_missing_params(action, action_text, full_text)
    unresolved_entities = find_unresolved_entities(request)
    contradiction_detected = find_contradiction(request)
    risk_score, unsafe_action = compute_risk(
        action,
        f"{action_text} {full_text}",
        unresolved_entities,
        contradiction_detected,
        request.user_state,
    )
    signals = Signals(
        inferred_action=action or "general",
        reversibility="irreversible" if action in {"send_email", "delete"} else "reversible",
        risk_score=risk_score,
        missing_params=missing_params,
        unresolved_entities=unresolved_entities,
        intent_clear=bool(request.action.strip()),
        contradiction_detected=contradiction_detected,
        unsafe_action=unsafe_action,
        deterministic_decision=Decision.CLARIFY,
    )
    decision, rules = choose_deterministic_decision(signals)
    signals.deterministic_decision = decision
    return signals, rules


def build_prompt(request: DecideRequest, signals: Signals, rules: list[str]) -> str:
    conversation = [{"role": item.role, "content": item.content} for item in request.conversation_history]
    return f"""
You are an AI decision engine for an assistant.

Choose exactly one of:
- execute_silent
- execute_notify
- confirm
- clarify
- refuse

Ask a clarifying question when intent, entity, or key parameters are unresolved.
Confirm before executing when intent is resolved but risk is above the silent threshold.
Refuse when policy disallows the action or uncertainty is still too high.
Use conversation history, not just the latest message.

Action:
{request.action}

Conversation History:
{json.dumps(conversation, indent=2)}

Signals:
{json.dumps(dump_model(signals), indent=2)}

User State:
{request.user_state or "none provided"}

Deterministic rules already computed in code:
{json.dumps(rules, indent=2)}

Respond only as valid JSON:
{{
  "decision": "execute_silent | execute_notify | confirm | clarify | refuse",
  "rationale": "short explanation"
}}
""".strip()


def extract_json(raw_output: str) -> str:
    match = re.search(r"\{.*\}", raw_output, re.DOTALL)
    if match:
        return match.group(0)
    return raw_output.strip()


def parse_model_output(raw_output: str) -> tuple[Decision, str]:
    parsed = json.loads(extract_json(raw_output))
    return Decision(parsed["decision"]), parsed.get("rationale", "").strip()


def build_fallback_rationale(rules: list[str], reason: str) -> str:
    base = rules[0] if rules else "Used deterministic fallback."
    return f"{base} {reason}".strip()


def choose_final_decision(model_decision: Decision, deterministic_decision: Decision) -> tuple[Decision, bool]:
    if DECISION_ORDER[model_decision] < DECISION_ORDER[deterministic_decision]:
        return deterministic_decision, True
    return model_decision, False


@router.get("/scenarios")
def get_scenarios() -> list[dict[str, Any]]:
    return load_json_file(SCENARIOS_PATH)


@router.post("/decision", response_model=AgentResponse)
def make_decision(request: DecideRequest) -> AgentResponse:
    signals, rules = build_signals(request)
    prompt = build_prompt(request, signals, rules)
    raw_output = ""
    model_status = "success"
    fallback_reason: Optional[str] = None

    try:
        if request.simulate_failure == FailureMode.TIMEOUT:
            raise TimeoutError("Simulated timeout")
        if request.simulate_failure == FailureMode.MALFORMED:
            raw_output = "decision=execute_notify rationale=plain text only"
        else:
            client = get_client()
            if client is None:
                raise RuntimeError("OPEN_AI_KEY is not configured")
            response = client.chat.completions.create(
                model=MODEL_NAME,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "You are a strict decision engine. Output only JSON."},
                    {"role": "user", "content": prompt},
                ],
            )
            raw_output = response.choices[0].message.content or ""

        model_decision, rationale = parse_model_output(raw_output)
        final_decision, overridden = choose_final_decision(model_decision, signals.deterministic_decision)
        if overridden:
            model_status = "guardrail_override"
            fallback_reason = (
                f"Model suggested {model_decision.value}; kept {signals.deterministic_decision.value}."
            )
            rationale = build_fallback_rationale(rules, fallback_reason)
    except TimeoutError:
        final_decision = signals.deterministic_decision
        model_status = "fallback_timeout"
        fallback_reason = "LLM timed out."
        rationale = build_fallback_rationale(rules, fallback_reason)
    except (json.JSONDecodeError, KeyError, ValueError):
        final_decision = signals.deterministic_decision
        model_status = "fallback_malformed_output"
        fallback_reason = "Model output was malformed."
        rationale = build_fallback_rationale(rules, fallback_reason)
    except Exception as exc:
        final_decision = signals.deterministic_decision
        model_status = "fallback_unavailable"
        fallback_reason = f"Model unavailable: {exc}"
        rationale = build_fallback_rationale(rules, fallback_reason)

    return AgentResponse(
        decision=final_decision,
        rationale=rationale,
        prompt_sent=prompt,
        signals=signals,
        triggered_rules=rules,
        model_status=model_status,
        fallback_reason=fallback_reason,
    )