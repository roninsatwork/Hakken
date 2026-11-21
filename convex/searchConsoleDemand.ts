import { v, type Infer, type ObjectType } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { moduleAction, moduleQuery } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite, type SiteReader } from "./siteAccess";
import { checkedCountry } from "./searchConsoleCountries";
import { askLive, checkedRange, countryFilters } from "./searchConsoleReads";
import { beforeOf, historyLimitDay, periodOf } from "./searchConsoleDays";
import { readPeriod } from "./searchConsolePeriodReads";
import { BookShelf } from "./searchConsolePeriodBooks";
import { connectionOf } from "./searchConsoleListSources";
import { checkedLongest } from "./searchConsoleLimits";
import { factsFor } from "./searchConsoleFacts";
import { readPageKinds } from "./pageKinds";
import { pageKindsFrom, type PageKinds } from "./utils/pageKinds";
import { fromGoogle } from "./utils/searchConsolePacks";
import { GOOGLE_MOST_ROWS } from "./searchConsoleApi";
import { demandOf, type DemandPage, type DemandRow } from "./utils/searchConsoleDemand";
import { calendarPeriodValidator, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";

/**
 * Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md; the page was Demand by
 * service until Anthony renamed it on the canvas, 18 November 2026): how often Google showed each of the website's
 * Classifications in the country chosen, and the clicks they got, against the dates before. Its figures follow the
 * country menu ("the country in scope"): the country's own pages, Google's country filter on, each sorted into its
 * Classification by the rules every screen shares (`readPageKinds`), or by Hakken's page type until the website has
 * any.
 *
 * The main home country's pages are kept by the collector for each ready-made period and its dates before
 * (`countryPage`, `searchConsolePeriods.ts`). Another country, other dates, or a period not added up yet are asked of
 * Google when chosen (`searchConsoleLiveDemand`): one ask for the dates and one for the dates before, 25,000 pages a
 * request. Google leaves the searches it keeps private out of a country's pages, so their sum falls short of the
 * country's clicks: the page shows the difference as Private searches, from the boxes' own figures.
 */

const demandArgs = {
  siteId: v.id("companyWebsites"),
  from: v.string(),
  to: v.string(),
  period: v.optional(calendarPeriodValidator),
  /** One of the website's home countries kept ready beside the main one, Google's code; missing for the main one. */
  country: v.optional(v.string()),
};

const demandRow = v.object({
  kind: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  clicksBefore: v.union(v.number(), v.null()),
  impressionsBefore: v.union(v.number(), v.null()),
  pages: v.number(),
});

const demandFigures = {
  /** The days the pages count, as Google answered or the period was kept. */
  from: v.string(),
  to: v.string(),
  /** Whether the dates before are held, so each Classification's move can be shown. */
  comparable: v.boolean(),
  rows: v.array(demandRow),
};

export type DemandAnswer = { from: string; to: string; comparable: boolean; rows: DemandRow[] };

/** A page's Classification: its own, once the website has any; Hakken's page type, kept with it, until then. */
const kindOfWith = (kinds: PageKinds | null) => (page: DemandPage) => (kinds ? kinds.kindOf(page.key) : page.kind || "UNJUDGED");

/**
 * The main home country's kept pages for a ready-made period, added up by Classification: the one read the screen and
 * Ask Hakken both make. Null when they must be asked of Google: another country, other dates, or a period the collector
 * hasn't added up yet.
 */
export async function readDemand(
  ctx: { db: QueryCtx["db"] },
  holdId: Id<"companyWebsites">,
  args: { from: string; to: string; period?: CalendarPeriod; country?: string },
): Promise<DemandAnswer | null> {
  const country = checkedCountry(args.country);
  const connection = await connectionOf(ctx, holdId);
  if (!connection?.newestDay) return null;
  // Only the main country's own pages are kept: an address naming it by its code reads them too.
  if (country !== undefined && country !== connection.mainCountry) return null;
  const period = periodOf(args.from, args.to, connection.newestDay, ukDay(), args.period);
  if (!period) return null;
  // The dates and the dates before of one build name one book of pages: read once (speed fixes, 18 November 2026).
  const shelf = new BookShelf(ctx);
  const now = await readPeriod(ctx, holdId, "web", "countryPage", period, "NOW", undefined, shelf);
  if (!now) return null;
  const before = await readPeriod(ctx, holdId, "web", "countryPage", period, "BEFORE", undefined, shelf);
  const kinds = await readPageKinds(ctx, holdId);
  return { from: now.from, to: now.to, comparable: before !== null, rows: demandOf(now.rows, before?.rows ?? null, kindOfWith(kinds)) };
}

/** The kept figures, or `live` when the page must ask Google (`searchConsoleLiveDemand`). */
export const searchConsoleDemand = moduleQuery({
  module: MENU_FEATURES.searchConsole,
  args: demandArgs,
  returns: v.union(v.object({ live: v.literal(true) }), v.object({ live: v.literal(false), ...demandFigures })),
  handler: async (ctx, args) => await readDemandFor(ctx, args),
});

/** The kept figures, or `live`: the screen's read, and a chat app's (`chatAppEyes/searchConsole.ts`). */
export async function readDemandFor(ctx: SiteReader, args: ObjectType<typeof demandArgs>) {
  checkedRange(args.from, args.to);
  const site = await requireMySite(ctx, args.siteId);
  const demand = await readDemand(ctx, site.hold._id, args);
  return demand ? { live: false as const, ...demand } : { live: true as const };
}

const liveDemandAnswer = v.union(
  v.object({
    ok: v.literal(true),
    ...demandFigures,
    /**
     * The dates' pages stopped at Google's most an ask (`GOOGLE_MOST_ROWS`), the fewest clicks left out: the table says so,
     * as every list asked of Google (review fixes, 18 November 2026).
     */
    cut: v.optional(v.number()),
  }),
  v.object({ ok: v.literal(false), problem: v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_REFUSED"), v.literal("GOOGLE_BUSY")) }),
);

/**
 * The country's pages asked of Google, for the dates and the dates before at once, added up by Classification. The dates
 * before are asked only where Google has figures for them (`googleHasDays`), and set against only where it answered.
 * Without Classifications, a page's type is looked up for the pages with most clicks, up to the website's limit
 * (`consoleLiveFactsRows`), as every live list of pages: the rest read as not judged yet.
 */
export const searchConsoleLiveDemand = moduleAction({
  module: MENU_FEATURES.searchConsole,
  args: demandArgs,
  returns: liveDemandAnswer,
  handler: async (ctx, args): Promise<Infer<typeof liveDemandAnswer>> => {
    checkedRange(args.from, args.to);
    const country = checkedCountry(args.country);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const target = await ctx.runQuery(internal.searchConsoleLists.liveTarget, { companyId, siteId: args.siteId, kind: "page" });
    if (!target) return { ok: false as const, problem: "NOT_CONNECTED" as const };
    checkedLongest(args.from, args.to, target.limits);
    const before = beforeOf(args.from, args.to, args.period);
    const beforeHeld: boolean = before.from >= historyLimitDay(Date.now())
      && await ctx.runQuery(internal.searchConsoleSpans.googleHasDays, { companyId, siteId: args.siteId, from: before.from, to: before.to });
    // The main country is filtered to by `askLive` itself, as every ask naming no country.
    const ask = async (from: string, to: string) => await askLive(ctx, target, {
      startDate: from,
      endDate: to,
      type: "web",
      dimensions: ["page"],
      ...(country ? { dimensionFilterGroups: [{ filters: countryFilters(country) }] } : {}),
    });
    const [now, earlier] = await Promise.all([ask(args.from, args.to), beforeHeld ? ask(before.from, before.to) : null]);
    if (!now.ok) return now;
    const pages: DemandPage[] = fromGoogle(now.rows, false);
    const pagesBefore: DemandPage[] | null = earlier?.ok ? fromGoogle(earlier.rows, false) : null;
    const kinds = target.pageKinds ? pageKindsFrom(target.pageKinds) : null;
    if (!kinds && target.facts) {
      const most = target.limits.liveFactsRows;
      const busiest = (list: readonly DemandPage[]) => [...list].sort((left, right) => right.clicks - left.clicks).slice(0, most).map((page) => page.key);
      // Each page's type alone: Demand shows no estimate (speed fixes, 18 November 2026).
      const facts = await factsFor(ctx, target.facts, "page", [...new Set([...busiest(pages), ...busiest(pagesBefore ?? [])])], { kind: true, number: false });
      for (const page of [...pages, ...(pagesBefore ?? [])]) {
        const kind = facts.get(page.key)?.kind;
        if (kind) page.kind = kind;
      }
    }
    return {
      ok: true as const, from: args.from, to: args.to, comparable: pagesBefore !== null, rows: demandOf(pages, pagesBefore, kindOfWith(kinds)),
      ...(now.rows.length >= GOOGLE_MOST_ROWS ? { cut: GOOGLE_MOST_ROWS } : {}),
    };
  },
});
