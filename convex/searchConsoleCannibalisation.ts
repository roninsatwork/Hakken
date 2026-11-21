import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { moduleAction } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { titlesOf } from "./pageTitles";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { searchTypeValidator } from "./searchConsoleSchema";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { checkedCountry } from "./searchConsoleCountries";
import { checkedLongest, type ConsoleLimits } from "./searchConsoleLimits";
import { isHome, pathOfPage, splitsKeyword } from "./utils/cannibalisationRule";
import { pageWithoutSection } from "./utils/searchConsoleViews";
import type { Id } from "./_generated/dataModel";

/**
 * Keyword cannibalisation's chart (Way 3, Anthony on the canvas, 20 November 2026: "lets build it as i dont understand
 * and need to see it working"): which of the website's pages Google showed for one keyword, each day, asked of Google
 * when the keyword is ticked in the table — one ask, in the country chosen, as a keyword's own screen asks. Its pages by
 * the rule (`cannibalisationRule.ts`): the home page left out, a page and its section links one, and those taking at
 * least 1 in 10 of the keyword's impressions marked as counted, so the chart's Pages menu opens on them.
 */

const dayValidator = v.object({ day: v.string(), clicks: v.number(), impressions: v.number(), position: v.number() });
const pageValidator = v.object({
  page: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  /** Google's average position over the dates, weighted by impressions; null with none. */
  position: v.union(v.number(), v.null()),
  /** It took at least 1 in 10 of the keyword's impressions, the home page left out: it counts as competing. */
  counted: v.boolean(),
  /** Its title, where the website's page list has one. */
  title: v.optional(v.string()),
  days: v.array(dayValidator),
});

export const keywordPagesAnswer = v.union(
  v.object({
    ok: v.literal(true),
    pages: v.array(pageValidator),
    /** Days Google showed a different page most than on the last day it showed the keyword. */
    swaps: v.number(),
    /** Days Google showed the keyword at all. */
    days: v.number(),
  }),
  v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
);
export type KeywordPagesAnswer = Infer<typeof keywordPagesAnswer>;

type Line = { day: string; page: string; clicks: number; impressions: number; position: number };

/** Each page's days and figures, and the days Google swapped the page it showed most. Plain code, for its tests. */
export function keywordPagesOf(lines: readonly Line[]): Extract<KeywordPagesAnswer, { ok: true }> {
  const byPage = new Map<string, Map<string, { clicks: number; impressions: number; positionSum: number }>>();
  for (const line of lines) {
    // A page and a link to one of its sections are one page (2026-10-04); the home page is never counted.
    const page = pageWithoutSection(line.page);
    if (isHome(pathOfPage(page))) continue;
    const days = byPage.get(page) ?? new Map();
    const held = days.get(line.day) ?? { clicks: 0, impressions: 0, positionSum: 0 };
    held.clicks += line.clicks;
    held.impressions += line.impressions;
    held.positionSum += line.position * line.impressions;
    days.set(line.day, held);
    byPage.set(page, days);
  }
  const pages = [...byPage].map(([page, days]) => {
    const list = [...days].map(([day, held]) => ({ day, clicks: held.clicks, impressions: held.impressions, position: held.impressions > 0 ? held.positionSum / held.impressions : 0 }))
      .sort((left, right) => left.day.localeCompare(right.day));
    const impressions = list.reduce((sum, day) => sum + day.impressions, 0);
    const positionSum = list.reduce((sum, day) => sum + day.position * day.impressions, 0);
    return { page, clicks: list.reduce((sum, day) => sum + day.clicks, 0), impressions, position: impressions > 0 ? positionSum / impressions : null, days: list };
  });
  const shown = pages.reduce((sum, page) => sum + page.impressions, 0);
  const ranked = pages
    .map((page) => ({ ...page, counted: splitsKeyword(page.impressions, shown) }))
    .sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks || left.page.localeCompare(right.page));
  // Each day's page shown most (then clicked most, then A to Z), against the last day the keyword was shown.
  const tops = new Map<string, { page: string; impressions: number; clicks: number }>();
  for (const page of ranked) {
    for (const day of page.days) {
      const best = tops.get(day.day);
      if (!best || day.impressions > best.impressions || (day.impressions === best.impressions && (day.clicks > best.clicks || (day.clicks === best.clicks && page.page < best.page)))) {
        tops.set(day.day, { page: page.page, impressions: day.impressions, clicks: day.clicks });
      }
    }
  }
  let swaps = 0;
  let last: string | null = null;
  for (const day of [...tops.keys()].sort()) {
    const top = tops.get(day)!.page;
    if (last !== null && top !== last) swaps += 1;
    last = top;
  }
  return { ok: true as const, pages: ranked, swaps, days: tops.size };
}

export const searchConsoleKeywordPagesByDay = moduleAction({
  module: MENU_FEATURES.searchConsole,
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    key: v.string(),
    from: v.string(),
    to: v.string(),
    country: v.optional(v.string()),
  },
  returns: keywordPagesAnswer,
  handler: async (ctx, args): Promise<KeywordPagesAnswer> => {
    checkedRange(args.from, args.to);
    checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target: { connectionId: Id<"searchConsoleConnections">; property: string; limits: ConsoleLimits } | null =
      await ctx.runQuery(internal.searchConsoleReads.liveDaysTarget, { companyId, siteId: args.siteId });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const answer = await askLive(ctx, target, {
      startDate: args.from,
      endDate: args.to,
      type: args.searchType,
      dimensions: ["date", "page"],
      dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: args.key }, ...countryFilters(args.country)] }],
    });
    if (!answer.ok) return answer;
    const found = keywordPagesOf(answer.rows.map((row) => ({ day: row.keys[0] ?? "", page: row.keys[1] ?? "", clicks: row.clicks, impressions: row.impressions, position: row.position })));
    // Each page by its title, as the tables name them: the pages the chart can draw, a few dozen at most.
    const titles: Array<{ page: string; title: string }> = await ctx.runQuery(internal.searchConsoleCannibalisation.titlesFor, { siteId: args.siteId, pages: found.pages.slice(0, MOST_TITLED).map((page) => page.page) });
    const titleOf = new Map(titles.map((entry) => [entry.page, entry.title]));
    return { ...found, pages: found.pages.map((page) => (titleOf.has(page.page) ? { ...page, title: titleOf.get(page.page)! } : page)) };
  },
});

/** The pages named by title at most: past them a page is named by its address. */
const MOST_TITLED = 40;

/** The titles of a keyword's pages, for the action above, which has checked the website is the caller's own. */
export const titlesFor = internalQuery({
  args: { siteId: v.id("companyWebsites"), pages: v.array(v.string()) },
  returns: v.array(v.object({ page: v.string(), title: v.string() })),
  handler: async (ctx, args) => [...(await titlesOf(ctx, args.siteId, args.pages.slice(0, MOST_TITLED)))].map(([page, title]) => ({ page, title })),
});
