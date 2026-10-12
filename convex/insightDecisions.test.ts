import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import type { PageDecision } from "./utils/insightDecisions";

/**
 * Page decisions kept (insightDecisions.ts, phase 4): every page of the
 * website's list decided, kept in parts the screen reads whole, and read only
 * by the company's own people.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Admin", email: "admin@acme-shop.test", role: "ADMIN", companyId, createdAt: 1 });
    const strangerId = await ctx.db.insert("users", { name: "Stranger", email: "someone@rival.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    return { holdId, userId, strangerId };
  });
}

const decision = (at: number): PageDecision => ({
  path: `/page-${String(at).padStart(3, "0")}/`, kind: null, type: "NOT_SORTED", verdict: "KEEP", reason: "QUIET", into: null,
  visits: 0, enquiries: 0, views: null, shown: 0, clicks: 0, domains: null, flags: [],
});

describe("page decisions kept", () => {
  test("every page of the website's list is decided; without Analytics none is called unvisited", async () => {
    const t = harness();
    const { holdId, userId } = await seeded(t);
    await t.run(async (ctx) => {
      for (const page of ["/", "/brand-agency/", "/hub/old-news/"]) {
        await ctx.db.insert("holdPages", { companyWebsiteId: holdId, page, crawled: true, shown: false, clicks: 0, ranks: false });
      }
    });
    expect(await t.action(internal.insightDecisions.decideNow, { holdId })).toEqual({ KEEP: 3, CREATE: 0 });
    const read = await t.withIdentity({ subject: userId }).query(api.insightDecisions.insightsPageDecisions, {});
    expect(read?.decisions.map((row) => [row.path, row.verdict])).toEqual([["/", "KEEP"], ["/brand-agency/", "KEEP"], ["/hub/old-news/", "KEEP"]]);
  });

  test("kept in parts, read back whole in their order, the last run's replaced", async () => {
    const t = harness();
    const { holdId, userId } = await seeded(t);
    const decisions = Array.from({ length: 300 }, (_, at) => decision(at));
    await t.mutation(internal.insightDecisions.saveDecisions, { holdId, decisions, creates: [{ search: "brand strategy agency", from: "GAP", volume: 390, rivals: 2, best: 4 }], pages: 300 });
    await t.mutation(internal.insightDecisions.saveDecisions, { holdId, decisions, creates: [], pages: 300 });
    const parts = await t.run(async (ctx) => await ctx.db.query("insightPageDecisions").take(10));
    expect(parts.map((row) => row.decisions.length)).toEqual([250, 50]);
    const read = await t.withIdentity({ subject: userId }).query(api.insightDecisions.insightsPageDecisions, {});
    expect(read?.decisions).toHaveLength(300);
    expect(read?.decisions.at(-1)?.path).toBe("/page-299/");
    expect(read?.creates).toEqual([]);
  });

  test("another company reads none of them", async () => {
    const t = harness();
    const { holdId, strangerId } = await seeded(t);
    await t.mutation(internal.insightDecisions.saveDecisions, { holdId, decisions: [decision(1)], creates: [], pages: 1 });
    expect(await t.withIdentity({ subject: strangerId }).query(api.insightDecisions.insightsPageDecisions, {})).toBeNull();
    await expect(t.withIdentity({ subject: strangerId }).query(api.insightDecisions.insightsPageDecisions, { siteId: holdId })).rejects.toThrow();
  });
});
