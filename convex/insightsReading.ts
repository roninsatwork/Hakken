import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import { decodePages } from "./holdPageRefs";
import { holdAiSummary } from "./holdLists";
import { conversionsOf, countedOf, readSlot } from "./googleAnalyticsRows";
import { EVERY_DEVICE, slotKey, splitChannelKey, unpackPart, type ListRow, type PackedPart } from "./googleAnalyticsLists";
import { channelOf } from "./utils/aiAssistants";
import type { AnalyticsList, AnalyticsPeriod, AnalyticsWhich } from "./googleAnalyticsSchema";
import { BookNames } from "./searchConsolePeriodBooks";
import { readPeriod } from "./searchConsolePeriodReads";
import { daysOf } from "./searchConsoleReads";
import { addUp } from "./searchConsoleDays";
import { mainConsoleCountry } from "./searchConsoleCountries";
import { countryIdOf } from "./googleAnalyticsCollect";
import { readings } from "./siteBrandRadar";
import { latestBands, latestFigures, seriesFor } from "./siteFigures";
import { listHold } from "./siteAccess";
import { loadRivalHolds, loadSite } from "./websiteSiteRows";
import { unpackColumn } from "./utils/packedColumns";
import { factKey, factValidator, percentOf, shiftDay, spanDays, spansOf, type Fact, type FactWhich } from "./utils/insightFacts";
import { monthValidator, shareMonthValidator } from "./utils/insightSummary";
import { rankedServices, serviceValidator, type Service } from "./utils/insightStrategy";
import { sharedSearchFacts, sharedSearches, type RankedRow } from "./utils/insightOwnSites";
import { CHANGE_DAYS, changeKindValidator, changeResultValidator, pageChangeResult, pageChanges, profileChangesOf, type Change, type PageYear } from "./utils/insightTrack";
import { landingByPath } from "./insightsConversion";
import { readListingActivity } from "./localListings";
import { fastEnough, missingStructuredData } from "./utils/moneyPageChecks";
import { NEAR, opportunitiesFrom, pagePlanFrom, planValidator, siteRateOf, type ConsoleSearch, type PageFigures, type RankedSearch } from "./utils/insightPlan";

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

/** A website's pages read for their kinds and titles: the most clicked, every page that brings visits. */
const HOLD_PAGES_READ = 900;

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
    // What the pages add up to: the clicks Google ties to a page (S2), against the website's whole.
    if (list === "page") {
      facts.add({ key: factKey("sc", "tiedClicks", 90, "now"), value: now.rows.reduce((sum, row) => sum + row.clicks, 0), unit: "count", source: "searchConsole", label: "Google clicks tied to a page", from: now.from, to: now.to, country });
    }
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
    // Pages no other page links to (phase 8): from the crawl's own pages, read as far as is sensible.
    const orphans = await orphanPagesOf(ctx, crawl.pullId);
    facts.add({ key: factKey("crawl", "orphans"), value: orphans.length, unit: "count", source: "crawl", label: "pages no other page links to", to: crawl.day });
  }
  // The money pages' weekly checks (phase 8): indexed, read lately, fast for real visitors, marked up.
  const checks = await ctx.db.query("moneyPageChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", hold._id)).take(MONEY_PAGES_READ);
  if (checks.length > 0) {
    const day = new Date(Math.max(...checks.map((check) => check.checkedAt))).toISOString().slice(0, 10);
    const inspected = checks.filter((check) => check.indexed);
    if (inspected.length > 0) {
      facts.add({ key: factKey("tech", "inspected"), value: inspected.length, unit: "count", source: "searchConsole", label: "money pages asked about in Google's URL inspection", to: day });
      facts.add({ key: factKey("tech", "indexed"), value: inspected.filter((check) => check.indexed?.verdict === "PASS").length, unit: "count", source: "searchConsole", label: "money pages Google has indexed", to: day });
    }
    const timed = checks.filter((check) => check.speed?.lcpMs !== null && check.speed?.lcpMs !== undefined);
    if (timed.length > 0) {
      facts.add({ key: factKey("tech", "timed"), value: timed.length, unit: "count", source: "crawl", label: "money pages with Google's real-visitor speed figures", to: day });
      facts.add({ key: factKey("tech", "fast"), value: timed.filter((check) => fastEnough(check.speed) === true).length, unit: "count", source: "crawl", label: "money pages fast enough on Google's three measures", to: day });
    }
    const read = checks.filter((check) => check.structured !== null);
    if (read.length > 0) {
      facts.add({ key: factKey("tech", "marked"), value: read.length, unit: "count", source: "crawl", label: "money pages whose structured data was read", to: day });
      facts.add({ key: factKey("tech", "missingMarkup"), value: read.filter((check) => missingStructuredData(check.kind, check.structured ?? []).length > 0).length, unit: "count", source: "crawl", label: "money pages missing the structured data their kind should carry", to: day });
    }
    for (const check of checks) {
      if (check.indexed && check.indexed.verdict !== "PASS") facts.add({ key: factKey("tech", "page", check.page, "notIndexed"), value: 1, unit: "count", source: "searchConsole", label: `${check.page} not indexed by Google`, to: day });
      if (check.indexed?.lastRead) facts.add({ key: factKey("tech", "page", check.page, "unreadDays"), value: spanDays(check.indexed.lastRead, day) - 1, unit: "count", source: "searchConsole", label: `days since Google last read ${check.page}`, to: day });
      if (check.speed?.lcpMs) facts.add({ key: factKey("tech", "page", check.page, "mainContent"), value: Math.round(check.speed.lcpMs / 100) / 10, unit: "seconds", source: "crawl", label: `seconds before ${check.page} shows its main content to real visitors on phones`, to: day });
    }
  }
  return facts.list;
}

/** A crawl's pages no other page links to, read at most. */
const ORPHANS_READ = 500;

/** The working pages of a crawl no other page links to, the home page aside: read by their own index (phase 8). */
export async function orphanPagesOf(ctx: Reader, pullId: Id<"seoDataPulls">) {
  const rows = await ctx.db.query("siteCrawlPages").withIndex("by_pull_inbound", (q) => q.eq("pullId", pullId).eq("inboundLinks", 0)).take(ORPHANS_READ);
  return rows.filter((page) => (page.statusCode ?? 200) === 200 && (page.resourceType ?? "html") === "html" && page.page !== "/");
}
/** A website's money page checks: a dozen, with room. */
const MONEY_PAGES_READ = 40;

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

/** Whether a website is a shop, as the Google Analytics work marks it (I40): its conversions are sales. */
export const isShopInternal = internalQuery({
  args: holdArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => Boolean((await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first())?.shop),
});

/** The days the Measurement check's chart draws: eight weeks, as Analytics keeps its channel days. */
const MEASUREMENT_DAYS = 56;

/**
 * What the Measurement check reads besides the facts (phase 13): Analytics'
 * own checks, as its connection keeps them (never worked out twice, I38), and
 * Google's clicks against Analytics' visits from Google a day each, both for
 * the main home country (I33).
 */
export const measurementInternal = internalQuery({
  args: holdArgs,
  returns: v.object({
    health: v.union(v.null(), v.array(v.object({ check: v.string(), passing: v.boolean(), names: v.optional(v.array(v.string())), count: v.optional(v.number()), share: v.optional(v.number()) }))),
    byDay: v.array(v.object({ day: v.string(), clicks: v.number(), visits: v.number() })),
  }),
  handler: async (ctx, args) => {
    const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.holdId)).first();
    const health = analytics?.status === "CONNECTED" && analytics.health ? analytics.health.checks : null;
    if (!analytics?.newestDay || !console?.newestDay) return { health, byDay: [] };
    // The days both hold: Search Console settles three days later than Analytics.
    const last = analytics.newestDay < console.newestDay ? analytics.newestDay : console.newestDay;
    const first = shiftDay(last, -(MEASUREMENT_DAYS - 1));
    const clicks = new Map((await daysOf(ctx, args.holdId, "web", first, last)).map((day) => [day.day, day.clicks]));
    const parts = await ctx.db
      .query("googleAnalyticsDays")
      .withIndex("by_hold_list_device_day", (q) => q.eq("companyWebsiteId", args.holdId).eq("list", "channel").eq("device", EVERY_DEVICE).gte("day", first).lte("day", last))
      .take(MEASUREMENT_DAYS + 2);
    const visits = new Map(parts.map((part) => [part.day, unpackPart(part as PackedPart).filter((row) => splitChannelKey(row.key).channel === "Organic Search").reduce((sum, row) => sum + row.visits, 0)]));
    const days = [...new Set([...clicks.keys(), ...visits.keys()])].filter((day) => clicks.has(day) && visits.has(day)).sort();
    return { health, byDay: days.map((day) => ({ day, clicks: clicks.get(day) ?? 0, visits: visits.get(day) ?? 0 })) };
  },
});

/** Rankings read in each band within reach, at most. */
const RANKS_READ = 300;
/** A plan page's own rankings read, to name what it should win. */
const PAGE_RANKS_READ = 40;

/**
 * Opportunities and the page plan (phase 9): the searches the website nearly
 * wins, from Visibility's rankings and Search Console's searches, each priced
 * with its page's rate from Analytics; and each page's one thing to do, from
 * its 12 months against the 12 before and the change log (I25).
 */
export const planInternal = internalQuery({
  args: holdArgs,
  returns: planValidator,
  handler: async (ctx, args) => {
    const none = { opportunities: [], pages: [], siteRate: null };
    const hold = await ctx.db.get(args.holdId);
    const site = hold ? await loadSite(ctx, hold._id) : null;
    if (!hold || !site) return none;
    // Each page's kind and title, and its 12 months against the 12 before.
    const held = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").take(HOLD_PAGES_READ);
    const kindOf = new Map(held.map((page) => [page.page, page]));
    const figures = new Map<string, PageFigures>();
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    if (connection?.property) {
      const counted = countedOf(connection);
      for (const which of ["NOW", "YEAR"] as const) {
        const landing = await readSlot(ctx, hold._id, slotKey("landing", "365", which, EVERY_DEVICE));
        if (!landing) continue;
        const addresses = await decodePages(ctx, hold._id, landing.rows.map((row) => row.key));
        landing.rows.forEach((row, index) => {
          const path = pathOf(addresses[index]);
          const page = kindOf.get(path);
          const entry = figures.get(path) ?? { page: path, kind: page?.pageType ?? (path === "/" ? "HOME" : null), title: page?.title ?? null, visits: 0, enquiries: 0, visitsBefore: null, enquiriesBefore: null };
          const done = conversionsOf(row, counted).conversions;
          if (which === "NOW") {
            entry.visits += row.visits;
            entry.enquiries += done;
          } else {
            entry.visitsBefore = (entry.visitsBefore ?? 0) + row.visits;
            entry.enquiriesBefore = (entry.enquiriesBefore ?? 0) + done;
          }
          figures.set(path, entry);
        });
      }
    }
    const pages = [...figures.values()];
    // The searches within reach in Google's results, and Search Console's own.
    const ranked: RankedSearch[] = [];
    for (const band of ["p04_10", "p11_20", "p21_50"] as const) {
      const rows = await ctx.db.query("siteKeywordRanks")
        .withIndex("by_site_band_position", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("band", band).lte("position", NEAR.to))
        .take(RANKS_READ);
      for (const row of rows) {
        if (row.status !== "LOST" && row.position !== undefined) ranked.push({ keyword: row.keyword, position: row.position, page: row.page, volume: row.volumeKnown ? row.volume : null });
      }
    }
    const list = await readPeriod(ctx, hold._id, "web", "query", "90", "NOW");
    const near = (list?.rows ?? []).filter((row) => row.impressions > 0 && row.positionSum / row.impressions >= NEAR.from - 0.5 && row.positionSum / row.impressions <= NEAR.to + 0.5);
    const names = list?.book ? await new BookNames(ctx, list.book).textsOf(near.map((row) => row.key)) : null;
    const consoleSearches: ConsoleSearch[] = near.map((row) => ({ search: names?.get(row.key) ?? row.key, impressions: row.impressions, position: row.positionSum / row.impressions, brand: Boolean(row.brand) }));
    const opportunities = opportunitiesFrom(ranked, consoleSearches, pages);
    const changes = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", hold._id)).take(100);
    const siteRate = siteRateOf(pages);
    const planned = pagePlanFrom(pages, changes, opportunities, siteRate);
    // What each page should win: its biggest searches within reach.
    const withSearches = [];
    for (const page of planned) {
      const rows = await ctx.db.query("siteKeywordRanks")
        .withIndex("by_site_page_band_position", (q) => q.eq("websiteId", site.website._id).eq("locationCode", site.place).eq("page", page.page))
        .take(PAGE_RANKS_READ);
      const shouldWin = rows
        .filter((row) => row.status !== "LOST" && row.position !== undefined && row.position <= NEAR.to)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 2)
        .map((row) => row.keyword);
      withSearches.push({ ...page, shouldWin });
    }
    return { opportunities, pages: withSearches, siteRate };
  },
});

/** The company's other websites read at most for the searches they share with this one. */
const OWN_SITES_READ = 10;
/** Google's places counted as competing for a search: the bands to the top 20. */
const SHARED_BANDS = ["p01_03", "p04_10", "p11_20"] as const;

/** A website's searches in Google's top 20, in one place. */
async function topRanks(ctx: Reader, websiteId: Id<"websites">, place: number): Promise<RankedRow[]> {
  const rows: RankedRow[] = [];
  for (const band of SHARED_BANDS) {
    const found = await ctx.db.query("siteKeywordRanks")
      .withIndex("by_site_band_position", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("band", band))
      .take(RANKS_READ);
    for (const row of found) {
      if (row.status !== "LOST" && row.position !== undefined) rows.push({ keyword: row.keyword, position: row.position, page: row.page, volume: row.volumeKnown ? row.volume : null });
    }
  }
  return rows;
}

/**
 * The searches this website shares with the company's other websites (I4):
 * each of its own websites read in the same place, the searches both rank
 * for in Google's top 20 counted, the most searched named. Nothing for a
 * company with one website.
 */
export const ownSitesFactsInternal = internalQuery({
  args: holdArgs,
  returns: v.array(factValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || hold.relationship !== "OWNED") return [];
    const others = (await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", hold.companyId)).take(50))
      .filter((other) => other.relationship === "OWNED" && other._id !== hold._id && other.websiteId !== hold.websiteId)
      .slice(0, OWN_SITES_READ);
    if (others.length === 0) return [];
    const site = await loadSite(ctx, hold._id);
    if (!site) return [];
    const read = [];
    for (const other of others) {
      const otherSite = await loadSite(ctx, other._id);
      // A search is the same search only in the same place.
      if (!otherSite || otherSite.place !== site.place) continue;
      read.push({ host: otherSite.website.displayHost ?? otherSite.website.host, rows: await topRanks(ctx, otherSite.website._id, site.place) });
    }
    if (read.length === 0) return [];
    return sharedSearchFacts(site.website.displayHost ?? site.website.host, sharedSearches(await topRanks(ctx, site.website._id, site.place), read), site.today);
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
    ["the company's other websites", () => ctx.runQuery(internal.insightsReading.ownSitesFactsInternal, { holdId })],
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
// Asked of Google in the run (§8): what a screen asks when it opens, reached from the run's own step

/** What the run needs to ask Google Analytics itself: the connection, its property, addresses, home country and what counts. */
export const analyticsTargetInternal = internalQuery({
  args: holdArgs,
  returns: v.union(v.null(), v.object({
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    addresses: v.array(v.string()),
    country: v.string(),
    counted: v.array(v.string()),
    newestDay: v.string(),
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const connection = hold ? await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first() : null;
    if (!hold || !connection?.property || !connection.newestDay || connection.status !== "CONNECTED") return null;
    return {
      connectionId: connection._id,
      property: connection.property,
      addresses: connection.addresses ?? [],
      country: countryIdOf(connection.mainCountry ?? mainConsoleCountry(hold)),
      counted: countedOf(connection).map((event) => event.eventName),
      newestDay: connection.newestDay,
    };
  },
});

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
    const shares = new Map<string, { you: number; total: number; hosts: number; rivals: Array<{ host: string; value: number }> }>();
    const site = await loadSite(ctx, hold._id);
    let hosts = 0;
    if (site) {
      const rivals = await loadRivalHolds(ctx, site);
      const ids = [site.website._id, ...rivals.map((rival) => rival.websiteId)];
      const names = new Map<Id<"websites">, string>();
      for (const id of ids.slice(1)) {
        const website = await ctx.db.get(id);
        if (website) names.set(id, (website.displayHost ?? website.host).replace(/^https?:\/\//, "").replace(/^www\./, ""));
      }
      hosts = ids.length;
      const from = shiftDay(site.today, -700);
      for (const [index, websiteId] of ids.entries()) {
        for (const point of await seriesFor(ctx, websiteId, site.place, from, site.today, "month")) {
          if (typeof point.estimatedTraffic !== "number") continue;
          const month = point.day.slice(0, 7);
          const held = shares.get(month) ?? { you: 0, total: 0, hosts: 0, rivals: [] };
          held.total += point.estimatedTraffic;
          held.hosts += 1;
          if (index === 0) held.you += point.estimatedTraffic;
          else held.rivals.push({ host: names.get(websiteId) ?? "", value: point.estimatedTraffic });
          shares.set(month, held);
        }
      }
    }
    return {
      enquiriesByMonth: [...enquiries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, held]) => ({ month, ...held })),
      // A month counts only when every website in the market has a figure for it.
      shareByMonth: [...shares.entries()].filter(([, held]) => held.hosts === hosts && held.total > 0).sort(([a], [b]) => a.localeCompare(b)).map(([month, held]) => ({ month, you: held.you, total: held.total, rivals: held.rivals })),
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

/**
 * Each service of a website for the quarter's strategy (§4.1): its service
 * pages and home page, and its articles together as its guides, each with
 * its enquiries and visits over 12 months against the 12 before (Analytics'
 * landing pages, I43) and its Google clicks and showings over 90 days against
 * the 90 before. Pages by Hakken's own kind of page (`holdPages.pageType`).
 */
export const strategyInternal = internalQuery({
  args: holdArgs,
  returns: v.array(serviceValidator),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return [];
    const pages = await ctx.db.query("holdPages").withIndex("by_hold_clicks", (q) => q.eq("companyWebsiteId", hold._id)).order("desc").take(HOLD_PAGES_READ);
    const kindOf = new Map(pages.map((page) => [page.page, page.pageType]));
    const titleOf = new Map(pages.map((page) => [page.page, page.title ?? null]));
    const sum = new Map<string, Omit<Service, "verdict">>();
    const entry = (path: string) => {
      const type = kindOf.get(path);
      const kind = type === "SERVICE" ? "SERVICE" : type === "HOME" || path === "/" ? "HOME" : type === "ARTICLE" ? "GUIDES" : null;
      if (!kind) return null;
      const key = kind === "GUIDES" ? "guides" : path;
      const held = sum.get(key) ?? { page: key, title: kind === "GUIDES" ? null : titleOf.get(path) ?? null, kind, enquiries: 0, enquiriesBefore: 0, visits: 0, people: 0, clicks: 0, clicksBefore: 0, impressions: 0, impressionsBefore: 0 };
      sum.set(key, held);
      return held;
    };
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    let yearHeld = false;
    if (connection?.property) {
      const counted = countedOf(connection);
      for (const which of ["NOW", "YEAR"] as const) {
        const landing = await readSlot(ctx, hold._id, slotKey("landing", "365", which, EVERY_DEVICE));
        if (!landing) continue;
        if (which === "YEAR") yearHeld = true;
        const addresses = await decodePages(ctx, hold._id, landing.rows.map((row) => row.key));
        landing.rows.forEach((row, index) => {
          const held = entry(pathOf(addresses[index]));
          if (!held) return;
          const done = conversionsOf(row, counted).conversions;
          if (which === "NOW") {
            held.enquiries += done;
            held.visits += row.visits;
            held.people += row.people;
          } else held.enquiriesBefore = (held.enquiriesBefore ?? 0) + done;
        });
      }
    }
    let beforeHeld = false;
    for (const which of ["NOW", "BEFORE"] as const) {
      const list = await readPeriod(ctx, hold._id, "web", "page", "90", which);
      if (list && which === "BEFORE") beforeHeld = true;
      for (const row of list?.rows ?? []) {
        const held = entry(pathOf(row.key));
        if (!held) continue;
        if (which === "NOW") {
          held.clicks += row.clicks;
          held.impressions += row.impressions;
        } else {
          held.clicksBefore = (held.clicksBefore ?? 0) + row.clicks;
          held.impressionsBefore = (held.impressionsBefore ?? 0) + row.impressions;
        }
      }
    }
    // A year not held is not a fall: its figures are left unsaid.
    const services = [...sum.values()].map((service) => ({
      ...service,
      ...(yearHeld ? {} : { enquiriesBefore: null }),
      ...(beforeHeld ? {} : { clicksBefore: null, impressionsBefore: null }),
    }));
    return rankedServices(services);
  },
});

/**
 * The page changes for the change log (I25), from the whole landing page lists
 * of the last 12 months and the 12 before (`utils/insightTrack.ts`), and the
 * pages logged as removed that had visits after all — dropped from the log.
 */
export const pageChangesInternal = internalQuery({
  args: holdArgs,
  returns: v.object({
    changes: v.array(v.object({ kind: changeKindValidator, from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()), day: v.optional(v.string()), before: v.number(), after: v.number(), result: changeResultValidator })),
    notRemoved: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    const connection = hold ? await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first() : null;
    if (!hold || !connection?.property) return { changes: [], notRemoved: [] };
    const counted = countedOf(connection);
    const yearOf = async (which: "NOW" | "YEAR"): Promise<PageYear[] | null> => {
      const landing = await readSlot(ctx, hold._id, slotKey("landing", "365", which, EVERY_DEVICE));
      if (!landing) return null;
      const addresses = await decodePages(ctx, hold._id, landing.rows.map((row) => row.key));
      return landing.rows.map((row, index) => ({ path: pathOf(addresses[index]), visits: row.visits, enquiries: conversionsOf(row, counted).conversions }));
    };
    const [now, year] = [await yearOf("NOW"), await yearOf("YEAR")];
    if (!now || !year) return { changes: [], notRemoved: [] };
    const live = new Set(now.filter((page) => page.visits > 0).map((page) => page.path));
    const removed = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", hold._id).eq("kind", "REMOVED")).take(200);
    return { changes: pageChanges(now, year), notRemoved: removed.map((change) => change.from).filter((from): from is string => from !== null && live.has(from)) };
  },
});

/** Own Google profiles read for their changes at most. */
const OWN_PROFILES_READ = 10;

/**
 * The page and profile changes for the change log (I25), each with what
 * followed: the parts of money pages this week's check saw change, with the
 * page's enquiries over the 30 days just gone; the page changes logged too
 * early to judge, judged once Analytics' 30 days all fall after them; and
 * the company's own Google profile changes over the last year, judged on
 * the website's enquiries the 30 days either side, from the year of days.
 */
export const newChangesInternal = internalQuery({
  args: { holdId: v.id("companyWebsites"), today: v.string(), seen: v.array(v.object({ kind: changeKindValidator, page: v.string() })) },
  returns: v.array(v.object({
    kind: changeKindValidator, from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()), day: v.optional(v.string()), seenIn: v.optional(v.string()),
    before: v.number(), after: v.number(), result: changeResultValidator,
  })),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold) return [];
    const changes: Array<Change & { seenIn: string }> = [];
    const landing = await landingByPath(ctx, hold._id, "30", "NOW");
    const enquiriesOn = (page: string) => landing?.pages.get(page)?.enquiries ?? landing?.pages.get(page.replace(/\/+$/, ""))?.enquiries ?? 0;
    for (const seen of args.seen) {
      changes.push({ kind: seen.kind, from: seen.page, to: null, day: args.today, seenIn: "pageCheck", before: landing ? enquiriesOn(seen.page) : 0, ...pageChangeResult(0, null) });
    }
    // A page change is judged once Analytics' 30 days start after it.
    if (landing) {
      const held = await ctx.db.query("insightChanges").withIndex("by_hold_kind_from", (q) => q.eq("companyWebsiteId", hold._id)).take(300);
      for (const change of held) {
        if (change.seenIn !== "pageCheck" || change.result !== "TOO_EARLY" || !change.day || !change.from || landing.from <= change.day) continue;
        changes.push({ kind: change.kind, from: change.from, to: null, day: change.day, seenIn: "pageCheck", before: change.before, ...pageChangeResult(change.before, enquiriesOn(change.from)) });
      }
    }
    // The company's own Google profiles, against the website's enquiries a day.
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
    const own = (await ctx.db.query("holdListings").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).take(OWN_PROFILES_READ * 5)).filter((entry) => entry.role === "OWN").slice(0, OWN_PROFILES_READ);
    if (connection?.property && own.length > 0) {
      const counted = countedOf(connection);
      const series = await readSlot(ctx, hold._id, slotKey("series", "365", "NOW", EVERY_DEVICE));
      const days = (series?.rows ?? []).map((row) => ({ day: row.key, enquiries: conversionsOf(row, counted).conversions }));
      const newest = days.reduce<string | null>((last, entry) => (last === null || entry.day > last ? entry.day : last), null);
      for (const entry of own) {
        const lines = await readListingActivity(ctx, entry.listingId);
        for (const change of profileChangesOf(lines, days, newest, shiftDay(args.today, -365 + CHANGE_DAYS))) changes.push({ ...change, seenIn: "profile" });
      }
    }
    return changes;
  },
});
