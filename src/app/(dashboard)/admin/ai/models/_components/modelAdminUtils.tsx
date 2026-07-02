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
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          +{hiddenCount}
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
