import { describe, expect, test, vi } from "vitest";
import { shiftDay } from "./searchConsoleDays";
import { keepsSearch, keptLines } from "./searchConsoleKeep";
import { MOST_PAIRS_HELD, PairSums, PairsPaused, addPiece, longListRows, piecesOf, type PairsCarry, type Span } from "./searchConsoleLongLists";
import { addRowsInto, addUpRows, fromGoogle, type GoogleRow, type Row } from "./utils/searchConsolePacks";

/** Google's answers, made up from each ask's days and dimensions, the same every time (`answerFor`). */
vi.mock("./searchConsoleReads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./searchConsoleReads")>()),
  askLive: async (_ctx: unknown, _google: unknown, ask: { startDate: string; endDate: string; dimensions: string[] }) =>
    ({ ok: true, rows: answerFor({ from: ask.startDate, to: ask.endDate }, ask.dimensions.length === 2) }),
}));

/**
 * The 90 days', the 90 days before's and twelve months' lists are asked of
 * Google a week at a time (keep-less-history-plan.md, part 3: one ask for a
 * busy website's 90 days is cut at Google's 50,000 rows). The pieces cover
 * every day once, and never cross a period's edge, so one set of answers
 * adds up to each period.
 */
const NEWEST = "2026-09-26";
const span = (days: number, endsDaysBack = 0) => {
  const to = shiftDay(NEWEST, -endsDaysBack);
  return { from: shiftDay(to, 1 - days), to };
};
const days = (piece: { from: string; to: string }) => Math.round((Date.parse(piece.to) - Date.parse(piece.from)) / 86_400_000) + 1;

describe("the days asked a week at a time", () => {
  test("90 days are twelve weeks and six days, oldest first", () => {
    const pieces = piecesOf([span(90)]);
    expect(pieces).toHaveLength(13);
    expect(pieces[0]).toEqual({ from: "2026-06-29", to: "2026-07-05" });
    expect(pieces.at(-1)).toEqual({ from: "2026-09-21", to: NEWEST });
    expect(pieces.map(days)).toEqual([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6]);
  });

  test("every day of every period once, no piece crossing a period's edge", () => {
    const periods = [span(90), span(90, 90), span(365)];
    const pieces = piecesOf(periods);
    // Every day from the twelve months' first to the newest, once, in order.
    expect(pieces[0].from).toBe(span(365).from);
    expect(pieces.at(-1)?.to).toBe(NEWEST);
    for (const [index, piece] of pieces.entries()) {
      expect(days(piece)).toBeLessThanOrEqual(7);
      if (index > 0) expect(piece.from).toBe(shiftDay(pieces[index - 1].to, 1));
    }
    // Each period is made of whole pieces.
    for (const period of periods) {
      const inside = pieces.filter((piece) => piece.from >= period.from && piece.to <= period.to);
      expect(inside.reduce((sum, piece) => sum + days(piece), 0)).toBe(days(period));
    }
  });

  test("nothing asked for, nothing asked", () => {
    expect(piecesOf([])).toEqual([]);
  });
});

/** A small generator, the same every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const seedOf = (text: string) => [...text].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) % 2_147_483_647, 7);

/** Weeks of pairs Google cuts at its 50,000 rows: their rows are made up, and must never reach a list. */
const cutWeek = (span: Span) => span.from !== span.to && seedOf(span.from) % 4 === 1;

/** One answer from Google: unique rows of a few hundred searches and pages, with positions that are not whole. A page list is cut past a week. */
function answerFor(span: Span, pairs: boolean): GoogleRow[] {
  if (pairs ? cutWeek(span) : span.to > shiftDay(span.from, 6)) return Array.from({ length: 50_000 }, (_, at) => ({ keys: [`cut ${at}`, "https://acme-shop.test/cut"], clicks: 1, impressions: 1, position: 1 }));
  const next = random(seedOf(`${span.from}${span.to}${pairs}`));
  const rows = new Map<string, GoogleRow>();
  const count = 40 + Math.floor(next() * (span.from === span.to ? 60 : 200));
  for (let at = 0; at < count; at += 1) {
    // Like a big website's: most searches seen on one page, with no click, past the first two pages of results.
    const number = Math.floor(next() * 1_500);
    const search = `plumber ${number}`;
    const page = `https://acme-shop.test/p${next() < 0.85 ? number % 8 : Math.floor(next() * 8)}`;
    const keys = pairs ? [search, page] : [page];
    const position = next() < 0.7 ? 21 + next() * 40 : 1 + next() * 20;
    rows.set(keys.join("|"), { keys, clicks: next() < 0.06 ? 1 + Math.floor(next() * 3) : 0, impressions: 1 + Math.floor(next() * 40), position: Math.round(position * 10) / 10 });
  }
  return [...rows.values()];
}

/** Searches let go the way the pairs held by text let them go until 2026-10-16: what `PairSums.prune` must match. */
function prunedBefore(sums: Map<string, Row>, tracked: ReadonlySet<string>, most: number): boolean {
  if (sums.size <= most) return false;
  const searches = new Map<string, { clicks: number; impressions: number; positionSum: number; pages: number; keys: string[] }>();
  for (const [key, row] of sums) {
    const one = searches.get(row.key) ?? { clicks: 0, impressions: 0, positionSum: 0, pages: 0, keys: [] };
    one.clicks += row.clicks;
    one.impressions += row.impressions;
    one.positionSum += row.positionSum;
    one.pages += 1;
    one.keys.push(key);
    searches.set(row.key, one);
  }
  const unkept = [...searches.entries()]
    .filter(([search, figures]) => !tracked.has(search) && !keepsSearch(figures))
    .sort((left, right) => left[1].impressions - right[1].impressions || (left[0] < right[0] ? -1 : 1));
  let pruned = false;
  for (const [, figures] of unkept) {
    if (sums.size <= most / 2) break;
    for (const key of figures.keys) sums.delete(key);
    pruned = true;
  }
  return pruned;
}

/** The periods' pairs added up by text, as until 2026-10-16: a cut week's days added up, then into each period. */
function pairsBefore(spans: readonly Span[], tracked: readonly string[], most: number) {
  const sums = spans.map(() => new Map<string, Row>());
  let pruned = false;
  for (const piece of piecesOf(spans)) {
    let rows = fromGoogle(answerFor(piece, true), true);
    if (rows.length >= 50_000) {
      const days: Row[][] = [];
      for (let day = piece.from; day <= piece.to; day = shiftDay(day, 1)) days.push(fromGoogle(answerFor({ from: day, to: day }, true), true));
      rows = addUpRows(days);
    }
    spans.forEach((span, which) => {
      if (piece.from >= span.from && piece.to <= span.to) {
        addRowsInto(sums[which], rows);
        if (prunedBefore(sums[which], new Set(tracked), most)) pruned = true;
      }
    });
  }
  return { lists: sums.map((held) => keptLines([...held.values()], new Set(tracked))), pruned };
}

const PERIODS: Span[] = [{ from: shiftDay(NEWEST, -89), to: NEWEST }, { from: shiftDay(NEWEST, -179), to: shiftDay(NEWEST, -90) }];
const google = { connectionId: "connection" as never, property: "sc-domain:acme-shop.test" };

describe("the pairs added up by number (search-console-streamed-lists-plan.md, SL3)", () => {
  test("the same lists, in the same order with the same figures, as the pairs added up by text — cut weeks asked a day at a time", async () => {
    expect(piecesOf(PERIODS).filter(cutWeek).length).toBeGreaterThan(3);
    const tracked = ["plumber 7"];
    const held = { pruned: false };
    const asked = await longListRows({} as never, google, { searchType: "web", list: "pair", country: undefined }, PERIODS, tracked, undefined, held);
    const before = pairsBefore(PERIODS, tracked, MOST_PAIRS_HELD);
    expect(PERIODS.map((span) => asked?.get(`${span.from}|${span.to}`))).toEqual(before.lists);
    expect(before.lists[0].length).toBeGreaterThan(100);
    expect(held.pruned).toBe(false);
  });

  test.each([1, 2, 3])("past the most held, the same searches let go, the same left in the same order (seed %i)", (seed) => {
    const tracked = ["plumber 7", `plumber ${seed * 11}`];
    // A small most, so searches go many times over the two periods.
    const most = 300 + seed * 40;
    const periods = PERIODS.map(() => new PairSums());
    let pruned = false;
    for (const piece of piecesOf(PERIODS)) {
      if (cutWeek(piece)) continue;
      const week = new PairSums();
      week.addGoogle(answerFor(piece, true));
      if (addPiece(periods, PERIODS, piece, week, new Set(tracked), most)) pruned = true;
    }
    // The same pieces added up by text.
    const sums = PERIODS.map(() => new Map<string, Row>());
    let prunedThen = false;
    for (const piece of piecesOf(PERIODS)) {
      if (cutWeek(piece)) continue;
      PERIODS.forEach((span, which) => {
        if (piece.from >= span.from && piece.to <= span.to) {
          addRowsInto(sums[which], fromGoogle(answerFor(piece, true), true));
          if (prunedBefore(sums[which], new Set(tracked), most)) prunedThen = true;
        }
      });
    }
    expect(pruned).toBe(true);
    expect(pruned).toBe(prunedThen);
    expect(periods.map((period) => period.rows())).toEqual(sums.map((held) => [...held.values()]));
  });

  test("paused near the end of every job and carried on by the next, the same lists as one job, and nothing left saved (SL4)", async () => {
    const tracked = ["plumber 7"];
    const whole = await longListRows({} as never, google, { searchType: "web", list: "pair", country: undefined }, PERIODS, tracked);
    // A job's storage, and a job given no time: each adds one batch of weeks, saves, and hands on.
    const saved = new Map<string, Blob>();
    const ctx = {
      storage: {
        store: async (blob: Blob) => { const id = `saved-${saved.size}-${Math.random()}`; saved.set(id, blob); return id; },
        get: async (id: string) => saved.get(id) ?? null,
        delete: async (id: string) => { saved.delete(id); },
      },
    };
    let carry: PairsCarry | undefined;
    let pauses = 0;
    let carried: Map<string, unknown> | null = null;
    for (;;) {
      try {
        carried = await longListRows(ctx as never, google, { searchType: "web", list: "pair", country: undefined }, PERIODS, tracked, Date.now(), { pruned: false }, carry);
        break;
      } catch (error) {
        if (!(error instanceof PairsPaused)) throw error;
        carry = error.carry;
        pauses += 1;
        // The sums carried in are let go once the next are saved: one saved at a time.
        expect(saved.size).toBe(1);
      }
    }
    expect(pauses).toBeGreaterThanOrEqual(piecesOf(PERIODS).length / 4 - 1);
    expect(carried).toEqual(whole);
    expect(saved.size).toBe(0);
  });

  test("a page list cut for its period is asked a week at a time and added up in order", async () => {
    const span = PERIODS[0];
    const asked = await longListRows({} as never, google, { searchType: "web", list: "page", country: undefined }, [span], []);
    expect(asked?.get(`${span.from}|${span.to}`)).toEqual(addUpRows(piecesOf([span]).map((piece) => fromGoogle(answerFor(piece, false), false))));
  });
});
