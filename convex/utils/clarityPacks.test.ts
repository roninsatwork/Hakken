import { describe, expect, test } from "vitest";
import { emptyTotals, type ClarityTotalsRow } from "./clarityRows";
import { addUpBy, packDaily, packTotals, unpackDaily, unpackTotals } from "./clarityPacks";

/**
 * Clarity's figures packed (agents-and-clarity-plan.md, Part 0): each record's
 * own books of pages and devices, its figures as packed columns, and back
 * again exactly.
 */

const row = (page: string | null, device: string, visits: number, extra: Partial<ClarityTotalsRow> = {}): ClarityTotalsRow => ({ ...emptyTotals(), page, device, visits, scrollSum: visits * 250, ...extra });

describe("Clarity's packs", () => {
  test("pages on devices come back exactly as they went in, each address kept once", () => {
    const rows = [row("/", "PC", 120, { bots: 4, dead: 3 }), row("/", "Mobile", 30), row("/ai-agency/", "PC", 7, { errors: 1 })];
    const pack = packTotals(rows);
    expect(pack.pageBook).toEqual(["/", "/ai-agency/"]);
    expect(pack.deviceBook).toEqual(["PC", "Mobile"]);
    expect(typeof pack.figures.visits).toBe("string");
    expect(unpackTotals(pack)).toEqual(rows);
  });

  test("rows across the website keep no page book; an empty list packs to an empty one", () => {
    const pack = packTotals([row(null, "PC", 180, { bots: 20 }), row(null, "Other", 0, { bots: 8 })]);
    expect(pack.pageBook).toBeUndefined();
    expect(unpackTotals(pack).map((entry) => [entry.page, entry.device, entry.visits, entry.bots])).toEqual([[null, "PC", 180, 20], [null, "Other", 0, 8]]);
    expect(unpackTotals(packTotals([]))).toEqual([]);
  });

  test("a period's days come back in order, and pages add up across their devices", () => {
    const days = [{ day: "2026-10-14", totals: { ...emptyTotals(), visits: 61 } }, { day: "2026-10-15", totals: { ...emptyTotals(), visits: 48, errors: 2 } }];
    expect(unpackDaily(packDaily(days))).toEqual(days);
    const byPage = addUpBy([row("/", "PC", 120), row("/", "Mobile", 30), row("/ai-agency/", "PC", 7)], (entry) => entry.page ?? "");
    expect(byPage.get("/")?.visits).toBe(150);
    expect(byPage.get("/")?.scrollSum).toBe(150 * 250);
  });
});
