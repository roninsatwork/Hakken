import type { FindingFact as VsFact } from "../findings";
import { MEASURES as VS_MEASURES } from "../measures";
import * as vsShared from "./shared";
import type { OwnFound, Row } from "./shared";

// ===========================================================================
// Visibility's second half (ask-hakken-every-chart-page-plan-2026-11-03.md, section 10): Google results (Above you,
// Search features, Wins and losses, Your searches), Competitors (Side by side, Market map, A rival), AI answers (AI
// demand, Mentions, Share of voice), Brand radar, Web mentions (All mentions, Against rivals), Reviews (Your reviews,
// Against rivals), the Overview, Paid search and Site audit. Its own block, built beside the first half's (Backlinks,
// Keywords, Keyword research): only these rules, and the keys they are registered under in `VISIBILITY_OWN`, are its.
//
// Visibility's figures come from checks on set days, a month apart for a website and its rivals: a period of the date
// menu holds one check, two or none. So each rule compares what the page shows with the check before the dates (the
// panels' own "before"), with the rivals at the same check, or with the rest of the list, and says nothing where
// neither is held. Every name is the reader's own: the page hands it, in its own words. Never money: what adverts
// would cost, a click's price or what visits would be worth are our data supplier's guesses (decision 4; Anthony,
// 2026-11-03: "Take it off", then "Yes, all of it").
// ===========================================================================

const vsNum = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const vsText = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value.trim() : fallback);
const vsRows = (value: unknown): Row[] => vsShared.rowsOf(value);
const vsPart = (data: Row, name: string): Row | null => (vsShared.isRow(data[name]) ? (data[name] as Row) : null);
/** A figure's unit, as the panel formats it: a place or a score keeps its tenth, a count is whole. */
function vsUnit(measure: string): VsFact["unit"] {
  const kind = VS_MEASURES[measure]?.kind;
  return kind === "percent" ? "percent" : kind === "place" || kind === "score" ? "score" : "count";
}
const vsShown = (measure: string, value: number) => (vsUnit(measure) === "count" ? Math.round(value) : vsShared.round1(value));
const vsWords = (measure: string) => VS_MEASURES[measure]?.words ?? measure;
/** The middle value of a list: the rival in the middle of the group, the website in the middle of the market. */
function vsMiddle(values: readonly number[]): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const at = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
}
/** How far two figures are apart, as a share of the larger: 0 the same, 1 one of them nothing. */
const vsGap = (value: number, other: number) => (Math.max(value, other) > 0 ? Math.abs(value - other) / Math.max(value, other) : 0);

/**
 * One figure set beside another's at the same check, said with both names: a rival's, the group's middle, the searches
 * checked, the span before. The first name is the subject: yours, or a rival's beside its reference.
 */
function vsBeside(list: string, name: string, measure: string, value: number, mean: number, other: string, score: number): OwnFound {
  const kind = value >= mean ? "rowAbove" : "rowBelow";
  const shown = vsShown(measure, value);
  const reference = vsShown(measure, mean);
  return {
    id: `${kind}:${list}:${measure}:${name}:${other}`, kind, list, score,
    params: { name, measure, value: shown, mean: reference, against: "other", other, ...(VS_MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}) },
    facts: [
      { key: "value", value: shown, unit: vsUnit(measure), label: `${name}: ${vsWords(measure)}` },
      { key: "mean", value: reference, unit: vsUnit(measure), label: `${other}: ${vsWords(measure)}` },
    ],
  };
}

/** A figure against the check before, with another's change beside it where it matters (a rival, the other group). */
function vsMoved(list: string, name: string, measure: string, now: number, before: number, score: number, other?: { name: string; change: number }): OwnFound {
  const change = (now - before) / before;
  const kind = change >= 0 ? "movedUp" : "movedDown";
  const size = vsShared.round1(Math.abs(change) * 100);
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: {
      name, measure, now: vsShown(measure, now), before: vsShown(measure, before), change: size,
      ...(other ? { other: other.name, otherChange: vsShared.round1(Math.abs(other.change) * 100), otherWay: other.change >= 0 ? "up" : "down" } : {}),
    },
    facts: [
      { key: "now", value: vsShown(measure, now), unit: vsUnit(measure), label: `${name}: ${vsWords(measure)}, now` },
      { key: "before", value: vsShown(measure, before), unit: vsUnit(measure), label: `${name}: ${vsWords(measure)}, before` },
      { key: "change", value: size, unit: "percent", label: `${name}: how much ${vsWords(measure)} ${change >= 0 ? "rose" : "fell"}` },
    ],
  };
}

/** A rival's figure moving beside yours: "handles4u.co.uk: up to 45 mentions, from 30. You: 28, from 40". */
function vsRival(list: string, rival: string, measure: string, now: number, before: number, you: number, youBefore: number, score: number): OwnFound {
  const kind = now >= before ? "rivalUp" : "rivalDown";
  const unit = vsUnit(measure);
  const shown = (value: number) => vsShown(measure, value);
  return {
    id: `${kind}:${list}:${measure}:${rival}`, kind, list, score,
    params: { name: rival, measure, now: shown(now), before: shown(before), you: shown(you), youBefore: shown(youBefore) },
    facts: [
      { key: "now", value: shown(now), unit, label: `${rival}: ${vsWords(measure)}, now` },
      { key: "before", value: shown(before), unit, label: `${rival}: ${vsWords(measure)}, before` },
      { key: "you", value: shown(you), unit, label: `this website: ${vsWords(measure)}, now` },
      { key: "youBefore", value: shown(youBefore), unit, label: `this website: ${vsWords(measure)}, before` },
    ],
  };
}

/** A part's share of a whole against its share before: "Pages with no link: 70% of all the mentions, from 33% before". */
function vsShareMoved(list: string, name: string, measure: string, share: number, shareBefore: number, score: number): OwnFound {
  const now = vsShared.round1(share);
  const before = vsShared.round1(shareBefore);
  return {
    id: `shareMoved:${list}:${measure}:${name}`, kind: "shareMoved", list, score,
    params: { name, measure, share: now, shareBefore: before },
    facts: [
      { key: "share", value: now, unit: "percent", label: `${name}: share of all the ${vsWords(measure)}, now` },
      { key: "shareBefore", value: before, unit: "percent", label: `${name}: share of all the ${vsWords(measure)}, before` },
    ],
  };
}

/** A search's place that moved: "door handles: place 4, from 12", weighed by how many make the search. */
function vsPlace(list: string, name: string, now: number, before: number, score: number): OwnFound {
  const kind = now < before ? "placeUp" : "placeDown";
  return {
    id: `${kind}:${list}:position:${name}`, kind, list, score,
    params: { name, measure: "position", now: vsShared.round1(now), before: vsShared.round1(before), moved: vsShared.round1(Math.abs(before - now)) },
    facts: [
      { key: "now", value: vsShared.round1(now), unit: "score", label: `${name}: place on Google, now` },
      { key: "before", value: vsShared.round1(before), unit: "score", label: `${name}: place on Google, before` },
    ],
  };
}

/** A change worth saying between two checks: this share of the figure before, and this many. */
const VS_LEAST_CHANGE = 0.05;
const VS_LEAST_COUNT = 3;
const vsMovedEnough = (now: number, before: number, least = VS_LEAST_COUNT) => before > 0 && Math.abs(now - before) >= least && Math.abs(now - before) / before >= VS_LEAST_CHANGE;
/** A gap to a rival worth saying: a fifth of the larger figure. */
const VS_LEAST_GAP = 0.2;
/** A part of a whole worth saying, and a whole too small to trust. */
const VS_LEAST_SHARE = 0.1;
const VS_LEAST_WHOLE = 5;

/** The newest check's figures and the check before's, as the dated Visibility pages hand them (`{ now, before, names }`). */
type VsFigures = { now: Row; before: Row | null; names: Row };
function vsFiguresOf(part: Row | null): VsFigures | null {
  if (!part || !vsShared.isRow(part.now)) return null;
  return { now: part.now as Row, before: vsShared.isRow(part.before) ? (part.before as Row) : null, names: vsShared.isRow(part.names) ? (part.names as Row) : {} };
}

/**
 * Each figure of a check against the check before, the biggest moves first: `fields` maps a figure to the measure it is
 * said as and the name the page shows it under.
 */
function vsChecksMoved(list: string, figures: VsFigures, fields: ReadonlyArray<{ field: string; measure: string; name: string; weight: number }>): OwnFound[] {
  if (!figures.before) return [];
  return fields.flatMap(({ field, measure, name, weight }) => {
    const now = vsNum(figures.now[field]);
    const before = vsNum(figures.before![field]);
    if (now === null || before === null || !vsMovedEnough(now, before)) return [];
    // A figure's weight says most what ranks first (visitors before AI Overviews); its size only a little: from 9 to 31
    // pages is no bigger news than visitors down a tenth.
    return [vsMoved(list, name, measure, now, before, weight * (0.9 + Math.min(0.4, Math.abs(now - before) / before)))];
  });
}

/** A rival as the dated pages hand them: its name and its figures now and at the check before the dates. */
type VsRival = { name: string; now: Row; before: Row | null };
const vsRivalsOf = (value: unknown): VsRival[] => vsRows(value).flatMap((row) => {
  const name = vsShared.named(row);
  return name && vsShared.isRow(row.now) ? [{ name, now: row.now as Row, before: vsShared.isRow(row.before) ? (row.before as Row) : null }] : [];
});

/**
 * Yours beside your rivals' on one figure at the same check: against the rival in the middle of the group where there
 * are three or more, else the one rival; worth saying from a fifth apart. Ranked by how far apart.
 */
function vsAgainstGroup(list: string, you: { name: string; figures: Row }, rivals: readonly VsRival[], field: string, measure: string, middleName: string, weight: number): OwnFound | null {
  const mine = vsNum(you.figures[field]);
  const theirs = rivals.map((rival) => ({ name: rival.name, value: vsNum(rival.now[field]) })).filter((one): one is { name: string; value: number } => one.value !== null);
  if (mine === null || theirs.length === 0) return null;
  const middle = theirs.length >= 3 ? vsMiddle(theirs.map((one) => one.value))! : theirs[0].value;
  const other = theirs.length >= 3 ? middleName : theirs[0].name;
  if (vsGap(mine, middle) < VS_LEAST_GAP) return null;
  return vsBeside(list, you.name, measure, mine, middle, other, weight * (0.8 + Math.min(0.7, vsGap(mine, middle))));
}

/**
 * The rival whose figure moved most between the check before the dates and the newest, beside your own move: worth
 * saying where it moved a twentieth or more and differently from yours.
 */
function vsRivalMoved(list: string, you: { figures: Row; before: Row | null }, rivals: readonly VsRival[], field: string, measure: string, weight: number): OwnFound | null {
  const mine = vsNum(you.figures[field]);
  const mineBefore = you.before ? vsNum(you.before[field]) : null;
  if (mine === null || mineBefore === null || mineBefore <= 0) return null;
  const yours = (mine - mineBefore) / mineBefore;
  const moves = rivals.flatMap((rival) => {
    const now = vsNum(rival.now[field]);
    const before = rival.before ? vsNum(rival.before[field]) : null;
    if (now === null || before === null || !vsMovedEnough(now, before)) return [];
    const change = (now - before) / before;
    return Math.abs(change - yours) >= VS_LEAST_CHANGE ? [{ rival, now, before, change, apart: Math.abs(change - yours) }] : [];
  }).sort((left, right) => right.apart - left.apart);
  const top = moves[0];
  return top ? vsRival(list, top.rival.name, measure, top.now, top.before, mine, mineBefore, weight * (0.9 + Math.min(0.8, top.apart))) : null;
}

// --- Google results → Who ranks above you (`google/above`): the newest check of each tracked search, no dates. ---

/**
 * The rival above you on most of your searches, against the searches checked; a website you don't watch above you
 * more often than any rival you do; and the searches where you are first, or nowhere in the top 100, of all checked.
 */
function aboveYouFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "above");
  const checked = part ? vsNum(part.checked) ?? 0 : 0;
  if (!part || checked < VS_LEAST_WHOLE) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  // Rivals and the other websites apart, each the most above you first: a list cut short keeps its top.
  const most = (value: unknown) => vsRows(value).filter((row) => vsShared.named(row) && (vsNum(row.above) ?? 0) > 0)
    .sort((left, right) => (right.above as number) - (left.above as number))[0];
  const found: OwnFound[] = [];
  const aboveName = vsText(names.aboveYou, "above you");
  const lead = most(part.rivals);
  if (lead) found.push(vsShared.partOf("above", `${vsShared.named(lead)!} · ${aboveName}`, "searchesChecked", lead.above as number, checked, 1.2 + (lead.above as number) / checked));
  const outsider = most(part.others);
  if (outsider && (outsider.above as number) >= VS_LEAST_COUNT && (outsider.above as number) > ((lead?.above as number | undefined) ?? 0)) {
    found.push(lead
      ? vsBeside("outsider", vsShared.named(outsider)!, "aboveYou", outsider.above as number, lead.above as number, vsShared.named(lead)!, 1.1 + (outsider.above as number) / checked)
      : vsShared.partOf("outsider", `${vsShared.named(outsider)!} · ${aboveName}`, "searchesChecked", outsider.above as number, checked, 1.1 + (outsider.above as number) / checked));
  }
  for (const [field, fallback, score] of [["first", "Searches where you rank first", 0.9], ["notOnPage", "Searches where you are not in the top 100", 0.8]] as const) {
    const value = vsNum(part[field]);
    if (value !== null && value / checked >= VS_LEAST_SHARE) found.push(vsShared.partOf(field, vsText(names[field], fallback), "searchesChecked", value, checked, score + value / checked / 2));
  }
  return found;
}

// --- Google results → Search features (`google/features`). ---

/**
 * The features across everything the website ranks for against the check before; the feature on most of the searches
 * checked; and a feature that names websites, on many searches, naming yours on few.
 */
function featuresFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const across = vsFiguresOf(vsPart(data, "across"));
  if (across) {
    const host = vsText(across.names.host, "This website");
    found.push(...vsChecksMoved("across", across, ([["aiOverviewRefs", "aiOverviews"], ["localPacks", "localPacks"], ["featuredSnippets", "featuredSnippets"]] as const).map(([field, measure]) => ({ field, measure, name: host, weight: 1.1 }))));
  }
  const part = vsPart(data, "features");
  const checked = part ? vsNum(part.checked) ?? 0 : 0;
  if (part && checked >= VS_LEAST_WHOLE) {
    const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
    const totals = vsRows(part.totals).filter((row) => vsShared.named(row) && (vsNum(row.searches) ?? 0) > 0).sort((left, right) => (right.searches as number) - (left.searches as number));
    // The feature that can show the website (an AI Overview, a map pack, an answer box) on most searches, before any other.
    const top = totals.find((row) => vsNum(row.withSite) !== null) ?? totals[0];
    if (top && (top.searches as number) / checked >= VS_LEAST_SHARE) found.push(vsShared.partOf("features", vsShared.named(top)!, "searchesChecked", top.searches as number, checked, 0.9 + (top.searches as number) / checked / 2));
    // A feature naming websites: the one naming yours least, of the searches it shows on, among those on enough of them.
    const naming = totals.filter((row) => vsNum(row.withSite) !== null && (row.searches as number) >= VS_LEAST_COUNT)
      .map((row) => ({ row, share: (row.withSite as number) / (row.searches as number) }))
      .sort((left, right) => left.share - right.share || (right.row.searches as number) - (left.row.searches as number))[0];
    if (naming && naming.share < 0.5) {
      found.push(vsShared.partOf("naming", `${vsShared.named(naming.row)!} · ${vsText(names.withSite, "with this website in it")}`, "featureShown", naming.row.withSite as number, naming.row.searches as number, 1 + (0.5 - naming.share)));
    }
  }
  return found;
}

// --- Google results → Wins and losses (`google/moves`). ---

/**
 * Searches that moved up against those that moved down over the dates, each against the span before; the step that
 * lost most, against the others; and the biggest move on the table, weighed by how often the search is made.
 */
function winsLossesFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "winsLosses");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const upName = vsText(names.up, "Moved up");
  const downName = vsText(names.down, "Moved down");
  const up = vsNum(part.up) ?? 0;
  const down = vsNum(part.down) ?? 0;
  const found: OwnFound[] = [];
  if (up + down >= VS_LEAST_WHOLE * 2 && vsGap(up, down) >= VS_LEAST_GAP / 2) found.push(vsBeside("winsLosses", upName, "searches", up, down, downName, 1.3 + Math.min(0.5, vsGap(up, down))));
  const upBefore = vsNum(part.upBefore);
  const downBefore = vsNum(part.downBefore);
  // Moves are counted at each check, so two spans compare only over as many checks each: a span holding three checks
  // against one holding one would read as moves trebling.
  const sameChecks = vsNum(part.checks) !== null && vsNum(part.checks) === vsNum(part.checksBefore);
  if (upBefore !== null && downBefore !== null && sameChecks) {
    const dates = vsText(names.dates, "The dates chosen");
    const moves = [
      { measure: "rankedDown", now: down, before: downBefore, other: { name: upName, now: up, before: upBefore } },
      { measure: "rankedUp", now: up, before: upBefore, other: { name: downName, now: down, before: downBefore } },
    ].filter((one) => vsMovedEnough(one.now, one.before)).sort((left, right) => Math.abs(right.now - right.before) / right.before - Math.abs(left.now - left.before) / left.before);
    const top = moves[0];
    // "Last month: 2,099 searches that moved down. The month before: 1,300", in the page's own words for the dates.
    if (top) found.push(vsBeside("before", dates, top.measure, top.now, top.before, vsText(names.before, "The span before"), 1.2 + Math.min(0.3, Math.abs(top.now - top.before) / top.before)));
  }
  // The step of the chart that lost most, against the steps' middle: a day or a week Google moved the website down.
  const steps = vsRows(data.steps).filter((row) => typeof row.label === "string" && vsNum(row.down) !== null);
  if (steps.length >= 3) {
    const worst = [...steps].sort((left, right) => (right.down as number) - (left.down as number))[0];
    const middle = vsMiddle(steps.map((row) => row.down as number)) ?? 0;
    if ((worst.down as number) >= VS_LEAST_WHOLE && (worst.down as number) >= Math.max(middle * 2, middle + VS_LEAST_WHOLE)) {
      found.push(vsBeside("steps", worst.label as string, "rankedDown", worst.down as number, middle, vsText(names.usual, "A usual step"), 1 + Math.min(0.5, (worst.down as number) / Math.max(1, up + down))));
    }
  }
  // The biggest move on the table shown, weighed by how often its search is made.
  const rows = vsRows(data.moves).filter((row) => typeof row.keyword === "string" && vsNum(row.position) !== null && vsNum(row.previousPosition) !== null);
  const biggest = rows.map((row) => ({ row, moved: Math.abs((row.previousPosition as number) - (row.position as number)), volume: vsNum(row.volume) ?? 0 }))
    .filter((one) => one.moved >= VS_LEAST_COUNT)
    .sort((left, right) => Math.min(10, right.moved) * Math.sqrt(right.volume + 1) - Math.min(10, left.moved) * Math.sqrt(left.volume + 1))[0];
  if (biggest) found.push(vsPlace("moves", biggest.row.keyword as string, biggest.row.position as number, biggest.row.previousPosition as number, 0.8 + Math.min(0.5, biggest.moved / 20)));
  return found;
}

// --- Google results → Your searches (`google/searches`). ---

/**
 * The searches on Google's first page now against the check before; the biggest climb and the biggest drop since that
 * check; a search furthest below its best; and the searches slipping, of all checked.
 */
function yourSearchesFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "standing");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const rows = vsRows(part.searches).filter((row) => typeof row.keyword === "string");
  const checked = rows.filter((row) => vsNum(row.position) !== null);
  const found: OwnFound[] = [];
  // The page counts over every search it lists (a long list reaches the eye cut short) and hands its searches the most
  // moved first; counted here from the rows where it did not.
  const onPageOne = (field: string) => rows.filter((row) => (vsNum(row[field]) ?? 101) <= 10).length;
  const pageOne = vsNum(part.pageOne) ?? onPageOne("position");
  const pageOneBefore = vsNum(part.pageOneBefore) ?? onPageOne("previousPosition");
  if (rows.some((row) => vsNum(row.previousPosition) !== null) && pageOne !== pageOneBefore && pageOneBefore > 0) {
    found.push(vsMoved("pageOne", vsText(names.pageOne, "Searches on Google's first page"), "searches", pageOne, pageOneBefore, 1.3));
  }
  const moves = checked.filter((row) => vsNum(row.previousPosition) !== null)
    .map((row) => ({ row, climbed: (row.previousPosition as number) - (row.position as number) }))
    .filter((one) => Math.abs(one.climbed) >= VS_LEAST_COUNT);
  const climb = [...moves].sort((left, right) => right.climbed - left.climbed)[0];
  const drop = [...moves].sort((left, right) => left.climbed - right.climbed)[0];
  if (climb && climb.climbed > 0) found.push(vsPlace("moves", climb.row.keyword as string, climb.row.position as number, climb.row.previousPosition as number, 1 + Math.min(0.5, climb.climbed / 20)));
  if (drop && drop.climbed < 0) found.push(vsPlace("moves", drop.row.keyword as string, drop.row.position as number, drop.row.previousPosition as number, 1.05 + Math.min(0.5, -drop.climbed / 20)));
  const below = checked.filter((row) => vsNum(row.best) !== null && (row.position as number) - (row.best as number) >= VS_LEAST_COUNT * 2)
    .sort((left, right) => ((right.position as number) - (right.best as number)) - ((left.position as number) - (left.best as number)))[0];
  if (below) found.push(vsBeside("best", below.keyword as string, "placeOnGoogle", below.position as number, below.best as number, vsText(names.best, "Its best"), 0.9));
  const slipping = vsNum(part.slipping) ?? rows.filter((row) => row.verdict === "SLIPPING").length;
  const listed = vsNum(part.total) ?? rows.length;
  if (listed >= VS_LEAST_WHOLE && slipping / listed >= VS_LEAST_SHARE) found.push(vsShared.partOf("verdicts", vsText(names.slipping, "Slipping"), "searchesChecked", slipping, listed, 0.8 + slipping / listed));
  return found;
}

// --- Competitors → Side by side (`competitors`). ---

/**
 * Your estimated visitors, searches ranked for, searches in the top 3 and linking websites beside the rival in the
 * middle of the group, the furthest apart first; the rival whose visitors moved most against yours over the dates; the
 * rival above you on most of the searches compared; and the rival that gained most new searches lately.
 */
function sideBySideFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "group");
  if (!part || !vsShared.isRow(part.you)) return [];
  const you = part.you as Row;
  const youName = vsText(you.name, "This website");
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const rivals = vsRivalsOf(part.rivals);
  const youFigures = { name: youName, figures: vsShared.isRow(you.now) ? (you.now as Row) : {} };
  const found: OwnFound[] = [];
  const middleName = vsText(names.middle, "The rival in the middle");
  const against = [
    { field: "estimatedTraffic", weight: 1.3 }, { field: "keywords", weight: 1 }, { field: "top3", weight: 1 }, { field: "referringDomains", weight: 0.9 },
  ].flatMap(({ field, weight }) => {
    const one = vsAgainstGroup("group", youFigures, rivals, field, field, middleName, weight);
    return one ? [one] : [];
  }).sort((left, right) => right.score - left.score);
  found.push(...against.slice(0, 3));
  // Over the dates: each line of the chart, its newest check against the check before the dates (or its first in them).
  const lines = vsPart(part, "lines");
  const lineOfYou = lines ? vsPart(lines, "you") : null;
  const move = lineOfYou && vsShared.isRow(lineOfYou.now)
    ? vsRivalMoved("moved", { figures: lineOfYou.now as Row, before: vsShared.isRow(lineOfYou.before) ? (lineOfYou.before as Row) : null }, vsRivalsOf(lines!.rivals), "estimatedTraffic", "estimatedTraffic", 1.2)
    : null;
  if (move) found.push(move);
  // Searches compared: the rival above you on most, against the searches you are above it on.
  const beats = vsRows(part.compared).filter((row) => vsShared.named(row) && (vsNum(row.comparedOn) ?? 0) >= VS_LEAST_WHOLE)
    .sort((left, right) => ((right.beatsYouOn as number) - (right.youBeatOn as number)) - ((left.beatsYouOn as number) - (left.youBeatOn as number)))[0];
  if (beats && (beats.beatsYouOn as number) > (beats.youBeatOn as number)) {
    found.push(vsBeside("compared", vsShared.named(beats)!, "aboveYou", beats.beatsYouOn as number, beats.youBeatOn as number, vsText(names.youAbove, "You above it"), 1 + Math.min(0.5, (beats.beatsYouOn as number) / (beats.comparedOn as number))));
  }
  // What the rivals did lately: the one with the most new searches, against the rival in the middle.
  const lately = vsRows(part.lately).filter((row) => vsShared.named(row) && vsNum(row.newSearches) !== null).sort((left, right) => (right.newSearches as number) - (left.newSearches as number));
  if (lately.length >= 2 && (lately[0].newSearches as number) >= VS_LEAST_WHOLE * 2) {
    const middle = vsMiddle(lately.map((row) => row.newSearches as number)) ?? 0;
    if (vsGap(lately[0].newSearches as number, middle) >= VS_LEAST_GAP) found.push(vsBeside("lately", vsShared.named(lately[0])!, "newSearches", lately[0].newSearches as number, middle, middleName, 0.9));
  }
  return found;
}

// --- Competitors → Market map (`competitors/map`): the newest check, no dates. ---

/**
 * A website you don't watch sharing more of your searches than any rival you do; your visitors for each search ranked
 * for against the market's middle; your estimated visitors against the market's middle; and the websites in your
 * market getting more visitors than you.
 */
function marketMapFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "market");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const you = vsPart(part, "you");
  if (!you) return [];
  const youName = vsText(you.name, "This website");
  const found: OwnFound[] = [];
  // The page hands the rival and the website it doesn't watch sharing most with you, and the market's middle, worked
  // out over every website in its market: a long market's list reaches the eye cut short.
  const outsider = vsPart(part, "outsider");
  const rival = vsPart(part, "rival");
  const outsiderShared = outsider && vsShared.named(outsider) ? vsNum(outsider.sharedKeywords) : null;
  const rivalShared = rival && vsShared.named(rival) ? vsNum(rival.sharedKeywords) : null;
  if (outsiderShared !== null && outsiderShared > 0 && (rivalShared === null || outsiderShared > rivalShared)) {
    found.push(rivalShared !== null
      ? vsBeside("shared", vsShared.named(outsider!)!, "sharedKeywords", outsiderShared, rivalShared, vsShared.named(rival!)!, 1.3)
      : vsBeside("shared", vsShared.named(outsider!)!, "sharedKeywords", outsiderShared, vsNum(you.keywords) ?? 0, youName, 1.2));
  }
  const middleName = vsText(names.middle, "The website in the middle of your market");
  const middle = vsPart(part, "middle");
  const measured = middle ? vsNum(middle.websites) ?? 0 : 0;
  const mineKeywords = vsNum(you.keywords);
  const mineTraffic = vsNum(you.traffic);
  if (middle && measured >= 3 && mineKeywords && mineTraffic !== null) {
    const perSearch = vsNum(middle.perSearch);
    const mine = mineTraffic / mineKeywords;
    if (perSearch !== null && vsGap(mine, perSearch) >= VS_LEAST_GAP) found.push(vsBeside("perSearch", youName, "visitsPerSearch", mine, perSearch, middleName, 1.1 + Math.min(0.5, vsGap(mine, perSearch))));
    const traffic = vsNum(middle.traffic);
    if (traffic !== null && vsGap(mineTraffic, traffic) >= VS_LEAST_GAP) found.push(vsBeside("traffic", youName, "estimatedTraffic", mineTraffic, traffic, middleName, 1 + Math.min(0.5, vsGap(mineTraffic, traffic))));
    const more = vsNum(middle.more);
    if (more !== null && more > 0) found.push(vsShared.partOf("more", vsText(names.more, "Websites in your market with more visitors than you"), "websites", more, measured, 0.8 + more / measured / 2));
  }
  return found;
}

// --- Competitors → A rival (`competitors/rival`). ---

/**
 * The figure where the rival is furthest from you; its visitors over the dates against yours; the searches it ranks
 * above you on, of all you share; and the shared search it leads on by most places, among those most searched.
 */
function rivalFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "rival");
  if (!part) return [];
  const rival = vsText(part.name, "");
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const youName = vsText(names.you, "This website");
  if (!rival || !vsShared.isRow(part.theirs) || !vsShared.isRow(part.yours)) return [];
  const theirs = part.theirs as Row;
  const yours = part.yours as Row;
  const found: OwnFound[] = [];
  const gaps = ["estimatedTraffic", "keywords", "referringDomains", "domainRank"].flatMap((field) => {
    const them = vsNum(theirs[field]);
    const me = vsNum(yours[field]);
    return them !== null && me !== null && vsGap(me, them) >= VS_LEAST_GAP ? [vsBeside("figures", youName, field, me, them, rival, (field === "estimatedTraffic" ? 1.3 : 1) * (0.8 + vsGap(me, them)))] : [];
  }).sort((left, right) => right.score - left.score);
  found.push(...gaps.slice(0, 2));
  // Visitors over the dates: the first and the newest point of each line.
  const line = (value: unknown) => vsRows(value).filter((row) => vsNum(row.estimatedTraffic) !== null);
  const mine = line(part.yourLine);
  const their = line(part.theirLine);
  if (mine.length >= 2 && their.length >= 2) {
    const [mineFirst, mineLast, theirFirst, theirLast] = [mine[0], mine[mine.length - 1], their[0], their[their.length - 1]].map((row) => row.estimatedTraffic as number);
    if (theirFirst > 0 && mineFirst > 0 && vsMovedEnough(theirLast, theirFirst) && Math.abs((theirLast - theirFirst) / theirFirst - (mineLast - mineFirst) / mineFirst) >= VS_LEAST_CHANGE) {
      found.push(vsRival("lines", rival, "estimatedTraffic", theirLast, theirFirst, mineLast, mineFirst, 1.25));
    }
  }
  const sharedAll = vsNum(part.sharedAll);
  const ahead = vsNum(part.theyLead);
  // Only where the table holds the searches it leads on: a shared list not held yet is no "none".
  if (sharedAll !== null && ahead !== null && ahead > 0 && sharedAll >= VS_LEAST_WHOLE) found.push(vsShared.partOf("shared", vsText(names.theyLead, `Searches where ${rival} ranks above you`), "sharedKeywords", ahead, sharedAll, 1 + ahead / sharedAll / 2));
  const lead = vsRows(part.shared).filter((row) => typeof row.keyword === "string" && vsNum(row.theirPosition) !== null)
    .map((row) => ({ row, apart: (vsNum(row.yourPosition) ?? 101) - (row.theirPosition as number), volume: vsNum(row.volume) ?? 0 }))
    .filter((one) => one.apart >= VS_LEAST_COUNT)
    .sort((left, right) => Math.min(20, right.apart) * Math.sqrt(right.volume + 1) - Math.min(20, left.apart) * Math.sqrt(left.volume + 1))[0];
  if (lead && vsNum(lead.row.yourPosition) !== null) found.push(vsBeside("lead", lead.row.keyword as string, "placeOnGoogle", lead.row.yourPosition as number, lead.row.theirPosition as number, rival, 0.9));
  return found;
}

// --- AI answers → AI demand (`ai/demand`): monthly figures, the last 12 months; no dates. ---

/** Asks of AI a month against a year before, beside Google's; the search rising fastest in AI against Google; Google's own year. */
function aiDemandFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "demand");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const found: OwnFound[] = [];
  // Each against 11 months before over the searches with a year of figures (`aiYear`), as the boxes count it.
  const ai = vsNum(part.aiYear) ?? vsNum(part.ai);
  const aiBefore = vsNum(part.aiYearBefore);
  const google = vsNum(part.google);
  const googleBefore = vsNum(part.googleYearBefore);
  const googleChange = google !== null && googleBefore ? (google - googleBefore) / googleBefore : null;
  if (ai !== null && aiBefore !== null && vsMovedEnough(ai, aiBefore)) {
    found.push(vsMoved("whole", vsText(names.searches, "Your searches"), "aiAsks", ai, aiBefore, 1.4, googleChange !== null ? { name: vsText(names.google, "Searched on Google a month"), change: googleChange } : undefined));
  } else if (google !== null && googleBefore !== null && vsMovedEnough(google, googleBefore)) {
    found.push(vsMoved("whole", vsText(names.searches, "Your searches"), "volume", google, googleBefore, 1.3));
  }
  // Each search's asks of AI three months back against now, beside its Google searches over the same months. The page
  // hands its searches the most moved first (`rising`, `movers`): a list of a hundred reaches the eye cut short.
  const rows = vsRows(part.searches).filter((row) => typeof row.keyword === "string");
  const listOf = (value: unknown) => (Array.isArray(value) ? vsRows(value).filter((row) => typeof row.keyword === "string") : rows);
  const rising = listOf(part.rising).flatMap((row) => {
    const months = Array.isArray(row.aiMonths) ? (row.aiMonths as unknown[]).filter((value): value is number => vsNum(value) !== null) : [];
    const googles = Array.isArray(row.googleMonths) ? (row.googleMonths as unknown[]).filter((value): value is number => vsNum(value) !== null) : [];
    if (months.length < 4) return [];
    const now = months[months.length - 1];
    const before = months[months.length - 4];
    if (!vsMovedEnough(now, before, VS_LEAST_COUNT * 10)) return [];
    const googleThen = googles.length >= 4 ? googles[googles.length - 4] : 0;
    return [{ row, now, before, google: googleThen > 0 ? (googles[googles.length - 1] - googleThen) / googleThen : null }];
  }).sort((left, right) => Math.abs(right.now - right.before) - Math.abs(left.now - left.before));
  for (const one of rising.slice(0, 2)) {
    found.push(vsMoved("rising", one.row.keyword as string, "aiAsks", one.now, one.before, 1.1, one.google !== null ? { name: vsText(names.onGoogle, "On Google"), change: one.google } : undefined));
  }
  // Where AI holds the most of a search's asks, against the share for every search together.
  const shared = rows.filter((row) => (vsNum(row.ai) ?? 0) > 0 && (vsNum(row.google) ?? 0) > 0);
  const aiAll = shared.reduce((sum, row) => sum + (row.ai as number), 0);
  const googleAll = shared.reduce((sum, row) => sum + (row.google as number), 0);
  if (shared.length >= 3 && aiAll + googleAll > 0) {
    const whole = (100 * aiAll) / (aiAll + googleAll);
    const top = shared.map((row) => ({ row, share: (100 * (row.ai as number)) / ((row.ai as number) + (row.google as number)) })).sort((left, right) => right.share - left.share)[0];
    if (top.share >= whole * 1.5 && top.share - whole >= 5) found.push(vsBeside("share", top.row.keyword as string, "aiSharePercent", top.share, whole, vsText(names.every, "Every search together"), 0.9));
  }
  // Without AI figures yet, the searches whose Google searches moved most over the year: what drove the box's change.
  if (ai === null) {
    const movers = listOf(part.movers).flatMap((row) => {
      const googles = Array.isArray(row.googleMonths) ? (row.googleMonths as unknown[]).filter((value): value is number => vsNum(value) !== null) : [];
      if (googles.length < 12) return [];
      const now = googles[googles.length - 1];
      const before = googles[googles.length - 12];
      return vsMovedEnough(now, before, 100) ? [{ row, now, before }] : [];
    }).sort((left, right) => Math.abs(right.now - right.before) - Math.abs(left.now - left.before));
    const up = movers.find((one) => one.now > one.before);
    const down = movers.find((one) => one.now < one.before);
    for (const one of [down, up]) if (one) found.push(vsMoved("google", one.row.keyword as string, "volume", one.now, one.before, 1 + Math.min(0.4, Math.abs(one.now - one.before) / Math.max(1, googleBefore ?? 1) * 5)));
  }
  return found;
}

// --- AI answers → Mentions (`ai/mentions`). ---

/**
 * The assistant naming you most against the one naming you least; each assistant's answers naming you over the dates,
 * the biggest move first, beside the one that moved most the other way; the questions no assistant names you on; and
 * the answers warning against you.
 */
function aiMentionsFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "mentions");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const engines = vsRows(part.engines).filter((row) => vsShared.named(row) && (vsNum(row.asked) ?? 0) >= VS_LEAST_WHOLE);
  const found: OwnFound[] = [];
  const rate = (row: Row) => (100 * (row.named as number)) / (row.asked as number);
  if (engines.length >= 2) {
    const sorted = [...engines].sort((left, right) => rate(right) - rate(left));
    const [most, least] = [sorted[0], sorted[sorted.length - 1]];
    if (rate(most) - rate(least) >= 10) found.push(vsBeside("engines", vsShared.named(least)!, "namedSharePercent", rate(least), rate(most), vsShared.named(most)!, 1.2 + Math.min(0.5, (rate(most) - rate(least)) / 100)));
  }
  // Over the dates: each assistant's answers naming you at the first check in them (or before them) and the newest.
  const moves = vsRows(part.moved).filter((row) => vsShared.named(row) && vsNum(row.named) !== null && vsNum(row.namedBefore) !== null && (row.namedBefore as number) > 0)
    .map((row) => ({ row, change: ((row.named as number) - (row.namedBefore as number)) / (row.namedBefore as number) }))
    .filter((one) => Math.abs((one.row.named as number) - (one.row.namedBefore as number)) >= 2)
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const top = moves[0];
  if (top) {
    const other = moves.find((one) => Math.sign(one.change) !== Math.sign(top.change));
    found.push(vsMoved("moved", vsShared.named(top.row)!, "named", top.row.named as number, top.row.namedBefore as number, 1.3, other ? { name: vsShared.named(other.row)!, change: other.change } : undefined));
  }
  // An assistant that named you in none of its answers at the check before and names you now: no share of nought to say.
  const fresh = vsRows(part.moved).filter((row) => vsShared.named(row) && (vsNum(row.named) ?? 0) >= 2 && vsNum(row.namedBefore) === 0)
    .sort((left, right) => (right.named as number) - (left.named as number))[0];
  if (fresh) found.push(vsBeside("fresh", vsShared.named(fresh)!, "named", fresh.named as number, 0, vsText(names.before, "The check before"), 1.25));
  const questions = vsNum(part.questions) ?? 0;
  const never = vsNum(part.neverNamed);
  if (never !== null && questions >= VS_LEAST_WHOLE && never / questions >= VS_LEAST_SHARE) found.push(vsShared.partOf("questions", vsText(names.never, "Questions no assistant names you on"), "questions", never, questions, 1 + never / questions / 2));
  const warned = vsNum(part.warned) ?? 0;
  const asked = engines.reduce((sum, row) => sum + (row.asked as number), 0);
  if (warned > 0 && asked > 0) found.push(vsShared.partOf("warned", vsText(names.warned, "Answers warning against you"), "aiAnswers", warned, asked, 1.4));
  return found;
}

// --- AI answers → Share of voice (`ai/share-of-voice`): the newest answers, no dates. ---

/**
 * Your share of the mentions across every assistant against the rival with the most; the assistant where a rival beats
 * you by most; and the assistant where you lead by most.
 */
function shareOfVoiceFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "voice");
  if (!part) return [];
  const engines = vsRows(part.engines).filter((row) => vsShared.named(row));
  const sitesOf = (engine: Row) => vsRows(engine.websites).filter((row) => vsShared.named(row) && vsNum(row.named) !== null);
  const totals = new Map<string, { you: boolean; named: number }>();
  let all = 0;
  for (const engine of engines) for (const site of sitesOf(engine)) {
    const held = totals.get(vsShared.named(site)!) ?? { you: site.you === 1, named: 0 };
    held.named += site.named as number;
    totals.set(vsShared.named(site)!, held);
    all += site.named as number;
  }
  const found: OwnFound[] = [];
  const you = [...totals.entries()].find(([, entry]) => entry.you);
  if (!you || all < VS_LEAST_WHOLE * 2) return [];
  const [youName, mine] = you;
  const leader = [...totals.entries()].filter(([, entry]) => !entry.you).sort((left, right) => right[1].named - left[1].named)[0];
  if (leader) found.push(vsBeside("all", youName, "voiceSharePercent", (100 * mine.named) / all, (100 * leader[1].named) / all, leader[0], 1.3));
  // Each assistant: your share against the rival with the most there.
  const apart = engines.flatMap((engine) => {
    const sites = sitesOf(engine);
    const total = sites.reduce((sum, site) => sum + (site.named as number), 0);
    const me = sites.find((site) => site.you === 1);
    const best = sites.filter((site) => site.you !== 1).sort((left, right) => (right.named as number) - (left.named as number))[0];
    if (!me || !best || total < VS_LEAST_WHOLE) return [];
    const share = (100 * (me.named as number)) / total;
    const theirs = (100 * (best.named as number)) / total;
    return [{ engine: vsShared.named(engine)!, share, theirs, rival: vsShared.named(best)!, gap: share - theirs, total }];
  });
  const behind = apart.filter((one) => one.gap < 0).sort((left, right) => left.gap - right.gap)[0];
  const ahead = apart.filter((one) => one.gap > 0).sort((left, right) => right.gap - left.gap)[0];
  if (behind) found.push(vsBeside("engines", `${youName} · ${behind.engine}`, "voiceSharePercent", behind.share, behind.theirs, behind.rival, 1.2 + Math.min(0.5, -behind.gap / 100)));
  if (ahead && ahead.gap >= 10) found.push(vsBeside("engines", `${youName} · ${ahead.engine}`, "voiceSharePercent", ahead.share, ahead.theirs, ahead.rival, 0.9 + Math.min(0.3, ahead.gap / 100)));
  // An assistant that never names you while it names rivals.
  const silent = apart.find((one) => one.share === 0 && one.theirs > 0);
  if (silent && silent !== behind) found.push(vsBeside("silent", `${youName} · ${silent.engine}`, "voiceSharePercent", 0, silent.theirs, silent.rival, 1.1));
  return found;
}

// --- Brand radar (`radar`): monthly, the last 12 months; no dates. ---

/**
 * Your mentions against the month before, beside the rival that moved most the other way; your share against the
 * leader's; the questions naming rivals and not you; and the pages cited, yours against the rival's most.
 */
function brandRadarFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "radar");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const businesses = vsRows(part.businesses).filter((row) => vsShared.named(row) && vsNum(row.mentions) !== null);
  const you = businesses.find((row) => row.you === 1);
  if (!you) return [];
  const youName = vsShared.named(you)!;
  const rivals = businesses.filter((row) => row.you !== 1);
  const found: OwnFound[] = [];
  const mine = you.mentions as number;
  const mineBefore = vsNum(you.before);
  if (mineBefore !== null && mineBefore > 0) {
    const yours = (mine - mineBefore) / mineBefore;
    const rival = rivals.filter((row) => (vsNum(row.before) ?? 0) > 0 && vsMovedEnough(row.mentions as number, row.before as number))
      .map((row) => ({ row, change: ((row.mentions as number) - (row.before as number)) / (row.before as number) }))
      .sort((left, right) => Math.abs(right.change - yours) - Math.abs(left.change - yours))[0];
    if (rival && Math.abs(rival.change - yours) >= VS_LEAST_CHANGE * 2) found.push(vsRival("moved", vsShared.named(rival.row)!, "aiMentions", rival.row.mentions as number, rival.row.before as number, mine, mineBefore, 1.4));
    else if (vsMovedEnough(mine, mineBefore)) found.push(vsMoved("moved", youName, "aiMentions", mine, mineBefore, 1.3));
  }
  const total = businesses.reduce((sum, row) => sum + (row.mentions as number), 0);
  const leader = [...rivals].sort((left, right) => (right.mentions as number) - (left.mentions as number))[0];
  if (leader && total >= VS_LEAST_WHOLE * 2) found.push(vsBeside("share", youName, "voiceSharePercent", (100 * mine) / total, (100 * (leader.mentions as number)) / total, vsShared.named(leader)!, 1.2));
  const questions = vsRows(part.questions).filter((row) => typeof row.question === "string");
  const allQuestions = vsNum(part.questionsAll) ?? questions.length;
  const without = vsNum(part.rivalsNotYou);
  if (without !== null && allQuestions >= VS_LEAST_WHOLE && without / allQuestions >= VS_LEAST_SHARE) found.push(vsShared.partOf("questions", vsText(names.rivalsNotYou, "Questions naming rivals and not you"), "questions", without, allQuestions, 1.1 + without / allQuestions / 2));
  const cited = rivals.filter((row) => vsNum(row.pagesCited) !== null).sort((left, right) => (right.pagesCited as number) - (left.pagesCited as number))[0];
  const mineCited = vsNum(you.pagesCited) ?? 0;
  if (cited && (cited.pagesCited as number) >= VS_LEAST_COUNT && vsGap(mineCited, cited.pagesCited as number) >= VS_LEAST_GAP) found.push(vsBeside("cited", youName, "aiCitedPages", mineCited, cited.pagesCited as number, vsShared.named(cited)!, 1));
  return found;
}

// --- Web mentions → All mentions (`mentions`). ---

/**
 * New pages naming you against the span before; those with no link, as a share, against before; those speaking badly,
 * against before; and the kind of website most of them are, of every new one.
 */
function webMentionsFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "period");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const fresh = vsNum(part.new) ?? 0;
  const before = vsNum(part.newBefore) ?? 0;
  const found: OwnFound[] = [];
  if (vsMovedEnough(fresh, before)) found.push(vsMoved("new", vsText(names.business, "This business"), "mentions", fresh, before, 1.4));
  const noLink = vsNum(part.noLink);
  const noLinkBefore = vsNum(part.noLinkBefore);
  if (noLink !== null && fresh >= VS_LEAST_WHOLE) {
    const share = (100 * noLink) / fresh;
    if (noLinkBefore !== null && before >= VS_LEAST_WHOLE && Math.abs(share - (100 * noLinkBefore) / before) >= 10) found.push(vsShareMoved("noLink", vsText(names.noLink, "Pages naming you with no link"), "mentions", share, (100 * noLinkBefore) / before, 1.2));
    else if (share >= 25) found.push(vsShared.partOf("noLink", vsText(names.noLink, "Pages naming you with no link"), "mentions", noLink, fresh, 1 + share / 200));
  }
  const badly = vsNum(part.badly) ?? 0;
  const badlyBefore = vsNum(part.badlyBefore) ?? 0;
  if (badly > badlyBefore && badly >= 2) found.push(badlyBefore > 0 ? vsMoved("badly", vsText(names.business, "This business"), "badMentions", badly, badlyBefore, 1.3) : vsShared.partOf("badly", vsText(names.badly, "Speak badly of you"), "mentions", badly, Math.max(fresh, badly), 1.25));
  const kinds = vsRows(part.kinds).filter((row) => vsShared.named(row) && (vsNum(row.mentions) ?? 0) > 0).sort((left, right) => (right.mentions as number) - (left.mentions as number));
  if (kinds[0] && fresh >= VS_LEAST_WHOLE && (kinds[0].mentions as number) / fresh >= 0.4) found.push(vsShared.partOf("kinds", vsShared.named(kinds[0])!, "mentions", kinds[0].mentions as number, fresh, 0.9));
  return found;
}

// --- Web mentions → Against rivals (`mentions/rivals`). ---

/**
 * Your mentions against the span before, beside the rival that moved most the other way; your share of every mention
 * against before; yours against the rival talked about most; and the share without a link, yours against the rivals'.
 */
function mentionsRivalsFindings(data: Row): OwnFound[] {
  const businesses = vsRows(vsPart(data, "group")?.businesses).filter((row) => vsShared.named(row) && vsNum(row.mentions) !== null);
  const you = businesses.find((row) => row.you === 1);
  if (!you) return [];
  const youName = vsShared.named(you)!;
  const rivals = businesses.filter((row) => row.you !== 1);
  const found: OwnFound[] = [];
  const mine = you.mentions as number;
  const mineBefore = vsNum(you.before) ?? 0;
  const moved = rivals.filter((row) => vsMovedEnough(row.mentions as number, vsNum(row.before) ?? 0))
    .map((row) => ({ row, by: (row.mentions as number) - (row.before as number) }))
    .sort((left, right) => Math.abs(right.by - (mine - mineBefore)) - Math.abs(left.by - (mine - mineBefore)))[0];
  if (moved && mineBefore > 0) found.push(vsRival("moved", vsShared.named(moved.row)!, "mentions", moved.row.mentions as number, moved.row.before as number, mine, mineBefore, 1.4));
  else if (vsMovedEnough(mine, mineBefore)) found.push(vsMoved("moved", youName, "mentions", mine, mineBefore, 1.3));
  const total = businesses.reduce((sum, row) => sum + (row.mentions as number), 0);
  const totalBefore = businesses.reduce((sum, row) => sum + (vsNum(row.before) ?? 0), 0);
  if (total >= VS_LEAST_WHOLE * 2 && totalBefore >= VS_LEAST_WHOLE * 2) {
    const share = (100 * mine) / total;
    const shareBefore = (100 * mineBefore) / totalBefore;
    if (Math.abs(share - shareBefore) >= 5) found.push(vsShareMoved("share", youName, "mentions", share, shareBefore, 1.3));
  }
  const leader = [...rivals].sort((left, right) => (right.mentions as number) - (left.mentions as number))[0];
  if (leader && (leader.mentions as number) >= VS_LEAST_WHOLE && vsGap(mine, leader.mentions as number) >= VS_LEAST_GAP) found.push(vsBeside("leader", youName, "mentions", mine, leader.mentions as number, vsShared.named(leader)!, 1.1));
  const linkShare = (row: Row) => (100 * (vsNum(row.noLink) ?? 0)) / (row.mentions as number);
  const theirs = rivals.filter((row) => (row.mentions as number) >= VS_LEAST_WHOLE);
  if (mine >= VS_LEAST_WHOLE && theirs.length > 0) {
    const middle = vsMiddle(theirs.map(linkShare))!;
    const share = linkShare(you);
    if (Math.abs(share - middle) >= 15) found.push(vsBeside("noLink", youName, "noLinkSharePercent", share, middle, vsText(vsPart(data, "group")?.middleName, "The rival in the middle"), 1));
  }
  return found;
}

// --- Reviews → Your reviews (`reviews`). ---

/**
 * New reviews against the span before; the stars they gave against the span before's; the reviews still waiting for a
 * reply, of all held; and the days a reply took against before.
 */
function yourReviewsFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "period");
  if (!part) return [];
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const found: OwnFound[] = [];
  const fresh = vsNum(part.new) ?? 0;
  const before = vsNum(part.newBefore) ?? 0;
  if (vsMovedEnough(fresh, before, 2)) found.push(vsMoved("new", vsText(names.business, "This business"), "newReviews", fresh, before, 1.3));
  const stars = vsNum(part.stars);
  const starsBefore = vsNum(part.starsBefore);
  if (stars !== null && starsBefore !== null && fresh >= VS_LEAST_COUNT && before >= VS_LEAST_COUNT && Math.abs(stars - starsBefore) >= 0.2) {
    found.push(vsBeside("stars", vsText(names.stars, "Stars this period"), "rating", stars, starsBefore, vsText(names.before, "The period before"), 1.4 + Math.min(0.5, Math.abs(stars - starsBefore) / 2)));
  }
  const waiting = vsNum(part.waiting) ?? 0;
  const held = vsNum(part.held) ?? 0;
  if (waiting >= 2 && held >= VS_LEAST_WHOLE && waiting / held >= VS_LEAST_SHARE) found.push(vsShared.partOf("waiting", vsText(names.waiting, "Waiting for a reply"), "reviews", waiting, held, 1.1 + waiting / held / 2));
  const low = vsNum(part.low);
  const lowBefore = vsNum(part.lowBefore);
  if (low !== null && lowBefore !== null && fresh >= VS_LEAST_WHOLE && before >= VS_LEAST_WHOLE) {
    const share = (100 * low) / fresh;
    const shareBefore = (100 * lowBefore) / before;
    if (Math.abs(share - shareBefore) >= 10) found.push(vsShareMoved("low", vsText(names.low, "Reviews of 1 or 2 stars"), "reviews", share, shareBefore, 1.2));
  }
  const days = vsNum(part.daysToAnswer);
  const daysBefore = vsNum(part.daysToAnswerBefore);
  if (days !== null && daysBefore !== null && Math.abs(days - daysBefore) >= 2) found.push(vsBeside("reply", vsText(names.reply, "Days to answer"), "daysToAnswer", days, daysBefore, vsText(names.before, "The period before"), 1));
  return found;
}

// --- Reviews → Against rivals (`reviews/rivals`). ---

/** Your star rating, new reviews, days to answer and reviews in all, each against the rival best at it. */
function reviewsRivalsFindings(data: Row): OwnFound[] {
  const rows = vsRows(vsPart(data, "group")?.businesses).filter((row) => vsShared.named(row));
  const you = rows.find((row) => row.you === 1 && row.google === 1) ?? rows.find((row) => row.you === 1);
  if (!you) return [];
  const youName = vsShared.named(you)!;
  // Like with like: your Google profile against the rivals' Google profiles, a page elsewhere against its kind.
  const rivals = rows.filter((row) => row.you !== 1 && (you.google !== 1 || row.google === 1));
  const found: OwnFound[] = [];
  const best = (field: string, lessIsBetter = false) => rivals.filter((row) => vsNum(row[field]) !== null).sort((left, right) => (lessIsBetter ? (left[field] as number) - (right[field] as number) : (right[field] as number) - (left[field] as number)))[0];
  const rating = vsNum(you.rating);
  const topRating = best("rating");
  if (rating !== null && topRating && Math.abs(rating - (topRating.rating as number)) >= 0.2) found.push(vsBeside("rating", youName, "rating", rating, topRating.rating as number, vsShared.named(topRating)!, 1.3 + Math.min(0.5, Math.abs(rating - (topRating.rating as number)))));
  const days = vsNum(you.daysToAnswer);
  const fastest = best("daysToAnswer", true);
  if (days !== null && fastest && days - (fastest.daysToAnswer as number) >= 2) found.push(vsBeside("reply", youName, "daysToAnswer", days, fastest.daysToAnswer as number, vsShared.named(fastest)!, 1.25));
  const fresh = vsNum(you.newIn);
  const busiest = best("newIn");
  if (fresh !== null && busiest && (busiest.newIn as number) >= VS_LEAST_COUNT && vsGap(fresh, busiest.newIn as number) >= VS_LEAST_GAP) found.push(vsBeside("new", youName, "newReviews", fresh, busiest.newIn as number, vsShared.named(busiest)!, 1.2));
  const reviews = vsNum(you.reviews);
  const most = best("reviews");
  if (reviews !== null && most && vsGap(reviews, most.reviews as number) >= VS_LEAST_GAP) found.push(vsBeside("reviews", youName, "reviews", reviews, most.reviews as number, vsShared.named(most)!, 1));
  const answered = (row: Row) => (vsNum(row.newIn) ?? 0) > 0 && vsNum(row.answered) !== null ? (100 * (row.answered as number)) / (row.newIn as number) : null;
  const mineAnswered = answered(you);
  const theirs = rivals.map(answered).filter((value): value is number => value !== null);
  if (mineAnswered !== null && (vsNum(you.newIn) ?? 0) >= VS_LEAST_COUNT && theirs.length > 0) {
    const top = Math.max(...theirs);
    if (top - mineAnswered >= 20) found.push(vsBeside("answered", youName, "answeredSharePercent", mineAnswered, top, vsText(vsPart(data, "group")?.bestName, "The rival answering most"), 1.1));
  }
  return found;
}

// --- The Overview (``). ---

/**
 * The headline figures against the check before the dates — estimated visitors, searches ranked for, the top 3,
 * linking websites, answers naming you — the biggest moves first; your visitors and searches beside the rival in the
 * middle of the group; and the rival sharing most of the searches bringing you visitors.
 */
function overviewFindings(data: Row): OwnFound[] {
  // The panels' figures, where the dates hold a check; the top competitors section shows whatever the dates.
  const figures = vsFiguresOf(vsPart(data, "headline"));
  const found: OwnFound[] = [];
  if (figures) {
    const host = vsText(figures.names.host, "This website");
    found.push(...vsChecksMoved("headline", figures, [
      { field: "estimatedTraffic", measure: "estimatedTraffic", name: host, weight: 1.4 },
      { field: "keywords", measure: "keywords", name: host, weight: 1.1 },
      { field: "top3", measure: "top3", name: host, weight: 1.1 },
      { field: "referringDomains", measure: "referringDomains", name: host, weight: 0.9 },
      { field: "aiOverviewRefs", measure: "aiOverviews", name: host, weight: 0.9 },
      { field: "paidKeywords", measure: "paidKeywords", name: host, weight: 0.7 },
    ]).sort((left, right) => right.score - left.score).slice(0, 3));
  }
  // The assistants: the one whose answers naming you moved most against the check before.
  const engines = vsRows(vsPart(data, "assistants")?.engines).filter((row) => vsShared.named(row) && vsNum(row.named) !== null && (vsNum(row.namedBefore) ?? 0) > 0)
    .filter((row) => Math.abs((row.named as number) - (row.namedBefore as number)) >= 2)
    .sort((left, right) => Math.abs((right.named as number) - (right.namedBefore as number)) - Math.abs((left.named as number) - (left.namedBefore as number)));
  if (engines[0]) found.push(vsMoved("assistants", vsShared.named(engines[0])!, "named", engines[0].named as number, engines[0].namedBefore as number, 1));
  // Beside the rivals, at their newest checks.
  const group = vsPart(data, "rivals");
  if (group) {
    const you = { name: vsText(group.youName, "This website"), figures: vsShared.isRow(group.you) ? (group.you as Row) : {} };
    const rivals = vsRows(group.rivals).flatMap((row) => (vsShared.named(row) ? [{ name: vsShared.named(row)!, now: row, before: null }] : []));
    const middle = vsText(group.middleName, "The rival in the middle");
    for (const [field, weight] of [["visits", 1.3], ["keywords", 1]] as const) {
      const one = vsAgainstGroup("rivals", you, rivals, field, field === "visits" ? "estimatedTraffic" : "keywords", middle, weight);
      if (one) found.push(one);
    }
    // The rival whose shared searches bring the most of your own visitors.
    const visits = vsNum(you.figures.visits);
    const sharing = vsRows(group.rivals).filter((row) => vsShared.named(row) && (vsNum(row.sharedVisits) ?? 0) > 0).sort((left, right) => (right.sharedVisits as number) - (left.sharedVisits as number))[0];
    if (sharing && visits && (sharing.sharedVisits as number) / visits >= 0.25) {
      found.push(vsShared.partOf("sharing", `${vsShared.named(sharing)!} · ${vsText(group.sharedName, "searches you share")}`, "estimatedTraffic", Math.round(sharing.sharedVisits as number), visits, 0.9 + (sharing.sharedVisits as number) / visits / 2));
    }
  }
  return found;
}

// --- Paid search → Summary (`paid`): searches and visits, never the guessed spend. ---

/** Searches with adverts and the visits they bring, each against the check before the dates. */
function paidFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "paid");
  if (!part) return [];
  const found: OwnFound[] = [];
  const searches = vsNum(part.paidKeywords);
  const before = vsNum(part.paidKeywordsBefore);
  const visits = vsNum(part.paidTraffic);
  const visitsBefore = vsNum(part.paidTrafficBefore);
  const visitsChange = visits !== null && visitsBefore ? (visits - visitsBefore) / visitsBefore : null;
  const name = vsText(part.name, "This website");
  // The searches with adverts against the check before, their visits' move beside it; the visits alone where the
  // searches held.
  const searchesMoved = searches !== null && before !== null && vsMovedEnough(searches, before, 2);
  if (searchesMoved) found.push(vsMoved("searches", name, "paidKeywords", searches, before, 1.4, visitsChange !== null ? { name: vsText(part.visitsName, "Visits from adverts"), change: visitsChange } : undefined));
  if (!searchesMoved && visits !== null && visitsBefore !== null && vsMovedEnough(visits, visitsBefore)) found.push(vsMoved("visits", name, "paidTraffic", visits, visitsBefore, 1.3));
  // Started or stopped advertising since the check before.
  if (searches !== null && before === 0 && searches > 0) found.push(vsBeside("started", name, "paidKeywords", searches, 0, vsText(part.beforeName, "The check before"), 1.5));
  if (searches === 0 && before !== null && before > 0) found.push(vsBeside("stopped", name, "paidKeywords", 0, before, vsText(part.beforeName, "The check before"), 1.5));
  return found;
}

// --- Site audit (`audit`). ---

/**
 * Broken pages and the technical score against the crawl before; the problem on most pages, of the pages crawled; and
 * errors against warnings. Nothing from a crawl the website turned away, which read too little to judge.
 */
function auditFindings(data: Row): OwnFound[] {
  const part = vsPart(data, "crawl");
  if (!part || part.turnedAway === 1) return [];
  const crawled = vsNum(part.pagesCrawled) ?? 0;
  const names = vsShared.isRow(part.names) ? (part.names as Row) : {};
  const found: OwnFound[] = [];
  const checks = vsFiguresOf(vsPart(data, "crawls"));
  if (checks) {
    found.push(...vsChecksMoved("crawls", checks, [
      { field: "brokenPages", measure: "brokenPages", name: vsText(checks.names.host, "This website"), weight: 1.4 },
      { field: "onPageScore", measure: "onPageScore", name: vsText(checks.names.host, "This website"), weight: 1.2 },
      { field: "crawledPages", measure: "pagesCrawled", name: vsText(checks.names.host, "This website"), weight: 0.6 },
    ]));
  }
  if (crawled < VS_LEAST_WHOLE * 2) return found;
  const severity = { ERROR: 3, WARNING: 2, NOTICE: 1 } as Record<string, number>;
  const issues = vsRows(part.issues).filter((row) => vsShared.named(row) && (vsNum(row.pages) ?? 0) > 0);
  const worst = [...issues].sort((left, right) => (severity[String(right.severity)] ?? 0) * Math.sqrt(right.pages as number) - (severity[String(left.severity)] ?? 0) * Math.sqrt(left.pages as number))[0];
  if (worst && (worst.pages as number) / crawled >= 0.05) found.push(vsShared.partOf("issues", vsShared.named(worst)!, "pagesCrawled", worst.pages as number, crawled, 0.9 + (severity[String(worst.severity)] ?? 0) / 10 + Math.min(0.4, (worst.pages as number) / crawled)));
  const widest = [...issues].sort((left, right) => (right.pages as number) - (left.pages as number))[0];
  if (widest && widest !== worst && (widest.pages as number) / crawled >= 0.25) found.push(vsShared.partOf("issues", vsShared.named(widest)!, "pagesCrawled", widest.pages as number, crawled, 0.8));
  const errors = issues.filter((row) => row.severity === "ERROR").reduce((sum, row) => sum + (row.pages as number), 0);
  // Every page with an error, where more than the worst problem's: said once, never the same pages twice.
  if (errors > 0 && errors > ((worst?.severity === "ERROR" ? (worst.pages as number) : 0))) found.push(vsShared.partOf("errors", vsText(names.errors, "Pages with errors"), "pagesCrawled", Math.min(errors, crawled), crawled, 0.85));
  return found;
}

/** Visibility's second half's pages, by the eye's key for them: each says only its own. Joined into `VISIBILITY_OWN`. */
export const VISIBILITY_MARKET_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "visibility.googleAbove": { general: false, find: aboveYouFindings },
  "visibility.googleFeatures": { general: false, find: featuresFindings },
  "visibility.googleMoves": { general: false, find: winsLossesFindings },
  "visibility.googleSearches": { general: false, find: yourSearchesFindings },
  "visibility.competitors": { general: false, find: sideBySideFindings },
  "visibility.competitorsMap": { general: false, find: marketMapFindings },
  "visibility.competitorsRival": { general: false, find: rivalFindings },
  "visibility.aiDemand": { general: false, find: aiDemandFindings },
  "visibility.aiMentions": { general: false, find: aiMentionsFindings },
  "visibility.aiShare": { general: false, find: shareOfVoiceFindings },
  "visibility.radarOverview": { general: false, find: brandRadarFindings },
  "visibility.mentions": { general: false, find: webMentionsFindings },
  "visibility.mentionsRivals": { general: false, find: mentionsRivalsFindings },
  "visibility.reviews": { general: false, find: yourReviewsFindings },
  "visibility.reviewsRivals": { general: false, find: reviewsRivalsFindings },
  "visibility.overview": { general: false, find: overviewFindings },
  "visibility.paid": { general: false, find: paidFindings },
  "visibility.audit": { general: false, find: auditFindings },
};
