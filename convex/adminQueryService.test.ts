import { describe, expect, test } from "vitest";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";

describe("admin query service", () => {
  test("normalizes search terms", () => {
    expect(normalizeSearchTerm("  Model ")).toBe("model");
    expect(normalizeSearchTerm("   ")).toBeNull();
    expect(normalizeSearchTerm()).toBeNull();
  });

  test("checks optional text values against a normalized term", () => {
    expect(includesSearchTerm("Gemini Flash", "flash")).toBe(true);
    expect(includesSearchTerm(undefined, "flash")).toBe(false);
  });

  test("paginates arrays with a configurable minimum page count", () => {
    expect(paginateItems([1, 2, 3], 2, 2)).toEqual({ data: [3], totalCount: 3, totalPages: 2 });
    expect(paginateItems([], 1, 15)).toEqual({ data: [], totalCount: 0, totalPages: 1 });
    expect(paginateItems([], 1, 15, { minTotalPages: 0 })).toEqual({ data: [], totalCount: 0, totalPages: 0 });
  });
});
