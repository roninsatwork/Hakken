import { v, type Infer } from "convex/values";

/**
 * What the Assistant looked up for an answer (docs/plans/active/
 * assistant-foundation-plan.md, item 7): the quiet "Looked up" line under a
 * reply, and the same list in "Why this answer" — each a link to the screen
 * the figures came from, so anyone can check them.
 *
 * Written from the run's own record of its tool calls when the reply is
 * saved, so a long run's look-ups survive its hand-overs, and only for a call
 * that actually read something: a refused one, or one that found the website
 * is not the company's, looked nothing up. Plain code, free of any Convex
 * function, so the server and the screens read the same shape.
 */

export const lookupKindValidator = v.union(
  v.literal("websites"),
  v.literal("overview"),
  v.literal("searchConsole"),
  v.literal("aiMentions"),
  v.literal("tasks"),
);

export const lookupValidator = v.object({
  kind: lookupKindValidator,
  website: v.optional(v.string()),
  days: v.optional(v.number()),
  /** A calendar month read whole, "2026-09": a chart of last month says so, not "last 30 days". */
  month: v.optional(v.string()),
  page: v.optional(v.string()),
  link: v.string(),
});

export type Lookup = Infer<typeof lookupValidator>;

/** The company-figure reads, by handler (`toolConnectorDefinitions.ts`, "assistant-figures"). */
const LOOKUP_KINDS: Record<string, Lookup["kind"]> = {
  "assistant.websites": "websites",
  "assistant.site.overview": "overview",
  "assistant.searchConsole": "searchConsole",
  "assistant.ai.mentions": "aiMentions",
  "assistant.tasks.open": "tasks",
  // Proposing an alert reads the last four weeks of Search Console first.
  "assistant.tasks.propose": "searchConsole",
  // A chart reads Search Console's days (hakken-tasks-plan.md, 2.1).
  "assistant.chart": "searchConsole",
};

/** At most this many on one reply: a line, not a log. */
const MOST_LOOKUPS = 8;

function parse(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function inclusiveDays(from: unknown, to: unknown): number | undefined {
  if (typeof from !== "string" || typeof to !== "string") return undefined;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  return Number.isFinite(days) && days > 0 ? days : undefined;
}

/**
 * The look-ups behind a reply, from the run's tool calls in the order they
 * ran: one per call that read something, the same look-up once.
 */
export function lookupsFromToolCalls(
  calls: Array<{ handlerMapping: string; status: string; argumentsJson: string; resultJson?: string }>,
): Lookup[] {
  const lookups: Lookup[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    const kind = LOOKUP_KINDS[call.handlerMapping];
    if (!kind || call.status !== "SUCCESS") continue;
    // The runtime wraps a handler's answer as { status, data }.
    const data = parse(call.resultJson).data as Record<string, unknown> | undefined;
    if (!data || data.ok === false || typeof data.link !== "string") continue;
    const asked = parse(call.argumentsJson);
    const page = asked.page;
    const month = kind === "searchConsole" && typeof asked.month === "string" && /^\d{4}-\d{2}$/.test(asked.month) ? asked.month : undefined;
    const lookup: Lookup = {
      kind,
      link: data.link,
      ...(typeof data.website === "string" ? { website: data.website } : {}),
      ...(month ? { month } : kind === "searchConsole" && inclusiveDays(data.from, data.to) ? { days: inclusiveDays(data.from, data.to) } : {}),
      ...(kind === "searchConsole" && typeof page === "string" && page.trim() ? { page: page.trim() } : {}),
    };
    const key = JSON.stringify(lookup);
    if (seen.has(key)) continue;
    seen.add(key);
    lookups.push(lookup);
    if (lookups.length >= MOST_LOOKUPS) break;
  }
  return lookups;
}
