import { describe, expect, test } from "vitest";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  normalizeSearchTerm,
  pageSlots,
  paginateItems,
} from "./pagination";

describe("numbered footer pages", () => {
  test("shows every page when they all fit", () => {
    expect(pageSlots(1, 1)).toEqual([1]);
    expect(pageSlots(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("keeps the first and last pages and the ones beside the current page", () => {
    expect(pageSlots(1, 31)).toEqual([1, 2, 3, 4, 5, "gap", 31]);
    expect(pageSlots(10, 31)).toEqual([1, "gap", 9, 10, 11, "gap", 31]);
    expect(pageSlots(31, 31)).toEqual([1, "gap", 27, 28, 29, 30, 31]);
  });

  test("never lets a gap stand for a single page", () => {
    expect(pageSlots(4, 31)).toEqual([1, 2, 3, 4, 5, "gap", 31]);
    expect(pageSlots(5, 31)).toEqual([1, "gap", 4, 5, 6, "gap", 31]);
    expect(pageSlots(28, 31)).toEqual([1, "gap", 27, 28, 29, 30, 31]);
    expect(pageSlots(8, 8)).toEqual([1, "gap", 4, 5, 6, 7, 8]);
  });

  test("always holds seven places once there are more pages than that", () => {
    for (let total = 8; total <= 40; total += 1) {
      for (let page = 1; page <= total; page += 1) {
        const slots = pageSlots(page, total);
        expect(slots).toHaveLength(7);
        expect(slots).toContain(page);
        expect(slots[0]).toBe(1);
        expect(slots.at(-1)).toBe(total);
      }
    }
  });

  test("reads a page outside the list as its nearest end", () => {
    expect(pageSlots(0, 31)).toEqual(pageSlots(1, 31));
    expect(pageSlots(99, 31)).toEqual(pageSlots(31, 31));
    expect(pageSlots(1, 0)).toEqual([1]);
  });
});

describe("admin pagination helpers", () => {
  test("normalizes search terms consistently", () => {
    expect(normalizeSearchTerm("  Alpha Team  ")).toBe("alpha team");
  });

  test("matches search terms across nullable row values", () => {
    expect(matchesSearchTerm("ron", ["Ronins", undefined, null])).toBe(true);
    expect(matchesSearchTerm("missing", ["Ronins", undefined, null])).toBe(false);
    expect(matchesSearchTerm("   ", ["Ronins"])).toBe(true);
  });

  test("paginates admin rows with safe page bounds", () => {
    const rows = Array.from({ length: TABLE_PAGE_SIZE + 2 }, (_, index) => index + 1);

    expect(paginateItems(rows, 1).items).toEqual(rows.slice(0, TABLE_PAGE_SIZE));
    expect(paginateItems(rows, 2).items).toEqual(rows.slice(TABLE_PAGE_SIZE));
    expect(paginateItems(rows, 99).page).toBe(2);
    expect(paginateItems([], 1).totalPages).toBe(1);
  });
});
