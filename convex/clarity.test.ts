import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { emptyTotals, type ClarityTotalsRow } from "./utils/clarityRows";
import { packTotals } from "./utils/clarityPacks";
import { pageParts, readPageRows } from "./clarity";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Clarity's figures kept (agents-and-clarity-plan.md, Part 0): one packed record
 * a day, its month and the 7, 30 and 90 days worked out from the days, the
 * screens reading those, what is past keeping cleared, and the records kept
 * before turned into days of the new kind.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const page = (path: string, device: string, visits: number, extra: Partial<ClarityTotalsRow> = {}): ClarityTotalsRow => ({ ...emptyTotals(), page: path, device, visits, scrollSum: visits * 300, activeSum: visits * 40, ...extra });
const device = (name: string, visits: number, extra: Partial<ClarityTotalsRow> = {}): ClarityTotalsRow => ({ ...emptyTotals(), page: null, device: name, visits, scrollSum: visits * 300, activeSum: visits * 40, ...extra });

async function seed(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const userId = await ctx.db.insert("users", { email: "owner@ronins.test", role: "ADMIN", companyId });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("clarityConnections", { companyId, companyWebsiteId: holdId, status: "CONNECTED", tokenCiphertext: "x", createdAt: 1, updatedAt: 1 });
    return { userId, holdId };
  });
}

async function keepDay(t: ReturnType<typeof harness>, holdId: Id<"companyWebsites">, day: string, pages: ClarityTotalsRow[], site: ClarityTotalsRow[]) {
  await t.mutation(internal.clarity.saveDay, { holdId, day, pages, site, problem: null, refused: false });
  await finishScheduled(t);
}

const spans = async (t: ReturnType<typeof harness>, holdId: Id<"companyWebsites">) => await t.run(async (ctx) =>
  [...new Set((await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId)).collect()).map((record) => [record.span, record.kind, record.key].filter(Boolean).join(" ")))].sort());

describe("Clarity's figures, kept", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test("a day kept as one record, its month and three periods worked out, and every screen reading the same totals", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    await keepDay(t, holdId, "2026-10-14", [page("/", "PC", 50, { dead: 5 }), page("/ai-agency/", "Mobile", 9, { quickBack: 4, errors: 2 })], [device("PC", 52, { bots: 6 }), device("Mobile", 9)]);
    await keepDay(t, holdId, "2026-10-15", [page("/", "PC", 30), page("/", "Mobile", 10)], [device("PC", 31), device("Mobile", 10)]);
    expect(await spans(t, holdId)).toEqual(["DAY 2026-10-14", "DAY 2026-10-15", "LAST_30 2026-10-15", "LAST_7 2026-10-15", "LAST_90 2026-10-15", "MONTH 2026-10"]);

    const asOwner = t.withIdentity({ subject: userId });
    const byPage = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, days: 30, page: 1, rows: 25 });
    expect(byPage.period.now).toEqual({ from: "2026-10-14", to: "2026-10-15", days: 2 });
    expect(byPage.rows.map((row) => [row.page, row.now.visits, row.now.scroll])).toEqual([["/", 90, 30], ["/ai-agency/", 9, 30]]);
    expect(byPage.rows[1].now.shares).toMatchObject({ quickBack: 44.4 });
    const onPhones = await asOwner.query(api.clarityScreens.clarityPagesList, { siteId: holdId, days: 30, device: "Mobile", page: 1, rows: 25 });
    expect(onPhones.rows.map((row) => [row.page, row.now.visits])).toEqual([["/", 10], ["/ai-agency/", 9]]);
    // The website's visits are by people: the six bots are counted apart.
    const overview = await asOwner.query(api.clarityScreens.clarityOverview, { siteId: holdId, days: 7 });
    expect(overview.devices.map((row) => [row.name, row.now.visits])).toEqual([["PC", 83], ["Mobile", 19]]);
    expect(overview.now).toMatchObject({ visits: 102, bots: 6 });
    expect(overview.byDay.map((day) => [day.day, day.visits])).toEqual([["2026-10-14", 61], ["2026-10-15", 41]]);
    // The list of websites says what Overview says, from the same totals.
    const sites = await asOwner.query(api.clarity.claritySites, {});
    expect(sites).toEqual([expect.objectContaining({ sessions: 102, scroll: 30 })]);
  });

  test("a day saved again replaces itself; days past 180 go — their sources and browsers past 90 — their month stays; months past 13 go", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await keepDay(t, holdId, "2026-04-10", [page("/", "PC", 5)], [device("PC", 5)]);
    await keepDay(t, holdId, "2026-04-10", [page("/", "PC", 8)], [device("PC", 8)]);
    expect((await spans(t, holdId)).filter((span) => span.startsWith("DAY"))).toEqual(["DAY 2026-04-10"]);
    // A month from more than 13 months before, as an old one would be.
    await t.run(async (ctx) => {
      const day = (await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY")).first())!;
      await ctx.db.insert("clarityFigures", { companyWebsiteId: holdId, span: "MONTH", key: "2025-08", part: 0, from: "2025-08-01", to: "2025-08-31", days: 31, pages: day.pages, site: day.site, builtAt: 1 });
    });
    // Sources and browsers by day are kept the 90 days a screen shows; the day's own figures 180.
    await t.mutation(internal.clarity.saveDay, { holdId, day: "2026-07-01", pages: [page("/", "PC", 2)], site: [device("PC", 2)], sources: { site: [device("PC", 2, { split: "google" })], pages: [] }, problem: null, refused: false });
    await finishScheduled(t);
    await keepDay(t, holdId, "2026-10-15", [page("/", "PC", 3)], [device("PC", 3)]);
    const kept = await spans(t, holdId);
    expect(kept).toContain("DAY 2026-07-01");
    expect(kept).not.toContain("DAY SOURCES 2026-07-01");
    expect(kept).toContain("MONTH 2026-04");
    expect(kept).not.toContain("DAY 2026-04-10");
    expect(kept).not.toContain("MONTH 2025-08");
    expect(kept).toContain("DAY 2026-10-15");
    // April's month was worked out while its day was kept, and is not redone from what is left.
    const april = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "MONTH").eq("kind", undefined).eq("key", "2026-04")).first());
    expect(april?.days).toBe(1);
  });

  test("a period keeps the website's figures apart, and pages beyond one record's rows in further parts, read back whole", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    const many = Array.from({ length: 4_100 }, (_, at) => page(`/products/item-${at}/`, "PC", 1 + (at % 3)));
    await keepDay(t, holdId, "2026-10-15", many, [device("PC", 9_000)]);
    const parts = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "LAST_30")).collect());
    // The website's figures on their own, then 4,000 pages and 100.
    expect(parts.sort((a, b) => a.part - b.part).map((part) => [part.part, part.pages.deviceBook.length > 0])).toEqual([[0, false], [1, true], [2, true]]);
    const figures = await t.withIdentity({ subject: userId }).query(api.clarityScreens.clarityPagesList, { siteId: holdId, days: 30, page: 1, rows: 25 });
    expect(figures.total).toBe(4_100);
  });

  test("pages kept in the pages' order, in parts that never cut one page's rows in two, and one page read from its part alone", async () => {
    const rows = ["/b/", "/a/", "/c/", "/a/", "/b/", "/b/"].map((path, at) => page(path, at % 2 ? "Mobile" : "PC", 1 + at));
    const parts = pageParts(rows, 2);
    expect(parts.map((part) => part.map((row) => row.page))).toEqual([["/a/", "/a/"], ["/b/", "/b/", "/b/"], ["/c/"]]);

    const t = harness();
    const { holdId } = await seed(t);
    await keepDay(t, holdId, "2026-10-15", Array.from({ length: 600 }, (_, at) => page(`/p-${String(at).padStart(3, "0")}/`, "PC", 1)), [device("PC", 600)]);
    const dayParts = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY").eq("kind", undefined).eq("key", "2026-10-15")).collect());
    expect(dayParts.map((part) => [part.part, part.firstPage ?? null])).toEqual([[0, null], [1, "/p-000/"], [2, "/p-250/"], [3, "/p-500/"]]);
    expect(await t.run(async (ctx) => (await readPageRows(ctx, holdId, "DAY", undefined, "2026-10-15", "/p-321/")).map((row) => row.page))).toEqual(["/p-321/"]);
    expect(await t.run(async (ctx) => await readPageRows(ctx, holdId, "DAY", undefined, "2026-10-15", "/missing/"))).toEqual([]);

    // A day kept whole before 2026-10-16 is read the same way.
    await t.run(async (ctx) => await ctx.db.insert("clarityFigures", { companyWebsiteId: holdId, span: "DAY", key: "2026-10-01", part: 0, from: "2026-10-01", to: "2026-10-01", days: 1, pages: packTotals([page("/old/", "PC", 4), page("/older/", "PC", 2)]), site: packTotals([device("PC", 6)]), builtAt: 1 }));
    expect(await t.run(async (ctx) => (await readPageRows(ctx, holdId, "DAY", undefined, "2026-10-01", "/old/")).map((row) => [row.page, row.visits]))).toEqual([["/old/", 4]]);
  });
});
