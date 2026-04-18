import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Pencil,
  Plus,
  SendHorizonal,
  Trash2,
} from "lucide-react";

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const categoryDotMap: Record<string, string> = {
  easy: "bg-emerald-400",
  ambiguous: "bg-amber-400",
  adversarial: "bg-rose-400",
};

const categoryLabelMap: Record<string, string> = {
  easy: "Easy",
  ambiguous: "Ambiguous",
  adversarial: "Adversarial",
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

function formatModelStatus(status: string) {
  return status.replace(/_/g, " ");
}

function summarizeList(items: string[]) {
  return items.length > 0 ? items.join(", ") : "None";
}

function requestFromScenario(scenario: Scenario): DecisionRequest {
  return {
    action: scenario.action,
    user_state: scenario.user_state ?? "",
    conversation_history: scenario.conversation_history,
    simulate_failure: "none",
  };
}

function surfaceOf(scenario: Scenario | null) {
  return scenario?.surface ?? "text";
}

function surfaceMeta(surface: string) {
  if (surface === "email") return { label: "Email", icon: Mail };
  if (surface === "calendar") return { label: "Calendar", icon: CalendarDays };
  return { label: "Text", icon: MessageSquareText };
}

function scenarioTitle(scenario: Scenario) {
  return scenario.title ?? scenario.label;
}

function scenarioPreview(scenario: Scenario) {
  return scenario.preview ?? scenario.conversation_history[0]?.content ?? scenario.action;
}

type ThreadProps = {
  messages: Message[];
  surface: string;
  scenario: Scenario | null;
  action: string;
};

function TextThread({
  messages,
  scenario,
}: {
  messages: Message[];
  scenario: Scenario | null;
}) {
  const contactName = scenario?.label ?? "alfred_";
  const initial = contactName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="bg-black text-white">
      <div className="flex flex-col items-center border-b border-white/5 px-4 py-4">
        <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium">
          {initial}
        </div>
        <p className="text-xs font-medium text-white">{contactName}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">iMessage</p>
      </div>
      <div className="space-y-1 px-3 py-4">
        {messages.map((message, index) => {
          const mine = message.role === "user";
          const next = messages[index + 1];
          const lastInRun = !next || next.role !== message.role;
          return (
            <div key={index} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-5 rounded-[20px]",
                  mine
                    ? cn("bg-[#0A84FF] text-white", lastInRun && "rounded-br-[6px]")
                    : cn("bg-[#2C2C2E] text-white", lastInRun && "rounded-bl-[6px]"),
                )}
              >
                {message.content || <span className="opacity-60">(empty)</span>}
              </div>
            </div>
          );
        })}
        {messages.length > 0 && messages[messages.length - 1].role === "user" ? (
          <p className="pr-3 pt-1 text-right text-[10px] text-zinc-500">Delivered</p>
        ) : null}
      </div>
    </div>
  );
}

function EmailThread({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-3 p-4">
      {messages.map((message, index) => {
        const mine = message.role === "user";
        return (
          <div
            key={index}
            className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
          >
            <div className="mb-3 flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
                  mine
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-foreground",
                )}
              >
                {mine ? "U" : "A"}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{mine ? "You" : "alfred_"}</p>
                <p className="text-xs text-muted-foreground">
                  {mine ? "to alfred_" : "reply draft"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">now</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
              {message.content || <span className="opacity-60">(empty)</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CalendarPreview({ scenario, action, messages }: ThreadProps) {
  const when = /\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)?)\b/i.exec(action)?.[1];
  const target =
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(action)?.[0] ||
    scenario?.label ||
    "alfred_ invitee";

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <span className="text-[10px] uppercase tracking-[0.18em]">Event</span>
            <CalendarDays className="mt-1 h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Calendar invite
            </p>
            <p className="mt-1 truncate text-lg font-medium text-slate-100">
              {scenario ? scenarioTitle(scenario) : action}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {when ? `Scheduled for ${when}` : "Time to be confirmed"}
              {" · with "}
              {target}
            </p>
          </div>
        </div>
      </div>
      <TextThread messages={messages} scenario={scenario} />
    </div>
  );
}

function ConversationSurface(props: ThreadProps) {
  if (props.surface === "email") return <EmailThread messages={props.messages} />;
  if (props.surface === "calendar") return <CalendarPreview {...props} />;
  return <TextThread messages={props.messages} scenario={props.scenario} />;
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
  const [isEditing, setIsEditing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const seeded = await fetchScenarios();
        setScenarios(seeded);
        if (seeded.length > 0) {
          setActiveScenarioId(seeded[0].id);
          setPayload(requestFromScenario(seeded[0]));
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load scenarios.");
      }
    };

    void load();
  }, []);

  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? null,
    [scenarios, activeScenarioId],
  );

  const surface = surfaceOf(activeScenario);
  const surfaceInfo = surfaceMeta(surface);
  const SurfaceIcon = surfaceInfo.icon;

  const handleScenarioSelect = (scenario: Scenario) => {
    setActiveScenarioId(scenario.id);
    setPayload(requestFromScenario(scenario));
    setResult(null);
    setSubmitError(null);
    setIsEditing(false);
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
    setIsEditing(true);
  };

  const submit = async () => {
    setIsLoading(true);
    setSubmitError(null);
    setDialogOpen(true);
    setLastSubmittedPayload({
      ...payload,
      conversation_history: [...payload.conversation_history],
    });

    try {
      const response = await runDecision(payload);
      setResult(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Decision request failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const headerSubtitle = activeScenario
    ? (() => {
        if (surface === "email") return `Email thread · ${scenarioTitle(activeScenario)}`;
        if (surface === "calendar") return `Calendar invite · ${scenarioTitle(activeScenario)}`;
        return `Text thread · ${scenarioTitle(activeScenario)}`;
      })()
    : "New thread";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold tracking-wide text-primary">alfred_</div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Execution decisions that feel product-native.
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Pick a realistic text, email, or calendar thread. alfred_ picks silent, notify,
              confirm, clarify, or refuse.
            </p>
          </div>
          <Badge variant="outline">{scenarios.length || 0} scenarios</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scenarios</CardTitle>
              <CardDescription className="text-xs">
                Threads alfred_ would actually see.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-2 pt-0">
              <ScrollArea className="h-[640px] pr-2">
                <div className="space-y-2 pb-2">
                  {scenarios.map((scenario) => {
                    const info = surfaceMeta(surfaceOf(scenario));
                    const Icon = info.icon;
                    const active = activeScenarioId === scenario.id;
                    return (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => handleScenarioSelect(scenario)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-slate-800 hover:bg-slate-900/70",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  categoryDotMap[scenario.category] ?? "bg-slate-500",
                                )}
                              />
                              <span className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                {categoryLabelMap[scenario.category] ?? scenario.category} ·
                                {" "}
                                {info.label}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm font-medium text-slate-100">
                              {scenarioTitle(scenario)}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {scenarioPreview(scenario)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {loadError ? (
                    <p className="px-2 text-sm text-destructive">{loadError}</p>
                  ) : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-slate-800 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                      <SurfaceIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {activeScenario ? activeScenario.label : "Custom thread"}
                      </CardTitle>
                      <CardDescription className="text-xs">{headerSubtitle}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={isEditing ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIsEditing((value) => !value)}
                    >
                      <Pencil className="h-4 w-4" />
                      {isEditing ? "Done editing" : "Edit"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                      New
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 p-0">
                <div
                  className={cn(
                    "border-b border-slate-800",
                    surface === "text" ? "bg-black" : "bg-slate-950/40",
                  )}
                >
                  <ConversationSurface
                    messages={payload.conversation_history}
                    surface={surface}
                    scenario={activeScenario}
                    action={payload.action}
                  />
                </div>

                <div className="space-y-4 px-5 pb-5">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Proposed action
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-100">
                      {payload.action || "Describe what should happen next."}
                    </p>
                    {payload.user_state ? (
                      <>
                        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          User state
                        </p>
                        <p className="mt-1 text-sm text-slate-100">{payload.user_state}</p>
                      </>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="action">Proposed action</Label>
                          <Input
                            id="action"
                            value={payload.action}
                            placeholder="Send the drafted reply to Acme"
                            onChange={(event) =>
                              setPayload((current) => ({
                                ...current,
                                action: event.target.value,
                              }))
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
                              setPayload((current) => ({
                                ...current,
                                user_state: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Conversation</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addMessage}
                          >
                            <Plus className="h-4 w-4" />
                            Add message
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {payload.conversation_history.map((message, index) => (
                            <div
                              key={index}
                              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                            >
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
                                onChange={(event) =>
                                  updateMessage(index, { content: event.target.value })
                                }
                                placeholder="Write the relevant message here"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <details className="rounded-2xl border border-slate-800 p-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          Failure path demo
                        </summary>
                        <div className="mt-4 space-y-2">
                          <Label htmlFor="failure-mode">
                            Show what happens when the model fails
                          </Label>
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
                    </div>
                  ) : null}

                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      onClick={submit}
                      disabled={isLoading || !payload.action.trim()}
                      className="min-w-[200px]"
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
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>alfred_'s call</DialogTitle>
            <DialogDescription>
              Final decision first. Pipeline details live below.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[68vh] pr-4">
            <div className="space-y-5">
              {isLoading && !result ? (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Running the decision pipeline…
                </div>
              ) : null}

              {submitError ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {submitError}
                </p>
              ) : null}

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

                  <p className="text-lg font-medium leading-7">
                    {decisionHeadlineMap[result.decision]}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{result.rationale}</p>
                  {result.fallback_reason ? (
                    <p className="mt-3 text-sm text-muted-foreground">{result.fallback_reason}</p>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Risk
                      </p>
                      <p className="mt-2 text-lg font-medium">{result.signals.risk_score}/10</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Inferred action
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {formatLabel(result.signals.inferred_action)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Deterministic floor
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {formatLabel(result.signals.deterministic_decision)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {result ? (
                <Accordion type="multiple" className="space-y-3">
                  <AccordionItem value="inputs">
                    <AccordionTrigger>Inputs</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Action
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {lastSubmittedPayload.action || "None provided"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            User state
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {lastSubmittedPayload.user_state?.trim() ||
                              "No explicit user state provided."}
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
                              <p className="mt-2 text-sm leading-7 text-slate-100">
                                {message.content}
                              </p>
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
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Missing params
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {summarizeList(result.signals.missing_params)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Unresolved entities
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {summarizeList(result.signals.unresolved_entities)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Contradiction
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {result.signals.contradiction_detected ? "Yes" : "No"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Unsafe action
                          </p>
                          <p className="mt-2 text-sm text-slate-100">
                            {result.signals.unsafe_action ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-slate-800 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Rules triggered
                        </p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-100">
                          {result.triggered_rules.map((rule, index) => (
                            <li key={index}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                </Accordion>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
