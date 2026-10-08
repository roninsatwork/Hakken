import { describe, expect, test } from "vitest";
import {
  PART_ROWS,
  addUp,
  addUpRows,
  bookPages,
  bookedColumns,
  bySide,
  firstDayKept,
  firstDayKeptFor,
  firstWeekKept,
  fromGoogle,
  monthStart,
  pack,
  packNumbers,
  packedColumns,
  positionOf,
  rowsOf,
  unpackNumbers,
  unpackedPart,
  weekStart,
  type Row,
} from "./searchConsolePacks";

/**
 * Search Console's kept lists, packed (docs/plans/active/search-console-plan.md
 * §14.3): one record a day for a list, parallel arrays, parts of 2,000 rows,
 * position kept weighted by impressions so any span averages as Google does.
 */

const row = (key: string, clicks: number, impressions: number, position: number, page?: string): Row =>
  ({ key, ...(page === undefined ? {} : { page }), clicks, impressions, positionSum: position * impressions });

describe("packing", () => {
  test("Google's rows become rows, a pair's page from its second key, position weighted by impressions", () => {
    expect(fromGoogle([{ keys: ["plumber leeds", "https://acme-shop.test/"], clicks: 3, impressions: 40, position: 2.5 }], true))
      .toEqual([{ key: "plumber leeds", page: "https://acme-shop.test/", clicks: 3, impressions: 40, positionSum: 100 }]);
    expect(fromGoogle([{ keys: ["gbr"], clicks: 1, impressions: 10, position: 4 }], false))
      .toEqual([{ key: "gbr", clicks: 1, impressions: 10, positionSum: 40 }]);
  });

  test("rows pack most clicks first, and read back as they went in", () => {
    const rows = [row("b", 1, 10, 5), row("a", 9, 90, 2), row("c", 1, 20, 7)];
    const [packed, ...more] = pack(rows, false);
    expect(more).toEqual([]);
    expect(packed).toEqual({ keys: ["a", "c", "b"], clicks: [9, 1, 1], impressions: [90, 20, 10], positionSums: [180, 140, 50] });
    expect([...rowsOf(packed)]).toEqual([row("a", 9, 90, 2), row("c", 1, 20, 7), row("b", 1, 10, 5)]);
  });

  test("a long list splits into parts of 2,000 rows, and an empty one is one empty part", () => {
    const rows = Array.from({ length: PART_ROWS * 2 + 1 }, (_, index) => row(`search ${index}`, index, index + 1, 3, "https://acme-shop.test/"));
    const parts = pack(rows, true);
    expect(parts.map((part) => part.keys.length)).toEqual([PART_ROWS, PART_ROWS, 1]);
    expect(parts.every((part) => part.pages?.length === part.keys.length)).toBe(true);
    expect(parts[0].clicks[0]).toBe(PART_ROWS * 2);
    expect(pack([], true)).toEqual([{ keys: [], pages: [], clicks: [], impressions: [], positionSums: [] }]);
  });
});

describe("whole numbers packed as text (keep-less-history-plan.md, part 8)", () => {
  test("numbers read back as they went in: small ones a character each, large ones and not known (−1) too", () => {
    const values = [0, 1, 15, 16, 511, 512, 16_383, 16_384, 2_500_000_000, -1, 7, 0];
    const text = packNumbers(values);
    expect(unpackNumbers(text)).toEqual(values);
    expect(packNumbers([0, 0, 15, 1])).toHaveLength(4);
    expect(packNumbers([16, 511])).toHaveLength(4);
    expect(packNumbers([])).toBe("");
    expect(unpackNumbers("")).toEqual([]);
  });

  test("a position sum is rounded to its whole number of places; anything not a number is refused", () => {
    expect(unpackNumbers(packNumbers([13.000000000000002, 41.99999999]))).toEqual([13, 42]);
    expect(() => packNumbers([Number.NaN])).toThrow();
    expect(() => packNumbers([Number.POSITIVE_INFINITY])).toThrow();
  });

  test("a part's number columns are stored as text and read back as lists; one kept as lists is read as it is", () => {
    const stored = { keys: ["a", "b"], ...packedColumns({ clicks: [3, 0], impressions: [40, 2], positionSums: [120, 18], volumes: [-1, 90] }) };
    expect(stored).toMatchObject({ clicks: expect.any(String), volumes: expect.any(String) });
    expect(stored).not.toHaveProperty("counts");
    expect(unpackedPart(stored)).toEqual({ keys: ["a", "b"], clicks: [3, 0], impressions: [40, 2], positionSums: [120, 18], volumes: [-1, 90] });
    expect([...rowsOf(stored)].map((row) => row.positionSum)).toEqual([120, 18]);
    const asLists = { keys: ["a"], clicks: [1], impressions: [2], positionSums: [3] };
    expect(unpackedPart(asLists)).toEqual(asLists);
  });

  test("a keyword list's top pages and Pages competing's pages are kept once a part, each row its place in the part's book (part 8.2)", () => {
    const home = "https://acme-shop.test/";
    const plumbers = "https://acme-shop.test/plumbers/";
    expect(bookPages([home, plumbers, home, home])).toEqual({ book: [home, plumbers], places: packNumbers([0, 1, 0, 0]) });
    const tops = [home, plumbers, home];
    const booked = bookedColumns({ list: "query", tops });
    expect(booked).toEqual({ tops: expect.any(String), pageBook: [home, plumbers] });
    expect(bookedColumns({ list: "competing", pages: [plumbers, plumbers] })).toMatchObject({ pageBook: [plumbers] });
    // A page list's tops are its top keywords, kept as they are; an empty list has no book.
    expect(bookedColumns({ list: "page", tops: ["plumber leeds"] })).toEqual({});
    // Any list's kinds — a search's intent, a page's type — in their own book (part 8.4).
    const kinds = bookedColumns({ list: "page", kinds: ["CATEGORY", "HOME", "CATEGORY"] });
    expect(kinds).toEqual({ kinds: packNumbers([0, 1, 0]), kindBook: ["CATEGORY", "HOME"] });
    expect(unpackedPart({ keys: ["a", "b", "c"], clicks: [1, 1, 1], impressions: [1, 1, 1], positionSums: [1, 1, 1], ...kinds }).kinds).toEqual(["CATEGORY", "HOME", "CATEGORY"]);
    expect(bookedColumns({ list: "query", tops: [] })).toEqual({});
    const stored = { keys: ["a", "b", "c"], ...packedColumns({ clicks: [1, 1, 1], impressions: [1, 1, 1], positionSums: [1, 1, 1] }), ...booked };
    expect(unpackedPart(stored).tops).toEqual(tops);
    // Addresses kept in full before 2026-10-08 read as they are.
    expect(unpackedPart({ keys: ["a"], clicks: [1], impressions: [1], positionSums: [1], tops: [home] }).tops).toEqual([home]);
  });
});

describe("adding up", () => {
  test("days add up by key, a pair by its search and page together, and the position is Google's own average", () => {
    const monday = pack([row("plumber leeds", 2, 10, 12, "/a"), row("plumber leeds", 1, 10, 3, "/b")], true)[0];
    const tuesday = pack([row("plumber leeds", 4, 30, 14, "/a")], true)[0];
    const summed = addUp([monday, tuesday]);
    expect(summed).toEqual([row("plumber leeds", 6, 40, 13.5, "/a"), row("plumber leeds", 1, 10, 3, "/b")]);
    // (10×12 + 30×14) ÷ 40, not the average of 12 and 14.
    expect(positionOf(summed[0])).toBe(13.5);
    expect(positionOf({ impressions: 0, positionSum: 0 })).toBeNull();
  });

  test("a search's totals come from its pairs, with how many pages and the top one; a page's the other way", () => {
    const pairs = [
      row("plumber leeds", 5, 50, 2, "/plumbers/"),
      row("plumber leeds", 3, 50, 4, "/"),
      row("boiler repair", 1, 10, 9, "/"),
    ];
    expect(bySide(pairs, "query").get("plumber leeds")).toEqual({ key: "plumber leeds", clicks: 8, impressions: 100, positionSum: 300, count: 2, top: "/plumbers/" });
    expect(bySide(pairs, "page").get("/")).toEqual({ key: "/", clicks: 4, impressions: 60, positionSum: 290, count: 2, top: "plumber leeds" });
  });

  test("the top one is the most clicks, then the most impressions", () => {
    const pairs = [row("q", 2, 10, 1, "/few"), row("q", 2, 90, 1, "/many"), row("q", 1, 500, 1, "/most-shown")];
    expect(bySide(pairs, "query").get("q")?.top).toBe("/many");
  });
});

describe("days, weeks and months", () => {
  test("a week starts on its Monday, a month on its first", () => {
    expect(weekStart("2026-09-26")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
    expect(monthStart("2026-09-26")).toBe("2026-09-01");
  });

  test("60 days are kept as days (keep-less-history-plan.md, part 3); a chart's weeks shown as weeks to six months", () => {
    expect(firstDayKept("2026-09-26")).toBe("2026-07-29");
    expect(firstWeekKept("2026-09-26")).toBe("2026-03-27");
  });

  test("every kind of result keeps its 60 days, image search's too", () => {
    for (const kind of ["image", "web", "video"]) expect(firstDayKeptFor(kind, "2026-09-26")).toBe("2026-07-29");
  });

  test("Google's answers for pieces of a period add up by search and page together", () => {
    const row = (key: string, page: string | undefined, clicks: number) => ({ key, ...(page ? { page } : {}), clicks, impressions: clicks * 10, positionSum: clicks * 20 });
    expect(addUpRows([[row("hinges", "/a", 1), row("hinges", "/b", 2)], [row("hinges", "/a", 3)]]))
      .toEqual([row("hinges", "/a", 4), row("hinges", "/b", 2)]);
    expect(addUpRows([[row("/a", undefined, 1)], [row("/a", undefined, 2)]])).toEqual([row("/a", undefined, 3)]);
  });
});
