/**
 * Turning observability numbers into the words the screen actually uses.
 *
 * These screens are read by people who do not build software, so nothing here
 * produces "p95", "OPEX" or a bare millisecond count. A duration reads as "4.2s",
 * a moment reads as "10 minutes ago", and a change reads as "12% more than the
 * week before".
 *
 * Shared rather than page-local because the overview, the job detail and the raw
 * logs all show the same quantities, and three copies of "how do we write a
 * duration" is three chances for them to disagree on the same screen.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * A reference to a message in the catalogue rather than the English itself.
 *
 * These helpers run outside React, so they cannot translate. They return the
 * key (relative to `admin.agents.labels`) plus any parameters, and the screen
 * that renders the label resolves it with `useTranslations("admin.agents.labels")`.
 * This keeps one mapping from platform vocabulary to reader vocabulary while
 * letting the words live in the catalogue with everything else.
 */
export type LabelRef = { key: string; params?: Record<string, string | number> };

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-GB");
}

/**
 * Durations at the precision a reader can act on: sub-second work in
 * milliseconds, ordinary work to one decimal, long work in minutes.
 */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < SECOND_MS) return `${Math.round(ms)}ms`;
  if (ms < MINUTE_MS) return `${(ms / SECOND_MS).toFixed(1)}s`;
  const minutes = Math.floor(ms / MINUTE_MS);
  const seconds = Math.round((ms % MINUTE_MS) / SECOND_MS);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/**
 * Money at a precision that survives both ends of the range. A per-job cost is
 * fractions of a cent and a weekly total is dollars; one fixed precision makes
 * one of them unreadable.
 *
 * Dollars, not pounds. Every rate in the model catalogue is the provider's own
 * published dollar price and nothing converts, so the "£" this used to print was
 * simply the wrong sign in front of the number.
 */
export function formatMoney(usd: number | undefined): string {
  if (usd === undefined || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return "—";
  const percent = rate * 100;
  // A success rate of 99.6% must not round to a reassuring 100%.
  if (percent > 99 && percent < 100) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

export type Change = {
  label: LabelRef;
  direction: "up" | "down" | "flat" | "unknown";
};

/**
 * A count against the same span before it, as a proportion.
 *
 * Returns "unknown" rather than a fabricated 100% when there was nothing to
 * compare against — a first week of traffic is not an infinite improvement.
 */
export function formatCountChange(current: number, previous: number): Change {
  if (previous === 0) {
    return current === 0
      ? { label: { key: "change.noChange" }, direction: "flat" }
      : { label: { key: "change.nothingToCompare" }, direction: "unknown" };
  }

  const ratio = (current - previous) / previous;
  const percent = Math.round(Math.abs(ratio) * 100);
  if (percent === 0) return { label: { key: "change.aboutSame" }, direction: "flat" };

  return {
    label: { key: ratio > 0 ? "change.moreCount" : "change.fewerCount", params: { percent } },
    direction: ratio > 0 ? "up" : "down",
  };
}

/**
 * A rate against the same span before it, in percentage points.
 *
 * Points rather than a proportion because "the success rate fell 1.2 points" is
 * a statement a reader can check against the number above it; "fell 1.2%" of a
 * percentage is a quantity almost nobody reads correctly.
 */
export function formatRateChange(current: number, previous: number, options?: { higherIsBetter?: boolean }): Change {
  const higherIsBetter = options?.higherIsBetter ?? true;
  const points = (current - previous) * 100;
  const rounded = Math.round(Math.abs(points) * 10) / 10;

  if (rounded === 0) return { label: { key: "change.aboutSame" }, direction: "flat" };

  const improved = points > 0 === higherIsBetter;
  return {
    label: { key: points > 0 ? "change.ptsHigher" : "change.ptsLower", params: { points: rounded } },
    direction: improved ? "up" : "down",
  };
}

/** How long ago something happened, in the roundest true unit. */
export function formatRelativeTime(timestamp: number, now: number): LabelRef {
  const elapsed = now - timestamp;
  if (elapsed < 0) return { key: "relative.justNow" };
  if (elapsed < MINUTE_MS) return { key: "relative.justNow" };
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return { key: "relative.minutesAgo", params: { count: minutes } };
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return { key: "relative.hoursAgo", params: { count: hours } };
  }
  const days = Math.floor(elapsed / DAY_MS);
  if (days === 1) return { key: "relative.yesterday" };
  return { key: "relative.daysAgo", params: { count: days } };
}

/** The short weekday for a chart column, in the reader's language. */
export function formatDayLabel(dayStartMs: number, locale = "en-GB"): string {
  return new Date(dayStartMs).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });
}

/**
 * How a job's status reads on screen.
 *
 * PENDING_APPROVAL in particular: the platform's own word for it says nothing
 * to somebody who has not been told what an approval gate is, and it is the one
 * status that requires the reader to go and do something.
 */
export function describeRunStatus(status: string, continued = false): LabelRef {
  switch (status) {
    case "SUCCESS": return { key: "runStatus.done" };
    // A run that worked to its per-run ceiling and whose queue the next run
    // picked up is the system pacing itself, not a fault. Only a run nothing
    // continued reads as failed.
    case "FAILED": return { key: continued ? "runStatus.handedOver" : "runStatus.failed" };
    case "CANCELLED": return { key: "runStatus.stopped" };
    case "RUNNING": return { key: "runStatus.running" };
    case "QUEUED": return { key: "runStatus.queued" };
    case "PENDING_APPROVAL": return { key: "runStatus.needsYou" };
    default: return { key: "runStatus.unknown", params: { status } };
  }
}

/** The trigger, said as a person would say it. */
export function describeTrigger(trigger: string): LabelRef {
  switch (trigger) {
    case "CHAT": return { key: "trigger.chat" };
    case "MANUAL": return { key: "trigger.manual" };
    case "SCHEDULE": return { key: "trigger.schedule" };
    case "WEBHOOK": return { key: "trigger.webhook" };
    case "WORKFLOW": return { key: "trigger.workflow" };
    case "EVENT": return { key: "trigger.event" };
    default: return { key: "trigger.unknown", params: { trigger } };
  }
}

/** `property_search` reads as `property search`. */
function humaniseToolName(raw: string): string {
  return raw.trim().replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * What a raw log entry was, in words.
 *
 * The stored value is the runtime's own label — "LLM SYNTHESIS", "TOOL
 * DISPATCH: property_search", "BATCH_GENERATION_START". Those are written for
 * whoever is reading a stack trace, not for the person asking why their agent
 * stopped working.
 */
export function describeInteractionType(interactionType: string): LabelRef {
  const raw = interactionType.trim();

  const dispatch = /^TOOL DISPATCH:\s*(.+)$/i.exec(raw);
  if (dispatch) return { key: "interaction.usedTool", params: { tool: humaniseToolName(dispatch[1]) } };

  const awaiting = /^TOOL AWAITING APPROVAL:\s*(.+)$/i.exec(raw);
  if (awaiting) return { key: "interaction.waitingTool", params: { tool: humaniseToolName(awaiting[1]) } };

  switch (raw.toUpperCase()) {
    case "LLM SYNTHESIS": return { key: "interaction.synthesis" };
    case "ERROR": return { key: "interaction.error" };
    case "WORKFLOW_EXECUTION": return { key: "interaction.workflowExecution" };
    case "BATCH_GENERATION_START": return { key: "interaction.batchStart" };
    case "BATCH_GENERATION_SUCCESS": return { key: "interaction.batchSuccess" };
    case "SWARM MICRO-EXECUTION": return { key: "interaction.swarm" };
    case "SYSTEM INSTRUCTION": return { key: "interaction.systemInstruction" };
    default: return { key: "interaction.unknown", params: { type: raw } };
  }
}

/** Long enough to recognise the entry, short enough to stay on one row. */
const PREVIEW_MAX_CHARS = 120;

/** `maxPrice` reads as `max price`. */
function humaniseKey(key: string): string {
  return key
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

/**
 * A JSON payload read as a sentence rather than as syntax.
 *
 * Most tool dispatches are stored as an object of arguments, and a row showing
 * `{"area":"Bristol","bedrooms":3}` makes a reader parse punctuation to learn
 * something the screen could simply have said. Nested values are dropped: they
 * cannot be rendered on one line, and a truncated object is worse than an
 * honest omission.
 */
function previewFromJson(raw: string): string | undefined {
  if (!raw.startsWith("{")) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value === "object") continue;
    parts.push(`${humaniseKey(key)} ${String(value)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * The gist of a log entry, for the row somebody scans before deciding whether
 * to open it.
 *
 * Without this the raw log listed what kind of thing each entry was but never
 * what it was about, so every property search on the page read identically and
 * the only way to find the one that mattered was to open all of them.
 *
 * Returns `undefined` when there is nothing to preview; the screen says
 * "Nothing was recorded" in the reader's language. Content is data, not copy —
 * it is never routed through the catalogue.
 */
export function summariseLogContent(content: string | undefined): string | undefined {
  const raw = (content ?? "").trim();
  if (!raw) return undefined;

  const collapsed = (previewFromJson(raw) ?? raw).replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;

  return collapsed.length > PREVIEW_MAX_CHARS
    ? `${collapsed.slice(0, PREVIEW_MAX_CHARS - 1).trimEnd()}…`
    : collapsed;
}

/**
 * A tool's name as configured, falling back to its handler when the catalogue
 * has no entry — which happens for connectors that were removed after the calls
 * were made.
 */
export function describeToolName(handlerMapping: string, nameByHandler: Map<string, string>): string {
  return nameByHandler.get(handlerMapping) ?? handlerMapping;
}
