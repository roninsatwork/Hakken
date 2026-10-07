import { describe, expect, test } from "vitest";
import { shiftDay } from "./searchConsoleDays";
import { piecesOf } from "./searchConsoleLongLists";

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
