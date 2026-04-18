from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class Decision(str, Enum):
    EXECUTE_SILENT = "execute_silent"
    EXECUTE_NOTIFY = "execute_notify"
    CONFIRM = "confirm"
    CLARIFY = "clarify"
    REFUSE = "refuse"


class FailureMode(str, Enum):
    NONE = "none"
    TIMEOUT = "timeout"
    MALFORMED = "malformed"


class Message(BaseModel):
    role: str
    content: str


class DecideRequest(BaseModel):
    action: str
    conversation_history: List[Message]
    user_id: Optional[str] = None
    user_state: Optional[str] = None
    simulate_failure: FailureMode = FailureMode.NONE


class Signals(BaseModel):
    inferred_action: str
    reversibility: str
    risk_score: int
    missing_params: List[str] = Field(default_factory=list)
    unresolved_entities: List[str] = Field(default_factory=list)
    intent_clear: bool
    contradiction_detected: bool = False
    unsafe_action: bool = False
    deterministic_decision: Decision


class AgentResponse(BaseModel):
    decision: Decision
    raw_output: str
    rationale: str
    prompt_sent: str
    signals: Signals
    triggered_rules: List[str] = Field(default_factory=list)
    model_status: str
    fallback_reason: Optional[str] = None

