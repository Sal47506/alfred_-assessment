import { useEffect, useState } from "react";
import { Bot, CalendarDays, LoaderCircle, Mail, MessageSquareText, Plus, SendHorizonal, Trash2 } from "lucide-react";

import { fetchScenarios, runDecision } from "@/lib/api";
import type {
  DecisionRequest,
  DecisionResponse,
  DecisionValue,
  FailureMode,
  Message,
  Role,
  Scenario,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const emptyRequest: DecisionRequest = {
  action: "",
  user_state: "",
  conversation_history: [{ role: "user", content: "" }],
  simulate_failure: "none",
};

const selectClassName =
  "flex h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-ring";

const decisionVariantMap: Record<
  DecisionValue,
  "default" | "success" | "warning" | "destructive"
> = {
  execute_silent: "success",
  execute_notify: "default",
  confirm: "warning",
  clarify: "warning",
  refuse: "destructive",
};

const categoryVariantMap: Record<string, "default" | "warning" | "destructive"> = {
  easy: "default",
  ambiguous: "warning",
  adversarial: "destructive",
};

const decisionHeadlineMap: Record<DecisionValue, string> = {
  execute_silent: "alfred_ can handle this quietly.",
  execute_notify: "alfred_ can do this and update the user right after.",
  confirm: "This should be confirmed before anything happens.",
  clarify: "alfred_ still needs one more detail.",
  refuse: "This should be refused or escalated.",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function requestFromScenario(scenario: Scenario): DecisionRequest {
  return {
    action: scenario.action,
    user_state: scenario.user_state ?? "",
    conversation_history: scenario.conversation_history,
    simulate_failure: "none",
  };
}

function preClassName(extra?: string) {
  return cn("rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100", extra);
}

function getScenarioSurface(scenario: Scenario) {
  return scenario.surface ?? "text";
}

function getScenarioTitle(scenario: Scenario) {
  return scenario.title ?? scenario.label;
}

function getScenarioPreview(scenario: Scenario) {
  return scenario.preview ?? scenario.conversation_history[0]?.content ?? scenario.action;
}

function getSurfaceMeta(surface: string) {
  if (surface === "email") {
    return { label: "Email", icon: Mail };
  }

  if (surface === "calendar") {
    return { label: "Calendar", icon: CalendarDays };
  }

  return { label: "Text", icon: MessageSquareText };
}

function formatModelStatus(status: string) {
  return status.replace(/_/g, " ");
}

function summarizeList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

function parseRawOutput(rawOutput: string) {
  try {
    return JSON.parse(rawOutput) as { decision?: string; rationale?: string };
  } catch {
    return null;
  }
}

export default function App() {
  const [payload, setPayload] = useState<DecisionRequest>(emptyRequest);
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState<DecisionRequest>(emptyRequest);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const seededScenarios = await fetchScenarios();
        setScenarios(seededScenarios);
        if (seededScenarios.length > 0) {
          setActiveScenarioId(seededScenarios[0].id);
          setPayload(requestFromScenario(seededScenarios[0]));
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load scenarios.");
      }
    };

    void load();
  }, []);

  const handleScenarioSelect = (scenario: Scenario) => {
    setActiveScenarioId(scenario.id);
    setPayload(requestFromScenario(scenario));
    setResult(null);
    setSubmitError(null);
  };

  const updateMessage = (index: number, patch: Partial<Message>) => {
    setPayload((current) => ({
      ...current,
      conversation_history: current.conversation_history.map((message, currentIndex) =>
        currentIndex === index ? { ...message, ...patch } : message,
      ),
    }));
  };

  const addMessage = () => {
    setPayload((current) => ({
      ...current,
      conversation_history: [...current.conversation_history, { role: "user", content: "" }],
    }));
  };

  const removeMessage = (index: number) => {
    setPayload((current) => ({
      ...current,
      conversation_history:
        current.conversation_history.length === 1
          ? [{ role: "user", content: "" }]
          : current.conversation_history.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const resetForm = () => {
    setActiveScenarioId(null);
    setPayload(emptyRequest);
    setLastSubmittedPayload(emptyRequest);
    setResult(null);
    setSubmitError(null);
  };

  const submit = async () => {
    setIsLoading(true);
    setSubmitError(null);
    setLastSubmittedPayload({ ...payload, conversation_history: [...payload.conversation_history] });

    try {
      const response = await runDecision(payload);
      setResult(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Decision request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const parsedRawOutput = result?.raw_output ? parseRawOutput(result.raw_output) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold tracking-wide text-primary">alfred_</div>
            <h1 className="text-3xl font-semibold tracking-tight">Execution decisions that feel product-native.</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Pick a realistic text or email scenario, tweak the context, and see how alfred_ should act.
            </p>
          </div>
          <Badge variant="outline">6 scenarios loaded</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Scenarios</CardTitle>
                <CardDescription>Styled like the kinds of threads alfred_ would actually see.</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                <ScrollArea className="h-[640px]">
                  <div className="space-y-2">
                    {scenarios.map((scenario) => {
                      const surface = getSurfaceMeta(getScenarioSurface(scenario));
                      const Icon = surface.icon;

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          onClick={() => handleScenarioSelect(scenario)}
                          className={cn(
                            "w-full rounded-2xl border p-4 text-left transition-colors",
                            activeScenarioId === scenario.id
                              ? "border-primary bg-primary/10"
                              : "border-slate-800 hover:bg-slate-900/70",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-medium">{scenario.label}</p>
                                <Badge variant={categoryVariantMap[scenario.category] ?? "default"}>
                                  {scenario.category}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-100">{getScenarioTitle(scenario)}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {getScenarioPreview(scenario)}
                              </p>
                              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                {surface.label}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {loadError ? <p className="px-2 text-sm text-destructive">{loadError}</p> : null}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tell alfred_ what to do</CardTitle>
                <CardDescription>
                  Action, conversation history, and optional user state stay together in one lightweight composer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                  <div className="space-y-2">
                    <Label htmlFor="action">Proposed action</Label>
                    <Input
                      id="action"
                      value={payload.action}
                      placeholder="Send the drafted reply to Acme"
                      onChange={(event) =>
                        setPayload((current) => ({ ...current, action: event.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-state">User state (optional)</Label>
                    <Input
                      id="user-state"
                      value={payload.user_state ?? ""}
                      placeholder="External pricing emails should always be confirmed"
                      onChange={(event) =>
                        setPayload((current) => ({ ...current, user_state: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Conversation</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addMessage}>
                      <Plus className="h-4 w-4" />
                      Add message
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {payload.conversation_history.map((message, index) => (
                      <div key={index} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <select
                            className={selectClassName}
                            value={message.role}
                            onChange={(event) =>
                              updateMessage(index, { role: event.target.value as Role })
                            }
                          >
                            <option value="user">user</option>
                            <option value="assistant">assistant</option>
                            <option value="system">system</option>
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMessage(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                        <Textarea
                          value={message.content}
                          onChange={(event) => updateMessage(index, { content: event.target.value })}
                          placeholder="Write the relevant message here"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <details className="rounded-2xl border border-slate-800 p-4">
                  <summary className="cursor-pointer text-sm font-medium">Failure path demo</summary>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="failure-mode">Show what happens when the model fails</Label>
                    <select
                      id="failure-mode"
                      className={selectClassName}
                      value={payload.simulate_failure}
                      onChange={(event) =>
                        setPayload((current) => ({
                          ...current,
                          simulate_failure: event.target.value as FailureMode,
                        }))
                      }
                    >
                      <option value="none">None</option>
                      <option value="timeout">LLM timeout</option>
                      <option value="malformed">Malformed model output</option>
                    </select>
                  </div>
                </details>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="button"
                    onClick={submit}
                    disabled={isLoading || !payload.action.trim()}
                    className="min-w-[190px]"
                  >
                    {isLoading ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Running
                      </>
                    ) : (
                      <>
                        <SendHorizonal className="h-4 w-4" />
                        Run decision
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>alfred_'s call</CardTitle>
                <CardDescription>
                  The verdict stays conversational. The deeper pipeline is still available below it.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

                {result ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-card">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">alfred_</p>
                        <p className="text-xs text-muted-foreground">Decision layer response</p>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge variant={decisionVariantMap[result.decision]}>
                        {formatLabel(result.decision)}
                      </Badge>
                      <Badge variant="outline">{formatModelStatus(result.model_status)}</Badge>
                    </div>

                    <p className="text-xl font-medium leading-8">{decisionHeadlineMap[result.decision]}</p>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{result.rationale}</p>
                    {result.fallback_reason ? (
                      <p className="mt-3 text-sm text-muted-foreground">{result.fallback_reason}</p>
                    ) : null}

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-800 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Risk score</p>
                        <p className="mt-2 text-lg font-medium">{result.signals.risk_score}/10</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Inferred action</p>
                        <p className="mt-2 text-lg font-medium">{formatLabel(result.signals.inferred_action)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Deterministic floor</p>
                        <p className="mt-2 text-lg font-medium">
                          {formatLabel(result.signals.deterministic_decision)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-muted-foreground">
                    Choose a scenario or write your own thread to see the decision here.
                  </div>
                )}

                <Card className="border-slate-800 bg-transparent shadow-none">
                  <CardHeader>
                    <CardTitle className="text-lg">Under the hood</CardTitle>
                    <CardDescription>
                      Everything required by the prompt is still here, but presented as product-friendly cards.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Accordion type="multiple" className="space-y-3">
                      <AccordionItem value="inputs">
                        <AccordionTrigger>Inputs</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Action</p>
                              <p className="mt-2 text-sm text-slate-100">{lastSubmittedPayload.action || "None provided"}</p>
                            </div>

                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">User state</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {lastSubmittedPayload.user_state?.trim() || "No explicit user state provided."}
                              </p>
                            </div>

                            <div className="space-y-3">
                              {lastSubmittedPayload.conversation_history.map((message, index) => (
                                <div
                                  key={`${message.role}-${index}`}
                                  className={cn(
                                    "rounded-2xl border p-4",
                                    message.role === "user"
                                      ? "border-slate-800 bg-slate-950/60"
                                      : "border-slate-800 bg-card",
                                  )}
                                >
                                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    {message.role === "assistant" ? "alfred_" : message.role}
                                  </p>
                                  <p className="mt-2 text-sm leading-7 text-slate-100">{message.content}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="signals">
                        <AccordionTrigger>Signals and rules</AccordionTrigger>
                        <AccordionContent>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Missing params</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {summarizeList(result?.signals.missing_params ?? [])}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unresolved entities</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {summarizeList(result?.signals.unresolved_entities ?? [])}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Contradiction detected</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {result?.signals.contradiction_detected ? "Yes" : "No"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Unsafe action</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {result?.signals.unsafe_action ? "Yes" : "No"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl border border-slate-800 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Rules triggered in code</p>
                            <ul className="mt-3 space-y-2 text-sm text-slate-100">
                              {(result?.triggered_rules ?? []).map((rule, index) => (
                                <li key={index}>{rule}</li>
                              ))}
                            </ul>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="prompt">
                        <AccordionTrigger>Exact prompt sent to the model</AccordionTrigger>
                        <AccordionContent>
                          <ScrollArea className="h-[280px]">
                            <div className={preClassName("whitespace-pre-wrap")}>
                              {result?.prompt_sent ?? "Run a decision to view the prompt."}
                            </div>
                          </ScrollArea>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="raw-output">
                        <AccordionTrigger>Raw model output</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4">
                            {parsedRawOutput ? (
                              <div className="rounded-2xl border border-slate-800 p-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Decoded at a glance</p>
                                <div className="mt-3 space-y-2 text-sm text-slate-100">
                                  <p>decision: {parsedRawOutput.decision ?? "n/a"}</p>
                                  <p>rationale: {parsedRawOutput.rationale ?? "n/a"}</p>
                                </div>
                              </div>
                            ) : null}
                            <div className={preClassName("whitespace-pre-wrap")}>
                              {result?.raw_output || "Run a decision to view raw output."}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="parsed">
                        <AccordionTrigger>Final parsed decision</AccordionTrigger>
                        <AccordionContent>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Decision</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {result ? formatLabel(result.decision) : "No decision yet"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Model status</p>
                              <p className="mt-2 text-sm text-slate-100">
                                {result ? formatModelStatus(result.model_status) : "No decision yet"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-800 p-4 md:col-span-2">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Rationale</p>
                              <p className="mt-2 text-sm leading-7 text-slate-100">
                                {result?.rationale ?? "Run a decision to view the parsed rationale."}
                              </p>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
