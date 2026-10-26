import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { emptyRow, packList, slotKey } from "./googleAnalyticsLists";
import { useFixedDay } from "@/src/test/realTime";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => useFixedDay("2026-10-26"));
afterEach(() => vi.useRealTimers());

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: holdId, websiteId, status: "CONNECTED", property: "properties/acme",
      events: [{ eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 }],
      createdAt: 1, updatedAt: 1,
    });
    const slots = [];
    for (const which of ["NOW", "YEAR"] as const) {
      const key = slotKey("landing", "365", which, "");
      const entries: Array<[string, number, number]> = which === "NOW"
        ? [["/existing/", 100, 5], ["/restored/", 20, 2], ["/new/", 10, 1]]
        : [["/existing/", 80, 4], ["/vanished/", 25, 6], ["/quiet/", 2, 0]];
      const slotId = await ctx.db.insert("googleAnalyticsPeriodSlots", {
        companyWebsiteId: holdId, key, slot: 1, parts: entries.length, hash: `${which}-one`,
        from: which === "NOW" ? "2025-10-26" : "2024-10-26", to: which === "NOW" ? "2026-10-25" : "2025-10-25", builtAt: 1,
      });
      slots.push(slotId);
      for (const [part, [page, visits, enquiries]] of entries.entries()) {
        const row = emptyRow(`https://acme.test${page}`);
        row.visits = visits;
        row.counts.set("generate_lead", enquiries);
        await ctx.db.insert("googleAnalyticsPeriods", {
          companyWebsiteId: holdId, key, slot: 1, part, ...packList("landing", [row], ["generate_lead"])[0],
        });
      }
    }
    await ctx.db.insert("insightChanges", {
      companyId, companyWebsiteId: holdId, week: "2026-10-19", kind: "REMOVED", from: "/restored/", to: null,
      before: 3, after: 0, result: "LOST", seenIn: "analytics", createdAt: 1,
    });
    return { holdId, slots };
  });
}

describe("annual page changes in bounded reads", () => {
  test("compares every stored part and restores live pages without treating quiet pages as removals", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    expect(await t.action(internal.insightsReading.pageChangesInternal, { holdId })).toEqual({
      changes: [{ kind: "REMOVED", from: "/vanished/", to: null, before: 6, after: 0, result: "LOST" }],
      notRemoved: ["/restored/"],
    });
  });

  test("rejects a changed build instead of mixing its parts", async () => {
    const t = harness();
    const { holdId, slots } = await seed(t);
    await t.run(async (ctx) => await ctx.db.patch(slots[0], { hash: "NOW-two" }));
    await expect(t.query(internal.insightsReading.pageYearPart, { holdId, which: "NOW", part: 1, slot: 1, hash: "NOW-one" }))
      .rejects.toThrow("Analytics changed");
  });

  test("does not turn an incomplete stored list into false page removals", async () => {
    const t = harness();
    const { holdId } = await seed(t);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("googleAnalyticsPeriods")
        .withIndex("by_hold_key_slot_part", (q) => q.eq("companyWebsiteId", holdId).eq("key", slotKey("landing", "365", "NOW", "")).eq("slot", 1).eq("part", 1)).first();
      await ctx.db.delete(row!._id);
    });
    await expect(t.action(internal.insightsReading.pageChangesInternal, { holdId })).rejects.toThrow("incomplete");
  });
});
