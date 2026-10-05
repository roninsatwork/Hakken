/**
 * The kinds of paid work credits are charged for, how each counts its units,
 * and the placeholder prices the Usage plan was drawn with
 * (docs/plans/active/usage-credits-plan.md). Pure: no database.
 */

export type CreditKind = "rankings" | "aiAnswers" | "keywordResearch" | "siteAudit" | "backlinks" | "assistant";

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
};

/** Credits in a month's plan batch, where the plan sets none: 1,000, his placeholder of 2026-10-05. */
export const DEFAULT_PLAN_CREDITS = 1_000;
/** What one credit covers in US dollars of real cost, as recommended (outstanding question 1). */
export const DEFAULT_CREDIT_COVERS_USD = 0.05;
export const DEFAULT_GBP_PER_USD = 0.79;

/**
 * Which kind a DataForSEO request is, by its registry family. Keyword
 * research's own requests are charged by the lookup instead, never here.
 */
export function creditKindOfFamily(family: string): CreditKind | null {
  switch (family) {
    case "SERP":
    case "DataForSEO Labs":
    case "Keywords Data":
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

/**
 * The units one request counts as: an AI answer is one answer whatever it
 * returns; a crawl counts the pages it may read; a list counts the rows it
 * asks for, a batch its keywords or websites; anything else counts one.
 * Rounded to credits only once a run's units are added up, so a single
 * keyword checked is not charged as a thousand.
 */
export function creditUnitsOfRequest(kind: CreditKind, taskArgsJson: string): number {
  if (kind === "aiAnswers") return 1;
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(taskArgsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    // An unreadable request still counts as one.
  }
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null);
  if (kind === "siteAudit") return count(args.max_crawl_pages) ?? 1;
  return count(args.limit)
    ?? (Array.isArray(args.keywords) && args.keywords.length > 0 ? args.keywords.length : null)
    ?? (Array.isArray(args.targets) && args.targets.length > 0 ? args.targets.length : null)
    ?? 1;
}

/** Credits for a run's units: rounded up to a whole credit, and never a charge for nothing. */
export function creditsForUnits(price: CreditPrice, units: number): number {
  if (units <= 0) return 0;
  return Math.max(1, Math.ceil((units * price.credits) / price.per - 1e-9));
}

/** The UTC month a moment falls in, and when it starts and ends — the month the app's quota reset already uses. */
export function creditMonthOf(at: number): { month: string; startsAt: number; endsAt: number } {
  const date = new Date(at);
  const startsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const endsAt = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { month: new Date(startsAt).toISOString().slice(0, 7), startsAt, endsAt };
}

/** A collection run's charge: one per collection, website and kind of work. */
export function cycleRunKey(cycleId: string, websiteId: string, kind: CreditKind): string {
  return `cycle:${cycleId}:${websiteId}:${kind}`;
}
