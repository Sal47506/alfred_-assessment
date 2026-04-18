import type { DecisionRequest, DecisionResponse, Scenario } from "@/lib/types";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const response = await fetch("/api/scenarios");
  return handleResponse<Scenario[]>(response);
}

export async function runDecision(payload: DecisionRequest): Promise<DecisionResponse> {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return handleResponse<DecisionResponse>(response);
}
