import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * The screens' boxes kept (insightBoxes.ts): the week's replace the last, a
 * screen not written this week keeps none, and only the company's own people
 * read them.
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
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Anthony", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: 1 });
    const strangerId = await ctx.db.insert("users", { name: "Stranger", email: "someone@rival.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    return { holdId, userId, strangerId };
  });
}

describe("the screens' boxes kept", () => {
  test("the week's replace the last; a screen not written keeps none; another company reads none", async () => {
    const t = harness();
    const { holdId, userId, strangerId } = await seeded(t);
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-05", boxes: [
      { screen: "AI_SEARCH", says: ["Named 4 times."], role: "INSIGHTS_AI_VISIBILITY" },
      { screen: "LEADERBOARDS", says: ["Third of five."], role: "INSIGHTS_MARKET" },
    ] });
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-12", boxes: [{ screen: "AI_SEARCH", says: ["Named 12 times."], role: "INSIGHTS_AI_VISIBILITY" }] });
    const me = t.withIdentity({ subject: userId });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH" })).toEqual({ says: ["Named 12 times."], role: "INSIGHTS_AI_VISIBILITY", week: "2026-10-12", period: null });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "LEADERBOARDS" })).toBeNull();
    expect(await t.withIdentity({ subject: strangerId }).query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH" })).toBeNull();
    await expect(t.withIdentity({ subject: strangerId }).query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH", siteId: holdId })).rejects.toThrow();
  });
});
