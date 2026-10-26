import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, listHold, requireMySite, type SiteReader } from "./siteAccess";
import { loadRivalHolds, loadSite, type Site } from "./websiteSiteRows";
import { askedQuestions } from "./siteFigures";
import { AI_ENGINES, type AiEngine } from "./seoAiEngines";
import { aiVolumeOf, demandSearches } from "./aiDemand";
import { partIsOn } from "./collectionParts";
import { historyOf, listsOf, monthsOf, pageKindsOf, sourceOf } from "./insightsPeriodData";
import { shiftMonth } from "./utils/insightHistory";
import { unpackColumn } from "./utils/packedColumns";
import { normalisePage } from "./utils/pageClassification";

/**
 * AI search over time (docs/plans/active/insights-intelligence-plan.md phase
 * 5): are you growing in AI — the visits and enquiries each assistant sent,
 * month by month, against the three months before and a year ago, and the
 * kinds of page they land on — then, for each assistant, how often its
 * answers to your questions name you, recommend you and cite your pages,
 * against each rival, month by month; the mentions DataForSEO counts in
 * Google's AI and ChatGPT where bought, and how often your searches are asked
 * of AI tools. Read when the screen opens from what Hakken keeps; the
 * answers' history starts on 23 September 2026. Only the caller's own company.
 */

/** Days of answers read for a website at most: a year of daily lines. */
const AI_DAYS_READ = 400;
/** Citations read for a website at most, newest first. */
const CITED_READ = 900;
/** Questions a website's citations are checked against. */
const QUESTIONS_READ = 200;
/** Rivals read beside the website. */
const MOST_RIVALS = 5;
/** Searches shown with how often they are asked of AI tools. */
const MOST_DEMAND = 15;
/** Cited pages listed, the most cited first. */
const MOST_CITED_PAGES = 50;

const engineValidator = v.union(...AI_ENGINES.map((engine) => v.literal(engine)));
const windowValidator = v.object({ months: v.array(v.string()), visits: v.number(), enquiries: v.number() });

const mentionsValidator = v.object({ websiteId: v.id("websites"), host: v.string(), own: v.boolean(), months: v.array(v.object({ month: v.string(), mentions: v.number() })) });

const aiSearchValidator = v.object({
  siteId: v.id("companyWebsites"),
  host: v.string(),
  /** The first day answers were kept for the website's questions; null before any. */
  since: v.union(v.string(), v.null()),
  /** Visits and enquiries each assistant sent, each whole month held. */
  months: v.array(v.object({ month: v.string(), assistants: v.array(v.object({ name: v.string(), visits: v.number(), enquiries: v.number() })) })),
  /** The newest three whole months against the three before and the same three a year before. */
  windows: v.object({ now: v.union(windowValidator, v.null()), before: v.union(windowValidator, v.null()), yearAgo: v.union(windowValidator, v.null()) }),
  assistants: v.array(v.object({ name: v.string(), now: v.number(), before: v.union(v.number(), v.null()), yearAgo: v.union(v.number(), v.null()), enquiries: v.number() })),
  /** The kinds of page the assistants' visits landed on, the newest three months. */
  kinds: v.array(v.object({ key: v.string(), name: v.union(v.string(), v.null()), type: v.string(), visits: v.number(), enquiries: v.number() })),
  /** Each website's month by month in each assistant's answers to your questions. */
  sites: v.array(v.object({
    websiteId: v.id("websites"),
    host: v.string(),
    own: v.boolean(),
    months: v.array(v.object({ month: v.string(), engine: engineValidator, asked: v.number(), named: v.number(), recommended: v.number(), cited: v.number() })),
  })),
  /** Citations were cut at `CITED_READ`: the oldest months count fewer than they had. */
  citedCut: v.boolean(),
  citedPages: v.array(v.object({ path: v.string(), times: v.number(), engines: v.array(engineValidator) })),
  /** DataForSEO's mentions in Google's AI a month, each website, when bought. */
  radar: v.union(v.null(), v.array(mentionsValidator)),
  /** The same in ChatGPT's answers: bought for United States websites only. */
  chatgpt: v.union(v.null(), v.array(mentionsValidator)),
  /** How often your searches are asked of AI tools a month, when bought. */
  demand: v.union(v.null(), v.object({ month: v.union(v.string(), v.null()), rows: v.array(v.object({ search: v.string(), ai: v.number(), google: v.union(v.number(), v.null()) })) })),
});

type Reader = Pick<QueryCtx, "db">;

/** The websites read: the company's own and its rivals', with their hosts. */
async function websitesOf(ctx: Reader, site: Site): Promise<Array<{ website: Doc<"websites">; own: boolean }>> {
  const rivals = (await loadRivalHolds(ctx, site)).slice(0, MOST_RIVALS);
  const out = [{ website: site.website, own: true }];
  for (const rival of rivals) {
    const website = await ctx.db.get(rival.websiteId);
    if (website) out.push({ website, own: false });
  }
  return out;
}

/** One website's month by month in each assistant's answers: asked, named and recommended from the daily lines, cited from the citations. */
async function answersOf(ctx: Reader, holdId: Id<"companyWebsites"> | null, place: number, websiteId: Id<"websites">, from: string, asked: ReadonlySet<string>) {
  const months = new Map<string, { month: string; engine: AiEngine; asked: number; named: number; recommended: number; cited: number }>();
  const entry = (month: string, engine: AiEngine) => {
    const key = `${month}|${engine}`;
    let held = months.get(key);
    if (!held) months.set(key, (held = { month, engine, asked: 0, named: 0, recommended: 0, cited: 0 }));
    return held;
  };
  let first: string | null = null;
  if (holdId) {
    const days = await ctx.db.query("siteListAiDays")
      .withIndex("by_hold_site_day", (q) => q.eq("companyWebsiteId", holdId).eq("locationCode", place).eq("websiteId", websiteId).gte("day", from))
      .take(AI_DAYS_READ);
    for (const day of days) {
      if (!first || day.day < first) first = day.day;
      for (const line of day.ai) {
        const held = entry(day.day.slice(0, 7), line.engine);
        held.asked += line.asked;
        held.named += line.named;
        held.recommended += line.recommended;
      }
    }
  }
  // Pages cited in answers to this company's own questions only (D17): the answers are shared.
  const citations = await ctx.db.query("aiCitations").withIndex("by_website_day", (q) => q.eq("mentionedWebsiteId", websiteId).gte("day", from)).order("desc").take(CITED_READ);
  const pages = new Map<string, { times: number; engines: Set<AiEngine> }>();
  for (const row of citations) {
    if (row.kind !== "SOURCE" || !asked.has(`${row.prompt}|${row.engine}|${row.locationCode ?? place}`)) continue;
    entry(row.day.slice(0, 7), row.engine as AiEngine).cited += 1;
    if (row.url) {
      const path = normalisePage(row.url);
      const held = pages.get(path) ?? { times: 0, engines: new Set<AiEngine>() };
      held.times += 1;
      held.engines.add(row.engine as AiEngine);
      pages.set(path, held);
    }
  }
  return { months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month) || a.engine.localeCompare(b.engine)), first, pages, cut: citations.length >= CITED_READ };
}

/** The whole screen's figures for one website. */
export async function aiSearchView(ctx: Reader, hold: Doc<"companyWebsites">, host: string) {
  const site = await loadSite(ctx, hold._id);
  if (!site) return null;

  // Are you growing in AI: the assistants' visits and enquiries, from the history (16 months).
  const records = await historyOf(ctx, hold._id, ["GA_SOURCES", "GA_PAGE_SOURCES"]);
  const kindOf = await pageKindsOf(ctx, hold._id);
  const whole = monthsOf(records, kindOf).filter((month) => month.whole).map((month) => month.month).sort();
  const lists = listsOf(records, kindOf);
  const months = whole.map((month) => {
    const sources = lists.over([month]).sources;
    const byName = new Map<string, { visits: number; enquiries: number }>();
    for (const [key, figures] of sources) {
      const source = sourceOf(key);
      if (source.group !== "AI") continue;
      const held = byName.get(source.name) ?? { visits: 0, enquiries: 0 };
      held.visits += figures.visits;
      held.enquiries += figures.enquiries;
      byName.set(source.name, held);
    }
    return { month, assistants: [...byName].map(([name, figures]) => ({ name, ...figures })).sort((a, b) => b.visits - a.visits) };
  });
  const span = (list: readonly string[]) => (list.length === 3 && list.every((month) => whole.includes(month)) ? list : null);
  const now = span(whole.slice(-3));
  const before = now ? span(now.map((month) => shiftMonth(month, -3))) : null;
  const yearAgo = now ? span(now.map((month) => shiftMonth(month, -12))) : null;
  const total = (list: readonly string[] | null) => {
    if (!list) return null;
    const inside = months.filter((entry) => list.includes(entry.month)).flatMap((entry) => entry.assistants);
    return { months: [...list], visits: inside.reduce((sum, row) => sum + row.visits, 0), enquiries: inside.reduce((sum, row) => sum + row.enquiries, 0) };
  };
  const visitsOf = (list: readonly string[] | null, name: string) => (list ? months.filter((entry) => list.includes(entry.month)).flatMap((entry) => entry.assistants).filter((row) => row.name === name).reduce((sum, row) => sum + row.visits, 0) : null);
  const names = [...new Set(months.flatMap((entry) => entry.assistants.map((row) => row.name)))];
  const assistants = names.map((name) => ({
    name,
    now: visitsOf(now, name) ?? 0,
    before: visitsOf(before, name),
    yearAgo: visitsOf(yearAgo, name),
    enquiries: now ? months.filter((entry) => now.includes(entry.month)).flatMap((entry) => entry.assistants).filter((row) => row.name === name).reduce((sum, row) => sum + row.enquiries, 0) : 0,
  })).sort((a, b) => b.now - a.now || (b.yearAgo ?? 0) - (a.yearAgo ?? 0));
  // The kinds of page their visits land on, the newest three months.
  const kinds = new Map<string, { key: string; name: string | null; type: string; visits: number; enquiries: number }>();
  if (now) {
    const span3 = lists.over(now);
    for (const [name, pages] of span3.pagesBySource) {
      if (!names.includes(name)) continue;
      for (const [path, figures] of pages) {
        const kind = kindOf(path);
        const held = kinds.get(kind.key) ?? { key: kind.key, name: kind.name, type: kind.type, visits: 0, enquiries: 0 };
        held.visits += figures.visits;
        held.enquiries += figures.enquiries;
        kinds.set(kind.key, held);
      }
    }
  }

  // Each website in each assistant's answers to this company's questions, the last twelve months.
  const from = `${shiftMonth(new Date().toISOString().slice(0, 7), -12)}-01`;
  const holdId = listHold(site);
  const asked = new Set((await askedQuestions(ctx, holdId, site.place, QUESTIONS_READ)).map((question) => `${question.prompt}|${question.engine}|${question.locationCode}`));
  const websites = await websitesOf(ctx, site);
  const sites = [];
  let since: string | null = null;
  let citedCut = false;
  let citedPages: Array<{ path: string; times: number; engines: AiEngine[] }> = [];
  for (const { website, own } of websites) {
    const read = await answersOf(ctx, holdId, site.place, website._id, from, asked);
    if (own) {
      since = read.first;
      citedCut = read.cut;
      citedPages = [...read.pages].map(([path, held]) => ({ path, times: held.times, engines: [...held.engines] })).sort((a, b) => b.times - a.times || a.path.localeCompare(b.path)).slice(0, MOST_CITED_PAGES);
    }
    sites.push({ websiteId: website._id, host: website.displayHost ?? website.host, own, months: read.months });
  }

  // DataForSEO's mentions in Google's AI, month by month, where the company buys them.
  let radar = null;
  if (await partIsOn(ctx, hold.companyId, "brandRadar")) {
    radar = [];
    for (const { website, own } of websites) {
      const row = await ctx.db.query("brandRadarMonths").withIndex("by_website_place", (q) => q.eq("websiteId", website._id).eq("locationCode", site.place)).first();
      const mentions = row ? unpackColumn(row.mentions) : [];
      radar.push({ websiteId: website._id, host: website.displayHost ?? website.host, own, months: (row?.months ?? []).map((month, at) => ({ month, mentions: mentions[at] ?? 0 })) });
    }
  }

  // ChatGPT's answers naming each website, where the company buys them (United States websites only).
  let chatgpt = null;
  if (await partIsOn(ctx, hold.companyId, "chatGptMentions")) {
    chatgpt = [];
    for (const { website, own } of websites) {
      const row = await ctx.db.query("chatGptRadarMonths").withIndex("by_website", (q) => q.eq("websiteId", website._id)).first();
      const mentions = row ? unpackColumn(row.mentions) : [];
      chatgpt.push({ websiteId: website._id, host: website.displayHost ?? website.host, own, months: (row?.months ?? []).map((month, at) => ({ month, mentions: mentions[at] ?? 0 })) });
    }
  }

  // How often the website's searches are asked of AI tools, where the company buys it.
  let demand = null;
  if (await partIsOn(ctx, hold.companyId, "aiDemand")) {
    let month: string | null = null;
    const rows = [];
    for (const { keyword } of await demandSearches(ctx, hold)) {
      const ai = await aiVolumeOf(ctx, keyword, site.place);
      if (!ai || ai.volume === null || ai.volume === undefined) continue;
      if (ai.month && (!month || ai.month > month)) month = ai.month;
      rows.push({ search: keyword, ai: ai.volume, google: null });
    }
    demand = { month, rows: rows.sort((a, b) => b.ai - a.ai).slice(0, MOST_DEMAND) };
  }

  return {
    siteId: hold._id, host, since, months,
    windows: { now: total(now), before: total(before), yearAgo: total(yearAgo) },
    assistants, kinds: [...kinds.values()].sort((a, b) => b.visits - a.visits),
    sites, citedCut, citedPages, radar, chatgpt, demand,
  };
}

/** The website a company-wide read shows: the one chosen, or its first owned website. */
async function siteFor(ctx: SiteReader, siteId: Id<"companyWebsites"> | undefined): Promise<{ hold: Doc<"companyWebsites">; host: string } | null> {
  if (!ctx.companyId) return null;
  if (siteId) await requireMySite(ctx, siteId);
  const owned = (await companyHolds(ctx, ctx.companyId)).filter((entry) => entry.summary.relationship === "OWNED" && (!siteId || entry.hold._id === siteId));
  return owned[0] ? { hold: owned[0].hold, host: owned[0].summary.host } : null;
}

/** AI search over time, for the website chosen. */
export const insightsAiSearch = tenantQuery({
  args: { siteId: v.optional(v.id("companyWebsites")) },
  returns: v.union(v.null(), aiSearchValidator),
  handler: async (ctx, args) => {
    const site = await siteFor(ctx, args.siteId);
    return site ? await aiSearchView(ctx, site.hold, site.host) : null;
  },
});
