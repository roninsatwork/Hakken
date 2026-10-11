import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { decodePages } from "./holdPageRefs";
import { holdAiSummary } from "./holdLists";
import { conversionsOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey, splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { channelOf } from "./utils/aiAssistants";
import type { AnalyticsList, AnalyticsPeriod, AnalyticsWhich } from "./googleAnalyticsSchema";
import { BookNames } from "./searchConsolePeriodBooks";
import { readPeriod } from "./searchConsolePeriodReads";
import { daysOf } from "./searchConsoleReads";
import { addUp } from "./searchConsoleDays";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { readings } from "./siteBrandRadar";
import { latestBands, latestFigures, seriesFor } from "./siteFigures";
import { listHold } from "./siteAccess";
import { loadRivalHolds, loadSite } from "./websiteSiteRows";
import { unpackColumn } from "./utils/packedColumns";
import { factKey, factValidator, percentOf, shiftDay, spansOf, type Fact, type FactWhich } from "./utils/insightFacts";
import { monthValidator, shareMonthValidator } from "./utils/insightSummary";

/**
 * Insights' reading layer (docs/plans/active/insights-analyst-plan.md §2,
 * §8, phase 1): every source of one owned website read where it is kept, as
 * facts (`utils/insightFacts.ts`), for the team's run. Nothing is copied or
 * stored here: each read is a query of its own, inside its budget, and the
 * run keeps only what it concludes.
 *
 * Like with like (I33): Search Console and Google Analytics are both read for
 * the website's main home country; the country list gives the clicks from
 * every country, said as such. Last year's figures are Analytics' own
 * year-before lists (I43) and Search Console's days a year back.
 */

type Reader = { db: QueryCtx["db"] };

/** The search-and-page rows a fact list names at most: the biggest, enough for any finding. */
const TOP_ROWS = 25;

/** Facts in, one list. */
class Facts {
  readonly list: Fact[] = [];
  add(fact: Fact | null | undefined) {
    if (fact && Number.isFinite(fact.value)) this.list.push(fact);
  }
}

// ---------------------------------------------------------------------------
// Search Console

const SC_PERIODS = [30, 90, 365] as const;

async function searchConsoleFacts(ctx: Reader, hold: Doc<"companyWebsites">): Promise<Fact[]> {
  const facts = new Facts();
  const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  if (!connection?.newestDay) return [];
  const newest = connection.newestDay;
  const oldest = connection.oldestDay ?? newest;
  const country = connection.mainCountry ?? mainConsoleCountry(hold);
  // One read of the days: the 12 months and the 12 months before them.
  const days = await daysOf(ctx, hold._id, "web", shiftDay(newest, -(365 + 364)), newest);
  for (const period of SC_PERIODS) {
    const spans = spansOf(newest, period);
    for (const which of ["now", "before", "year"] as const) {
      const span = spans[which];
      // A span not wholly held is not a figure: a part would read as a fall.
      if (span.from < oldest) continue;
      const figures = addUp(days.filter((day) => day.day >= span.from && day.day <= span.to));
      if (!figures) continue;
      const base = { source: "searchConsole" as const, from: span.from, to: span.to, country };
      facts.add({ ...base, key: factKey("sc", "clicks", period, which), value: figures.clicks, unit: "count", label: "Google clicks" });
      facts.add({ ...base, key: factKey("sc", "impressions", period, which), value: figures.impressions, unit: "count", label: "times Google showed the website" });
      facts.add({ ...base, key: factKey("sc", "position", period, which), value: Math.round(figures.position * 10) / 10, unit: "position", label: "average position on Google" });
    }
  }
  // Every country's clicks, from the country list (§7): said as worldwide, never set against one country's.
  for (const period of ["90", "365"] as const) {
    const world = await readPeriod(ctx, hold._id, "web", "country", period, "NOW");
    if (world) {
      facts.add({
        key: factKey("sc", "clicksWorld", period, "now"), value: world.rows.reduce((sum, row) => sum + row.clicks, 0), unit: "count",
        source: "searchConsole", label: "Google clicks from every country", from: world.from, to: world.to, country: "world",
      });
    }
  }
  // The pages and the searches, the biggest, against the span before.
  for (const list of ["page", "query"] as const) {
    const [now, before] = await Promise.all([
      readPeriod(ctx, hold._id, "web", list, "90", "NOW"),
      readPeriod(ctx, hold._id, "web", list, "90", "BEFORE"),
    ]);
    if (!now) continue;
    const top = [...now.rows].sort((a, b) => b.clicks - a.clicks).slice(0, TOP_ROWS);
    const names = list === "query" && now.book ? await new BookNames(ctx, now.book).textsOf(top.map((row) => row.key)) : null;
    const beforeNames = list === "query" && before?.book ? await new BookNames(ctx, before.book).textsOf(before.rows.map((row) => row.key)) : null;
    const beforeBy = new Map((before?.rows ?? []).map((row) => [list === "page" ? pathOf(row.key) : beforeNames?.get(row.key) ?? row.key, row]));
    const noun = list === "page" ? "page" : "search";
    // Brand searches (the website's own name), counted whole from the list's flags.
    if (list === "query") {
      const brand = now.rows.filter((row) => row.brand).reduce((sum, row) => sum + row.clicks, 0);
      facts.add({ key: factKey("sc", "brandClicks", 90, "now"), value: brand, unit: "count", source: "searchConsole", label: "Google clicks from searches for the business's own name", from: now.from, to: now.to, country });
      if (before) {
        const brandBefore = before.rows.filter((row) => row.brand).reduce((sum, row) => sum + row.clicks, 0);
        facts.add({ key: factKey("sc", "brandClicks", 90, "before"), value: brandBefore, unit: "count", source: "searchConsole", label: "Google clicks from searches for the business's own name", from: before.from, to: before.to, country });
      }
    }
    for (const row of top) {
      // A page by its path, as Analytics names it, so the two join (§2); a search by its words.
      const name = list === "page" ? pathOf(row.key) : names?.get(row.key) ?? row.key;
      if (!name) continue;
      const base = { source: "searchConsole" as const, country };
      facts.add({ ...base, key: factKey("sc", noun, name, "clicks", 90, "now"), value: row.clicks, unit: "count", label: `Google clicks to ${name}`, from: now.from, to: now.to });
      facts.add({ ...base, key: factKey("sc", noun, name, "impressions", 90, "now"), value: row.impressions, unit: "count", label: `times Google showed ${name}`, from: now.from, to: now.to });
      if (row.impressions > 0) {
        facts.add({ ...base, key: factKey("sc", noun, name, "position", 90, "now"), value: Math.round((row.positionSum / row.impressions) * 10) / 10, unit: "position", label: `average position of ${name}`, from: now.from, to: now.to });
      }
      const was = beforeBy.get(name);
      if (was && before) {
        facts.add({ ...base, key: factKey("sc", noun, name, "clicks", 90, "before"), value: was.clicks, unit: "count", label: `Google clicks to ${name}`, from: before.from, to: before.to });
      }
    }
  }
  return facts.list;
}

// ---------------------------------------------------------------------------
// Google Analytics

const GA_WHICH: Record<AnalyticsWhich, FactWhich> = { NOW: "now", BEFORE: "before", YEAR: "year" };

/** The periods read, each with the spans kept for it: the year before is kept for 90 days and 12 months only (I43). */
const GA_SPANS: ReadonlyArray<{ period: AnalyticsPeriod; which: readonly AnalyticsWhich[] }> = [
  { period: "30", which: ["NOW", "BEFORE"] },
  { period: "90", which: ["NOW", "BEFORE", "YEAR"] },
  { period: "365", which: ["NOW", "BEFORE", "YEAR"] },
];

/**
 * Google Analytics' facts, a part at a time (Phase 2b): the totals and
 * channels, the landing pages, and the events and visitors — each part its
 * own query, so a large website's page lists never share one read's limits.
 */
type AnalyticsPart = "totals" | "landing" | "events";

async function analyticsFacts(ctx: Reader, hold: Doc<"companyWebsites">, part: AnalyticsPart): Promise<Fact[]> {
  const facts = new Facts();
  const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  if (!connection?.property || !connection.newestDay) return [];
  const counted = countedOf(connection);
  const currency = connection.currency ?? "GBP";
  const country = connection.mainCountry;
  const slot = (list: AnalyticsList, period: AnalyticsPeriod, which: AnalyticsWhich) => readSlot(ctx, hold._id, slotKey(list, period, which, EVERY_DEVICE));
  const moneyOf = (row: ListRow) => conversionsOf(row, counted);
  const rowFacts = (prefix: string[], label: string, row: ListRow, span: { from: string; to: string }, period: string, which: FactWhich, withPeople: boolean) => {
    const base = { source: "analytics" as const, from: span.from, to: span.to, country };
    const money = moneyOf(row);
    facts.add({ ...base, key: factKey("ga", ...prefix, "visits", period, which), value: row.visits, unit: "count", label: `visits${label}` });
    facts.add({ ...base, key: factKey("ga", ...prefix, "engaged", period, which), value: row.engaged, unit: "count", label: `engaged visits${label}` });
    if (withPeople) facts.add({ ...base, key: factKey("ga", ...prefix, "people", period, which), value: row.people, unit: "count", label: `people${label}` });
    facts.add({ ...base, key: factKey("ga", ...prefix, "conversions", period, which), value: money.conversions, unit: "count", label: `conversions${label}` });
    if (money.value > 0) facts.add({ ...base, key: factKey("ga", ...prefix, "value", period, which), value: Math.round(money.value / 100), unit: "money", currency, label: `value of conversions${label}` });
    if (withPeople && money.conversions > 0 && row.people > 0) {
      facts.add({ ...base, key: factKey("ga", ...prefix, "peoplePerConversion", period, which), value: Math.round(row.people / money.conversions), unit: "ratio", label: `people for one conversion${label}` });
    }
    if (row.visits > 0) {
      const rate = percentOf(money.conversions, row.visits);
      if (rate !== null) facts.add({ ...base, key: factKey("ga", ...prefix, "conversionRate", period, which), value: rate, unit: "percent", label: `share of visits that converted${label}` });
    }
  };
  for (const { period, which: spans } of part === "totals" ? GA_SPANS : []) {
    for (const which of spans) {
      const total = await slot("total", period, which);
      const row = total?.rows[0];
      if (total && row) {
        rowFacts([], "", row, total, period, GA_WHICH[which], true);
        facts.add({ key: factKey("ga", "views", period, GA_WHICH[which]), value: row.views, unit: "count", source: "analytics", label: "page views", from: total.from, to: total.to, country });
      }
      // The channels as the Analytics screens show them — an assistant's referrals among AI assistants
      // (utils/aiAssistants.ts) — each from its sources added up; people left out, never added across sources.
      const channels = await slot("channel", period, which);
      if (channels) {
        for (const [name, line] of byChannelOf(channels.rows)) rowFacts(["channel", name], ` from ${name}`, line, channels, period, GA_WHICH[which], false);
      }
      if (period === "30") continue;
      // The channel that first brought each person (I35): each person has one first source, so their people add up.
      const first = await slot("firstChannel", period, which);
      if (first) {
        for (const [name, line] of byChannelOf(first.rows, true)) rowFacts(["firstChannel", name], ` from people first brought by ${name}`, line, first, period, GA_WHICH[which], true);
      }
    }
  }
  // Landing pages and the visits from search to each (§8), the biggest, now and a year before.
  for (const period of part === "landing" ? (["90", "365"] as const) : []) {
    for (const which of ["NOW", "YEAR"] as const) {
      const landing = await slot("landing", period, which);
      if (landing) {
        const top = [...landing.rows].sort((a, b) => b.visits - a.visits).slice(0, TOP_ROWS);
        const addresses = await decodePages(ctx, hold._id, top.map((row) => row.key));
        top.forEach((row, index) => rowFacts(["landing", pathOf(addresses[index])], ` landing on ${pathOf(addresses[index])}`, row, landing, period, GA_WHICH[which], true));
      }
      const byChannel = await slot("landingChannel", period, which);
      if (byChannel) {
        const search = byChannel.rows.filter((row) => splitChannelKey(row.key).source === "Organic Search").sort((a, b) => b.visits - a.visits).slice(0, TOP_ROWS);
        const addresses = await decodePages(ctx, hold._id, search.map((row) => splitChannelKey(row.key).channel));
        search.forEach((row, index) => rowFacts(["landingSearch", pathOf(addresses[index])], ` from search landing on ${pathOf(addresses[index])}`, row, byChannel, period, GA_WHICH[which], true));
      }
    }
  }
  if (part !== "events") return facts.list;
  // Every event over 12 months, against the 12 months before (I38, I42), and new against returning people.
  for (const which of ["NOW", "YEAR"] as const) {
    const events = await slot("event", "365", which);
    for (const row of events?.rows ?? []) {
      facts.add({ key: factKey("ga", "event", row.key, "times", 365, GA_WHICH[which]), value: row.times ?? 0, unit: "count", source: "analytics", label: `times "${row.key}" happened`, from: events!.from, to: events!.to, country });
      facts.add({ key: factKey("ga", "event", row.key, "people", 365, GA_WHICH[which]), value: row.people, unit: "count", source: "analytics", label: `people who did "${row.key}"`, from: events!.from, to: events!.to, country });
    }
  }
  // The ways to enquire counted as conversions, each with how often it happened in 12 months (§4.4, Measurement).
  const events365 = await slot("event", "365", "NOW");
  if (events365) {
    for (const event of counted) {
      const times = events365.rows.find((row) => row.key === event.eventName)?.times ?? 0;
      facts.add({ key: factKey("ga", "counted", event.eventName, "times", 365, "now"), value: times, unit: "count", source: "analytics", label: `times "${event.eventName}", counted as a conversion, happened`, from: events365.from, to: events365.to, country });
    }
  }
  const visitors = await slot("visitorType", "365", "NOW");
  for (const row of visitors?.rows ?? []) {
    if (row.key !== "new" && row.key !== "returning") continue;
    rowFacts(["visitor", row.key], ` from ${row.key} visitors`, row, visitors!, "365", "now", true);
  }
  return facts.list;
}

/** A list's rows by channel as the screens show them, its sources added up; people too when `people`. */
function byChannelOf(rows: readonly ListRow[], people = false): Map<string, ListRow> {
  const byChannel = new Map<string, ListRow>();
  for (const line of rows) {
    const { channel, source } = splitChannelKey(line.key);
    const name = channelOf(channel || "Unassigned", source);
    const held = byChannel.get(name);
    if (!held) {
      byChannel.set(name, { ...line, key: name, counts: new Map(line.counts), values: new Map(line.values) });
      continue;
    }
    for (const field of ["visits", "engaged", "seconds", "views", "purchases", "revenue"] as const) held[field] += line[field];
    if (people) held.people += line.people;
    for (const [event, count] of line.counts) held.counts.set(event, (held.counts.get(event) ?? 0) + count);
    for (const [event, value] of line.values) held.values.set(event, (held.values.get(event) ?? 0) + value);
  }
  return byChannel;
}

/** A page's path, for words: the address without its scheme and host. */
function pathOf(address: string): string {
  try {
    const url = new URL(address);
    return `${url.pathname}${url.search}`;
  } catch {
    return address;
  }
}

// ---------------------------------------------------------------------------
// The market: the website and its rivals (DataForSEO), AI mentions and answers, reviews, the site audit

export async function marketFacts(ctx: Reader, hold: Doc<"companyWebsites">): Promise<Fact[]> {
  const facts = new Facts();
  const site = await loadSite(ctx, hold._id);
  if (!site) return [];
  const rivals = await loadRivalHolds(ctx, site);
  const websites: Array<Doc<"websites">> = [site.website];
  for (const rival of rivals) {
    const website = await ctx.db.get(rival.websiteId);
    if (website) websites.push(website);
  }
  const today = site.today;
  const yearAgo = { from: shiftDay(today, -395), to: shiftDay(today, -335) };
  for (const website of websites) {
    const host = website.displayHost ?? website.host;
    const latest = await latestFigures(ctx, website._id, site.place);
    const day = latest.lastDay ?? today;
    const base = { source: "market" as const, from: day, to: day };
    const metrics = latest.metrics;
    if (metrics?.estimatedTraffic !== undefined) facts.add({ ...base, key: factKey("seo", host, "traffic", "now"), value: Math.round(metrics.estimatedTraffic), unit: "count", label: `${host}'s estimated visitors from Google a month` });
    if (metrics?.domainRank !== undefined) facts.add({ ...base, key: factKey("seo", host, "strength", "now"), value: Math.round(metrics.domainRank), unit: "score", label: `${host}'s strength in Google's eyes, out of 1,000` });
    const links = latest.links;
    if (links?.referringDomains !== undefined) facts.add({ ...base, key: factKey("seo", host, "linkingSites", "now"), value: links.referringDomains, unit: "count", label: `websites linking to ${host}` });
    const bands = latestBands(latest);
    if (bands?.p01_03 !== undefined) facts.add({ ...base, key: factKey("seo", host, "top3", "now"), value: bands.p01_03, unit: "count", label: `searches where ${host} is in Google's top three` });
    if (metrics?.aiOverviewRefs !== undefined && metrics.aiOverviewRefs !== null) facts.add({ ...base, key: factKey("seo", host, "aiOverviews", "now"), value: metrics.aiOverviewRefs, unit: "count", label: `searches where Google's AI Overview cites ${host}` });
    // A year before, from the month a year back (§5): what the leagues' moves are measured against.
    const past = await seriesFor(ctx, website._id, site.place, yearAgo.from, yearAgo.to, "month");
    const then = past.at(-1);
    if (then) {
      const pastBase = { source: "market" as const, from: then.lastDay, to: then.lastDay };
      if (typeof then.estimatedTraffic === "number") facts.add({ ...pastBase, key: factKey("seo", host, "traffic", "year"), value: Math.round(then.estimatedTraffic), unit: "count", label: `${host}'s estimated visitors from Google a month` });
      if (typeof then.domainRank === "number") facts.add({ ...pastBase, key: factKey("seo", host, "strength", "year"), value: Math.round(then.domainRank), unit: "score", label: `${host}'s strength in Google's eyes, out of 1,000` });
      if (typeof then.referringDomains === "number") facts.add({ ...pastBase, key: factKey("seo", host, "linkingSites", "year"), value: then.referringDomains, unit: "count", label: `websites linking to ${host}` });
      const pastBands = then.allBands ?? then.bands;
      if (pastBands?.p01_03 !== undefined) facts.add({ ...pastBase, key: factKey("seo", host, "top3", "year"), value: pastBands.p01_03, unit: "count", label: `searches where ${host} is in Google's top three` });
      if (typeof then.aiOverviewRefs === "number") facts.add({ ...pastBase, key: factKey("seo", host, "aiOverviews", "year"), value: then.aiOverviewRefs, unit: "count", label: `searches where Google's AI Overview cites ${host}` });
    }
  }
  // AI mentions a month (Brand Radar), the newest month and the same month a year before.
  const radar = await readings(ctx, site);
  for (const reading of radar.readings) {
    const months = reading.months;
    if (!months || months.months.length === 0) continue;
    const host = reading.website.displayHost ?? reading.website.host;
    const mentions = unpackColumn(months.mentions);
    const last = months.months.length - 1;
    const month = months.months[last];
    facts.add({ key: factKey("ai", host, "mentions", "now"), value: mentions[last] ?? 0, unit: "count", source: "ai", label: `times AI answers mentioned ${host} in a month`, from: `${month}-01`, to: `${month}-28` });
    const yearBefore = months.months.indexOf(`${Number(month.slice(0, 4)) - 1}${month.slice(4)}`);
    if (yearBefore >= 0) {
      facts.add({ key: factKey("ai", host, "mentions", "year"), value: mentions[yearBefore] ?? 0, unit: "count", source: "ai", label: `times AI answers mentioned ${host} in a month`, from: `${months.months[yearBefore]}-01`, to: `${months.months[yearBefore]}-28` });
    }
  }
  // Hakken's own AI answer checks: how often each assistant was asked, and how often it named each website.
  const listed = listHold(site);
  const summary = await holdAiSummary(ctx, listed ?? null, site.place);
  const hosts = new Map(websites.map((website) => [website._id, website.displayHost ?? website.host]));
  // The pages each website has cited as a source by AI assistants (Pages AI cites, §5).
  for (const cited of summary?.cited ?? []) {
    const host = hosts.get(cited.websiteId);
    if (host) facts.add({ key: factKey("ai", "cited", host), value: cited.pages, unit: "count", source: "ai", label: `${host}'s pages AI assistants cited as a source` });
  }
  for (const engine of summary?.engines ?? []) {
    facts.add({ key: factKey("ai", "answers", engine.engine, "asked"), value: engine.asked, unit: "count", source: "ai", label: `questions asked of ${engine.engine}`, to: engine.lastDay });
    for (const host of hosts.values()) {
      const named = engine.named.find((entry) => hosts.get(entry.websiteId) === host)?.times ?? 0;
      facts.add({ key: factKey("ai", "answers", engine.engine, host, "named"), value: named, unit: "count", source: "ai", label: `answers from ${engine.engine} naming ${host}`, to: engine.lastDay });
    }
  }
  // Reviews: the website's own Business Profiles and its rivals'.
  const held = await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(40);
  for (const entry of held) {
    const listing = await ctx.db.get(entry.listingId);
    if (!listing) continue;
    const who = entry.role === "OWN" ? "own" : "rival";
    if (listing.reviews !== undefined) facts.add({ key: factKey("local", who, listing.name, "reviews"), value: listing.reviews, unit: "count", source: "local", label: `Google reviews of ${listing.name}` });
    if (listing.rating !== undefined) facts.add({ key: factKey("local", who, listing.name, "rating"), value: listing.rating, unit: "score", source: "local", label: `${listing.name}'s Google rating, out of 5` });
  }
  // The site audit's newest crawl: its pages, and each problem's pages.
  const crawl = await ctx.db.query("siteCrawls").withIndex("by_site_day", (q) => q.eq("websiteId", site.website._id)).order("desc").first();
  if (crawl) {
    facts.add({ key: factKey("crawl", "pages"), value: crawl.pagesCrawled, unit: "count", source: "crawl", label: "pages read in the site audit", to: crawl.day });
    for (const issue of crawl.issues) facts.add({ key: factKey("crawl", "issue", issue.check), value: issue.pages, unit: "count", source: "crawl", label: `pages with "${issue.check}"`, to: crawl.day });
  }
  return facts.list;
}

// ---------------------------------------------------------------------------
// The queries the run reads, one a source

const holdArgs = { holdId: v.id("companyWebsites") };

export const searchConsoleFactsInternal = internalQuery({
  args: holdArgs,
  returns: v.array(factValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    return hold ? await searchConsoleFacts(ctx, hold) : [];
  },
});

export const analyticsFactsInternal = internalQuery({
  args: { ...holdArgs, part: v.optional(v.union(v.literal("totals"), v.literal("landing"), v.literal("events"))) },
  returns: v.array(factValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return [];
    // Without a part, every part: the tests' and a small website's one read.
    if (args.part) return await analyticsFacts(ctx, hold, args.part);
    return [...await analyticsFacts(ctx, hold, "totals"), ...await analyticsFacts(ctx, hold, "landing"), ...await analyticsFacts(ctx, hold, "events")];
  },
});

export const marketFactsInternal = internalQuery({
  args: holdArgs,
  returns: v.array(factValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    return hold ? await marketFacts(ctx, hold) : [];
  },
});

/**
 * Every source of one website, read for a run: each source on its own, so one
 * that fails says so and the rest still read (Anthony, 2026-10-11: "don't get
 * blocked if anything fails"). The problems are the run's to log.
 */
export async function readWebsiteFacts(ctx: Pick<ActionCtx, "runQuery">, holdId: Id<"companyWebsites">): Promise<{ facts: Fact[]; problems: string[] }> {
  const reads: Array<[string, () => Promise<Fact[]>]> = [
    ["Search Console", () => ctx.runQuery(internal.insightsReading.searchConsoleFactsInternal, { holdId })],
    ["Google Analytics' totals", () => ctx.runQuery(internal.insightsReading.analyticsFactsInternal, { holdId, part: "totals" })],
    ["Google Analytics' landing pages", () => ctx.runQuery(internal.insightsReading.analyticsFactsInternal, { holdId, part: "landing" })],
    ["Google Analytics' events", () => ctx.runQuery(internal.insightsReading.analyticsFactsInternal, { holdId, part: "events" })],
    ["the market", () => ctx.runQuery(internal.insightsReading.marketFactsInternal, { holdId })],
  ];
  const facts: Fact[] = [];
  const problems: string[] = [];
  for (const [name, read] of reads) {
    try {
      facts.push(...await read());
    } catch (error) {
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { facts, problems };
}

// ---------------------------------------------------------------------------
// Month by month, for the executive summary's charts (§4.1)

/**
 * Visits and conversions a month over the last 12 months (Analytics' 12
 * months a day, I44), and the website's share of its market's estimated
 * Google visitors a month, back as far as every website in it is held.
 */
export const monthlyInternal = internalQuery({
  args: holdArgs,
  returns: v.object({ enquiriesByMonth: v.array(monthValidator), shareByMonth: v.array(shareMonthValidator) }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return { enquiriesByMonth: [], shareByMonth: [] };
    const enquiries = new Map<string, { visits: number; conversions: number }>();
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (connection?.property) {
      const counted = countedOf(connection);
      const series = await readSlot(ctx, hold._id, slotKey("series", "365", "NOW", EVERY_DEVICE));
      for (const row of series?.rows ?? []) {
        const month = row.key.slice(0, 7);
        const held = enquiries.get(month) ?? { visits: 0, conversions: 0 };
        held.visits += row.visits;
        held.conversions += conversionsOf(row, counted).conversions;
        enquiries.set(month, held);
      }
    }
    const shares = new Map<string, { you: number; total: number; hosts: number }>();
    const site = await loadSite(ctx, hold._id);
    let hosts = 0;
    if (site) {
      const rivals = await loadRivalHolds(ctx, site);
      const ids = [site.website._id, ...rivals.map((rival) => rival.websiteId)];
      hosts = ids.length;
      const from = shiftDay(site.today, -700);
      for (const [index, websiteId] of ids.entries()) {
        for (const point of await seriesFor(ctx, websiteId, site.place, from, site.today, "month")) {
          if (typeof point.estimatedTraffic !== "number") continue;
          const month = point.day.slice(0, 7);
          const held = shares.get(month) ?? { you: 0, total: 0, hosts: 0 };
          held.total += point.estimatedTraffic;
          held.hosts += 1;
          if (index === 0) held.you += point.estimatedTraffic;
          shares.set(month, held);
        }
      }
    }
    return {
      enquiriesByMonth: [...enquiries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, held]) => ({ month, ...held })),
      // A month counts only when every website in the market has a figure for it.
      shareByMonth: [...shares.entries()].filter(([, held]) => held.hosts === hosts && held.total > 0).sort(([a], [b]) => a.localeCompare(b)).map(([month, held]) => ({ month, you: held.you, total: held.total })),
    };
  },
});

/**
 * A calendar month's figures against the month before, for the monthly
 * report (§4.1): enquiries and visits from Analytics' 12 months a day (I44),
 * Google clicks in the home country from Search Console's days.
 */
export const monthFactsInternal = internalQuery({
  args: { holdId: v.id("companyWebsites"), month: v.string() },
  returns: v.array(factValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return [];
    const facts = new Facts();
    const [year, month] = args.month.split("-").map(Number);
    const before = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
    const lastDay = (key: string) => {
      const [y, m] = key.split("-").map(Number);
      return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    };
    const spans = { now: { from: `${args.month}-01`, to: lastDay(args.month) }, before: { from: `${before}-01`, to: lastDay(before) } };
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (connection?.property) {
      const counted = countedOf(connection);
      const series = await readSlot(ctx, hold._id, slotKey("series", "365", "NOW", EVERY_DEVICE));
      for (const which of ["now", "before"] as const) {
        const span = spans[which];
        const rows = (series?.rows ?? []).filter((row) => row.key >= span.from && row.key <= span.to);
        if (rows.length === 0) continue;
        const visits = rows.reduce((sum, row) => sum + row.visits, 0);
        const conversions = rows.reduce((sum, row) => sum + conversionsOf(row, counted).conversions, 0);
        facts.add({ key: factKey("month", "visits", which), value: visits, unit: "count", source: "analytics", label: "visits", ...span, country: connection.mainCountry });
        facts.add({ key: factKey("month", "enquiries", which), value: conversions, unit: "count", source: "analytics", label: "enquiries", ...span, country: connection.mainCountry });
      }
    }
    const sc = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (sc?.newestDay) {
      const days = await daysOf(ctx, hold._id, "web", spans.before.from, spans.now.to);
      for (const which of ["now", "before"] as const) {
        const span = spans[which];
        if (sc.oldestDay && span.from < sc.oldestDay) continue;
        const inSpan = days.filter((day) => day.day >= span.from && day.day <= span.to);
        if (inSpan.length === 0) continue;
        facts.add({ key: factKey("month", "googleClicks", which), value: inSpan.reduce((sum, day) => sum + day.clicks, 0), unit: "count", source: "searchConsole", label: "Google clicks", ...span, country: sc.mainCountry ?? mainConsoleCountry(hold) });
      }
    }
    return facts.list;
  },
});
