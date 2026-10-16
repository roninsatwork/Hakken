import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { emptyTotals, type ClarityTotalsRow } from "./utils/clarityRows";
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
  [...new Set((await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", holdId)).collect()).map((record) => `${record.span} ${record.key}`))].sort());

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
    const byPage = await asOwner.query(api.clarity.clarityFigures, { siteId: holdId, by: "PAGE", days: 30 });
    expect(byPage).toMatchObject({ from: "2026-10-14", to: "2026-10-15", days: 2 });
    expect(byPage.rows.map((row) => [row.key, row.sessions, row.scroll])).toEqual([["/", 90, 30], ["/ai-agency/", 9, 30]]);
    expect(byPage.rows[1]).toMatchObject({ quickBack: 44.4 });
    const byPageDevice = await asOwner.query(api.clarity.clarityFigures, { siteId: holdId, by: "PAGE_DEVICE", days: 30 });
    expect(byPageDevice.rows.map((row) => row.key)).toEqual(["/|PC", "/|Mobile", "/ai-agency/|Mobile"]);
    // The website's visits are by people: the six bots are counted apart.
    const byDevice = await asOwner.query(api.clarity.clarityFigures, { siteId: holdId, by: "DEVICE", days: 7 });
    expect(byDevice.rows.map((row) => [row.key, row.sessions])).toEqual([["PC", 83], ["Mobile", 19]]);
    expect(byDevice.byDay.map((day) => [day.day, day.sessions])).toEqual([["2026-10-14", 61], ["2026-10-15", 41]]);
    // The list of websites says what Overview says, from the same totals.
    const sites = await asOwner.query(api.clarity.claritySites, {});
    expect(sites).toEqual([expect.objectContaining({ sessions: 102, scroll: 30 })]);
  });

  test("a day saved again replaces itself; days past 90 go, their month stays; months past 13 go", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await keepDay(t, holdId, "2026-06-30", [page("/", "PC", 5)], [device("PC", 5)]);
    await keepDay(t, holdId, "2026-06-30", [page("/", "PC", 8)], [device("PC", 8)]);
    expect((await spans(t, holdId)).filter((span) => span.startsWith("DAY"))).toEqual(["DAY 2026-06-30"]);
    // A month from more than 13 months before, as an old one would be.
    await t.run(async (ctx) => {
      const day = (await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "DAY")).first())!;
      await ctx.db.insert("clarityFigures", { companyWebsiteId: holdId, span: "MONTH", key: "2025-08", part: 0, from: "2025-08-01", to: "2025-08-31", days: 31, pages: day.pages, site: day.site, builtAt: 1 });
    });
    await keepDay(t, holdId, "2026-10-15", [page("/", "PC", 3)], [device("PC", 3)]);
    const kept = await spans(t, holdId);
    expect(kept).toContain("MONTH 2026-06");
    expect(kept).not.toContain("DAY 2026-06-30");
    expect(kept).not.toContain("MONTH 2025-08");
    expect(kept).toContain("DAY 2026-10-15");
    // June's month was worked out while its day was kept, and is not redone from what is left.
    const june = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "MONTH").eq("key", "2026-06")).first());
    expect(june?.days).toBe(1);
  });

  test("a period keeps the website's figures apart, and pages beyond one record's rows in further parts, read back whole", async () => {
    const t = harness();
    const { userId, holdId } = await seed(t);
    const many = Array.from({ length: 4_100 }, (_, at) => page(`/products/item-${at}/`, "PC", 1 + (at % 3)));
    await keepDay(t, holdId, "2026-10-15", many, [device("PC", 9_000)]);
    const parts = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "LAST_30")).collect());
    // The website's figures on their own, then 4,000 pages and 100.
    expect(parts.sort((a, b) => a.part - b.part).map((part) => [part.part, part.pages.deviceBook.length > 0])).toEqual([[0, false], [1, true], [2, true]]);
    const figures = await t.withIdentity({ subject: userId }).query(api.clarity.clarityFigures, { siteId: holdId, by: "PAGE", days: 30 });
    expect(figures.rows).toHaveLength(4_100);
  });

  test("the records kept before are turned into days: by device carried over, the pages filed as \"/\" dropped", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch((await ctx.db.query("clarityConnections").first())!._id, { newestDay: "2026-10-15" });
      const row = (key: string, sessions: number, scroll: number | null) => ({ key, sessions, scroll, activeSeconds: 52, dead: 0, rage: 0, quickBack: 10, excessiveScroll: 0 });
      await ctx.db.insert("clarityDays", { companyWebsiteId: holdId, day: "2026-10-15", by: "DEVICE", rows: [row("PC", 44, 30.8), row("Tablet", 4, 22.6)], createdAt: 1 });
      await ctx.db.insert("clarityDays", { companyWebsiteId: holdId, day: "2026-10-15", by: "PAGE", rows: [row("/", 51, 9)], createdAt: 1 });
      await ctx.db.insert("clarityDays", { companyWebsiteId: holdId, day: "2026-10-11", by: "DEVICE", rows: [], createdAt: 1 });
    });
    expect(await t.mutation(internal.clarity.convertOldDays, {})).toEqual({ converted: 2, more: false });
    await finishScheduled(t);
    expect(await t.run(async (ctx) => (await ctx.db.query("clarityDays").collect()).length)).toBe(0);
    const period = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "LAST_7")).first());
    // The day Clarity was connected and counted nobody is kept, and not counted as a day it recorded.
    expect(period).toMatchObject({ from: "2026-10-11", to: "2026-10-15", days: 1 });
  });
});
