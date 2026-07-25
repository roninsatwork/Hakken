import type { ReactNode } from "react";

export type ModelStatusFilter = "active" | "inactive";
export type SyncProviderKey = "google" | "openai" | "anthropic";

export type GlobalDefaultRow = {
  useCase: string;
  default: {
    modelId: string;
    providerKey: string;
    model: {
      displayName: string;
      modelId: string;
      providerKey: string;
      isEnabled: boolean;
    } | null;
  } | null;
};

export const MODEL_CAPABILITY_OPTIONS = [
  "text",
  "reasoning",
  "vision",
  "audio",
  "tool-calling",
  "json-mode",
  "streaming",
  "embeddings",
];

export const MODEL_USE_CASE_OPTIONS = [
  "chat",
  "agent",
  "workflow",
  "report",
  "router",
  "title",
  "embedding",
  "transcription",
  "vision",
  "tool-calling",
];

export function formatModelTag(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isSyncProviderKey(value: string): value is SyncProviderKey {
  return value === "google" || value === "openai" || value === "anthropic";
}

export function getProviderHealthMessage(settings?: string) {
  if (!settings) return "";
  try {
    const parsed = JSON.parse(settings) as { lastHealthMessage?: unknown };
    return typeof parsed.lastHealthMessage === "string" ? parsed.lastHealthMessage : "";
  } catch {
    return "";
  }
}

export function formatProviderDate(value?: number) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function modelSupportsUseCase(model: { supportedUseCases?: string[] }, useCase: string) {
  return !model.supportedUseCases || model.supportedUseCases.length === 0 || model.supportedUseCases.includes(useCase);
}

export function getProviderDisplayName(
  providerKey: string | undefined,
  providerNameByKey: Map<string, string> = new Map()
) {
  if (!providerKey) return "Legacy";
  if (providerKey === "google") return providerNameByKey.get(providerKey) || "Google Vertex AI";
  return providerNameByKey.get(providerKey) || providerKey;
}

export function ModelTagList({
  emptyLabel,
  limit = 3,
  values,
}: {
  emptyLabel: string;
  limit?: number;
  values?: string[];
}) {
  if (!values || values.length === 0) {
    return <span className="text-[11px] font-medium text-muted">{emptyLabel}</span>;
  }

  const visible = values.slice(0, limit);
  const hiddenCount = values.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((value) => (
        <span
          key={value}
          className="inline-flex rounded-[6px] border border-border-dim bg-foreground/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-secondary"
        >
          {formatModelTag(value)}
        </span>
      ))}
      {hiddenCount > 0 && (
        // "+6" told the reader six things existed and gave them no way to find
        // out what. Naming them costs one attribute and answers the question.
        <span
          title={values.slice(limit).map(formatModelTag).join(", ")}
          className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted cursor-help underline decoration-dotted underline-offset-2"
        >
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}

export function ModelAdminHeader({
  children,
  icon,
  subtitle,
  title,
}: {
  children?: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border-dim pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          {icon}
          {title}
        </h1>
        <p className="text-[13px] text-secondary mt-1 tracking-wide">
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

/**
 * A per-token price as money someone can compare.
 *
 * Prices are stored per token, which produces numbers like 0.0000003 — true,
 * and useless for choosing between two models. Per million tokens is the unit
 * every provider publishes and the only one at human scale.
 */
export function formatTokenCost(costPerToken: number | undefined) {
  if (!costPerToken || costPerToken <= 0) return "—";
  const perMillion = costPerToken * 1_000_000;
  // Two decimals reads as money. Below a penny per million, two decimals would
  // round every cheap model to £0.00 and hide the difference between them.
  return perMillion >= 0.01
    ? `£${perMillion.toFixed(2)}`
    : `£${perMillion.toFixed(4)}`;
}

/**
 * What each runtime job actually is, in a sentence.
 *
 * The defaults screen asked which model should handle "Router", "Title" and
 * "Transcription" without ever saying what those are. Choosing between a cheap
 * model and a clever one is a real decision, and it cannot be made by someone
 * who does not know what the job is.
 */
export const MODEL_USE_CASE_DESCRIPTIONS: Record<string, string> = {
  chat: "Ordinary conversations with people.",
  "fast-chat": "Short replies where speed matters more than depth.",
  reasoning: "Harder problems worth spending more time and money on.",
  agent: "Agents working through a task on their own.",
  workflow: "Steps inside an automated workflow.",
  report: "Written summaries and reports.",
  router: "Deciding which model or skill should handle a request. Runs on every message, so a cheap model here saves the most.",
  title: "Naming a conversation from its first message. Trivial work — the cheapest model is the right one.",
  transcription: "Turning speech into text.",
  embedding: "Turning documents into something searchable. Only embedding models can do this.",
  vision: "Reading images and screenshots.",
  "tool-calling": "Deciding which tool to use and with what arguments.",
};

export function describeModelUseCase(useCase: string) {
  return MODEL_USE_CASE_DESCRIPTIONS[useCase] ?? "";
}
