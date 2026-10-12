import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { MOST_A_WEEK, type SavedFinding, type TeamMember } from "./insightsTeam";
import { ask, factLines, type AskRun } from "./insightsAsk";
import { factsByKey, fillFacts, type Fact } from "./utils/insightFacts";
import { typedNumbers } from "./utils/insightEditor";
import { briefFor } from "./utils/insightBriefs";
import { COMPETING_ANSWER, agentInputOf, applyAnswer, carryOver, signatureOf } from "./utils/insightCompetingAgent";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { readPeriod } from "./searchConsolePeriodReads";
import { BookNames } from "./searchConsolePeriodBooks";
import { askDifficultyFor, askVolumesFor, difficultiesOf, searchVolumeOf } from "./searchVolumes";
import { normaliseKeyword } from "./seoJudgments";
import { historyOf, monthsOf, pageKindsOf } from "./insightsPeriodData";
import { clickRatesOf } from "./utils/heroes";
import { SOURCE_JOIN, fromGoogleSearch, shiftMonth } from "./utils/insightHistory";
import { DEFAULT_LOCATION_CODE, findSeoLocation, resolveLocationCode } from "./utils/seoLocations";
import { namedIn } from "./utils/placeNames";
import {
  OWNER_RULE, brandWordsOf, competingDraft, competingFacts, competingGroupValidator, competingGroups, competingSummary, mostSearched, nameGroups, pathOfPage,
  type CompetingPair, type KeptGroup, type PageFigures, type Places, type SearchFigures,
} from "./utils/insightCompeting";

/**
 * Keyword cannibalisation (docs/plans/active/insights-intelligence-plan.md
 * phase 3; Anthony, 12 October 2026: "I want a specific keyword
 * cannibalisation section, under Findings"): each week the run reads Search
 * Console's Pages competing list over the last 90 days, gathers the pages
 * into groups (utils/insightCompeting.ts), weighs each search by how often it
 * is searched, and the rule gives each search its page. The Head of Strategy
 * then hands the groups the rule reads anew to its Keyword cannibalisation
 * specialist, which decides and writes them up (Anthony, 12 October 2026: "it
 * should be routed to the head of strategy then assigned to the
 * cannibalisation agent when appropriate … this way we get consistency").
 * What it decided is kept once and read by the screens, the findings, Page
 * decisions and Ask Hakken. Only the caller's own company is ever read.
 */

/** Groups written up as findings a week, the most shown first. */
const GROUP_FINDINGS = 5;
/** Groups the specialist is asked about at once. */
const AT_ONCE = 4;
/** The specialist's role: the run asks it as this member, or as the lead while it has none. */
export const COMPETING_ROLE = "INSIGHTS_CANNIBALISATION";

type RunCompeting = Awaited<ReturnType<typeof competingForRun>>;
type CompetingRun = AskRun & { holdId: Id<"companyWebsites"> };

/**
 * For the Head of Strategy's weekly run: the groups now, each the rule reads
 * just as it did last week keeping last week's decision, every other handed
 * to the Keyword cannibalisation specialist (`rules` the run's ground rules);
 * the biggest written up as drafts for the Head of Strategy to rank and the
 * Editor to check, with the facts they name; and the Executive summary's
 * summing up. A group the specialist wasn't reached for keeps the rule's
 * decision, said so on its screen. Never throws: the week goes on without it.
 */
export async function competingForRun(ctx: ActionCtx, run: CompetingRun, week: string, rules: string, member: TeamMember | undefined) {
  const competing = await ctx.runQuery(internal.insightCompeting.groupsForRun, { holdId: run.holdId }).catch(() => null);
  const none = { competing, drafts: [] as ReturnType<typeof competingDraft>[], facts: [] as Fact[], summary: null };
  if (!competing || competing.groups.length === 0) return none;
  const last = await ctx.runQuery(internal.insightCompeting.keptForRun, { holdId: run.holdId }).catch(() => []);
  const span = { from: competing.from, to: competing.to };
  const titles = new Map(competing.titles.map((entry) => [entry.path, entry.title]));

  // Handed on only when the rule reads a group anew: the same pages and the same page for its most searched searches keep last week's.
  const assigned = competing.groups.filter((group) => !last.some((before) => carryOver(group, before, competing.websiteRate)));
  const system = [rules, briefFor(COMPETING_ROLE, member?.instructions), OWNER_RULE, COMPETING_ANSWER].filter(Boolean).join("\n\n");
  const words = new Map<KeptGroup, { headline: string; story: string }>();
  const failed: string[] = [];
  let changed = 0;
  for (let at = 0; at < assigned.length; at += AT_ONCE) {
    await Promise.all(assigned.slice(at, at + AT_ONCE).map(async (group) => {
      try {
        const prompt = JSON.stringify({ website: run.host, ...agentInputOf(group, titles), facts: factLines(competingFacts(group, span)) });
        const answer = await ask(ctx, run, member, `the Keyword cannibalisation specialist, on "${group.name}"`, system, prompt);
        if (answer === null) throw new Error("its answer wasn't JSON");
        const applied = applyAnswer(group, answer, competing.websiteRate, week);
        changed += applied.owners + applied.pages;
        // Its words kept only when every figure they name is the group's own, and none is typed.
        const held = factsByKey(competingFacts(group, span));
        const usable = applied.words && [applied.words.headline, applied.words.story].every((text) => typedNumbers(text).length === 0 && fillFacts(text, held).missing.length === 0);
        if (applied.words && usable) words.set(group, applied.words);
      } catch (error) {
        failed.push(`"${group.name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }
  nameGroups(competing.groups);
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: "Keyword cannibalisation",
    detail: [
      `Head of Strategy → Keyword cannibalisation specialist: ${assigned.length} of ${competing.groups.length} groups${assigned.length < competing.groups.length ? `, the other ${competing.groups.length - assigned.length} unchanged since last week and kept as decided` : ""}.`,
      assigned.length > 0 ? ` It changed ${changed} of the rule's choices.` : "",
      failed.length > 0 ? ` Not reached, so the rule decided: ${failed.join("; ")}.` : "",
    ].join("").slice(0, 900),
    failed: failed.length > 0 && failed.length === assigned.length,
  });

  const written = competing.groups.filter((group) => group.sure === "LIKELY").slice(0, GROUP_FINDINGS);
  return {
    competing,
    drafts: written.map((group) => competingDraft(group, words.get(group) ?? null)),
    facts: written.flatMap((group) => competingFacts(group, span)),
    summary: competingSummary(competing.groups),
  };
}

/** The group a saved finding writes up, by the facts it names. */
const groupKeyOf = (finding: SavedFinding) => finding.facts.map((fact) => /^competing\.(.+)\.(?:pages|shared|split|shown|clicks|enquiries|recent|recentBefore|gainClicks|gainEnquiries)$/.exec(fact.key)?.[1]).find(Boolean);

/** After the week is saved: its groups kept beside their findings, their searches' volumes asked for, and the run's log saying so. */
export async function keepCompeting(
  ctx: ActionCtx,
  run: { holdId: Id<"companyWebsites">; runId: Id<"agentRuns">; companyId: Id<"companies"> },
  week: string,
  { competing }: RunCompeting,
  saved: readonly SavedFinding[],
  publishedIds: readonly Id<"insightFindings">[],
): Promise<void> {
  if (!competing) return;
  // The week keeps its first findings, and returns the published ones' ids in their order: each group's by the facts it names.
  const ids = new Map<string, Id<"insightFindings">>();
  let at = 0;
  for (const finding of saved.slice(0, MOST_A_WEEK)) {
    if (finding.status !== "PUBLISHED") continue;
    const id = publishedIds[at++];
    const key = finding.pattern === "COMPETING_PAGES" ? groupKeyOf(finding) : undefined;
    if (key && id) ids.set(key, id);
  }
  const kept = await ctx.runMutation(internal.insightCompeting.saveGroups, {
    holdId: run.holdId, week, from: competing.from, to: competing.to,
    groups: competing.groups.map((group) => {
      const findingId = ids.get(group.key);
      return { group, ...(findingId ? { findingId } : {}) };
    }),
  });
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId: run.runId, companyId: run.companyId, heading: "Keyword cannibalisation",
    detail: `${kept.saved} groups of competing pages kept, ${ids.size} written up as findings; ${kept.volumesAsked} searches' monthly volumes and ${kept.difficultiesAsked} searches' difficulty asked for.`,
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
 * and the newest three against the same three a year before; and of the
 * year's enquiries, those from people who came from Google's own results.
 */
function pageFiguresFrom(records: Awaited<ReturnType<typeof historyOf>>, whole: readonly string[]) {
  const months = [...whole].sort();
  const year = new Set(months.slice(-12));
  const recent = months.slice(-3);
  const before = recent.map((month) => shiftMonth(month, -12));
  const heldBefore = before.every((month) => months.includes(month));
  const totals = new Map<string, { visits: number; enquiries: number; recent: number; recentBefore: number }>();
  const fromGoogle = new Map<string, number>();
  for (const record of records) {
    if (record.kind === "GA_PAGE_SOURCES" && year.has(record.month)) {
      for (const row of record.rows) {
        const [path = "", channel = "", source = ""] = row.key.split(SOURCE_JOIN);
        if (fromGoogleSearch(channel, source)) fromGoogle.set(pathKey(path), (fromGoogle.get(pathKey(path)) ?? 0) + (row.enquiries ?? 0));
      }
    }
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
    return { visits: held?.visits ?? 0, enquiries: held?.enquiries ?? 0, recent: held?.recent ?? 0, recentBefore: heldBefore ? held?.recentBefore ?? 0 : null, googleEnquiries: fromGoogle.get(pathKey(path)) ?? 0 };
  };
}

/**
 * What a website's searches are read against (`ownerOfSearch`): its own
 * country, from the place it is measured from, and the places of the offices
 * the company calls its own on Google — their towns and counties, for "near
 * me" searches.
 */
async function placesFor(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">): Promise<Places> {
  const homeIso = findSeoLocation(resolveLocationCode(hold.locationCode))?.countryIso ?? null;
  const links = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(50);
  const offices = new Set<string>();
  for (const link of links.filter((entry) => entry.role === "OWN")) {
    const listing = await ctx.db.get(link.listingId);
    if (listing?.source !== "GOOGLE") continue;
    // Its town where Google names one: an address's "London Rd" in Guildford is no London office.
    for (const place of namedIn(listing.town ?? listing.address ?? "", homeIso).places) offices.add(place);
  }
  return { homeIso, offices: [...offices] };
}

/**
 * The website's groups of competing pages now, from what Hakken holds: Search
 * Console's 90-day Pages competing and searches lists, Analytics' history and
 * the company's page classifications, and the searches' monthly volumes as far
 * as they are held. Null when Search Console has built no competing list yet.
 */
export async function competingNow(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, host: string): Promise<{ from: string; to: string; groups: KeptGroup[]; websiteRate: number | null } | null> {
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
  const input = { pairs, brandSearches, brandWords: brandWordsOf(host), pageOf, clickRates, websiteRate, months, places: await placesFor(ctx, hold) };
  const first = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });

  // The volumes bought for the groups' searches so far (DataForSEO, from the website's place), then the groups again with them.
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  for (const search of new Set(first.flatMap((group) => group.searches.filter((entry) => entry.volume === null).map((entry) => entry.search)))) {
    const held = await searchVolumeOf(ctx, normaliseKeyword(search), locationCode);
    if (held?.volume === null || held?.volume === undefined) continue;
    bySearch.set(search, { position: bySearch.get(search)?.position ?? null, volume: held.volume });
  }
  const groups = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });
  // The rule's reading of each, so a group read just the same next week keeps the specialist's decision.
  for (const group of groups) Object.assign(group, { decidedBy: "RULE", signature: signatureOf(group) });
  // How hard each group's most searched searches are: the monthly ranking collection's, else bought (insights-one-voice-plan.md).
  for (const group of groups) {
    const held = await difficultiesOf(ctx, hold.websiteId, locationCode, mostSearched(group));
    for (const search of group.searches) if (held.has(search.search)) search.difficulty = held.get(search.search) ?? null;
  }
  return { from: competing.from, to: competing.to, groups, websiteRate };
}

/** For the weekly run: the groups now, read in one query, with the website's enquiry rate and its pages' titles for the specialist. */
export const groupsForRun = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    from: v.string(), to: v.string(), groups: v.array(competingGroupValidator), websiteRate: v.union(v.number(), v.null()),
    titles: v.array(v.object({ path: v.string(), title: v.string() })),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    const now = hold && website ? await competingNow(ctx, hold, website.displayHost ?? website.host) : null;
    if (!now) return null;
    // Each page's title as Analytics last saw it (`holdPages`), kept by path with or without its closing slash.
    const titles: Array<{ path: string; title: string }> = [];
    for (const path of new Set(now.groups.flatMap((group) => group.pages.map((page) => page.path)))) {
      for (const page of new Set([path, pathKey(path), `${pathKey(path)}/`])) {
        const row = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId).eq("page", page)).first();
        if (row?.title) {
          titles.push({ path, title: row.title });
          break;
        }
      }
    }
    return { ...now, titles };
  },
});

/** For the weekly run: the groups kept last week, each with what decided it, to keep a decision the rule reads just the same. */
export const keptForRun = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.array(competingGroupValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("insightCompetingGroups").withIndex("by_hold_rank", (q) => q.eq("companyWebsiteId", args.holdId)).take(MOST_KEPT);
    return rows.map((row) => row.group);
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
  returns: v.object({ saved: v.number(), volumesAsked: v.number(), difficultiesAsked: v.number() }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return { saved: 0, volumesAsked: 0, difficultiesAsked: 0 };
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
    // The most searched searches' difficulty where neither the monthly collection nor a purchase holds it.
    const hard = args.groups.flatMap((entry) => mostSearched(entry.group).filter((search) => typeof entry.group.searches.find((held) => held.search === search)?.difficulty !== "number"));
    const difficultiesAsked = await askDifficultyFor(ctx, hold, hard, now);
    return { saved: Math.min(args.groups.length, MOST_KEPT), volumesAsked, difficultiesAsked };
  },
});


const keptValidator = v.object({
  rank: v.number(),
  week: v.string(),
  from: v.string(),
  to: v.string(),
  /** The span in months, as the extra clicks a month were worked out (`monthsIn`): its clicks a month are `clicks / months`. */
  months: v.number(),
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

const keptOf = (row: Doc<"insightCompetingGroups">) => ({ rank: row.rank, week: row.week, from: row.from, to: row.to, months: monthsIn(row.from, row.to), group: row.group, findingId: row.findingId ?? null });

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
