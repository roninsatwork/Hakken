import type { ReactNode } from "react";

export type ModelStatusFilter = "active" | "inactive";
export type SyncProviderKey = "google" | "openai" | "anthropic" | "openrouter";

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

/**
 * Which jobs each model is actually handling, keyed by model id.
 *
 * The catalogue used to answer "is this the default?" from the `isDefault` flag
 * on the model row. That flag is real but it is the *fourth* thing the runtime
 * tries: an agent's own choice, then the company's choice for the job, then the
 * platform's choice for the job, and only then the flag. So a starred model
 * could easily be running nothing at all, while the model doing all the work
 * carried no mark.
 *
 * The platform's choices live one row per job in `aiModelDefaults`, which is
 * what `getGlobalModelDefaults` returns and what the Defaults screen edits.
 * Ten rows, so inverting them in the client is cheaper than threading them
 * through the paginated model query.
 */
export function buildDefaultJobsByModelId(
  globalDefaults: { defaults?: GlobalDefaultRow[] } | undefined | null
) {
  const jobsByModelId = new Map<string, string[]>();
  for (const row of globalDefaults?.defaults ?? []) {
    const modelId = row.default?.modelId;
    if (!modelId) continue;
    const existing = jobsByModelId.get(modelId);
    if (existing) existing.push(row.useCase);
    else jobsByModelId.set(modelId, [row.useCase]);
  }
  return jobsByModelId;
}

export function formatModelTag(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * A model's name, as a person would write it.
 *
 * Screens were showing raw ids: a dropdown printed the provider's own
 * identifier while the catalogue showed a readable name for the same model. The
 * provider syncs titleize on the way in, but rows written before that fix still
 * hold the raw id, and a screen should not depend on when someone last pressed
 * Sync.
 *
 * The fallback only fires when the stored name still *looks* like an id: no
 * spaces, and punctuation where words would be. A published name such as
 * "MoonshotAI: Kimi K3" has spaces and is left exactly as it is.
 */
export function formatModelDisplayName(model: {
  friendlyName?: string;
  displayName?: string;
  modelId?: string;
}) {
  const friendly = model.friendlyName?.trim();
  if (friendly) return friendly;

  const displayName = model.displayName?.trim();
  const candidate = displayName || model.modelId?.trim() || "";
  if (!candidate) return "";

  const looksLikeAnId = !candidate.includes(" ") && /[-_/:.]/.test(candidate);
  if (!looksLikeAnId) return candidate;

  return candidate
    .split("/").at(-1)!
    .replace(/[:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isSyncProviderKey(value: string): value is SyncProviderKey {
  return value === "google" || value === "openai" || value === "anthropic" || value === "openrouter";
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

/**
 * Whether this platform can reach the provider, in words.
 *
 * The screen used to print the stored status verbatim — "healthy", "unknown",
 * "degraded" — as a coloured badge. Those are the database's words, not a
 * reader's, and "healthy" in particular meant two different things: the API
 * answered for two providers, and the environment variables parsed for the
 * third. That second meaning is gone; this is the first.
 */
export function describeProviderStatus(isEnabled: boolean, status?: string) {
  if (!isEnabled) return "Off";
  if (status === "healthy") return "Connected";
  if (status === "error") return "Not connected";
  if (status === "degraded") return "Connected, with problems";
  return "Not checked yet";
}

export function describeProviderStatusTone(isEnabled: boolean, status?: string) {
  if (!isEnabled) return "text-muted";
  if (status === "healthy") return "text-[#10b981]";
  if (status === "error") return "text-red-400";
  if (status === "degraded") return "text-[#f59e0b]";
  return "text-muted";
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
 * A model's rate, as money someone can compare.
 *
 * The rate is stored **already per million tokens**. This is not a guess:
 * `calculateModelCostGBP` divides token counts by 1,000,000 before applying it,
 * the detail page's own fields are labelled "per 1M tokens", and every synced
 * record carries `inputTokenUnit: "Per 1M tokens"`.
 *
 * This function used to multiply by a million on the way out, on the assumption
 * that the stored figure was per single token. A model priced at 0.075 per
 * million therefore displayed as "£75000.00", and the same helper feeds the
 * Defaults screen, so the cost shown at the point of choosing a model was wrong
 * by the same factor.
 *
 * Dollars, because that is the currency the number is in: the record says
 * `currency: "USD"`, the pricing fields are entered from the provider's own
 * published dollar price, and nothing in the codebase converts. Printing a "£"
 * in front of a dollar figure was the second thing this got wrong. See
 * `docs/plans/active/admin-ux-plan.md` (E2) for why converting here would have
 * disagreed with every other cost figure in the product.
 */
export function formatTokenCost(costPerMillionTokens: number | undefined) {
  if (!costPerMillionTokens || costPerMillionTokens <= 0) return "—";
  // Two decimals reads as money, but the cheap models are priced in fractions of
  // a cent per million — rounding 0.075 to "0.08" would misquote the provider's
  // own published figure. So two decimals minimum, four when the number needs
  // them.
  const amount = new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(costPerMillionTokens);
  return `$${amount}`;
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
  speech: "Turning text into a spoken voice. Only Google text-to-speech models can do this.",
  realtime: "Live spoken conversation — you talk, it answers straight away and can be interrupted. Only OpenAI realtime models can do this.",
  embedding: "Turning documents into something searchable. Only embedding models can do this.",
  vision: "Reading images and screenshots.",
  "tool-calling": "Deciding which tool to use and with what arguments.",
};

export function describeModelUseCase(useCase: string) {
  return MODEL_USE_CASE_DESCRIPTIONS[useCase] ?? "";
}
