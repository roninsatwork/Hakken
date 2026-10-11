import { seen, toPage, type Seen, type SeenPhrase, type SeenStep } from "../hakkenSees";

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
 * Shares go as whole percentages; days as the dates' length (`c`).
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

/** "That is 21% fewer clicks than the 30 days before", when the change is worth saying. */
function clicksChange(now: number, before: number | null, days: number): Maybe<SeenPhrase> {
  const change = changeOf(now, before);
  if (change === null || Math.abs(change) < WORTH_SAYING) return null;
  return { code: change > 0 ? "clicksUp" : "clicksDown", a: percent(change), c: days };
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
export function keywordsSees(list: ListFigures, days: number): Seen {
  if (list.rows === 0) return seen([{ code: "noKeywords", c: days }]);
  return seen(
    [
      { code: "shown", a: list.rows, b: list.clicks, c: days },
      clicksChange(list.clicks, list.previousClicks, days),
      { code: "topThree", a: list.bands["1-3"] ?? 0 },
    ],
    [checkGoogle(list.clicks, list.previousClicks), pushNear(list.bands)],
  );
}

/** Pages. */
export function pagesSees(list: ListFigures, days: number): Seen {
  if (list.rows === 0) return seen([{ code: "noPages", c: days }]);
  return seen(
    [{ code: "shown", a: list.rows, b: list.clicks, c: days }, clicksChange(list.clicks, list.previousClicks, days)],
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
export function movesSees(list: ListFigures, days: number): Seen {
  if (list.gaining === 0 && list.losing === 0) return seen([{ code: "noMoves", c: days }]);
  const net = list.gained - Math.abs(list.lost);
  return seen(
    [
      { code: "gainingLosing", a: list.gaining, b: list.losing, c: days },
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
    [{ code: "pickOne", link: "seePages", to: toPage("pages") }],
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
export function trackedSees(list: ListFigures, days: number, kind: "keywords" | "pages"): Seen {
  if (list.rows === 0) return seen([{ code: `none${kind === "keywords" ? "Keywords" : "Pages"}` }], [{ code: `track${kind === "keywords" ? "Keywords" : "Pages"}`, link: kind === "keywords" ? "seeKeywords" : "seePages", to: toPage(kind) }]);
  return seen(
    [{ code: kind === "keywords" ? "trackedKeywords" : "trackedPages", a: list.rows, b: list.clicks, c: days }, clicksChange(list.clicks, list.previousClicks, days)],
    [checkGoogle(list.clicks, list.previousClicks)],
  );
}

/** Performance: the website's totals against the days before. */
export function performanceSees(totals: { clicks: number; impressions: number; position: number } | null, previous: { clicks: number; position: number } | null, days: number): Seen {
  if (!totals) return seen([{ code: "nothingShown", c: days }]);
  const fell = changeOf(totals.clicks, previous ? previous.clicks : null);
  return seen(
    [
      { code: "performance", a: totals.impressions, b: totals.clicks, c: days },
      clicksChange(totals.clicks, previous ? previous.clicks : null, days),
      { code: "position", a: Math.round(totals.position * 10) / 10 },
    ],
    [fell !== null && fell <= -WORTH_SAYING
      ? { code: "checkGoogle", link: "seeVolatility", to: toPage("volatility") }
      : { code: "seeWins", link: "seeWins", to: toPage("wins-and-losses") }],
  );
}

/** New and lost. */
export function newLostSees(counts: { newKeywords: number; lostKeywords: number; newPages: number; lostPages: number }, days: number): Seen {
  return seen(
    [
      { code: "keywordsNewLost", a: counts.newKeywords, b: counts.lostKeywords, c: days },
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
  days: number,
): Seen {
  if (!totals) return seen([{ code: "notShown", text: name, c: days }]);
  const moved = previous ? Math.round((previous.position - totals.position) * 10) / 10 : 0;
  return seen([
    { code: "recordFigures", text: name, a: Math.round(totals.position * 10) / 10, b: totals.clicks, c: days },
    clicksChange(totals.clicks, previous ? previous.clicks : null, days),
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
