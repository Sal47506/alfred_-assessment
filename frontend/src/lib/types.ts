export type Role = "user" | "assistant" | "system";
export type FailureMode = "none" | "timeout" | "malformed" | "missing_context";
export type DecisionValue =
  | "execute_silent"
  | "execute_notify"
  | "confirm"
  | "clarify"
  | "refuse";

export interface Message {
  role: Role;
  content: string;
}

export interface DecisionRequest {
  action: string;
  conversation_history: Message[];
  user_id?: string | null;
  user_state?: string | null;
  simulate_failure: FailureMode;
}

export interface Signals {
  inferred_action: string;
  reversibility: string;
  risk_score: number;
  missing_params: string[];
  unresolved_entities: string[];
  intent_clear: boolean;
  contradiction_detected: boolean;
  unsafe_action: boolean;
  deterministic_decision: DecisionValue;
}

export interface DecisionResponse {
  decision: DecisionValue;
  rationale: string;
  prompt_sent: string;
  signals: Signals;
  triggered_rules: string[];
  model_status: string;
  fallback_reason?: string | null;
}

export interface Scenario {
  id: string;
  label: string;
  category: string;
  action: string;
  surface?: string;
  title?: string;
  preview?: string;
  user_state?: string | null;
  conversation_history: Message[];
}
