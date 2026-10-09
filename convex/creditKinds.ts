/**
 * The kinds of paid work credits are charged for, how each counts its units,
 * and the placeholder prices the Usage plan was drawn with
 * (docs/plans/active/usage-credits-plan.md). Pure: no database.
 */

export type CreditKind = "rankings" | "aiAnswers" | "keywordResearch" | "siteAudit" | "backlinks" | "assistant" | "taskAlerts" | "taskReports" | "taskResearch";

export type CreditPrice = { credits: number; per: number };

/**
 * Placeholders, as drawn, until the cost audit sets real ones: `credits` for
 * every `per` units. Admin → Settings → Credit prices will hold the real ones.
 */
export const DEFAULT_CREDIT_PRICES: Record<CreditKind, CreditPrice> = {
  rankings: { credits: 4, per: 1_000 },
  aiAnswers: { credits: 1, per: 1 },
  keywordResearch: { credits: 5, per: 1 },
  siteAudit: { credits: 1, per: 50 },
  backlinks: { credits: 10, per: 1_000 },
  assistant: { credits: 1, per: 1 },
  // Hakken tasks (hakken-tasks-plan.md, across all of it): placeholders until
  // the Watcher's real cost is measured (Anthony, 2026-10-07: "Small
  // placeholder prices") — an alert's daily check, a weekly report, a
  // "find out why".
  taskAlerts: { credits: 1, per: 1 },
  taskReports: { credits: 1, per: 1 },
  taskResearch: { credits: 5, per: 1 },
};

/**
 * Credits in a month's plan batch, where neither the company's plan nor
 * Admin → Settings → Credit prices sets a number: 10,000 (Anthony,
 * 2026-10-05: "make the credits default 10,000 credits per month for the
 * moment"), raised the same day from his first placeholder of 1,000.
 */
export const DEFAULT_PLAN_CREDITS = 10_000;
/** The first placeholder, which a platform setting saved before the raise may still hold. */
export const FIRST_PLAN_CREDITS = 1_000;
/** What one credit covers in US dollars of real cost, as recommended (outstanding question 1). */
export const DEFAULT_CREDIT_COVERS_USD = 0.05;

/**
 * Which kind a DataForSEO request is, by its registry family. Keyword
 * research's own requests are charged by the lookup instead, never here.
 */
export function creditKindOfFamily(family: string): CreditKind | null {
  switch (family) {
    case "SERP":
    case "DataForSEO Labs":
    case "Keywords Data":
    // Discovery's Local pages: profiles, map checks and local markets are
    // Google results of their own, charged as rankings until the cost audit
    // says otherwise (discovery-local-reputation-ai-plan.md).
    case "Business Data":
      return "rankings";
    case "AI Optimization":
      return "aiAnswers";
    case "On-Page":
      return "siteAudit";
    case "Backlinks":
      return "backlinks";
    default:
      return null;
  }
}

function readArgs(taskArgsJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(taskArgsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // An unreadable request still counts as one.
  }
  return {};
}

const countOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null);

/** What a list or batch asks for, in rows: its `limit`, else its keywords or websites; null for a single answer. */
function rowsAskedFor(args: Record<string, unknown>): number | null {
  return countOf(args.limit)
    ?? (Array.isArray(args.keywords) && args.keywords.length > 0 ? args.keywords.length : null)
    ?? (Array.isArray(args.targets) && args.targets.length > 0 ? args.targets.length : null);
}

/**
 * The units one request asks for: an AI answer is one answer whatever it
 * returns; a crawl the pages it may read; a list the rows it asks for, a
 * batch its keywords or websites; anything else one. **Not what is charged
 * since 2026-10-05** (finish-off-plan.md, item 3): a request is counted by
 * what came back (`creditUnitsOfAnswer`). Kept for what a collection line
 * planned before then had counted, and as the most an answer can count.
 */
export function creditUnitsOfRequest(kind: CreditKind, taskArgsJson: string): number {
  if (kind === "aiAnswers") return 1;
  const args = readArgs(taskArgsJson);
  if (kind === "siteAudit") return countOf(args.max_crawl_pages) ?? 1;
  return rowsAskedFor(args) ?? 1;
}

/** Whether a request is counted by what comes back — a crawl, a list, a batch — rather than as one answer. */
export function countsWhatCameBack(kind: CreditKind, taskArgsJson: string): boolean {
  if (kind === "aiAnswers") return false;
  if (kind === "siteAudit") return true;
  return rowsAskedFor(readArgs(taskArgsJson)) !== null;
}

/**
 * The units a request counts before its answer is in (finish-off-plan.md,
 * item 3): one for a single answer, which is all it can be, and nothing yet
 * for a crawl or a list, which count what comes back when it comes.
 */
export function creditUnitsUpFront(kind: CreditKind, taskArgsJson: string): number {
  return countsWhatCameBack(kind, taskArgsJson) ? 0 : 1;
}

/**
 * The units a request counts once it is answered (finish-off-plan.md, item
 * 3): the pages a crawl crawled, the rows a list or batch brought back —
 * never more than it asked for — one for a single answer, and an AI answer
 * one whatever it says. An answer whose rows were never counted (one
 * recorded before 2026-10-05 with nothing kept to count) counts what was
 * asked for, as it did then.
 */
export function creditUnitsOfAnswer(kind: CreditKind, taskArgsJson: string, rowsReturned: number | undefined): number {
  if (!countsWhatCameBack(kind, taskArgsJson)) return 1;
  const asked = creditUnitsOfRequest(kind, taskArgsJson);
  if (rowsReturned === undefined || !Number.isFinite(rowsReturned)) return asked;
  const came = Math.max(0, Math.floor(rowsReturned));
  // A crawl sent without its page limit has none to hold it to.
  const askedFor = kind === "siteAudit" ? countOf(readArgs(taskArgsJson).max_crawl_pages) : asked;
  return askedFor === null ? came : Math.min(askedFor, came);
}

/** Credits for a run's units: rounded up to a whole credit, and never a charge for nothing. */
export function creditsForUnits(price: CreditPrice, units: number): number {
  if (units <= 0) return 0;
  return Math.max(1, Math.ceil((units * price.credits) / price.per - 1e-9));
}

/**
 * Credits count in UK time (Anthony, 2026-10-05: "UK time"): a month's plan
 * credits start at midnight in the UK on the 1st and end at the next, and a
 * charge's day and month are its UK date's.
 */
const UK = "Europe/London";
const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit" });
const ukClock = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** A moment's date in the UK, `YYYY-MM-DD`. */
export function creditDayOf(at: number): string {
  return ukDate.format(at);
}

/** How far ahead of UTC the UK is at a moment: nothing in winter, an hour in summer. */
function ukOffsetMs(at: number): number {
  const parts = Object.fromEntries(ukClock.formatToParts(at).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * Midnight in the UK at the start of a date, as a moment. The clocks change at
 * 01:00 UTC, so a UK midnight is never skipped or doubled, and the offset an
 * hour before UTC's midnight is the one in force at it.
 */
function ukMidnight(year: number, monthIndex: number, day: number): number {
  const utc = Date.UTC(year, monthIndex, day);
  return utc - ukOffsetMs(utc - 3_600_000);
}

/** The UK month a moment falls in, and when it starts and ends. */
export function creditMonthOf(at: number): { month: string; startsAt: number; endsAt: number } {
  const day = creditDayOf(at);
  const year = Number(day.slice(0, 4));
  const monthIndex = Number(day.slice(5, 7)) - 1;
  return { month: day.slice(0, 7), startsAt: ukMidnight(year, monthIndex, 1), endsAt: ukMidnight(year, monthIndex + 1, 1) };
}

/** When the UK day a moment falls in started: its midnight. */
export function ukDayStart(at: number): number {
  const day = creditDayOf(at);
  return ukMidnight(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

/** A month named `YYYY-MM`, and when it starts and ends in the UK. */
export function creditMonthNamed(month: string): { month: string; startsAt: number; endsAt: number } {
  return creditMonthOf(ukMidnight(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 15));
}

/** A collection run's charge: one per collection, website and kind of work. */
export function cycleRunKey(cycleId: string, websiteId: string, kind: CreditKind): string {
  return `cycle:${cycleId}:${websiteId}:${kind}`;
}
