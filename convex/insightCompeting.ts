import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { MOST_A_WEEK, type SavedFinding } from "./insightsTeam";
import { shiftDay } from "./utils/insightFacts";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { readPeriod } from "./searchConsolePeriodReads";
import { BookNames } from "./searchConsolePeriodBooks";
import { askVolumesFor, searchVolumeOf } from "./searchVolumes";
import { normaliseKeyword } from "./seoJudgments";
import { historyOf, monthsOf, pageKindsOf } from "./insightsPeriodData";
import { clickRatesOf } from "./utils/heroes";
import { shiftMonth } from "./utils/insightHistory";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { brandWordsOf, competingFinding, competingGroupValidator, competingGroups, competingSummary, pathOfPage, type CompetingPair, type KeptGroup, type PageFigures, type SearchFigures } from "./utils/insightCompeting";

/**
 * Keyword cannibalisation (docs/plans/active/insights-intelligence-plan.md
 * phase 3; Anthony, 12 October 2026: "I want a specific keyword
 * cannibalisation section, under Findings"): each week the run reads Search
 * Console's Pages competing list over the last 90 days, gathers the pages
 * into groups (utils/insightCompeting.ts), weighs each search by how often it
 * is searched, keeps the groups for the screens and writes the biggest up as
 * findings. Only the caller's own company is ever read.
 */

/** Groups written up as findings a week, the most shown first, and the days until each is checked. */
const GROUP_FINDINGS = 5;
const GROUP_CHECK_DAYS = 56;

type RunCompeting = Awaited<ReturnType<typeof competingForRun>>;

/**
 * For the weekly run: the groups now, the biggest the run is sure of written
 * up as findings after the specialists' — built from their own figures, every
 * number the group's — and the Executive summary's summing up.
 */
export async function competingForRun(ctx: ActionCtx, holdId: Id<"companyWebsites">, today: string, rank: number) {
  const competing = await ctx.runQuery(internal.insightCompeting.groupsForRun, { holdId }).catch(() => null);
  const findings = new Map<string, SavedFinding>();
  for (const group of (competing?.groups ?? []).filter((entry) => entry.sure === "LIKELY").slice(0, GROUP_FINDINGS)) {
    findings.set(group.key, { ...competingFinding(group, competing!, shiftDay(today, GROUP_CHECK_DAYS)), status: "PUBLISHED", rank: rank + findings.size + 1 });
  }
  return { competing, findings, summary: competing && competing.groups.length > 0 ? competingSummary(competing.groups) : null };
}

/** After the week is saved: its groups kept beside their findings, their searches' volumes asked for, and the run's log saying so. */
export async function keepCompeting(
  ctx: ActionCtx,
  run: { holdId: Id<"companyWebsites">; runId: Id<"agentRuns">; companyId: Id<"companies"> },
  week: string,
  { competing, findings }: RunCompeting,
  saved: readonly SavedFinding[],
  publishedIds: readonly Id<"insightFindings">[],
): Promise<void> {
  if (!competing) return;
  // The week keeps its first findings, and returns the published ones' ids in their order.
  const ids = new Map<SavedFinding, Id<"insightFindings">>();
  let at = 0;
  for (const finding of saved.slice(0, MOST_A_WEEK)) if (finding.status === "PUBLISHED") ids.set(finding, publishedIds[at++]);
  const kept = await ctx.runMutation(internal.insightCompeting.saveGroups, {
    holdId: run.holdId, week, from: competing.from, to: competing.to,
    groups: competing.groups.map((group) => {
      const findingId = ids.get(findings.get(group.key)!);
      return { group, ...(findingId ? { findingId } : {}) };
    }),
  });
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: "Keyword cannibalisation",
    detail: `${kept.saved} groups of competing pages kept, ${findings.size} written up as findings; ${kept.volumesAsked} searches' monthly volumes asked for.`,
    failed: false,
  });
}

/** Groups a website keeps: the rule is the newest week's, and never more than this. */
const MOST_KEPT = 40;

/** Days of a span, as months: clicks a month from a 90-day list. */
const monthsIn = (from: string, to: string) => Math.max(1, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) + 86_400_000) / (30.44 * 86_400_000));

/** A page path as both lists name it: Analytics' landing pages drop the closing slash that Search Console's keep. */
const pathKey = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/**
 * Each page's visits and enquiries from the history: the last 12 whole months,
 * and the newest three against the same three a year before.
 */
function pageFiguresFrom(records: Awaited<ReturnType<typeof historyOf>>, whole: readonly string[]) {
  const months = [...whole].sort();
  const year = new Set(months.slice(-12));
  const recent = months.slice(-3);
  const before = recent.map((month) => shiftMonth(month, -12));
  const heldBefore = before.every((month) => months.includes(month));
  const totals = new Map<string, { visits: number; enquiries: number; recent: number; recentBefore: number }>();
  for (const record of records) {
    if (record.kind !== "GA_PAGES") continue;
    const inYear = year.has(record.month), inRecent = recent.includes(record.month), inBefore = before.includes(record.month);
    if (!inYear && !inBefore) continue;
    for (const row of record.rows) {
      const key = pathKey(row.key);
      const held = totals.get(key) ?? { visits: 0, enquiries: 0, recent: 0, recentBefore: 0 };
      if (inYear) {
        held.visits += row.visits ?? 0;
        held.enquiries += row.enquiries ?? 0;
      }
      if (inRecent) held.recent += row.enquiries ?? 0;
      if (inBefore) held.recentBefore += row.enquiries ?? 0;
      totals.set(key, held);
    }
  }
  return (path: string) => {
    const held = totals.get(pathKey(path));
    return { visits: held?.visits ?? 0, enquiries: held?.enquiries ?? 0, recent: held?.recent ?? 0, recentBefore: heldBefore ? held?.recentBefore ?? 0 : null };
  };
}

/**
 * The website's groups of competing pages now, from what Hakken holds: Search
 * Console's 90-day Pages competing and searches lists, Analytics' history and
 * the company's page classifications, and the searches' monthly volumes as far
 * as they are held. Null when Search Console has built no competing list yet.
 */
export async function competingNow(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, host: string): Promise<{ from: string; to: string; groups: KeptGroup[] } | null> {
  const competing = await readPeriod(ctx, hold._id, "web", "competing", "90", "NOW");
  if (!competing || competing.rows.length === 0) return null;
  const searches = await readPeriod(ctx, hold._id, "web", "query", "90", "NOW");
  // Both lists come from one build, so a search is the same token in each; named only for the competing rows.
  const sameBook = Boolean(competing.book && searches?.book && competing.book.builtAt === searches.book.builtAt);
  const names = competing.book ? await new BookNames(ctx, competing.book).textsOf(competing.rows.flatMap((row) => [row.key, row.page ?? ""])) : new Map<string, string>();
  const text = (token: string) => names.get(token) ?? token;
  const figuresByToken = new Map<string, SearchFigures>();
  const brandSearches = new Set<string>();
  for (const row of sameBook ? searches?.rows ?? [] : []) {
    figuresByToken.set(row.key, { position: row.impressions > 0 ? row.positionSum / row.impressions : null, volume: row.volume !== undefined && row.volume >= 0 ? row.volume : null });
    if (row.brand && names.has(row.key)) brandSearches.add(text(row.key));
  }
  const bySearch = new Map<string, SearchFigures>();
  const pairs: CompetingPair[] = competing.rows.map((row) => {
    const search = text(row.key);
    const figures = figuresByToken.get(row.key);
    if (figures) bySearch.set(search, figures);
    return { search, page: text(row.page ?? ""), clicks: row.clicks, impressions: row.impressions };
  });

  const records = await historyOf(ctx, hold._id);
  const kindOf = await pageKindsOf(ctx, hold._id);
  const whole = monthsOf(records, kindOf).filter((month) => month.whole).map((month) => month.month);
  const visitsOf = pageFiguresFrom(records, whole);
  // Each page's showings for every search over the same 90 days, to tell a page living off the owner's searches from one with its own.
  const pageList = await readPeriod(ctx, hold._id, "web", "page", "90", "NOW");
  const shownAll = new Map<string, number>();
  for (const row of pageList?.rows ?? []) {
    const path = pathKey(pathOfPage(row.key));
    shownAll.set(path, (shownAll.get(path) ?? 0) + row.impressions);
  }
  const pageOf = (path: string): PageFigures => {
    const kind = kindOf(path);
    return { kind: kind.name, type: kind.type, ...visitsOf(path), shownAll: shownAll.get(pathKey(path)) ?? null };
  };
  const clickRates = clickRatesOf((searches?.rows ?? []).map((row) => ({ impressions: row.impressions, clicks: row.clicks, position: row.impressions > 0 ? row.positionSum / row.impressions : 0 })));
  const months = monthsIn(competing.from, competing.to);
  const lastYear = monthsOf(records, kindOf).filter((month) => month.whole).slice(-12);
  const yearVisits = lastYear.reduce((sum, month) => sum + month.visits, 0);
  const websiteRate = yearVisits > 0 ? lastYear.reduce((sum, month) => sum + month.enquiries, 0) / yearVisits : null;
  const input = { pairs, brandSearches, brandWords: brandWordsOf(host), pageOf, clickRates, websiteRate, months };
  const first = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });

  // The volumes bought for the groups' searches so far (DataForSEO, from the website's place), then the groups again with them.
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  for (const search of new Set(first.flatMap((group) => group.searches.filter((entry) => entry.volume === null).map((entry) => entry.search)))) {
    const held = await searchVolumeOf(ctx, normaliseKeyword(search), locationCode);
    if (held?.volume === null || held?.volume === undefined) continue;
    bySearch.set(search, { position: bySearch.get(search)?.position ?? null, volume: held.volume });
  }
  const groups = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });
  return { from: competing.from, to: competing.to, groups };
}

/** For the weekly run: the groups now, read in one query. */
export const groupsForRun = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ from: v.string(), to: v.string(), groups: v.array(competingGroupValidator) })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    return hold && website ? await competingNow(ctx, hold, website.displayHost ?? website.host) : null;
  },
});

/**
 * The week's groups saved, the run's before them replaced, each with the
 * finding written for it; and the searches still without a monthly volume
 * asked of DataForSEO, so next week's groups are weighed by them.
 */
export const saveGroups = internalMutation({
  args: {
    holdId: v.id("companyWebsites"),
    week: v.string(),
    from: v.string(),
    to: v.string(),
    groups: v.array(v.object({ group: competingGroupValidator, findingId: v.optional(v.id("insightFindings")) })),
  },
  returns: v.object({ saved: v.number(), volumesAsked: v.number() }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return { saved: 0, volumesAsked: 0 };
    const old = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOST_KEPT);
    for (const row of old) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const [at, entry] of args.groups.slice(0, MOST_KEPT).entries()) {
      await ctx.db.insert("insightCompetingGroups", {
        companyId: hold.companyId, companyWebsiteId: args.holdId, week: args.week, rank: at + 1, from: args.from, to: args.to,
        group: entry.group, ...(entry.findingId ? { findingId: entry.findingId } : {}), createdAt: now,
      });
    }
    const unknown = args.groups.flatMap((entry) => entry.group.searches.filter((search) => search.volume === null).map((search) => search.search));
    const volumesAsked = await askVolumesFor(ctx, hold, unknown, now);
    return { saved: Math.min(args.groups.length, MOST_KEPT), volumesAsked };
  },
});


const keptValidator = v.object({
  rank: v.number(),
  week: v.string(),
  from: v.string(),
  to: v.string(),
  group: competingGroupValidator,
  findingId: v.union(v.id("insightFindings"), v.null()),
});

/** The website a company-wide read shows: the one chosen, or its first owned website holding groups. */
async function siteFor(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<{ hold: Doc<"companyWebsites">; host: string } | null> {
  if (!ctx.companyId) return null;
  if (siteId) await requireMySite(ctx, siteId);
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED" && (!siteId || entry.hold._id === siteId));
  for (const entry of owned) {
    const any = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", entry.hold._id)).first();
    if (any) return { hold: entry.hold, host: entry.summary.host };
  }
  return owned[0] ? { hold: owned[0].hold, host: owned[0].summary.host } : null;
}

const keptOf = (row: Doc<"insightCompetingGroups">) => ({ rank: row.rank, week: row.week, from: row.from, to: row.to, group: row.group, findingId: row.findingId ?? null });

/** Keyword cannibalisation: every group of competing pages, biggest first. */
export const insightsCannibalisation = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), v.object({ siteId: v.id("companyWebsites"), host: v.string(), groups: v.array(keptValidator) })),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    if (!site) return null;
    const rows = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", site.hold._id)).take(MOST_KEPT);
    return { siteId: site.hold._id, host: site.host, groups: rows.map(keptOf) };
  },
});

/** One group of competing pages, by its owner page. */
export const insightsCompetingGroup = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")), key: v.string() },
  returns: v.union(v.null(), v.object({ siteId: v.id("companyWebsites"), host: v.string(), kept: v.union(v.null(), keptValidator), finding: v.union(v.null(), v.object({ headline: v.string(), action: v.string(), checkOn: v.union(v.string(), v.null()) })) })),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    if (!site) return null;
    const rows = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", site.hold._id)).take(MOST_KEPT);
    const row = rows.find((entry) => entry.group.key === args.key) ?? null;
    const finding = row?.findingId ? await ctx.db.get(row.findingId) : null;
    return {
      siteId: site.hold._id,
      host: site.host,
      kept: row ? keptOf(row) : null,
      finding: finding && finding.companyWebsiteId === site.hold._id ? { headline: finding.headline, action: finding.action, checkOn: finding.checkOn ?? null } : null,
    };
  },
});
