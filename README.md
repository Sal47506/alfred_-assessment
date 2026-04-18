# alfred_ Execution Decision Layer

A FastAPI + React + shadcn prototype for deciding whether alfred_ should execute silently, execute and notify after, confirm, clarify, or refuse.

Live demo: https://alfred-sal.fly.dev/

## What it does

- Accepts a proposed action plus conversation history and optional user state
- Evaluates deterministic signals first, then asks the model for judgment
- Treats the decision as a contextual conversation problem, not a one-shot classification
- Shows the full pipeline in the UI (inputs, signals, triggered rules, final decision)
- Ships with 10 preloaded scenarios (easy, ambiguous, adversarial, plus injection / social-engineering edge cases)
- Exposes visible failure handling for LLM timeout, malformed output, and missing critical context
- React + shadcn frontend renders scenarios as iOS messages, Gmail threads, or calendar invites

## Execution Decision Layer

Given a proposed action plus context, the system picks exactly one of five decisions:

| Decision           | When it fires                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `execute_silent`   | Intent is resolved, action is reversible, `risk_score <= 3`, no contradictions, no unresolved entities, no missing params.                                              |
| `execute_notify`   | Intent is resolved and `risk_score` is 4–7, or the action is irreversible but low risk. alfred_ acts, then tells the user what was done.                                |
| `confirm`          | Intent is resolved but `risk_score >= 8`, or the target is external / sensitive. alfred_ asks the user to confirm before executing.                                     |
| `clarify`          | Intent, entity, or key parameters are unresolved (`missing_params`, `unresolved_entities`, contradiction between hold and resume, or `intent_clear == False`).          |
| `refuse`           | Policy disallows the action, or risk / uncertainty remains too high after clarification (bulk delete, wire transfer to a new vendor, etc.). alfred_ stops and escalates.|

Framing boundaries, used in both the deterministic rules and the prompt:

- **Clarify** when intent, entity, or key parameters are unresolved
- **Confirm** when intent is resolved but risk is above the silent-execution threshold
- **Refuse** when policy disallows it, or risk / uncertainty is still too high after clarification

The decision always considers the full conversation history and the user state, not just the latest message.

### Deterministic floor, model nudge

1. Deterministic signals produce a safety floor decision (`signals.deterministic_decision`)
2. The model can match the floor or be stricter, but never more lenient
3. If the model suggests something riskier than the floor, the API keeps the safer deterministic decision and surfaces `model_status = guardrail_override` so the divergence is visible

This is what lets the system be safe under both unreliable model output *and* model attempts to please the user past what policy allows.

## Failure Cases

The system treats failure as a first-class output. Every failure path is surfaced in the response as `model_status` and `fallback_reason`, and is selectable from the UI (Edit > Failure path demo).

| Failure                       | Trigger                                                                 | System behavior                                                                                                                           | Final decision                                   |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| LLM timeout                   | `simulate_failure = "timeout"` or real `TimeoutError` from the OpenAI client | Raises a `TimeoutError` before the model reply is consumed. Caught, fallback to the deterministic floor. `model_status = fallback_timeout`. | Deterministic floor (never more lenient than it) |
| Malformed model output        | `simulate_failure = "malformed"` or a real parse failure                | Model response is not valid JSON. `json.JSONDecodeError` / `KeyError` / `ValueError` caught. Fallback to deterministic floor. `model_status = fallback_malformed_output`. | Deterministic floor                              |
| Missing critical context      | `simulate_failure = "missing_context"` or signals show `missing_params` / `unresolved_entities` / ambiguous intent | Model call is skipped. Returns `clarify` with a "Critical context missing" rule. `model_status = fallback_missing_context`.              | Always `clarify`                                 |
| Model unavailable / no API key | No `OPEN_AI_KEY` configured                                             | `RuntimeError` raised from the client getter. Fallback to deterministic floor. `model_status = fallback_unavailable`.                     | Deterministic floor                              |

### Demonstrations

- Run any scenario and pick **LLM timeout** in the failure dropdown — the dialog shows `fallback_timeout`, decision defaults to the deterministic floor.
- Pick **Malformed model output** — the model is fed a non-JSON response; the JSON parser throws, fallback kicks in, decision stays at the deterministic floor.
- Pick **Missing critical context** — the model call is skipped entirely; system returns `clarify`.
- Or naturally: send `action = "Send email"` with no recipient — signals detect `missing_params: ["recipient"]`, decision is `clarify` without ever needing the fake failure toggle.

The full behavior is covered by tests in `tests/test_decision_api.py`:

- `test_llm_timeout_falls_back_to_deterministic`
- `test_malformed_model_output_falls_back_to_deterministic`
- `test_missing_critical_context_returns_clarify`
- `test_missing_params_naturally_triggers_clarify`
- `test_failure_modes_use_safe_fallback`
- `test_conflicting_history_triggers_clarification`
- `test_bulk_delete_is_refused`
- `test_low_risk_reminder_executes_silently`
- `test_scenarios_endpoint_returns_required_seed_data`

The default posture across every failure path: never upgrade to a more lenient decision than the deterministic floor. Irreversible actions never silently execute when uncertainty remains.

## Signals used, and why

- `inferred_action`: anchors baseline risk and reversibility
- `reversibility`: silent execution is safer for reversible actions
- `risk_score`: gives a simple 0–10 threshold for silent vs confirm behavior
- `risk_factors`: keeps the rationale inspectable instead of opaque
- `missing_params`: catches unresolved key inputs like recipient or time
- `unresolved_entities`: catches vague references like “it”, “everyone”, or “the one this week”
- `contradiction_detected`: prevents the model from ignoring earlier hold / wait instructions
- `external_recipient`: outbound actions to external parties deserve more caution
- `prior_confirmation_seen`: distinguishes follow-through from fresh execution
- `unsafe_action`: hard guardrail for destructive bulk actions

## LLM vs regular code

### Deterministic code handles

- signal extraction
- contradiction detection
- missing-context detection
- risk scoring
- hard safety boundaries
- fallback behavior when the model times out or returns malformed output

### The model handles

- the final contextual judgment when the action is otherwise allowed
- concise natural-language rationale generation
- weighing conversation nuance after structured guardrails are already computed

## What the model decides vs what is computed deterministically

Deterministic code computes the safety floor. The model can be equally conservative or more conservative than that floor, but not less conservative. If the model suggests a riskier action than the code guardrails allow, the API keeps the safer deterministic decision.

## Prompt design

The prompt is intentionally short and structured:

- decision space is explicit
- clarify / confirm / refuse boundaries are spelled out
- full conversation history is included
- user state is included
- computed signals and guardrails are included
- the response schema is forced to strict JSON

This keeps the model focused on judgment rather than extraction.

## Running locally

```bash
python3 -m pip install -r requirements.txt
cd frontend && npm install
cd ..
uvicorn backend.app:app --reload
```

In a second terminal for frontend development:

```bash
cd frontend
npm run dev
```

For production-style local serving through FastAPI:

```bash
cd frontend
npm run build
cd ..
uvicorn backend.app:app --reload
```

Then open `http://127.0.0.1:8000` for the built app, or `http://127.0.0.1:5173` during Vite development.

## Tests

```bash
npm --prefix frontend run build
python3 -m pytest tests -q
```

## How I would evolve this as alfred_ gains riskier tools

- replace heuristic risk scoring with tool-specific policy objects
- add durable user trust / preference state instead of stateless request fields
- log decisions, overrides, and user corrections for offline calibration
- split policy review, execution planning, and action authorization into separate stages
- add evaluator suites for policy regressions and conversation-history traps

## What I would build in the next 6 months

1. Per-tool policy engine with explicit capability boundaries
2. Decision-memory layer for user preferences and prior corrections
3. Better entity resolution tied to product objects like drafts, calendar events, and reminder IDs
4. Offline evals and replay tooling for regression testing
5. Human-review queues for high-risk or escalated actions
