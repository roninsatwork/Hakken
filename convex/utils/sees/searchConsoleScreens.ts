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
/**
 * The keywords at places 4 to 20, closest to more clicks: Position bands lists them, at 4–10 and 11–20, since Almost there
 * was taken out of the menu (2026-11-20). Position bands' own eye leaves the step out: it would link to the page it's on.
 */
const pushNear = (bands: Record<string, number>): Maybe<SeenStep> =>
  near(bands) > 0 && { code: "pushNear", a: near(bands), link: "seeBands", to: toPage("position-bands") };

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

/** Position bands: the dates before by the period's words, as Keywords' lines say them (2026-11-19, Way 3). */
export function bandsSees(list: ListFigures, period: CalendarPeriod): Seen {
  const top = list.bands["1-3"] ?? 0;
  const before = list.bandsBefore ? list.bandsBefore["1-3"] ?? 0 : null;
  return seen(
    [
      { code: "bands", a: top, b: list.bands["4-10"] ?? 0, c: list.bands["11-20"] ?? 0 },
      before !== null && top !== before && { code: top > before ? "topMore" : "topFewer", a: Math.abs(top - before), period },
    ],
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
    // Keyword research since Missed demand was taken out of the menu (2026-11-20): the searches people make that you could be found for.
    [share >= MOSTLY_BRAND && { code: "growOthers", link: "keywordResearch", to: { url: "/app/keyword-research" } }],
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
      : { code: "seeWins", link: "seeKeywords", to: toPage("keywords", { sort: "change" }) }],
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

/**
 * Countries and devices: the country bringing the most clicks, named by the screen, and mobile's share of that
 * country's clicks. Its devices are the country chosen's (search-console-countries-and-devices-way-1-plan-2026-11-18.md),
 * so `deviceClicks` is their own total, and the screen hands mobile's only when the country chosen is the busiest.
 */
export function placesSees(country: { name: string; clicks: number } | null, clicks: number, mobileClicks: number | null, deviceClicks: number = clicks): Seen {
  if (!country || clicks === 0) return seen([{ code: "noPlaces" }]);
  return seen([
    { code: "topCountry", text: country.name, a: percent(country.clicks / clicks) },
    mobileClicks !== null && deviceClicks > 0 && { code: "mobileShare", a: percent(mobileClicks / deviceClicks) },
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
  if (!first) return seen([{ code: "noFirst" }], [{ code: "seeBands", link: "seeBands", to: toPage("position-bands") }]);
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

/** A Classification's clicks, named by the screen, and whether it's one the reader made (never Unclassified). */
export type ClassificationClicks = { name: string; clicks: number; sorted: boolean };

/**
 * Demand by Classification (search-console-demand-by-classification-way-2-plan-2026-11-18.md): the Classification that
 * got the most clicks, and its share of the clicks Google tied to the country's pages, as the squares count them.
 */
export function servicesSees(classifications: readonly ClassificationClicks[]): Seen {
  const clicks = classifications.reduce((sum, one) => sum + one.clicks, 0);
  const top = classifications.filter((one) => one.sorted).sort((left, right) => right.clicks - left.clicks)[0];
  if (!top || top.clicks <= 0 || clicks <= 0) return seen([{ code: "noDemand" }]);
  return seen([{ code: "topClicks", text: top.name, a: Math.max(1, Math.round((100 * top.clicks) / clicks)) }]);
}

/** A reason as Indexing names it, in the reader's words, with its page's address and its pages. */
export type IndexingReasonPages = { name: string; slug: string; pages: number };

/**
 * Indexing (search-console-indexing-v1-plan-2026-11-18.md): the biggest reason Google gave, and its share of the pages
 * not in Google, with its own page as the step; every page checked in Google where Google gave no reason; and nothing
 * checked yet where nothing is.
 */
export function indexingSees(reasons: readonly IndexingReasonPages[], checks: { checked: number } | null): Seen {
  if (!checks || checks.checked === 0) return seen([{ code: "noChecks" }]);
  const top = reasons[0];
  if (!top) return seen([{ code: "allIn", a: checks.checked }]);
  const notIndexed = reasons.reduce((sum, one) => sum + one.pages, 0);
  // Tied at the top, no reason is the biggest: the line says how many reasons Google gave instead.
  const tied = reasons[1] !== undefined && reasons[1].pages >= top.pages;
  return seen(
    [tied ? { code: "reasonsTied", a: reasons.length, b: notIndexed } : { code: "biggest", text: top.name, a: top.pages, b: notIndexed }],
    [{ code: "seeReason", text: top.name, link: "seeReasonPages", to: { segment: `indexing/${top.slug}` } }],
  );
}

/**
 * A reason's own page under Indexing: how many of the website's pages Google gave it for, and how many of them still
 * got clicks in the dates.
 */
export function reasonSees(name: string, pages: number, clicked: number): Seen {
  if (pages === 0) return seen([{ code: "reasonNone", text: name }]);
  return seen([{ code: "reasonPages", text: name, a: pages }, clicked > 0 && { code: "reasonClicked", a: clicked }]);
}
