import type { FindingFact } from "../findings";
import { measureWords } from "../measures";
import { pageNameOf } from "../../bingWebmasterSeen";
import { isNumber, isRow, moved, named, partOf, round1, rowsOf, type OwnFound, type Row } from "./shared";

/**
 * Bing Webmaster's pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7; Anthony,
 * 2026-11-03: "every page we touch needs its own finding"). Each page compares Bing with something: the span before,
 * Google for the same days or the same keyword, or the whole website. They pick the biggest things for whatever dates
 * are chosen; the bars below only keep out what is too small to trust, as Bing's figures are a few per cent of Google's.
 *
 * Written on 3–4 November 2026 with no website connected to Bing, so held to figures written by hand in the shape of
 * every Bing read's answer (`bingPageFindings.test.ts`), not yet to a real website's. Search Console's rules are the
 * same idea for Google, kept apart on purpose (`own/searchConsole.ts`): each section is built on its own.
 *
 * A place compared with another (Bing's against Google's, or the span before's) is "above" when it is the better place,
 * a lower number: the panel's arrow and colour then read right, as a place has no `lessIsBetter` of its own.
 */

/** Clicks too few to say a move of: fewer than this in both spans. */
const CLICKS_LEAST = 10;
/** Times shown too few to say a move or a click rate of. */
const SHOWN_LEAST = 100;
/** A click rate from fewer times shown than this is never set against another (BW14 greys under 10; a rate needs more). */
const RATE_SHOWN_LEAST = 200;
/**
 * A click rate this far from its reference, as a share of it, before it is said: a tenth, so a rate that held is never
 * called a gap ("0.9% against 0.9%"); past it, the rules rank by size and say the biggest.
 */
const RATE_APART = 0.1;
/** Two rates that read the same once rounded are no gap, whatever their share. */
const sameRead = (value: number, mean: number) => round1(value) === round1(mean);
/** A page's share of its clicks from Bing this many times the website's, or under its share by as much. */
const SHARE_FAR = 2;
/** Clicks from Bing and Google together too few for Bing's share of them to be trusted. */
const SHARE_CLICKS_LEAST = 50;
/** Bing's clicks on a list too few to split by kind of page: a week of a small shop's pages has a few dozen. */
const KIND_CLICKS_LEAST = 20;
/** A move too small to say, as a share of the span before: twice it for a kind of page or a record's times shown, four times for errors. */
const MOVE_LEAST = 0.05;
/** A row's move under this many clicks is no news: Bing's lists are small. */
const ROW_MOVE_LEAST = 5;
/** Places apart, or moved, before a keyword's or a page's place is said. */
const PLACES_LEAST = 3;
const RECORD_PLACES_LEAST = 0.5;
/** A record's figures: times shown before a place or a rate is trusted, clicks before a move is said. */
const RECORD_SHOWN_LEAST = 20;
const RECORD_CLICKS_LEAST = 5;

type Names = (key: string, fallback: string) => string;

/** The reader's words the page hands under `names`, else the English the screen would say. */
function namesOf(data: Row): Names {
  const names = isRow(data.names) ? data.names : {};
  return (key, fallback) => (typeof names[key] === "string" && (names[key] as string).trim() ? (names[key] as string).trim() : fallback);
}

const num = (value: unknown): number | null => (isNumber(value) ? value : null);
const rateOf = (clicks: number | null, shown: number | null) => (clicks !== null && shown !== null && shown > 0 ? (100 * clicks) / shown : null);

/** Two figures set side by side: a rate, a share, a count or a place, against another (`against: "other"`) or the website's. */
function apart(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string | null, better: boolean | null = null): OwnFound {
  // A place is above where it is better, a lower number; any other figure where it is the larger.
  const above = better ?? value > mean;
  const kind = above ? "rowAbove" : "rowBelow";
  const unit: FindingFact["unit"] = measure === "position" ? "score" : /Percent$/.test(measure) ? "percent" : "count";
  const words = measureWords(measure);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, value: round1(value), mean: round1(mean), against: other === null ? "website" : "other", ...(other !== null ? { other } : {}) },
    facts: [
      { key: "value", value: round1(value), unit, label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit, label: `${other ?? "the whole website"}: ${words}` },
    ],
  };
}

/** A share of a whole against its share the span before: "Bing: 5.3% of the clicks from Bing and Google, from 6.1%". */
function shareMoved(list: string, name: string, measure: string, share: number, shareBefore: number, score: number): OwnFound {
  const words = measureWords(measure);
  return {
    id: `shareMoved:${list}:${measure}:${name}`, kind: "shareMoved", list, score,
    params: { name, measure, share: round1(share), shareBefore: round1(shareBefore) },
    facts: [
      { key: "share", value: round1(share), unit: "percent", label: `${name}'s share of all the ${words}, this span` },
      { key: "shareBefore", value: round1(shareBefore), unit: "percent", label: `${name}'s share of all the ${words}, the span before` },
    ],
  };
}

/** The biggest rise or fall on a whole list, said with both spans' clicks. */
function rowMoved(list: string, row: Row, score: number, words: (name: string) => string = (name) => name): OwnFound | null {
  const name = named(row) ? words(named(row)!) : null;
  const now = num(row.clicks);
  const before = num(row.clicksBefore);
  if (!name || now === null || before === null || Math.abs(now - before) < ROW_MOVE_LEAST) return null;
  const kind = now > before ? "rowUp" : "rowDown";
  return {
    id: `${kind}:${list}:clicks:${name}`, kind, list, score,
    params: { name, measure: "clicks", now, before },
    facts: [
      { key: "now", value: now, unit: "count", label: `${name}: clicks, this span` },
      { key: "before", value: before, unit: "count", label: `${name}: clicks, the span before` },
    ],
  };
}

/** Rows new and lost against the span before: "Keywords that brought clicks: 40 new, 25 lost". */
function newLost(list: string, measure: string, gained: number, lost: number, score: number): OwnFound {
  return {
    id: `newLost:${list}:${measure}`, kind: "newLost", list, score,
    params: { measure, gained, lost },
    facts: [
      { key: "gained", value: gained, unit: "count", label: `${measureWords(measure)}: new this span` },
      { key: "lost", value: lost, unit: "count", label: `${measureWords(measure)}: lost since the span before` },
    ],
  };
}

const changeOf = (now: number, before: number) => (now - before) / before;

/** A page as the eye names it (`pageNameOf`): its path, the home page in the reader's words. */
const pageWords = (name: string, names: Names) => (name === "/" ? names("home", "The home page") : name);

// ---------------------------------------------------------------------------
// The figures every page with Bing's totals shares: Performance, Keywords, Pages, Bing against Google
// ---------------------------------------------------------------------------

type Totals = { clicks: number; impressions: number };
const totalsOf = (value: unknown): Totals | null => (isRow(value) && isNumber(value.clicks) && isNumber(value.impressions) ? { clicks: value.clicks, impressions: value.impressions } : null);

/** A Bing totals answer (`bingPerformance`): this span's, Google's, and the span before's of each. */
function spansOf(figures: Row) {
  const before = isRow(figures.before) ? figures.before : null;
  return { bing: totalsOf(figures.totals), google: totalsOf(figures.google), bingBefore: before ? totalsOf(before.totals) : null, googleBefore: before ? totalsOf(before.google) : null };
}

/**
 * Bing's clicks against the span before, Google's move beside it ("Bing: clicks down 12%, to 340 from 386. Google: up
 * 3%"): every page's headline where the boxes are Bing's totals, past a span with too few clicks to trust.
 */
function clicksHeadline(figures: Row, names: Names, score = 1.6): OwnFound | null {
  const { bing, google, bingBefore, googleBefore } = spansOf(figures);
  if (!bing || !bingBefore || bingBefore.clicks <= 0 || Math.max(bing.clicks, bingBefore.clicks) < CLICKS_LEAST) return null;
  const other = google && googleBefore && googleBefore.clicks > 0 ? { name: names("google", "Google"), change: changeOf(google.clicks, googleBefore.clicks) } : undefined;
  return moved("whole", names("bing", "Bing"), "clicks", bing.clicks, bingBefore.clicks, score, other);
}

/** Bing's times shown against the span before, Google's beside: is the website shown more, or clicked more? */
function shownMoved(figures: Row, names: Names): OwnFound | null {
  const { bing, google, bingBefore, googleBefore } = spansOf(figures);
  if (!bing || !bingBefore || bingBefore.impressions <= 0 || Math.max(bing.impressions, bingBefore.impressions) < SHOWN_LEAST) return null;
  const change = changeOf(bing.impressions, bingBefore.impressions);
  // Weighed against the clicks' move: shown more but clicked less is the story; shown as much as clicked is less of one.
  const clicks = bingBefore.clicks > 0 ? changeOf(bing.clicks, bingBefore.clicks) : 0;
  const other = google && googleBefore && googleBefore.impressions > 0 ? { name: names("google", "Google"), change: changeOf(google.impressions, googleBefore.impressions) } : undefined;
  return moved("shown", names("bing", "Bing"), "impressions", bing.impressions, bingBefore.impressions, 0.7 + Math.min(0.6, Math.abs(change) + Math.abs(change - clicks)), other);
}

/** Bing's click rate against Google's for the same days: people who see you on Bing clicking more, or less. */
function rateAgainstGoogle(figures: Row, names: Names): OwnFound | null {
  const { bing, google } = spansOf(figures);
  if (!bing || !google || bing.impressions < RATE_SHOWN_LEAST || google.impressions < RATE_SHOWN_LEAST) return null;
  const value = rateOf(bing.clicks, bing.impressions)!;
  const mean = rateOf(google.clicks, google.impressions)!;
  if (mean <= 0 || Math.abs(value - mean) / mean < RATE_APART || sameRead(value, mean)) return null;
  return apart("rate", names("bing", "Bing"), "ctrPercent", value, mean, 0.8 + Math.min(0.6, Math.abs(Math.log(value / Math.max(0.01, mean))) / 2), names("google", "Google"));
}

/** Bing's click rate against its own the span before: shown as often, clicked less often. */
function rateAgainstBefore(figures: Row, names: Names): OwnFound | null {
  const { bing, bingBefore } = spansOf(figures);
  if (!bing || !bingBefore || bing.impressions < RATE_SHOWN_LEAST || bingBefore.impressions < RATE_SHOWN_LEAST) return null;
  const value = rateOf(bing.clicks, bing.impressions)!;
  const mean = rateOf(bingBefore.clicks, bingBefore.impressions)!;
  if (mean <= 0 || Math.abs(value - mean) / mean < RATE_APART || sameRead(value, mean)) return null;
  return apart("rateBefore", names("bing", "Bing"), "ctrPercent", value, mean, 0.5 + Math.min(0.5, Math.abs(Math.log(value / Math.max(0.01, mean))) / 2), names("before", "The period before"));
}

/** Bing's share of the website's clicks from Bing and Google, against its share the span before; else this span's alone. */
function shareOfSearch(figures: Row, names: Names, headline = false): OwnFound | null {
  const { bing, google, bingBefore, googleBefore } = spansOf(figures);
  if (!bing || !google || bing.clicks + google.clicks < SHARE_CLICKS_LEAST) return null;
  const share = (100 * bing.clicks) / (bing.clicks + google.clicks);
  if (bingBefore && googleBefore && bingBefore.clicks + googleBefore.clicks >= SHARE_CLICKS_LEAST) {
    const before = (100 * bingBefore.clicks) / (bingBefore.clicks + googleBefore.clicks);
    const points = Math.abs(share - before);
    return shareMoved("share", names("bing", "Bing"), "searchClicks", share, before, headline ? 1.6 : 0.7 + Math.min(0.7, points / 3));
  }
  // No span before to set it against: where the page is about the share, its share alone is the headline.
  return headline ? partOf("share", names("bing", "Bing"), "searchClicks", bing.clicks, bing.clicks + google.clicks, 1.5) : null;
}

/**
 * The newest whole week's share of the clicks from Bing and Google against the whole period's (the share chart's last
 * full bar): where the period ends going one way, as the plan's example has it, "Bing's share fell three weeks running".
 * A week the period cuts short (its Monday less than six days before the period's end) gives way to the one before.
 */
function newestWeek(figures: Row, names: Names): OwnFound | null {
  const to = typeof figures.to === "string" ? figures.to : null;
  const whole = (week: string) => to !== null && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`) >= 6 * 86_400_000;
  const weeks = rowsOf(figures.weeks).filter((week) => isNumber(week.bing) && isNumber(week.google) && typeof week.week === "string");
  const { bing, google } = spansOf(figures);
  if (weeks.length < 3 || !bing || !google || bing.clicks + google.clicks < SHARE_CLICKS_LEAST) return null;
  const last = [...weeks].filter((week) => whole(week.week as string)).sort((left, right) => String(left.week).localeCompare(String(right.week))).at(-1);
  if (!last) return null;
  const lastClicks = (last.bing as number) + (last.google as number);
  if (lastClicks < SHARE_CLICKS_LEAST) return null;
  const value = (100 * (last.bing as number)) / lastClicks;
  const mean = (100 * bing.clicks) / (bing.clicks + google.clicks);
  if (mean <= 0 || Math.abs(value - mean) / mean < RATE_APART || sameRead(value, mean)) return null;
  const name = named(last) ?? names("newestWeek", "The newest week");
  return apart("weeks", name, "bingSharePercent", value, mean, 0.6 + Math.min(0.6, Math.abs(value - mean) / mean), names("period", "The whole period"));
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

/** Performance: Bing's clicks against the span before, what moved with them, and Bing against Google. */
function performanceFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  return [clicksHeadline(data, names), shownMoved(data, names), rateAgainstGoogle(data, names), shareOfSearch(data, names), rateAgainstBefore(data, names), newestWeek(data, names)]
    .filter((one): one is OwnFound => one !== null);
}

// ---------------------------------------------------------------------------
// The lists: Keywords, Pages and Bing against Google, each read whole for the eye (`bingListSeen`, as `wholeList`)
// ---------------------------------------------------------------------------

/** A keyword or page one engine ranks well above the other: "door handles: place 2. Google: 14". */
function placeAgainstGoogle(list: string, row: unknown, names: Names, bingBetter: boolean, score: number): OwnFound | null {
  if (!isRow(row)) return null;
  const name = named(row);
  const bing = num(row.position);
  const google = num(row.googlePosition);
  if (!name || bing === null || google === null || Math.abs(google - bing) < PLACES_LEAST || (google < bing) === bingBetter) return null;
  return apart(list, name, "position", bing, google, score, names("google", "Google"), bing < google);
}

/** The biggest rise and fall over the whole list, the biggest first. */
function moversOf(whole: Row, list: string, words?: (name: string) => string): OwnFound[] {
  const total = isRow(whole.before) && isNumber(whole.before.clicks) ? Math.max(1, whole.before.clicks) : 1;
  return [rowsOf(whole.up)[0], rowsOf(whole.down)[0]].flatMap((row) => {
    if (!row || !isNumber(row.clicks) || !isNumber(row.clicksBefore)) return [];
    const one = rowMoved(list, row, 0.7 + Math.min(0.7, (5 * Math.abs(row.clicks - row.clicksBefore)) / total), words);
    return one ? [one] : [];
  });
}

/** Rows that brought clicks this span and none before, against those that stopped: churn a total hides. */
function churnOf(whole: Row, list: string, measure: string): OwnFound | null {
  const counts = isRow(whole.newLost) ? whole.newLost : null;
  if (!counts || !isNumber(counts.gained) || !isNumber(counts.lost) || counts.gained + counts.lost < 3) return null;
  const clicks = isRow(whole.totals) && isNumber(whole.totals.clicks) ? Math.max(1, whole.totals.clicks) : 1;
  const moving = (num(counts.gainedClicks) ?? 0) + (num(counts.lostClicks) ?? 0);
  return newLost(list, measure, counts.gained, counts.lost, 0.6 + Math.min(0.6, moving / clicks));
}

function keywordsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const figures = isRow(data.figures) ? data.figures : {};
  const whole = isRow(data.wholeList) ? data.wholeList : {};
  const found = [clicksHeadline(figures, names), ...moversOf(whole, "keywords"), churnOf(whole, "keywords", "searchesWithClicks")];
  // A keyword Bing ranks well above Google that brings Bing's clicks, and one Google ranks well above Bing.
  const clicks = isRow(whole.totals) && isNumber(whole.totals.clicks) ? Math.max(1, whole.totals.clicks) : 1;
  const ahead = isRow(whole.bingAhead) ? whole.bingAhead : null;
  found.push(placeAgainstGoogle("bingAhead", ahead, names, true, 0.7 + Math.min(0.6, (5 * (num(ahead?.clicks) ?? 0)) / clicks)));
  const behind = isRow(whole.googleAhead) ? whole.googleAhead : null;
  found.push(placeAgainstGoogle("googleAhead", behind, names, false, 0.7 + Math.min(0.5, (num(behind?.googleClicks) ?? 0) / Math.max(1, clicks * 5))));
  // The first three places: how often each engine's are clicked, for the same keywords.
  const top = rowsOf(whole.bands).find((band) => band.band === "top3");
  if (top && isNumber(top.impressions) && isNumber(top.googleImpressions) && top.impressions >= RATE_SHOWN_LEAST && top.googleImpressions >= RATE_SHOWN_LEAST) {
    const value = rateOf(num(top.clicks), top.impressions)!;
    const mean = rateOf(num(top.googleClicks), top.googleImpressions)!;
    if (mean > 0 && Math.abs(value - mean) / mean >= RATE_APART && !sameRead(value, mean)) found.push(apart("bands", names("topThree", "Keywords in places 1 to 3"), "ctrPercent", value, mean, 0.7 + Math.min(0.5, Math.abs(Math.log(value / Math.max(0.01, mean))) / 2), names("google", "Google")));
  }
  return found.filter((one): one is OwnFound => one !== null);
}

function pagesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const figures = isRow(data.figures) ? data.figures : {};
  const whole = isRow(data.wholeList) ? data.wholeList : {};
  const found = [clicksHeadline(figures, names), ...moversOf(whole, "pages", (name) => pageWords(name, names)), churnOf(whole, "pages", "pagesWithClicks")];
  // A page whose share of its search clicks from Bing is far from the website's: Bing sends it far more, or far less.
  // The website's is the page's own box, Bing's share of the clicks from Bing and Google, so the two figures agree.
  const { bing, google } = spansOf(figures);
  const both = isRow(whole.both) ? whole.both : null;
  const site = bing && google && bing.clicks + google.clicks > 0
    ? (100 * bing.clicks) / (bing.clicks + google.clicks)
    : both && isNumber(both.clicks) && isNumber(both.googleClicks) && both.clicks + both.googleClicks > 0 ? (100 * both.clicks) / (both.clicks + both.googleClicks) : null;
  for (const [field, list] of [["shareHigh", "shareHigh"], ["shareLow", "shareLow"]] as const) {
    const row = isRow(whole[field]) ? (whole[field] as Row) : null;
    const name = row && named(row) ? pageWords(named(row)!, names) : null;
    if (!row || !name || site === null || site <= 0 || !isNumber(row.clicks) || !isNumber(row.googleClicks) || row.clicks + row.googleClicks <= 0) continue;
    const value = (100 * row.clicks) / (row.clicks + row.googleClicks);
    // Far from the website's share as its box shows it, either way: the read picks by its list's own share.
    if (value < site * SHARE_FAR && value > site / SHARE_FAR) continue;
    found.push(apart(list, name, "bingSharePercent", value, site, 0.7 + Math.min(0.6, Math.abs(Math.log(Math.max(0.1, value) / site)) / 3), null));
  }
  // Kinds of page: the one whose share of Bing's clicks is furthest from its share of Google's, and the one that moved most.
  const kinds = rowsOf(whole.kinds).filter((kind) => kind.sorted !== false && named(kind) && isNumber(kind.clicks) && isNumber(kind.googleClicks));
  const bingAll = kinds.reduce((sum, kind) => sum + (kind.clicks as number), 0);
  const googleAll = kinds.reduce((sum, kind) => sum + (kind.googleClicks as number), 0);
  if (kinds.length >= 2 && bingAll >= KIND_CLICKS_LEAST && googleAll >= SHARE_CLICKS_LEAST) {
    const furthest = kinds
      .map((kind) => ({ kind, bing: (100 * (kind.clicks as number)) / bingAll, google: (100 * (kind.googleClicks as number)) / googleAll }))
      .filter((one) => Math.max(one.bing, one.google) >= 5 && Math.abs(one.bing - one.google) >= 5)
      .sort((left, right) => Math.abs(right.bing - right.google) - Math.abs(left.bing - left.google))[0];
    if (furthest) found.push(apart("kinds", named(furthest.kind)!, "clicksSharePercent", furthest.bing, furthest.google, 0.8 + Math.min(0.6, Math.abs(furthest.bing - furthest.google) / 30), names("google", "Google")));
    const mover = kinds
      .filter((kind) => isNumber(kind.clicksBefore) && (kind.clicksBefore as number) > 0 && Math.max(kind.clicks as number, kind.clicksBefore as number) >= CLICKS_LEAST)
      .map((kind) => ({ kind, change: changeOf(kind.clicks as number, kind.clicksBefore as number) }))
      .filter((one) => Math.abs(one.change) >= MOVE_LEAST * 2)
      .sort((left, right) => Math.abs((right.kind.clicks as number) - (right.kind.clicksBefore as number)) - Math.abs((left.kind.clicks as number) - (left.kind.clicksBefore as number)))[0];
    if (mover) found.push(moved("kindMoved", named(mover.kind)!, "clicks", mover.kind.clicks as number, mover.kind.clicksBefore as number, 0.7 + Math.min(0.5, Math.abs(mover.change))));
  }
  return found.filter((one): one is OwnFound => one !== null);
}

function versusFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const figures = isRow(data.figures) ? data.figures : {};
  const whole = isRow(data.wholeList) ? data.wholeList : {};
  // The page's headline is its emphasis box: Bing's share of the website's clicks from search, against the span before.
  const found = [shareOfSearch(figures, names, true), newestWeek(figures, names)];
  // Who ranks the website higher on the keywords both show: the engine ahead on more of them, of all those on both.
  const who = isRow(whole.who) ? whole.who : null;
  if (who && isNumber(who.bingHigher) && isNumber(who.googleHigher) && isNumber(who.same)) {
    const onBoth = who.bingHigher + who.googleHigher + who.same;
    const [count, name] = who.googleHigher >= who.bingHigher ? [who.googleHigher, names("googleHigher", "Keywords Google ranks higher")] : [who.bingHigher, names("bingHigher", "Keywords Bing ranks higher")];
    if (onBoth >= 20 && count / onBoth >= 0.4) found.push(partOf("who", name, "searchesOnBoth", count, onBoth, 0.8 + Math.min(0.5, count / onBoth - 0.4)));
  }
  // The widest gaps, each where it matters: Bing ranks you well above Google on a keyword Google shows a lot, and the
  // other way round on one Google brings clicks for.
  const ahead = isRow(whole.bingAhead) ? whole.bingAhead : null;
  found.push(placeAgainstGoogle("bingAhead", ahead, names, true, 0.9 + Math.min(0.4, (num(ahead?.googleImpressions) ?? 0) / 5000)));
  const behind = isRow(whole.googleAhead) ? whole.googleAhead : null;
  found.push(placeAgainstGoogle("googleAhead", behind, names, false, 0.9 + Math.min(0.4, (num(behind?.googleClicks) ?? 0) / 200)));
  // The clicks from keywords only Bing shows you for, added up: what Google doesn't bring at all.
  const clicks = isRow(whole.totals) && isNumber(whole.totals.clicks) ? whole.totals.clicks : 0;
  if (who && isNumber(who.onlyBingClicks) && clicks > 0 && who.onlyBingClicks >= ROW_MOVE_LEAST && who.onlyBingClicks / clicks >= 0.05) {
    found.push(partOf("onlyBing", names("onlyBing", "Keywords only on Bing"), "clicks", who.onlyBingClicks, clicks, 0.7 + Math.min(0.5, who.onlyBingClicks / clicks)));
  }
  return found.filter((one): one is OwnFound => one !== null);
}

// ---------------------------------------------------------------------------
// Crawling and indexing
// ---------------------------------------------------------------------------

/** A money page's figures as the page hands them, by its name (`moneyPages`: every money page, never cut to a page). */
type MoneyPage = { inIndex: boolean | null; lastRead: string | null; googleIndexed: boolean | null; googleLastRead: string | null };
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** A day this many times the average day's errors, with this many, is a day that went wrong. */
const ERROR_DAY_TIMES = 3;
const ERROR_DAY_LEAST = 10;
/** A money page Bing last read this many days ago, this many days longer ago than Google did. */
const STALE_DAYS = 30;
const STALE_GAP = 14;

function crawlingFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const found: Array<OwnFound | null> = [];
  const totals = isRow(data.totals) ? data.totals : null;
  const before = isRow(data.before) ? data.before : null;
  const thenTotals = before && isRow(before.totals) ? before.totals : null;
  const bing = names("bing", "Bing");

  // The headline: the pages Bing read against the span before.
  if (totals && thenTotals && isNumber(totals.crawled) && isNumber(thenTotals.crawled) && thenTotals.crawled > 0 && Math.max(totals.crawled, thenTotals.crawled) >= SHOWN_LEAST) {
    found.push(moved("crawled", bing, "crawled", totals.crawled, thenTotals.crawled, 1.6));
  }
  // Its errors against the span before, where there are enough to count.
  if (totals && thenTotals && isNumber(totals.errors) && isNumber(thenTotals.errors) && Math.max(totals.errors, thenTotals.errors) >= 5) {
    if (thenTotals.errors > 0) {
      const change = changeOf(totals.errors, thenTotals.errors);
      if (Math.abs(change) >= MOVE_LEAST * 4) found.push(moved("errors", bing, "errors", totals.errors, thenTotals.errors, 0.8 + Math.min(0.6, Math.abs(change) / 3)));
    }
  }
  // Pages blocked by robots.txt jumping: a change to the file can shut Bing out of a whole section.
  if (totals && thenTotals && isNumber(totals.blocked) && isNumber(thenTotals.blocked) && thenTotals.blocked > 0 && totals.blocked >= 20) {
    const change = changeOf(totals.blocked, thenTotals.blocked);
    if (change >= 0.5) found.push(moved("blocked", bing, "robotsBlocked", totals.blocked, thenTotals.blocked, 0.6 + Math.min(0.5, change / 4)));
  }
  // The pages in Bing's index on the span's last day against the span before's last day.
  const days = rowsOf(data.days).filter((day) => isDay(day.day) && isNumber(day.inIndex)).sort((left, right) => String(left.day).localeCompare(String(right.day)));
  const last = days.at(-1);
  if (last && before && isNumber(before.inIndex) && before.inIndex > 0) {
    const change = changeOf(last.inIndex as number, before.inIndex);
    if (Math.abs(change) >= 0.01) found.push(moved("index", bing, "inIndex", last.inIndex as number, before.inIndex, 0.8 + Math.min(0.7, Math.abs(change) * 5)));
  }
  // The day errors bunched on, against an average day of the span: often the day a change went live.
  const errorDays = rowsOf(data.days).filter((day) => isDay(day.day) && isNumber(day.errors));
  if (errorDays.length >= 7) {
    const mean = errorDays.reduce((sum, day) => sum + (day.errors as number), 0) / errorDays.length;
    const worst = [...errorDays].sort((left, right) => (right.errors as number) - (left.errors as number) || String(left.day).localeCompare(String(right.day)))[0];
    const errors = worst.errors as number;
    if (errors >= ERROR_DAY_LEAST && errors >= ERROR_DAY_TIMES * Math.max(0.5, mean)) {
      found.push(apart("errorDay", named(worst) ?? String(worst.day), "errors", errors, mean, 0.8 + Math.min(0.5, errors / Math.max(1, mean) / 20), names("averageDay", "An average day")));
    }
  }

  // The money pages, every one of them.
  const money = isRow(data.moneyPages) ? Object.entries(data.moneyPages as Row).filter((entry): entry is [string, Row] => isRow(entry[1])).map(([name, page]) => [pageWords(name, names), page] as [string, Row]) : [];
  const asked = money.filter(([, page]) => typeof page.inIndex === "boolean");
  const missing = asked.filter(([, page]) => page.inIndex === false && page.googleIndexed === true);
  if (asked.length >= 3 && missing.length > 0) {
    found.push(partOf("money", names("inGoogleNotBing", "Money pages in Google's index but not Bing's"), "moneyPages", missing.length, asked.length, 1.0 + Math.min(0.5, missing.length / asked.length)));
  }
  // The money page Bing has left longest unread, against the day Google last read it. The pages are asked of both each
  // week, whatever the dates chosen: counted to the day they were last asked (`checkedAt`), else the newest day either
  // engine read one, never the period's end, so a past week never reads "Google: 0 days".
  const read = money.flatMap(([, page]) => [page.lastRead, page.googleLastRead]).filter(isDay).sort();
  const checked = isNumber(data.checkedAt) ? new Date(data.checkedAt).toISOString().slice(0, 10) : null;
  const to = checked ?? read.at(-1) ?? (isDay(data.to) ? data.to : null);
  if (to) {
    const stale = money
      .map(([name, page]) => ({ name, page: page as unknown as MoneyPage }))
      .filter((one) => isDay(one.page.lastRead) && isDay(one.page.googleLastRead))
      .map((one) => ({ ...one, bingDays: daysBetween(one.page.lastRead!, to), googleDays: Math.max(0, daysBetween(one.page.googleLastRead!, to)) }))
      .filter((one) => one.bingDays >= STALE_DAYS && one.bingDays - one.googleDays >= STALE_GAP)
      .sort((left, right) => right.bingDays - right.googleDays - (left.bingDays - left.googleDays) || left.name.localeCompare(right.name))[0];
    // Days since a read are fewer the better (`lessIsBetter`): above Google's, and the panel colours it as bad news.
    if (stale) found.push(apart("stale", stale.name, "daysSinceRead", stale.bingDays, stale.googleDays, 0.8 + Math.min(0.5, (stale.bingDays - stale.googleDays) / 120), names("google", "Google")));
  }
  return found.filter((one): one is OwnFound => one !== null);
}

// ---------------------------------------------------------------------------
// A keyword's and a page's own screens
// ---------------------------------------------------------------------------

/** A record's figures (`bingRecord`): its span's, beside Google's, and its own the span before. */
function recordOf(data: Row) {
  const record = isRow(data.record) ? data.record : {};
  const figures = isRow(record.figures) ? record.figures : null;
  const before = isRow(record.before) ? record.before : null;
  return { name: typeof record.key === "string" ? record.key : null, title: typeof record.title === "string" ? record.title : null, figures, before };
}

/** The weeks a record's chart is read in at its end: the newest so many, against as many before them. */
const RECENT_WEEKS = 6;

/**
 * The record's chart, its newest six weeks against the six before them (the plan's example: "Bing position from 2.0 to
 * 5.8 over six weeks"): the same whatever the dates, as the chart always draws its last six months. Its place, weighed by
 * the times shown each week, and its clicks.
 */
function recentWeeks(data: Row, name: string, names: Names): OwnFound[] {
  const record = isRow(data.record) ? data.record : {};
  const weeks = rowsOf(record.weeks).filter((week) => typeof week.week === "string" && isNumber(week.clicks) && isNumber(week.impressions)).sort((left, right) => String(left.week).localeCompare(String(right.week)));
  if (weeks.length < RECENT_WEEKS * 2) return [];
  const sum = (rows: Row[]) => {
    const shown = rows.reduce((total, week) => total + (week.impressions as number), 0);
    const placed = rows.filter((week) => isNumber(week.position));
    const placedShown = placed.reduce((total, week) => total + (week.impressions as number), 0);
    return { clicks: rows.reduce((total, week) => total + (week.clicks as number), 0), shown, place: placedShown > 0 ? placed.reduce((total, week) => total + (week.position as number) * (week.impressions as number), 0) / placedShown : null };
  };
  const now = sum(weeks.slice(-RECENT_WEEKS));
  const then = sum(weeks.slice(-RECENT_WEEKS * 2, -RECENT_WEEKS));
  const recent = `${name}, ${names("lastSixWeeks", "the last 6 weeks")}`;
  const before = names("sixWeeksBefore", "The 6 weeks before");
  const found: OwnFound[] = [];
  if (now.place !== null && then.place !== null && now.shown >= RECORD_SHOWN_LEAST && then.shown >= RECORD_SHOWN_LEAST && Math.abs(now.place - then.place) >= RECORD_PLACES_LEAST) {
    found.push(apart("recentPlace", recent, "position", now.place, then.place, 0.8 + Math.min(0.6, Math.abs(now.place - then.place) / 10), before, now.place < then.place));
  }
  if (then.clicks > 0 && Math.max(now.clicks, then.clicks) >= RECORD_CLICKS_LEAST) {
    found.push(apart("recentClicks", recent, "clicks", now.clicks, then.clicks, 0.5 + Math.min(0.6, Math.abs(changeOf(now.clicks, then.clicks)) / 2), before));
  }
  return found;
}

/** Its place on Bing against Google's for the same keyword or page: the screen's first box beside its detail. */
function recordPlace(figures: Row, name: string, names: Names, score: number): OwnFound | null {
  const bing = num(figures.position);
  const google = num(figures.googlePosition);
  if (bing === null || google === null || (num(figures.impressions) ?? 0) < RECORD_SHOWN_LEAST || (num(figures.googleImpressions) ?? 0) < RECORD_SHOWN_LEAST) return null;
  if (Math.abs(google - bing) < RECORD_PLACES_LEAST) return null;
  return apart("place", name, "position", bing, google, score + Math.min(0.3, Math.abs(google - bing) / 30), names("google", "Google"), bing < google);
}

/** The figures every record shares: its clicks, times shown and place against the span before, its click rate against Google's. */
function recordCommon(data: Row, names: Names, kind: "keyword" | "page"): OwnFound[] {
  const { name: key, title, figures, before } = recordOf(data);
  if (!key || !figures) return [];
  const name = kind === "page" ? pageWords(pageNameOf(key, title), names) : key;
  const found: Array<OwnFound | null> = [];
  const clicks = num(figures.clicks);
  const shown = num(figures.impressions);
  // A keyword's headline is its place on Bing against Google's; a page's, its clicks against the span before — or,
  // where no whole span before is held (Last 12 months), against Google's clicks to it in the same days.
  found.push(recordPlace(figures, name, names, kind === "keyword" ? 1.6 : 1.1));
  const clicksBefore = before && clicks !== null && isNumber(before.clicks) && Math.max(clicks, before.clicks) >= RECORD_CLICKS_LEAST && before.clicks > 0;
  if (clicksBefore) {
    found.push(moved("clicks", name, "clicks", clicks!, before!.clicks as number, kind === "page" ? 1.6 : 0.8 + Math.min(0.6, Math.abs(changeOf(clicks!, before!.clicks as number)))));
  } else if (kind === "page" && clicks !== null && isNumber(figures.googleClicks) && Math.max(clicks, figures.googleClicks) >= RECORD_CLICKS_LEAST) {
    found.push(apart("clicksGoogle", name, "clicks", clicks, figures.googleClicks, 1.6, names("google", "Google")));
  }
  if (before && shown !== null && isNumber(before.impressions) && before.impressions > 0 && Math.max(shown, before.impressions) >= SHOWN_LEAST) {
    const change = changeOf(shown, before.impressions);
    if (Math.abs(change) >= MOVE_LEAST * 2) found.push(moved("shown", name, "impressions", shown, before.impressions, 0.6 + Math.min(0.6, Math.abs(change))));
  }
  const place = num(figures.position);
  if (before && place !== null && isNumber(before.position) && (shown ?? 0) >= RECORD_SHOWN_LEAST && (num(before.impressions) ?? 0) >= RECORD_SHOWN_LEAST && Math.abs(place - before.position) >= RECORD_PLACES_LEAST) {
    found.push(apart("placeBefore", name, "position", place, before.position, 0.8 + Math.min(0.6, Math.abs(place - before.position) / 10), names("before", "The period before"), place < before.position));
  }
  const rate = rateOf(clicks, shown);
  const googleRate = rateOf(num(figures.googleClicks), num(figures.googleImpressions));
  if (rate !== null && googleRate !== null && googleRate > 0 && (shown ?? 0) >= SHOWN_LEAST / 2 && (num(figures.googleImpressions) ?? 0) >= SHOWN_LEAST / 2 && Math.abs(rate - googleRate) / googleRate >= RATE_APART && !sameRead(rate, googleRate)) {
    found.push(apart("rate", name, "ctrPercent", rate, googleRate, 0.6 + Math.min(0.6, Math.abs(Math.log(Math.max(0.01, rate) / googleRate)) / 2), names("google", "Google")));
  }
  found.push(...recentWeeks(data, name, names));
  return found.filter((one): one is OwnFound => one !== null);
}

/** Of the rows Bing gave the record's screen (a keyword's pages, a page's keywords), the share of their clicks each holds. */
function liveRowsOf(data: Row, kind: "keyword" | "page", names: Names) {
  const rows = rowsOf(data.rows).filter((row) => typeof row.key === "string" && isNumber(row.clicks));
  const clicks = rows.reduce((sum, row) => sum + (row.clicks as number), 0);
  const name = (row: Row) => (kind === "keyword" ? pageWords(pageNameOf(row.key as string, null), names) : (row.key as string));
  return { rows: [...rows].sort((left, right) => (right.clicks as number) - (left.clicks as number)), clicks, name };
}

function keywordFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const found = recordCommon(data, names, "keyword");
  // Two of the website's pages splitting one keyword's clicks on Bing: the second page holding a fifth or more.
  const { rows, clicks, name } = liveRowsOf(data, "keyword", names);
  const second = rows[1];
  if (rows.length >= 2 && clicks >= RECORD_CLICKS_LEAST * 2 && (rows[0].clicks as number) / clicks < 0.8 && (second.clicks as number) / clicks >= 0.2) {
    found.push(partOf("pages", name(second), "clicks", second.clicks as number, clicks, 0.9 + Math.min(0.4, (second.clicks as number) / clicks)));
  }
  return found;
}

function pageFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const found = recordCommon(data, names, "page");
  // One keyword bringing most of the page's clicks on Bing: the page leans on it.
  const { rows, clicks, name } = liveRowsOf(data, "page", names);
  const top = rows[0];
  if (top && rows.length >= 3 && clicks >= RECORD_CLICKS_LEAST * 2 && (top.clicks as number) / clicks >= 0.4) {
    found.push(partOf("keywords", name(top), "clicks", top.clicks as number, clicks, 0.7 + Math.min(0.5, (top.clicks as number) / clicks - 0.4)));
  }
  return found;
}

/** Bing Webmaster's pages with their own rules, by the eye's key for them. Each says only its own: the general rules read a page of a table as the list. */
export const BING_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "bing.performance": { general: false, find: performanceFindings },
  "bing.keywords": { general: false, find: keywordsFindings },
  "bing.pages": { general: false, find: pagesFindings },
  "bing.versus": { general: false, find: versusFindings },
  "bing.crawling": { general: false, find: crawlingFindings },
  "bing.keyword": { general: false, find: keywordFindings },
  "bing.page": { general: false, find: pageFindings },
};
