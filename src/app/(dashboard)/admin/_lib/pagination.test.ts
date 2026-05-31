import { describe, expect, test } from "vitest";
import {
  ADMIN_PAGE_SIZE,
  matchesAdminSearchTerm,
  normalizeAdminSearchTerm,
  paginateAdminItems,
} from "./pagination";

describe("admin pagination helpers", () => {
  test("normalizes search terms consistently", () => {
    expect(normalizeAdminSearchTerm("  Alpha Team  ")).toBe("alpha team");
  });

  test("matches search terms across nullable row values", () => {
    expect(matchesAdminSearchTerm("ron", ["Ronins", undefined, null])).toBe(true);
    expect(matchesAdminSearchTerm("missing", ["Ronins", undefined, null])).toBe(false);
    expect(matchesAdminSearchTerm("   ", ["Ronins"])).toBe(true);
  });

  test("paginates admin rows with safe page bounds", () => {
    const rows = Array.from({ length: ADMIN_PAGE_SIZE + 2 }, (_, index) => index + 1);

    expect(paginateAdminItems(rows, 1).items).toEqual(rows.slice(0, ADMIN_PAGE_SIZE));
    expect(paginateAdminItems(rows, 2).items).toEqual(rows.slice(ADMIN_PAGE_SIZE));
    expect(paginateAdminItems(rows, 99).page).toBe(2);
    expect(paginateAdminItems([], 1).totalPages).toBe(1);
  });
});
