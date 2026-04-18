import { useEffect, useState } from "react";
import { LoaderCircle, Plus, SendHorizonal, Trash2 } from "lucide-react";

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

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function jsonBlock(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function requestFromScenario(scenario: Scenario): DecisionRequest {
  return {
    action: scenario.action,
    conversation_history: scenario.conversation_history,
    simulate_failure: "none",
  };
}

function preClassName(extra?: string) {
  return cn("rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100", extra);
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
    setLastSubmittedPayload(payload);

    try {
      const response = await runDecision(payload);
      setResult(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Decision request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="mb-8 space-y-2">
          <Badge variant="outline">alfred_ challenge</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Execution Decision Layer</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Submit an action, inspect the result, and open the debug sections when you want the full
            pipeline.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>Pick a scenario or edit the action and conversation directly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Scenarios</Label>
                  <span className="text-xs text-muted-foreground">{scenarios.length} loaded</span>
                </div>
                <ScrollArea className="h-[220px] rounded-2xl border border-slate-800">
                  <div className="space-y-2 p-3">
                    {scenarios.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => handleScenarioSelect(scenario)}
                        className={cn(
                          "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                          activeScenarioId === scenario.id
                            ? "border-primary bg-primary/10"
                            : "border-slate-800 bg-transparent hover:bg-slate-900",
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{scenario.label}</span>
                          <Badge variant={categoryVariantMap[scenario.category] ?? "default"}>
                            {scenario.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{scenario.action}</p>
                      </button>
                    ))}
                    {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
                  </div>
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action">Proposed action</Label>
                <Input
                  id="action"
                  value={payload.action}
                  placeholder="Send email reply to external partner"
                  onChange={(event) =>
                    setPayload((current) => ({ ...current, action: event.target.value }))
                  }
                />
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
                    <div key={index} className="rounded-2xl border border-slate-800 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
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
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeMessage(index)}>
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                      <Textarea
                        value={message.content}
                        onChange={(event) => updateMessage(index, { content: event.target.value })}
                        placeholder="Message content"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <details className="rounded-2xl border border-slate-800 p-4">
                <summary className="cursor-pointer text-sm font-medium">Failure demo</summary>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="failure-mode">Simulate a failure path</Label>
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
                  className="min-w-[180px]"
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

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Decision output</CardTitle>
                <CardDescription>Final decision first, then the debug trace below it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

                {result ? (
                  <div className="space-y-4 rounded-2xl border border-slate-800 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={decisionVariantMap[result.decision]}>
                        {formatLabel(result.decision)}
                      </Badge>
                      <Badge variant="outline">{formatLabel(result.model_status)}</Badge>
                    </div>
                    <p className="text-lg font-medium leading-8">{result.rationale}</p>
                    {result.fallback_reason ? (
                      <p className="text-sm text-muted-foreground">{result.fallback_reason}</p>
                    ) : null}
                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <div>risk score: {result.signals.risk_score}/10</div>
                      <div>inferred action: {formatLabel(result.signals.inferred_action)}</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-muted-foreground">
                    Run a scenario to see the decision and rationale here.
                  </div>
                )}

                <Accordion type="multiple" className="space-y-3">
                  <AccordionItem value="inputs">
                    <AccordionTrigger>Inputs</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[220px]">
                        <pre className={preClassName()}>{jsonBlock(lastSubmittedPayload)}</pre>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="signals">
                    <AccordionTrigger>Signals and rules</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <ScrollArea className="h-[220px]">
                          <pre className={preClassName()}>{jsonBlock(result?.signals ?? {})}</pre>
                        </ScrollArea>
                        <ScrollArea className="h-[150px]">
                          <pre className={preClassName()}>{jsonBlock(result?.triggered_rules ?? [])}</pre>
                        </ScrollArea>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="prompt">
                    <AccordionTrigger>Prompt</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[260px]">
                        <pre className={preClassName("whitespace-pre-wrap")}>
                          {result?.prompt_sent ?? "Run a decision to view the prompt."}
                        </pre>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="raw-output">
                    <AccordionTrigger>Raw output</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[180px]">
                        <pre className={preClassName("whitespace-pre-wrap")}>
                          {result?.raw_output || "Run a decision to view raw output."}
                        </pre>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="parsed">
                    <AccordionTrigger>Parsed decision</AccordionTrigger>
                    <AccordionContent>
                      <ScrollArea className="h-[160px]">
                        <pre className={preClassName()}>
                          {jsonBlock(
                            result
                              ? {
                                  decision: result.decision,
                                  rationale: result.rationale,
                                  model_status: result.model_status,
                                  fallback_reason: result.fallback_reason,
                                }
                              : {},
                          )}
                        </pre>
                      </ScrollArea>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
