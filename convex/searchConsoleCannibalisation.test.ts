import { describe, expect, test } from "vitest";
import { keywordPagesOf } from "./searchConsoleCannibalisation";

/** Keyword cannibalisation's chart: one keyword's pages each day, as Google answers them (20 November 2026). */
describe("a keyword's pages each day", () => {
  const SITE = "https://acme-shop.test";
  test("its pages by the rule, the most shown first, and the days Google swapped them", () => {
    const answer = keywordPagesOf([
      { day: "2026-10-01", page: `${SITE}/`, clicks: 5, impressions: 90, position: 2 },
      { day: "2026-10-01", page: `${SITE}/a`, clicks: 1, impressions: 30, position: 7 },
      { day: "2026-10-01", page: `${SITE}/b`, clicks: 0, impressions: 10, position: 12 },
      { day: "2026-10-02", page: `${SITE}/a`, clicks: 0, impressions: 10, position: 8 },
      { day: "2026-10-02", page: `${SITE}/b#fit`, clicks: 0, impressions: 20, position: 11 },
      { day: "2026-10-03", page: `${SITE}/a`, clicks: 2, impressions: 40, position: 6 },
      { day: "2026-10-03", page: `${SITE}/c`, clicks: 0, impressions: 2, position: 40 },
    ]);
    expect(answer.ok).toBe(true);
    // The home page left out; /b's section link folded in; /c under 1 in 10 of the 112 impressions doesn't count.
    expect(answer.pages.map((page) => [page.page, page.impressions, page.counted])).toEqual([
      [`${SITE}/a`, 80, true], [`${SITE}/b`, 30, true], [`${SITE}/c`, 2, false],
    ]);
    expect(answer.pages[0].position).toBeCloseTo((30 * 7 + 10 * 8 + 40 * 6) / 80);
    // /a, then /b, then /a: two swaps over three days.
    expect(answer).toMatchObject({ swaps: 2, days: 3 });
  });
});
