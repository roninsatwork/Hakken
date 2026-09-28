import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { FAN_OUT_LIMITS, readFanOutLimits } from "./fanOutLimits";

/**
 * The fan-out limits, set on screen (Anthony, 2026-09-28: "i think we need
 * configs in the UI for test"): a company's own, a website's over them, and
 * Hakken's defaults under both — and the code reading them.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const DAY = "2026-09-27";
const QUESTION = "What is the best line for carp fishing?";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { name: "Anthony", email: `a-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now() }));
  return t.withIdentity({ subject: userId });
}

async function site(t: Harness, relationship: "OWNED" | "TRACKED" = "OWNED") {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const websiteId = await ctx.db.insert("websites", { host: "korda.example", displayHost: "korda.example", firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship, createdAt: Date.now() });
    return { companyId, websiteId, holdId };
  });
}

describe("the fan-out limits", () => {
  test("a website's own, else its company's, else Hakken's default", async () => {
    const t = harness();
    const { companyId, holdId } = await site(t);
    const admin = await superAdmin(t);

    expect(await t.run(async (ctx) => await readFanOutLimits(ctx, companyId, holdId))).toMatchObject({
      searchesPerEngine: FAN_OUT_LIMITS.searchesPerEngine.fallback,
      anglesShown: 1_000,
      companyRowsRead: 5_000,
    });

    await admin.mutation(api.fanOutLimits.setCompanyFanOutLimits, { companyId, limits: { anglesShown: 500, companyRowsRead: 1_000 } });
    await admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: holdId, limits: { anglesShown: 2_000 } });
    const read = await t.run(async (ctx) => ({
      site: await readFanOutLimits(ctx, companyId, holdId),
      company: await readFanOutLimits(ctx, companyId),
    }));
    expect(read.site).toMatchObject({ anglesShown: 2_000, companyRowsRead: 1_000, consoleDays: 28 });
    expect(read.company).toMatchObject({ anglesShown: 500 });

    // Back to following: the website keeps no row of its own.
    await admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: holdId, limits: { anglesShown: null } });
    expect((await t.run(async (ctx) => await readFanOutLimits(ctx, companyId, holdId))).anglesShown).toBe(500);
    expect(await t.run(async (ctx) => await ctx.db.query("fanOutLimits").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).unique())).toBeNull();

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((row) => row.actionType === "FAN_OUT_LIMITS_CHANGED"));
    expect(audits).toHaveLength(3);
  });

  test("only the listed choices, and a company-wide limit only on the company", async () => {
    const t = harness();
    const { companyId, holdId } = await site(t);
    const admin = await superAdmin(t);
    await expect(admin.mutation(api.fanOutLimits.setCompanyFanOutLimits, { companyId, limits: { anglesShown: 999 } })).rejects.toThrow();
    await expect(admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: holdId, limits: { purchasesPerCollection: 5_000 } })).rejects.toThrow();
    const competitor = await site(t, "TRACKED");
    await expect(admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: competitor.holdId, limits: { anglesShown: 500 } })).rejects.toThrow();
    // A competitor asks no prompts of its own, so its Limits offer none of these.
    expect((await admin.query(api.platformLimits.getSiteLimits, { companyWebsiteId: competitor.holdId }))?.keys).not.toContain("anglesShown");
  });

  test("the rebuild keeps as many wordings per angle as the website chose", async () => {
    const t = harness();
    const { websiteId, holdId } = await site(t);
    const admin = await superAdmin(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", { websiteId, companyWebsiteId: holdId, prompt: QUESTION, engines: ["claude"], isActive: true, createdAt: Date.now() });
      const pullId = await ctx.db.insert("seoDataPulls", {
        operationId: "ai_citation_claude", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
        status: "READY", tag: "t-1", attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
      } as never);
      // Seven wordings of one angle: the same words in other orders.
      const words = ["best", "carp", "fishing", "line"];
      const orders = [[0, 1, 2, 3], [1, 2, 3, 0], [2, 3, 0, 1], [3, 0, 1, 2], [0, 2, 1, 3], [1, 3, 0, 2], [2, 0, 3, 1]];
      for (const [index, order] of orders.entries()) {
        const query = order.map((at) => words[at]).join(" ");
        await ctx.db.insert("promptFanOutQueries", {
          prompt: QUESTION, engine: "claude", query, queryText: query, timesSeen: 10 - index,
          firstSeenAt: Date.now(), lastSeenAt: Date.now(), lastSeenDay: DAY, lastPullId: pullId,
        });
      }
    });
    await admin.mutation(api.fanOutLimits.setSiteFanOutLimits, { companyWebsiteId: holdId, limits: { wordingsPerAngle: 5 } });

    await t.mutation(internal.fanOutAngles.rebuildHoldAngles, { holdId: holdId as Id<"companyWebsites"> });
    await finishScheduled(t);

    const angles = await t.run(async (ctx) => await ctx.db.query("fanOutAngles").withIndex("by_hold_seen", (q) => q.eq("holdId", holdId)).collect());
    expect(angles).toHaveLength(1);
    expect(angles[0].wordings.map((wording) => wording.timesSeen)).toEqual([10, 9, 8, 7, 6]);
  });
});
