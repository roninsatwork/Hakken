import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * A company's own searches and questions, read through the hold they belong
 * to (docs/plans/active/private-tracking-lists-plan.md). Every screen — the
 * client's Sites pages and the admin's company screens — and the planner read
 * the lists here, and only here, by the `by_hold` indexes; the writers that
 * must find everyone who asked read `by_keyword` / `by_prompt` themselves and
 * never show what they find. `websiteTenancyGuard.test.ts` holds both rules.
 *
 * A null hold — a competitor watched against none of the company's own sites
 * (V8) — has no list, and reads as empty.
 */

type Reader = { db: QueryCtx["db"] };

/** A company's questions about a website, oldest first, up to `cap`. */
export async function holdQuestions(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  cap: number,
  options: { activeOnly?: boolean } = {},
): Promise<Doc<"websiteQuestions">[]> {
  if (!holdId) return [];
  return options.activeOnly
    ? await ctx.db
      .query("websiteQuestions")
      .withIndex("by_hold_active", (q) => q.eq("companyWebsiteId", holdId).eq("isActive", true))
      .take(cap)
    : await ctx.db
      .query("websiteQuestions")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
      .take(cap);
}

/** A company's searches for a website, oldest first, up to `cap`. */
export async function holdSearches(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  cap: number,
  options: { activeOnly?: boolean } = {},
): Promise<Doc<"websiteKeywords">[]> {
  if (!holdId) return [];
  return options.activeOnly
    ? await ctx.db
      .query("websiteKeywords")
      .withIndex("by_hold_active", (q) => q.eq("companyWebsiteId", holdId).eq("isActive", true))
      .take(cap)
    : await ctx.db
      .query("websiteKeywords")
      .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
      .take(cap);
}

/** One question on a company's list, or null when it is not on it. */
export async function holdQuestion(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  prompt: string,
): Promise<Doc<"websiteQuestions"> | null> {
  if (!holdId) return null;
  return await ctx.db
    .query("websiteQuestions")
    .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", holdId).eq("prompt", prompt))
    .first();
}

/**
 * How the answers to a company's questions treated its group, a row per
 * question, from the place the list is asked from (`siteListQuestions`, kept
 * by `siteListAi.ts`). A question nothing has answered yet has no row.
 */
export async function holdQuestionAnswers(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  place: number,
  cap: number,
): Promise<Doc<"siteListQuestions">[]> {
  if (!holdId) return [];
  return await ctx.db
    .query("siteListQuestions")
    .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", holdId).eq("locationCode", place))
    .take(cap);
}

/** A company's list added up (`siteListAiSummary`), or null before anything has answered it. */
export async function holdAiSummary(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  place: number,
): Promise<Doc<"siteListAiSummary"> | null> {
  if (!holdId) return null;
  return await ctx.db
    .query("siteListAiSummary")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId).eq("locationCode", place))
    .first();
}

/** One search on a company's list, or null when it is not on it. */
export async function holdSearch(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  keyword: string,
): Promise<Doc<"websiteKeywords"> | null> {
  if (!holdId) return null;
  return await ctx.db
    .query("websiteKeywords")
    .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", holdId).eq("keyword", keyword))
    .first();
}

/**
 * The first Google check a company asked for one of its fan-out queries
 * (docs/plans/active/fan-out-opt-in-plan.md), or null when it has not. The
 * check is filed against the website for everyone; this record is what lets
 * the company read it, as a tracked search's own row does.
 */
export async function holdFirstCheck(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  query: string,
): Promise<Doc<"fanOutFirstChecks"> | null> {
  if (!holdId) return null;
  return await ctx.db
    .query("fanOutFirstChecks")
    .withIndex("by_hold_query", (q) => q.eq("holdId", holdId).eq("query", query))
    .first();
}

/** A company's first checks for a website not filed yet, oldest first, up to `cap`: what its next collection may buy. */
export async function holdFirstChecksDue(
  ctx: Reader,
  holdId: Id<"companyWebsites"> | null,
  cap: number,
): Promise<Doc<"fanOutFirstChecks">[]> {
  if (!holdId || cap <= 0) return [];
  return await ctx.db
    .query("fanOutFirstChecks")
    .withIndex("by_hold_checked", (q) => q.eq("holdId", holdId).eq("checkedDay", undefined))
    .take(cap);
}
