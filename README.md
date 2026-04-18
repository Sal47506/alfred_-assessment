# alfred_ Execution Decision Layer

A FastAPI + React + shadcn prototype for deciding whether alfred_ should execute silently, execute and notify after, confirm, clarify, or refuse.

Live demo: https://alfred-sal.fly.dev/

## What it does

- Accepts a proposed action plus conversation context
- Evaluates deterministic signals before asking the model for judgment
- Shows the full pipeline in the UI:
  - inputs
  - computed signals and triggered rules
  - exact prompt sent to the model
  - raw model output
  - final parsed decision
- Ships with 6 preloaded scenarios:
  - 2 easy
  - 2 ambiguous
  - 2 adversarial / risky
- Exposes visible failure handling for:
  - LLM timeout
  - malformed model output
  - missing critical context
- Uses a React + shadcn frontend to make the pipeline easy to inspect

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

## Failure modes

- **LLM timeout**: fall back to the deterministic safe decision
- **Malformed model output**: fall back to the deterministic safe decision
- **Missing critical context**: return `clarify`
- **Model unavailable / missing API key**: return the deterministic safe decision and surface the fallback in the UI

Default behavior avoids irreversible execution when uncertainty remains.

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
