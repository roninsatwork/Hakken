import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { MOST_A_WEEK, type SavedFinding, type TeamMember } from "./insightsTeam";
import { ASK_LIMIT_MS, ask, factLines, type AskRun } from "./insightsAsk";
import { searchConsoleTables } from "./searchConsoleSchema";
import { assertInsightsPublisher, insightsPublicationArgs } from "./insightsRunState";
import type { Fact } from "./utils/insightFacts";
import { briefFor } from "./utils/insightBriefs";
import { BIG_GROUP_LIMIT_MS, COMPETING_ANSWER, agentInputOf, applyAnswer, atTheCap, carryOver, nextPiece, signatureOf, summaryOf, usableWords } from "./utils/insightCompetingAgent";
import { ownerJudge, ownerTallyLine } from "./insightCompetingJudge";
import { tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { companyHolds, requireMySite, type SiteReader } from "./siteAccess";
import { readPeriod, firstPartOf, holdingPeriod, type ReadPeriod } from "./searchConsolePeriodReads";
import { BookNames } from "./searchConsolePeriodBooks";
import { askDifficultyFor, askVolumesFor, difficultiesOf, searchVolumeOf } from "./searchVolumes";
import { normaliseKeyword } from "./seoJudgments";
import { historyOf, monthsOf, pageKindsOf, type HistoryRecord, type PageKind } from "./insightsPeriodData";
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
/** Groups the specialist is asked about at once: every group a week keeps, in practice, so none waits on another. */
const AT_ONCE = 8;
/**
 * How long the specialist's groups may take: about the other specialists'
 * time, so the Head of Strategy, who waits for both, still has its own.
 * A group whose answer failed is asked once more while this lasts
 * (Anthony, 13 October 2026, "go").
 */
const COMPETING_FOR_MS = 4 * 60 * 1000;
/** Time a second ask needs to be worth making. */
const RETRY_LEAST_MS = 60 * 1000;
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
export async function competingForRun(ctx: ActionCtx, run: CompetingRun, week: string, rules: string, member: TeamMember | undefined, options: { at?: number; most?: number; signature?: string; cachedOnly?: boolean } = {}) {
  const competing = await ctx.runAction(internal.insightCompeting.groupsForRun, { holdId: run.holdId });
  const none = { competing, drafts: [] as ReturnType<typeof competingDraft>[], facts: [] as Fact[], summary: null, problems: [] as string[], batch: { next: 0, complete: true, signature: "" } };
  if (!competing || competing.groups.length === 0) return none;
  const last = await ctx.runQuery(internal.insightCompeting.keptForRun, { holdId: run.holdId });
  const span = { from: competing.from, to: competing.to };
  const titles = new Map(competing.titles.map((entry) => [entry.path, entry.title]));

  // Jev picks each search's page while its Decision acts on its own (insightCompetingJudge.ts): turning it on or off reads every group anew.
  const owners = await ownerJudge(ctx, run, competing.groups, competing.websiteRate);
  if (owners) for (const group of competing.groups) group.signature = signatureOf(group, "JEV");
  // Handed on only when the rule reads a group anew: the same pages and the same page for each of its searches keep last week's.
  const assigned = competing.groups.filter((group) => !last.some((before) => carryOver(group, before, competing.websiteRate)));
  const signature = JSON.stringify(assigned.map((group) => [group.key, group.signature]));
  if (options.signature !== undefined && options.signature !== signature) throw appError("CONFLICT", "The competing-page inputs changed while their specialist was working. Previous completed results are kept.");
  const from = options.at ?? 0;
  const given = options.most === undefined ? assigned.slice(from) : nextPiece(assigned.slice(from), options.most);
  const system = [rules, briefFor(COMPETING_ROLE, member?.instructions), OWNER_RULE, COMPETING_ANSWER].filter(Boolean).join("\n\n");
  const failed: string[] = [];
  let changed = 0, retried = 0;
  const started = Date.now();
  for (let at = 0; at < given.length; at += AT_ONCE) {
    await Promise.all(given.slice(at, at + AT_ONCE).map(async (group) => {
      try {
        owners?.judge(group);
        const prompt = JSON.stringify({ website: run.host, ...agentInputOf(group, titles, Boolean(owners)), facts: factLines(competingFacts(group, span)) });
        const asked = async (limitMs: number) => {
          const answer = await ask(ctx, run, member, `the Keyword cannibalisation specialist, on "${group.name}"`, system, prompt, limitMs, undefined, options.cachedOnly);
          if (answer === null) throw appError("UPSTREAM_FAILURE", "Its answer wasn't JSON.");
          return answer;
        };
        // A failed answer is asked once more while the specialist's time lasts; a run past its spend limit isn't.
        const limitMs = atTheCap(group) ? BIG_GROUP_LIMIT_MS : ASK_LIMIT_MS;
        const answer = await asked(limitMs).catch(async (error: unknown) => {
          const left = COMPETING_FOR_MS - (Date.now() - started);
          if (options.cachedOnly || left < RETRY_LEAST_MS || /spend limit/.test(String(error))) throw error;
          retried += 1;
          return await asked(Math.min(limitMs, left));
        });
        const applied = applyAnswer(group, answer, competing.websiteRate, week, { ownersChosen: Boolean(owners) });
        changed += applied.owners + applied.pages;
        // Its words kept on the group — they open its page and its finding — only when every figure they name is the group's own, and none is typed.
        const words = usableWords(group, applied.words, span);
        if (words) group.words = words;
        else delete group.words;
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
      assigned.length > 0 ? ` It changed ${changed} of the rule's choices${retried > 0 ? `, asked once more for ${retried} whose first answer failed` : ""}.` : "",
      owners ? ownerTallyLine(owners.tally) : "",
      failed.length > 0 ? ` Not reached, so the rule decided: ${failed.join("; ")}.` : "",
    ].join("").slice(0, 900),
    failed: failed.length > 0 && failed.length === assigned.length,
  });

  const written = competing.groups.filter((group) => group.sure === "LIKELY").slice(0, GROUP_FINDINGS);
  return {
    competing,
    drafts: written.map((group) => competingDraft(group, group.words ?? null)),
    facts: written.flatMap((group) => competingFacts(group, span)),
    summary: competingSummary(competing.groups),
    problems: failed,
    batch: { next: from + given.length, complete: from + given.length >= assigned.length, signature },
  };
}

/** The group a saved finding writes up, by the facts it names. */
const groupKeyOf = (finding: SavedFinding) => finding.facts.map((fact) => /^competing\.(.+)\.(?:pages|shared|split|shown|clicks|enquiries|recent|recentBefore|gainClicks|gainEnquiries)$/.exec(fact.key)?.[1]).find(Boolean);

/** After the week is saved: its groups kept beside their findings, their searches' volumes asked for, and the run's log saying so. */
export async function keepCompeting(
  ctx: ActionCtx,
  run: { holdId: Id<"companyWebsites">; runId: Id<"agentRuns">; companyId: Id<"companies">; chainBooking?: number },
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
    runId: run.runId, chainBooking: run.chainBooking,
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
export type CompetingLists = "competing" | "query" | "page";
export type CompetingNow = { from: string; to: string; groups: KeptGroup[]; websiteRate: number | null };
export type CompetingSources = {
  list: (list: CompetingLists) => Promise<ReadPeriod | null>;
  names: (list: ReadPeriod, tokens: string[]) => Promise<Map<string, string>>;
  history: () => Promise<HistoryRecord[]>;
  kinds: (paths: string[]) => Promise<(path: string) => PageKind>;
  places: () => Promise<Places>;
  volumes: (searches: string[]) => Promise<Map<string, number | null>>;
  difficulties: (searches: string[]) => Promise<Map<string, number | null>>;
};

/** The shared calculation; Node workers supply bounded readers for large sites. */
export async function competingFromSources(source: CompetingSources, host: string): Promise<CompetingNow | null> {
  const competing = await source.list("competing");
  if (!competing) return null;
  if (competing.rows.length === 0) return { from: competing.from, to: competing.to, groups: [], websiteRate: null };
  const searches = await source.list("query");
  // Both lists come from one build, so a search is the same token in each; named only for the competing rows.
  const sameBook = Boolean(competing.book && searches?.book && competing.book.builtAt === searches.book.builtAt);
  const names = competing.book ? await source.names(competing, competing.rows.flatMap((row) => [row.key, row.page ?? ""])) : new Map<string, string>();
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

  const records = await source.history();
  const kindOf = await source.kinds([...new Set([...pairs.map((pair) => pathOfPage(pair.page)), ...records.filter((record) => ["GA_PAGES", "SC_PAGES", "GA_PAGE_SOURCES"].includes(record.kind)).flatMap((record) => record.rows.map((row) => row.key.split(SOURCE_JOIN)[0]))])]);
  const whole = monthsOf(records, kindOf).filter((month) => month.whole).map((month) => month.month);
  const visitsOf = pageFiguresFrom(records, whole);
  // Each page's showings for every search over the same 90 days, to tell a page living off the owner's searches from one with its own.
  const pageList = await source.list("page");
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
  const input = { pairs, brandSearches, brandWords: brandWordsOf(host), pageOf, clickRates, websiteRate, months, places: await source.places() };
  const first = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });

  // The volumes bought for the groups' searches so far (DataForSEO, from the website's place), then the groups again with them.
  const wanted = [...new Set(first.flatMap((group) => group.searches.filter((entry) => entry.volume === null).map((entry) => entry.search)))];
  for (const [search, volume] of await source.volumes(wanted)) {
    if (volume === null) continue;
    bySearch.set(search, { position: bySearch.get(search)?.position ?? null, volume });
  }
  const groups = competingGroups({ ...input, searchOf: (search) => bySearch.get(search) ?? { position: null, volume: null } });
  // The rule's reading of each, so a group read just the same next week keeps the specialist's decision.
  for (const group of groups) Object.assign(group, { decidedBy: "RULE", signature: signatureOf(group) });
  // How hard each search is, wherever it's held — the monthly ranking collection's, else bought — read free for every search;
  // only each group's most searched are bought where missing (saveGroups; insights-one-voice-plan.md).
  const held = await source.difficulties([...new Set(groups.flatMap((group) => group.searches.map((search) => search.search)))]);
  for (const group of groups) for (const search of group.searches) if (held.has(search.search)) search.difficulty = held.get(search.search) ?? null;
  return { from: competing.from, to: competing.to, groups, websiteRate };
}

/** Existing query callers retain the same calculation and measurement rules. */
export async function competingNow(ctx: Pick<QueryCtx, "db">, hold: Doc<"companyWebsites">, host: string): Promise<CompetingNow | null> {
  const locationCode = hold.locationCode ?? DEFAULT_LOCATION_CODE;
  return await competingFromSources({
    list: async (list) => await readPeriod(ctx, hold._id, "web", list, "lastQuarter", "NOW"),
    names: async (list, tokens) => list.book ? await new BookNames(ctx, list.book).textsOf(tokens) : new Map(),
    history: async () => await historyOf(ctx, hold._id),
    kinds: async () => await pageKindsOf(ctx, hold._id),
    places: async () => await placesFor(ctx, hold),
    volumes: async (searches) => {
      const volumes = new Map<string, number | null>();
      for (const search of searches) volumes.set(search, (await searchVolumeOf(ctx, normaliseKeyword(search), locationCode))?.volume ?? null);
      return volumes;
    },
    difficulties: async (searches) => await difficultiesOf(ctx, hold.websiteId, locationCode, searches),
  }, host);
}

/** For the weekly run: the groups now, read in one query, with the website's enquiry rate and its pages' titles for the specialist. */
export type GroupsForRun = CompetingNow & { titles: Array<{ path: string; title: string }> };

export const groupsForRun = internalAction({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    from: v.string(), to: v.string(), groups: v.array(competingGroupValidator), websiteRate: v.union(v.number(), v.null()),
    titles: v.array(v.object({ path: v.string(), title: v.string() })),
  })),
  handler: async (ctx, args): Promise<GroupsForRun | null> => await ctx.runAction(internal.insightCompetingSteps.groupsForRun, args),
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
    ...insightsPublicationArgs,
    holdId: v.id("companyWebsites"),
    week: v.string(),
    from: v.string(),
    to: v.string(),
    groups: v.array(v.object({ group: competingGroupValidator, findingId: v.optional(v.id("insightFindings")) })),
  },
  returns: v.object({ saved: v.number(), volumesAsked: v.number(), difficultiesAsked: v.number() }),
  handler: async (ctx, args) => {
    await assertInsightsPublisher(ctx, args);
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
  /** The specialist's headline and story, filled from the group's figures; null where the rule decided it. */
  summary: v.union(v.array(v.string()), v.null()),
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

const keptOf = (row: Doc<"insightCompetingGroups">) => ({
  rank: row.rank, week: row.week, from: row.from, to: row.to, months: monthsIn(row.from, row.to), group: row.group, findingId: row.findingId ?? null, summary: summaryOf(row.group, row),
});

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


export const groupTarget = internalQuery({
  args: { holdId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ host: v.string(), connected: v.boolean(), places: v.object({ homeIso: v.union(v.string(), v.null()), offices: v.array(v.string()) }) })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const website = hold ? await ctx.db.get(hold.websiteId) : null;
    if (!hold || !website) return null;
    const places = await placesFor(ctx, hold);
    const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    return { host: website.displayHost ?? website.host, connected: connection?.status === "CONNECTED", places: { homeIso: places.homeIso, offices: [...places.offices] } };
  },
});

const storedGroupPartValidator = v.object({ _id: v.id("searchConsolePeriods"), _creationTime: v.number(), ...searchConsoleTables.searchConsolePeriods.validator.fields });

/** One stored list part from the same complete build; no list is unpacked inside this query. */
export const groupListPart = internalQuery({
  args: { holdId: v.id("companyWebsites"), list: v.union(v.literal("competing"), v.literal("query"), v.literal("page")), part: v.number(), builtAt: v.optional(v.number()) },
  returns: v.union(v.null(), storedGroupPartValidator),
  handler: async (ctx, args): Promise<Doc<"searchConsolePeriods"> | null> => {
    const period = await holdingPeriod(ctx, { companyWebsiteId: args.holdId, country: undefined, searchType: "web", list: args.list }, "lastQuarter");
    const first = await firstPartOf(ctx, args.holdId, undefined, "web", args.list, period, "NOW");
    if (!first) return null;
    if (args.builtAt !== undefined && first.builtAt !== args.builtAt) throw appError("CONFLICT", "Search Console changed while competing pages were being read; try this stage again.");
    if (args.part === 0) return first;
    const part = await ctx.db.query("searchConsolePeriods")
      .withIndex("by_hold_slot_built", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", "web").eq("list", args.list).eq("period", period).eq("which", "NOW").eq("builtAt", first.builtAt).eq("part", args.part)).first();
    if (!part) {
      const later = await ctx.db.query("searchConsolePeriods")
        .withIndex("by_hold_slot_built", (q) => q.eq("companyWebsiteId", args.holdId).eq("country", undefined).eq("searchType", "web").eq("list", args.list).eq("period", period).eq("which", "NOW").eq("builtAt", first.builtAt).gt("part", args.part)).first();
      if (later) throw appError("UPSTREAM_FAILURE", "The saved Search Console list is incomplete.");
    }
    return part;
  },
});

export const groupPageData = internalQuery({
  args: { holdId: v.id("companyWebsites"), paths: v.array(v.string()) },
  returns: v.array(v.object({ path: v.string(), kind: v.object({ key: v.string(), name: v.union(v.string(), v.null()), type: v.string() }), title: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    if (args.paths.length > 25) throw appError("INVALID_INPUT", "Read at most 25 page classifications at once.");
    const variants = (path: string) => [...new Set([path, pathKey(path), `${pathKey(path)}/`])];
    const kind = await pageKindsOf(ctx, args.holdId, { pages: args.paths.flatMap(variants) });
    const rows = [];
    for (const path of args.paths) {
      let title: string | null = null;
      for (const page of variants(path)) {
        const row = await ctx.db.query("holdPages").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.holdId).eq("page", page)).first();
        if (row?.title) { title = row.title; break; }
      }
      rows.push({ path, kind: kind(path), title });
    }
    return rows;
  },
});

export const groupSearchData = internalQuery({
  args: { holdId: v.id("companyWebsites"), searches: v.array(v.string()), kind: v.union(v.literal("volume"), v.literal("difficulty")) },
  returns: v.array(v.object({ search: v.string(), value: v.union(v.number(), v.null()) })),
  handler: async (ctx, args) => {
    if (args.searches.length > 25) throw appError("INVALID_INPUT", "Read at most 25 searches at once.");
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return [];
    const location = hold.locationCode ?? DEFAULT_LOCATION_CODE;
    const rows: Array<{ search: string; value: number | null }> = [];
    if (args.kind === "difficulty") return [...await difficultiesOf(ctx, hold.websiteId, location, args.searches)].map(([search, value]) => ({ search, value }));
    for (const search of args.searches) rows.push({ search, value: (await searchVolumeOf(ctx, normaliseKeyword(search), location))?.volume ?? null });
    return rows;
  },
});
