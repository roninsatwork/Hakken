import { describe, expect, test } from "vitest";
import { chartFigures, keptIn, type Kept } from "./searchConsolePeriods";
import { ListStream, PairStream, spanKey, type Span } from "./searchConsoleKeptSums";
import { shiftDay } from "./searchConsoleDays";
import { addUp, bySide, firstDayKeptFor, type Packed } from "./utils/searchConsolePacks";

/**
 * The web lists built as a stream give what the build gave from the days held
 * whole (search-console-streamed-lists-plan.md, SL6): the same rows, in the
 * same order, for every period; the same chart figures and volatility; the
 * same fan-out and volatility-day keywords. Built both ways from the same
 * days — with ties, empty days, gaps and brand searches — and compared whole.
 */

const NEWEST = "2026-10-14";
const OLDEST = "2025-06-11";

/** A small generator, the same every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** 90 days of kept pairs, oldest first as they are read: some days empty, some missing, a few split in two parts. */
function keptDays(seed: number): Kept[] {
  const next = random(seed);
  const kept: Kept[] = [];
  for (let back = 89; back >= 0; back -= 1) {
    const day = shiftDay(NEWEST, -back);
    if (back % 23 === 7) continue; // a day never collected
    const rows = back % 31 === 4 ? 0 : 20 + Math.floor(next() * 60);
    const parts = back % 11 === 0 ? 2 : 1;
    for (let part = 0; part < parts; part += 1) {
      const packed: Packed = { keys: [], pages: [], clicks: [], impressions: [], positionSums: [] };
      for (let at = 0; at < rows; at += 1) {
        const keyword = Math.floor(next() * 40);
        packed.keys.push(keyword % 9 === 0 ? `acme brand ${keyword}` : `plumber ${keyword}`);
        packed.pages!.push(`https://acme-shop.test/p${Math.floor(next() * 6)}`);
        const impressions = Math.floor(next() * 30);
        packed.impressions.push(impressions);
        // Ties on purpose: a keyword's pages often have the same clicks and impressions.
        packed.clicks.push(Math.floor(next() * 3));
        packed.positionSums.push(impressions * (1 + Math.floor(next() * 30)));
      }
      kept.push({ grain: "DAY", start: day, packed });
    }
  }
  return kept;
}

const spans: Span[] = [
  { from: shiftDay(NEWEST, -6), to: NEWEST },
  { from: shiftDay(NEWEST, -13), to: shiftDay(NEWEST, -7) },
  { from: shiftDay(NEWEST, -29), to: NEWEST },
  { from: shiftDay(NEWEST, -59), to: shiftDay(NEWEST, -30) },
];
const fanOut: Span[] = [{ from: shiftDay(NEWEST, -13), to: NEWEST }, { from: shiftDay(NEWEST, -27), to: NEWEST }];

function streamed(kept: readonly Kept[], chartWeeks = 13) {
  const stream = new PairStream({ newest: NEWEST, oldest: OLDEST, pairSpans: spans, keywordSpans: fanOut, chart: { chartWeeks, brandWords: ["acme"], dayLine: firstDayKeptFor("web", NEWEST) } });
  for (const record of kept) stream.add(record.start, record.packed);
  stream.finish();
  return stream;
}

describe("the pairs added up as they are read (SL1, SL6)", () => {
  test.each([1, 2, 3])("every period's pairs, in the same order, with the same top page among equals (seed %i)", (seed) => {
    const kept = keptDays(seed);
    const stream = streamed(kept);
    for (const span of spans) {
      const whole = addUp(keptIn(kept, span, NEWEST, "web"));
      const rows = stream.pairs.get(spanKey(span))!.rows();
      expect(rows).toEqual(whole);
      expect([...bySide(rows, "query")]).toEqual([...bySide(whole, "query")]);
      expect([...bySide(rows, "page")]).toEqual([...bySide(whole, "page")]);
    }
  });

  test.each([1, 2, 3])("the charts' days, weeks and months, with their volatility (seed %i)", (seed) => {
    const kept = keptDays(seed);
    expect(streamed(kept).weeks()).toEqual(chartFigures(kept, NEWEST, OLDEST, ["acme"], 13, "web"));
    // A first collection's charts, reaching back past the 60 days kept to the 90 read.
    expect(streamed(kept, 26).weeks()).toEqual(chartFigures(kept, NEWEST, OLDEST, ["acme"], 26, "web"));
  });

  test("the fan-out's days and the volatility day's keywords", () => {
    const kept = keptDays(4);
    const stream = streamed(kept);
    const keywords = (span: Span) => [...bySide(addUp(keptIn(kept, span, NEWEST, "web")), "query").values()]
      .map((summed) => ({ key: summed.key, clicks: summed.clicks, impressions: summed.impressions, positionSum: summed.positionSum }));
    for (const span of fanOut) expect([...stream.keywords.get(spanKey(span))!.summed()]).toEqual(keywords(span));
    for (const day of [NEWEST, shiftDay(NEWEST, -1), shiftDay(NEWEST, -6)]) {
      expect([...stream.recentKeywords(day)!.summed()]).toEqual(keywords({ from: day, to: day }));
    }
    // Only the last week's days are held to the end.
    expect(stream.recentKeywords(shiftDay(NEWEST, -20))).toBeUndefined();
  });

  test("a website with no kept days at all: empty periods and zero charts, as before", () => {
    const stream = streamed([]);
    for (const span of spans) expect(stream.pairs.get(spanKey(span))!.rows()).toEqual([]);
    expect(stream.weeks()).toEqual(chartFigures([], NEWEST, OLDEST, ["acme"], 13, "web"));
  });
});

describe("the other lists added up as they are read", () => {
  test("a page list's periods, in the same order", () => {
    const kept = keptDays(5).map((record) => ({ ...record, packed: { ...record.packed, keys: record.packed.pages!, pages: undefined } }));
    const stream = new ListStream(spans);
    for (const record of kept) stream.add(record.start, record.packed);
    for (const span of spans) expect(stream.sums.get(spanKey(span))!.rows()).toEqual(addUp(keptIn(kept, span, NEWEST, "web")));
    expect(new Set(stream.keys.texts)).toEqual(new Set(kept.flatMap((record) => record.packed.keys)));
  });
});
