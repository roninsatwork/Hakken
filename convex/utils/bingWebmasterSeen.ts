/**
 * What the eye reads of a whole Bing list (ask-hakken-every-chart-page-plan-2026-11-03.md, section 7: "Bing keeps each
 * row's span before and its days, but no screen reads them. One read of the span before serves every Bing list page").
 * Keywords, Pages and Bing against Google each show one page of a list of thousands, so the eye, which reads only what a
 * page hands it (`pageData.ts`, a list cut to its first 25 rows), could never find the biggest mover, a gap between the
 * engines, or what a kind of page brings. This works them out over the whole list once, and hands a few rows of each:
 * the read names them (`bingWebmasterReads.ts`, `bingListSeen`) and the page's own rules say what is worth saying
 * (`utils/sees/own/bing.ts`). No database here, so the rules' test builds the figures the way the read does.
 */

/** A row of a Bing list as the build keeps it (`bingPeriods`), with Google's figures for the same keyword or page. */
export type BingSeenRow = {
  number: number;
  clicks: number;
  impressions: number;
  position: number | null;
  googleClicks: number | null;
  googleImpressions: number | null;
  googlePosition: number | null;
};

/** The same row the span before: Bing's figures only, as the build keeps no Google columns for the span before. */
export type BingSeenBefore = { number: number; clicks: number; impressions: number; position: number | null };

/** A row the eye is handed: both spans' figures, Google's beside them. */
export type BingSeenPick = BingSeenRow & { clicksBefore: number | null; impressionsBefore: number | null; positionBefore: number | null };

/** Which engine ranks the website higher for a row: Bing, Google, the same, or only Bing shows it. */
export function whoRanksHigher(row: { position: number | null; googlePosition: number | null; googleImpressions: number | null }): "BING" | "GOOGLE" | "SAME" | "ONLY_BING" | null {
  if (row.position === null) return null;
  if (row.googlePosition === null || !row.googleImpressions) return "ONLY_BING";
  const gap = row.googlePosition - row.position;
  return Math.abs(gap) < 0.5 ? "SAME" : gap > 0 ? "BING" : "GOOGLE";
}

/** The places a list is filtered by, as Search Console's: 1–3, 4–10, 11–20, and 21 and below. */
export const BING_BANDS = ["top3", "top10", "top20", "rest"] as const;
export type BingBand = (typeof BING_BANDS)[number];

export function bandOf(position: number | null): BingBand | "none" {
  if (position === null) return "none";
  return position <= 3 ? "top3" : position <= 10 ? "top10" : position <= 20 ? "top20" : "rest";
}

const daysIn = (span: { from: string; to: string }) => Math.round((Date.parse(`${span.to}T00:00:00Z`) - Date.parse(`${span.from}T00:00:00Z`)) / 86_400_000) + 1;
/** A span before shorter than this share of the span it is set against is a part of one. */
const WHOLE_BEFORE = 0.9;

/**
 * Whether a list's span before is as long as the span it is set against. Bing keeps 13 months of weeks, so Last 12
 * months' span before, built from the weeks still kept, holds only its newest five or so (bingWebmasterCollect.ts,
 * `buildPeriods`; found 2026-11-04): read as the whole, every keyword would have "risen" tenfold. A part is never read.
 */
export function beforeIsWhole(now: { from: string; to: string }, before: { from: string; to: string }): boolean {
  return daysIn(before) >= daysIn(now) * WHOLE_BEFORE;
}

/** Rows handed of each kind of move at most: the rules pick the biggest, and say why. */
const MOVERS = 3;
/** A row that gained or lost fewer clicks than this is no mover: Bing's figures are small. */
const MOVE_LEAST = 3;
/** One engine ranking the website this many places above the other, the better of the two in the first page. */
const AHEAD_PLACES = 3;
const AHEAD_BEST = 10;
/** A row's share of clicks from Bing weighed from this many of its clicks on Bing, or on Google for one Bing barely sends. */
const SHARE_BING_LEAST = 10;
const SHARE_GOOGLE_LEAST = 30;
/** Twice the website's share, or half of it, before a row is far from it. */
const SHARE_FAR = 2;

type Totals = { rows: number; clicks: number; impressions: number };

export type BingListSeen = {
  totals: Totals;
  /** The span before, as the build keeps it: null where none is held. */
  before: Totals | null;
  /** Rows on both engines: Bing's clicks and Google's, for Bing's share of the website's search clicks. */
  both: Totals & { googleClicks: number; googleImpressions: number };
  /** Who ranks the website higher, over the whole list, and the clicks of the rows only Bing shows. */
  who: { bingHigher: number; googleHigher: number; same: number; onlyBing: number; onlyBingClicks: number };
  /** Each place band: Bing's rows by Bing's place, and Google's for the same keywords or pages by Google's. */
  bands: Array<{ band: BingBand; rows: number; clicks: number; impressions: number; googleRows: number; googleClicks: number; googleImpressions: number }>;
  /** Rows bringing clicks this span and none the span before, and the other way round; null with no span before. */
  newLost: { gained: number; lost: number; gainedClicks: number; lostClicks: number } | null;
  /** The rows that gained and lost the most clicks against the span before, the most first. */
  up: BingSeenPick[];
  down: BingSeenPick[];
  /** Bing ranks it well above Google, the most Bing clicks first; Google well above Bing, the most Google clicks first. */
  bingAhead: BingSeenPick | null;
  googleAhead: BingSeenPick | null;
  /** The rows whose share of their clicks from Bing is furthest above and below the website's. */
  shareHigh: BingSeenPick | null;
  shareLow: BingSeenPick | null;
  /** Pages only: each kind of page's clicks on Bing, now and before, and on Google. */
  kinds: Array<{ kind: string; rows: number; clicks: number; clicksBefore: number | null; impressions: number; googleClicks: number }>;
};

/**
 * A whole list's figures for the eye. `kindOf`, for Pages: a row's kind of page by its number (the website's
 * classification, or Not sorted), read once by the caller from every page's address.
 */
export function bingListSeen(rows: readonly BingSeenRow[], before: readonly BingSeenBefore[] | null, kindOf?: (number: number) => string): BingListSeen {
  const beforeOf = new Map((before ?? []).map((row) => [row.number, row]));
  const nowOf = new Map(rows.map((row) => [row.number, row]));
  // Its figures only: a caller's row may carry more (its A to Z place, its rate), which the eye is never handed.
  const pick = (row: BingSeenRow): BingSeenPick => {
    const then = before ? beforeOf.get(row.number) : undefined;
    return {
      number: row.number, clicks: row.clicks, impressions: row.impressions, position: row.position,
      googleClicks: row.googleClicks, googleImpressions: row.googleImpressions, googlePosition: row.googlePosition,
      clicksBefore: before ? then?.clicks ?? 0 : null, impressionsBefore: before ? then?.impressions ?? 0 : null, positionBefore: then?.position ?? null,
    };
  };
  const sum = (list: readonly { clicks: number; impressions: number }[]): Totals => ({
    rows: list.length,
    clicks: list.reduce((total, row) => total + row.clicks, 0),
    impressions: list.reduce((total, row) => total + row.impressions, 0),
  });

  const onBoth = rows.filter((row) => row.googleImpressions !== null && row.googleImpressions > 0 && row.googleClicks !== null);
  const both = { ...sum(onBoth), googleClicks: onBoth.reduce((total, row) => total + (row.googleClicks ?? 0), 0), googleImpressions: onBoth.reduce((total, row) => total + (row.googleImpressions ?? 0), 0) };

  const who = { bingHigher: 0, googleHigher: 0, same: 0, onlyBing: 0, onlyBingClicks: 0 };
  for (const row of rows) {
    const higher = whoRanksHigher(row);
    if (higher === "BING") who.bingHigher += 1;
    else if (higher === "GOOGLE") who.googleHigher += 1;
    else if (higher === "SAME") who.same += 1;
    else if (higher === "ONLY_BING") {
      who.onlyBing += 1;
      who.onlyBingClicks += row.clicks;
    }
  }

  const bands = BING_BANDS.map((band) => {
    const bing = rows.filter((row) => bandOf(row.position) === band);
    const google = onBoth.filter((row) => bandOf(row.googlePosition) === band);
    return {
      band, ...sum(bing),
      googleRows: google.length, googleClicks: google.reduce((total, row) => total + (row.googleClicks ?? 0), 0), googleImpressions: google.reduce((total, row) => total + (row.googleImpressions ?? 0), 0),
    };
  });

  // The movers, rows only the span before held among them (a keyword lost whole lost all its clicks).
  const moves = before
    ? [
        ...rows.map((row) => ({ row: pick(row), change: row.clicks - (beforeOf.get(row.number)?.clicks ?? 0) })),
        ...before.filter((row) => !nowOf.has(row.number)).map((row) => ({
          row: { number: row.number, clicks: 0, impressions: 0, position: null, googleClicks: null, googleImpressions: null, googlePosition: null, clicksBefore: row.clicks, impressionsBefore: row.impressions, positionBefore: row.position },
          change: -row.clicks,
        })),
      ].filter((one) => Math.abs(one.change) >= MOVE_LEAST)
    : [];
  const up = moves.filter((one) => one.change > 0).sort((left, right) => right.change - left.change || left.row.number - right.row.number).slice(0, MOVERS).map((one) => one.row);
  const down = moves.filter((one) => one.change < 0).sort((left, right) => left.change - right.change || left.row.number - right.row.number).slice(0, MOVERS).map((one) => one.row);

  const newLost = before
    ? {
        gained: rows.filter((row) => row.clicks > 0 && (beforeOf.get(row.number)?.clicks ?? 0) === 0).length,
        lost: before.filter((row) => row.clicks > 0 && (nowOf.get(row.number)?.clicks ?? 0) === 0).length,
        gainedClicks: rows.filter((row) => (beforeOf.get(row.number)?.clicks ?? 0) === 0).reduce((total, row) => total + row.clicks, 0),
        lostClicks: before.filter((row) => (nowOf.get(row.number)?.clicks ?? 0) === 0).reduce((total, row) => total + row.clicks, 0),
      }
    : null;

  // One engine well above the other, the better of the two on the first page: weighed by the clicks the better engine
  // brings, so a keyword nobody clicks never comes first.
  const gapOf = (row: BingSeenRow) => (row.position !== null && row.googlePosition !== null ? row.googlePosition - row.position : 0);
  const bestOf = (list: BingSeenRow[], weight: (row: BingSeenRow) => number) => list.filter((row) => weight(row) > 0).sort((left, right) => weight(right) - weight(left) || left.number - right.number)[0];
  const ranked = onBoth.filter((row) => row.position !== null && row.googlePosition !== null);
  const bingAhead = bestOf(ranked.filter((row) => gapOf(row) >= AHEAD_PLACES && row.position! <= AHEAD_BEST), (row) => row.clicks * Math.min(10, gapOf(row)));
  const googleAhead = bestOf(ranked.filter((row) => -gapOf(row) >= AHEAD_PLACES && row.googlePosition! <= AHEAD_BEST), (row) => (row.googleClicks ?? 0) * Math.min(10, -gapOf(row)));

  // Bing's share of a row's search clicks against the website's: far above it with clicks enough on Bing, or far below it
  // with clicks enough on Google, weighed by the clicks behind it.
  const siteShare = both.clicks + both.googleClicks > 0 ? both.clicks / (both.clicks + both.googleClicks) : 0;
  const shareOf = (row: BingSeenRow) => row.clicks / (row.clicks + (row.googleClicks ?? 0));
  const shared = onBoth.filter((row) => row.clicks + (row.googleClicks ?? 0) > 0);
  const shareHigh = siteShare > 0 ? bestOf(shared.filter((row) => row.clicks >= SHARE_BING_LEAST && shareOf(row) >= siteShare * SHARE_FAR), (row) => row.clicks * Math.log(shareOf(row) / siteShare)) : undefined;
  const shareLow = siteShare > 0 ? bestOf(shared.filter((row) => (row.googleClicks ?? 0) >= SHARE_GOOGLE_LEAST && shareOf(row) <= siteShare / SHARE_FAR), (row) => (row.googleClicks ?? 0) * (1 - shareOf(row) / siteShare)) : undefined;

  const kinds = new Map<string, { kind: string; rows: number; clicks: number; clicksBefore: number | null; impressions: number; googleClicks: number }>();
  if (kindOf) {
    for (const row of rows) {
      const kind = kindOf(row.number);
      const held = kinds.get(kind) ?? { kind, rows: 0, clicks: 0, clicksBefore: before ? 0 : null, impressions: 0, googleClicks: 0 };
      held.rows += 1;
      held.clicks += row.clicks;
      held.impressions += row.impressions;
      held.googleClicks += row.googleClicks ?? 0;
      kinds.set(kind, held);
    }
    for (const row of before ?? []) {
      const kind = kindOf(row.number);
      const held = kinds.get(kind) ?? { kind, rows: 0, clicks: 0, clicksBefore: 0, impressions: 0, googleClicks: 0 };
      held.clicksBefore = (held.clicksBefore ?? 0) + row.clicks;
      kinds.set(kind, held);
    }
  }

  return {
    totals: sum(rows),
    before: before ? sum(before) : null,
    both,
    who,
    bands,
    newLost,
    up,
    down,
    bingAhead: bingAhead ? pick(bingAhead) : null,
    googleAhead: googleAhead ? pick(googleAhead) : null,
    shareHigh: shareHigh ? pick(shareHigh) : null,
    shareLow: shareLow ? pick(shareLow) : null,
    kinds: [...kinds.values()].sort((left, right) => right.clicks - left.clicks || left.kind.localeCompare(right.kind)),
  };
}

/** The rows a list's figures hand the eye, by number: the read names only these. */
export function seenNumbers(seen: BingListSeen): number[] {
  const picks = [...seen.up, ...seen.down, seen.bingAhead, seen.googleAhead, seen.shareHigh, seen.shareLow].filter((row): row is BingSeenPick => row !== null);
  return [...new Set(picks.map((row) => row.number))];
}

/** A named row: its words (a keyword, or a page's path, its title for the home page), its own screen's reference. */
export type NamedPick = Omit<BingSeenPick, "number"> & { name: string; ref: string };

/**
 * A page as the eye names it: its path, as the tables show it under its title, never the title itself ("Door Handles |
 * More Handles" names the brand twice). The home page is "/", which the page's rules say in the reader's words.
 */
export function pageNameOf(address: string, _title: string | null = null): string {
  try {
    const url = new URL(address);
    return `${url.pathname}${url.search}`;
  } catch {
    return address;
  }
}

/**
 * The list's figures with each picked row named: a row with no name (a keyword or page Hakken can't name) is left out,
 * never handed by its number. Kinds named by the website's own words, Not sorted marked so no rule names it.
 */
export function namedListSeen(seen: BingListSeen, nameOf: (number: number) => { name: string; ref: string } | null, kindName: (kind: string) => string | null = () => null) {
  const named = (row: BingSeenPick | null): NamedPick | null => {
    if (!row) return null;
    const name = nameOf(row.number);
    if (!name) return null;
    const { number: _number, ...figures } = row;
    return { ...figures, ...name };
  };
  const list = (rows: readonly BingSeenPick[]) => rows.map(named).filter((row): row is NamedPick => row !== null);
  return {
    totals: seen.totals,
    before: seen.before,
    both: seen.both,
    who: seen.who,
    bands: seen.bands,
    newLost: seen.newLost,
    up: list(seen.up),
    down: list(seen.down),
    bingAhead: named(seen.bingAhead),
    googleAhead: named(seen.googleAhead),
    shareHigh: named(seen.shareHigh),
    shareLow: named(seen.shareLow),
    // Each kind by its name only: its id is the website's plumbing, never a word the eye hands on.
    kinds: seen.kinds.map(({ kind, ...figures }) => {
      const name = kindName(kind);
      return { ...figures, name: name ?? "", sorted: name !== null };
    }),
  };
}
export type NamedBingListSeen = ReturnType<typeof namedListSeen>;
