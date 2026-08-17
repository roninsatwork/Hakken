import { describe, expect, test } from "vitest";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  normalizeSearchTerm,
  paginateItems,
} from "./pagination";

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
