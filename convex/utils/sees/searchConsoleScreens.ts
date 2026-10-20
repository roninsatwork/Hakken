import { seen, toPage, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";
import type { CalendarPeriod } from "../calendarPeriods";

/**
 * What Hakken sees on the rest of Search Console's screens
 * (docs/plans/active/search-console-volatility-plan.md §8, HS8; Anthony,
 * 2026-10-10: "if a screen in Discovery, Search Console or Analytics is
 * missing a What Hakken sees we need to add it where it makes sense"): what
 * each screen's figures mean, as an SEO specialist would say it, and what to
 * do first. Fixed rules over the figures each screen already reads — never an
 * AI model, never a purchase — run on screen over the same answer the screen
 * shows (`SearchConsoleSees`), most important first, sent as codes with
 * their numbers for the screen's words (`searchConsole.seen.<screen>`).
 * Shares go as whole percentages; the date menu's period as `period`, worded
 * by the sentence (calendar-periods-plan.md, phase 4).
 */

type Maybe<T> = T | null | undefined | false;

/** A change in clicks this big, as a share, is worth saying. */
const WORTH_SAYING = 0.1;
/** A brand share at or above this says to grow the searches that don't name the business. */
const MOSTLY_BRAND = 0.5;

/** The list figures a Search Console list screen reads (`searchConsoleLists.ts`'s summary), as far as its box needs them. */
export type ListFigures = {
  rows: number;
  clicks: number;
  impressions: number;
  previousClicks: number | null;
  position: number | null;
  gaining: number;
  losing: number;
  gained: number;
  lost: number;
  volume: number;
  expected: number;
  high: number;
  low: number;
  pagesInvolved: number | null;
  bands: Record<string, number>;
  bandsBefore: Record<string, number> | null;
  brand: { now: { brandClicks: number; nonBrandClicks: number }; before: { brandClicks: number; nonBrandClicks: number } | null } | null;
};

/** A change as a share, or null without the days before. */
const changeOf = (now: number, before: number | null): number | null => (before === null || before <= 0 ? null : (now - before) / before);
const percent = (share: number) => Math.round(Math.abs(share) * 100);

/** "That is 21% fewer clicks than the month before", when the change is worth saying. */
function clicksChange(now: number, before: number | null, period: CalendarPeriod): Maybe<SeenPhrase> {
  const change = changeOf(now, before);
  if (change === null || Math.abs(change) < WORTH_SAYING) return null;
  return { code: change > 0 ? "clicksUp" : "clicksDown", a: percent(change), period };
}

/** Clicks fell enough to ask whether it was Google: Volatility answers. */
function checkGoogle(now: number, before: number | null): Maybe<SeenStep> {
  const change = changeOf(now, before);
  return change !== null && change <= -WORTH_SAYING && { code: "checkGoogle", link: "seeVolatility", to: toPage("volatility") };
}

const near = (bands: Record<string, number>) => (bands["4-10"] ?? 0) + (bands["11-20"] ?? 0);
const pushNear = (bands: Record<string, number>): Maybe<SeenStep> =>
  near(bands) > 0 && { code: "pushNear", a: near(bands), link: "seeAlmost", to: toPage("almost-there") };

/** Keywords. */
export function keywordsSees(list: ListFigures, period: CalendarPeriod): Seen {
  if (list.rows === 0) return seen([{ code: "noKeywords", period }]);
  return seen(
    [
      { code: "shown", a: list.rows, b: list.clicks, period },
      clicksChange(list.clicks, list.previousClicks, period),
      { code: "topThree", a: list.bands["1-3"] ?? 0 },
    ],
    [checkGoogle(list.clicks, list.previousClicks), pushNear(list.bands)],
  );
}

/** Pages. */
export function pagesSees(list: ListFigures, period: CalendarPeriod): Seen {
  if (list.rows === 0) return seen([{ code: "noPages", period }]);
  return seen(
    [{ code: "shown", a: list.rows, b: list.clicks, period }, clicksChange(list.clicks, list.previousClicks, period)],
    [checkGoogle(list.clicks, list.previousClicks), { code: "seeLowCtr", link: "seeLowCtr", to: toPage("shown-but-not-clicked") }],
  );
}

/** Position bands. */
export function bandsSees(list: ListFigures): Seen {
  const top = list.bands["1-3"] ?? 0;
  const before = list.bandsBefore ? list.bandsBefore["1-3"] ?? 0 : null;
  return seen(
    [
      { code: "bands", a: top, b: list.bands["4-10"] ?? 0, c: list.bands["11-20"] ?? 0 },
      before !== null && top !== before && { code: top > before ? "topMore" : "topFewer", a: Math.abs(top - before) },
    ],
    [pushNear(list.bands)],
  );
}

/** Wins and losses. */
export function movesSees(list: ListFigures, period: CalendarPeriod): Seen {
  if (list.gaining === 0 && list.losing === 0) return seen([{ code: "noMoves", period }]);
  const net = list.gained - Math.abs(list.lost);
  return seen(
    [
      { code: "gainingLosing", a: list.gaining, b: list.losing, period },
      net !== 0 && { code: net > 0 ? "netUp" : "netDown", a: Math.abs(net) },
    ],
    [
      list.losing > 0 && { code: "seeLosing", link: "seeLosing", to: toPage("wins-and-losses", { move: "loss" }) },
      net < 0 && { code: "checkGoogle", link: "seeVolatility", to: toPage("volatility") },
    ],
  );
}

/** Almost there. */
export function almostSees(list: ListFigures): Seen {
  if (list.rows === 0) return seen([{ code: "noneNear" }]);
  return seen(
    [{ code: "near", a: list.rows }, list.volume > 0 && { code: "nearVolume", a: list.volume }],
    [{ code: "improvePages", link: "seePages", to: toPage("pages") }],
  );
}

/** Shown but not clicked. */
export function lowCtrSees(list: ListFigures): Seen {
  if (list.rows === 0) return seen([{ code: "noneLow" }]);
  return seen(
    [{ code: "lowCtr", a: list.rows, b: list.clicks, c: list.expected }],
    [{ code: "rewriteTitles", link: "seePages", to: toPage("pages") }],
  );
}

/** Missed demand. */
export function demandSees(list: ListFigures): Seen {
  if (list.rows === 0) return seen([{ code: "noneMissed" }]);
  return seen(
    [{ code: "missed", a: list.rows }, list.volume > 0 && { code: "missedVolume", a: list.volume }],
    [{ code: "writeForDemand", link: "keywordResearch", to: { url: "/app/keyword-research" } }],
  );
}

/** Pages competing. */
export function competingSees(list: ListFigures): Seen {
  if (list.rows === 0) return seen([{ code: "noneCompeting" }]);
  return seen(
    [{ code: "competing", a: list.rows, b: list.pagesInvolved ?? 0 }, { code: "splitsClicks" }],
    // Which page owns each keyword is Keyword cannibalisation's specialist's to say (insights-one-voice-plan.md phase 5): one voice.
    [{ code: "pickOne", link: "seeCannibalisation", to: { url: "/app/insights/cannibalisation" } }],
  );
}

/** Real against estimated. */
export function estimatesSees(list: ListFigures): Seen {
  if (list.rows === 0) return seen([{ code: "estimatesClose" }]);
  return seen([{ code: "estimatesOff", a: list.rows, b: list.high, c: list.low }]);
}

/** Brand and non-brand. */
export function brandSees(list: ListFigures): Seen {
  const split = list.brand;
  const total = split ? split.now.brandClicks + split.now.nonBrandClicks : 0;
  if (!split || total === 0) return seen([{ code: "noBrandClicks" }]);
  const share = split.now.brandClicks / total;
  const other = changeOf(split.now.nonBrandClicks, split.before ? split.before.nonBrandClicks : null);
  return seen(
    [
      { code: "brandShare", a: percent(share) },
      other !== null && Math.abs(other) >= WORTH_SAYING && { code: other > 0 ? "othersUp" : "othersDown", a: percent(other) },
    ],
    [share >= MOSTLY_BRAND && { code: "growOthers", link: "seeDemand", to: toPage("missed-demand") }],
  );
}

/** Tracked keywords and tracked pages. */
export function trackedSees(list: ListFigures, period: CalendarPeriod, kind: "keywords" | "pages"): Seen {
  if (list.rows === 0) return seen([{ code: `none${kind === "keywords" ? "Keywords" : "Pages"}` }], [{ code: `track${kind === "keywords" ? "Keywords" : "Pages"}`, link: kind === "keywords" ? "seeKeywords" : "seePages", to: toPage(kind) }]);
  return seen(
    [{ code: kind === "keywords" ? "trackedKeywords" : "trackedPages", a: list.rows, b: list.clicks, period }, clicksChange(list.clicks, list.previousClicks, period)],
    [checkGoogle(list.clicks, list.previousClicks)],
  );
}

/** Performance: the website's totals against the days before. */
export function performanceSees(totals: { clicks: number; impressions: number; position: number } | null, previous: { clicks: number; position: number } | null, period: CalendarPeriod): Seen {
  if (!totals) return seen([{ code: "nothingShown", period }]);
  const fell = changeOf(totals.clicks, previous ? previous.clicks : null);
  return seen(
    [
      { code: "performance", a: totals.impressions, b: totals.clicks, period },
      clicksChange(totals.clicks, previous ? previous.clicks : null, period),
      { code: "position", a: Math.round(totals.position * 10) / 10 },
    ],
    [fell !== null && fell <= -WORTH_SAYING
      ? { code: "checkGoogle", link: "seeVolatility", to: toPage("volatility") }
      : { code: "seeWins", link: "seeWins", to: toPage("wins-and-losses") }],
  );
}

/** New and lost. */
export function newLostSees(counts: { newKeywords: number; lostKeywords: number; newPages: number; lostPages: number }, period: CalendarPeriod): Seen {
  return seen(
    [
      { code: "keywordsNewLost", a: counts.newKeywords, b: counts.lostKeywords, period },
      (counts.newPages > 0 || counts.lostPages > 0) && { code: "pagesNewLost", a: counts.newPages, b: counts.lostPages },
    ],
    [counts.lostKeywords > counts.newKeywords && { code: "checkGoogle", link: "seeVolatility", to: toPage("volatility") }],
  );
}

/** By page classification: the kind of page bringing the most clicks, named by the screen (`text`). */
export function typesSees(top: { name: string; clicks: number } | null, clicks: number): Seen {
  if (!top || clicks === 0) return seen([{ code: "noTypes" }]);
  return seen([{ code: "topType", text: top.name, a: percent(top.clicks / clicks) }]);
}

/** Countries and devices: the country bringing the most clicks, named by the screen, and mobile's share. */
export function placesSees(country: { name: string; clicks: number } | null, clicks: number, mobileClicks: number | null): Seen {
  if (!country || clicks === 0) return seen([{ code: "noPlaces" }]);
  return seen([
    { code: "topCountry", text: country.name, a: percent(country.clicks / clicks) },
    mobileClicks !== null && { code: "mobileShare", a: percent(mobileClicks / clicks) },
  ]);
}

/** Rich results: how many kinds show the website's pages, and the one bringing the most clicks, named by the screen. */
export function appearanceSees(kinds: number, top: { name: string } | null): Seen {
  if (kinds === 0 || !top) return seen([{ code: "noRichResults" }]);
  return seen([{ code: "richResults", a: kinds, text: top.name }]);
}

/** Click rate by position: how often a page is clicked at position 1 and at 3, as percentages. */
export function curveSees(points: ReadonlyArray<{ position: number; ctr: number; impressions: number }>): Seen {
  const at = (position: number) => points.find((point) => point.position === position && point.impressions > 0) ?? null;
  const first = at(1);
  const third = at(3);
  if (!first) return seen([{ code: "noFirst" }], [{ code: "seeAlmost", link: "seeAlmost", to: toPage("almost-there") }]);
  return seen(
    [
      third
        ? { code: "firstAndThird", a: Math.round(first.ctr * 1000) / 10, b: Math.round(third.ctr * 1000) / 10 }
        : { code: "firstOnly", a: Math.round(first.ctr * 1000) / 10 },
    ],
    [{ code: "seeLowCtr", link: "seeLowCtr", to: toPage("shown-but-not-clicked") }],
  );
}

/** A keyword's or a page's own screen: its clicks and position against the days before. */
export function recordSees(
  name: string,
  totals: { clicks: number; position: number } | null,
  previous: { clicks: number; position: number } | null,
  period: CalendarPeriod,
): Seen {
  if (!totals) return seen([{ code: "notShown", text: name, period }]);
  const moved = previous ? Math.round((previous.position - totals.position) * 10) / 10 : 0;
  return seen([
    { code: "recordFigures", text: name, a: Math.round(totals.position * 10) / 10, b: totals.clicks, period },
    clicksChange(totals.clicks, previous ? previous.clicks : null, period),
    previous && Math.abs(moved) >= 1 && { code: moved > 0 ? "rose" : "fell", a: Math.round(previous.position * 10) / 10, b: Math.round(totals.position * 10) / 10 },
  ]);
}

/** Search Console's list of websites: how many are connected, and the one to connect first. */
export function websitesSees(sites: ReadonlyArray<{ siteId: string; host: string; connected: boolean; clicks: number | null }>): Seen {
  if (sites.length === 0) return seen([{ code: "noWebsites" }]);
  const connected = sites.filter((site) => site.connected);
  const top = [...connected].sort((left, right) => (right.clicks ?? 0) - (left.clicks ?? 0))[0];
  const waiting = sites.find((site) => !site.connected);
  return seen(
    [
      { code: "connected", a: connected.length, b: sites.length },
      // One connected website brought its clicks; of several, the one bringing the most.
      top && (top.clicks ?? 0) > 0 && { code: connected.length === 1 ? "oneWebsite" : "topWebsite", text: top.host, a: top.clicks ?? 0 },
      waiting && { code: "notConnected", text: waiting.host },
    ],
    [waiting && { code: "connect", text: waiting.host, link: "connect", to: { url: `/app/search-console/${waiting.siteId}/connection` } }],
  );
}

/** A service's showings and clicks, now and before, named by the screen. */
export type ServiceDemand = { name: string; shown: number; shownBefore: number | null; clicks: number; clicksBefore: number | null; service: boolean };

/** A service needs this many showings before its change says anything. */
const DEMAND_FLOOR = 100;

/**
 * Demand by service (insights-analyst-plan.md §4.4, phase 9): whether Google
 * showed the website more or less than the days before and what happened to
 * the clicks, and which service held up best and which fell most — the one
 * to put next quarter's effort into.
 */
export function servicesSees(services: readonly ServiceDemand[]): Seen {
  const shown = services.reduce((sum, service) => sum + service.shown, 0);
  if (shown === 0) return seen([{ code: "noDemand" }]);
  const held = services.filter((service) => service.shownBefore !== null);
  const shownBefore = held.reduce((sum, service) => sum + (service.shownBefore ?? 0), 0);
  const clicks = services.reduce((sum, service) => sum + service.clicks, 0);
  const clicksBefore = held.reduce((sum, service) => sum + (service.clicksBefore ?? 0), 0);
  const moved = (now: number, before: number) => Math.round(((now - before) / before) * 100);
  // Best and worst among the services themselves, never the guides or the company's other groups.
  const sized = held.filter((service) => service.service && (service.shownBefore ?? 0) >= DEMAND_FLOOR).map((service) => ({ ...service, change: moved(service.shown, service.shownBefore ?? 0) }));
  const ranked = [...sized].sort((a, b) => b.change - a.change);
  const best = ranked[0], worst = ranked.at(-1);
  return seen(
    [
      shownBefore > 0 && { code: shown >= shownBefore ? "shownMore" : "shownFewer", a: Math.abs(moved(shown, shownBefore)), b: clicks, c: clicksBefore },
      // Sizes as plain numbers, `c` 1 when the best still rose: the words say up or down.
      best && worst && best !== worst && { code: "bestWorst", text: best.name, more: worst.name, a: Math.abs(best.change), b: Math.abs(worst.change), c: best.change >= 0 ? 1 : 0 },
    ],
    [best && { code: "growBest", text: best.name, link: "seeStrategy", to: { url: "/app/insights/strategy" } }],
  );
}

/** A money page's indexing, as the weekly check found it. */
export type PageIndexing = { page: string; verdict: string | null; lastRead: string | null };

/** A page Google hasn't read in this many days carries none of the changes made since. */
const UNREAD_DAYS = 60;

/**
 * Indexing (insights-analyst-plan.md §4.4, phase 8): how many money pages
 * Google has indexed, which one isn't, and the one it read longest ago — with
 * asking Google to read it again as the step, in Search Console itself.
 */
export function indexingSees(pages: readonly PageIndexing[], checkedDay: string | null): Seen {
  const inspected = pages.filter((page) => page.verdict !== null);
  if (inspected.length === 0) return seen([{ code: "noIndexing" }]);
  const indexed = inspected.filter((page) => page.verdict === "PASS");
  const missing = inspected.filter((page) => page.verdict !== "PASS");
  const oldest = [...indexed].filter((page) => page.lastRead).sort((a, b) => (a.lastRead ?? "").localeCompare(b.lastRead ?? ""))[0];
  const daysAgo = (day: string) => (checkedDay ? Math.round((Date.parse(checkedDay) - Date.parse(day)) / 86_400_000) : 0);
  const stale = oldest?.lastRead && daysAgo(oldest.lastRead) >= UNREAD_DAYS ? oldest : null;
  const console = { url: "https://search.google.com/search-console" };
  return seen(
    [
      { code: "indexedOf", a: indexed.length, b: inspected.length },
      missing.length > 0 && { code: "notIndexed", text: missing[0].page, a: missing.length },
      oldest?.lastRead ? { code: "oldestRead", text: oldest.page, days: [oldest.lastRead] } : null,
    ],
    [
      missing.length > 0 && { code: "fixIndexing", text: missing[0].page, link: "openSearchConsole", to: console },
      stale && { code: "askRead", text: stale.page, link: "openSearchConsole", to: console },
    ],
  );
}
