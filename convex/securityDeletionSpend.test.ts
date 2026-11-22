import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { spentToday } from "./seoCollectionLimits";
import { useFixedDay } from "@/src/test/realTime";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-11-01"));
afterEach(() => vi.useRealTimers());

describe("deleted company and collector boundaries", () => {
  test("counts charges made today on a run started yesterday", async () => {
    const t = harness();
    const agentId = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: "Collector", modelId: "test", thinkingMode: false, isActive: true,
        systemKey: "DATAFORSEO_COLLECTOR", createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.insert("agentRuns", {
        agentId, triggerType: "MANUAL", objective: "collect", status: "RUNNING",
        startedAt: Date.now() - 24 * 60 * 60 * 1000, updatedAt: Date.now(), costUsd: 7,
      });
      await ctx.db.insert("agentTransactions", {
        agentId, actionContext: "dataforseo:serp_google_organic", modelUsed: "serp_google_organic",
        providerKey: "dataforseo", inputTokens: 0, outputTokens: 0, costUsd: 7,
        status: "SUCCESS", createdAt: Date.now(),
      });
      return agentId;
    });
    expect(await t.run(async (ctx) => spentToday(ctx, agentId))).toBe(7);
  });

  test("a deleted company loses site reads before cleanup jobs run", async () => {
    const t = harness();
    const { companyId, userId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Gone", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { email: "gone@example.com", role: "USER", companyId });
      const websiteId = await ctx.db.insert("websites", { host: "gone.example", displayHost: "gone.example", firstSeenAt: Date.now() });
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", createdAt: Date.now() });
      return { companyId, userId };
    });
    const member = t.withIdentity({ subject: userId });
    expect((await member.query(api.sites.listPickerHolds, {})).length).toBe(1);
    await t.run(async (ctx) => ctx.db.delete(companyId));
    await expect(member.query(api.sites.listPickerHolds, {})).rejects.toThrow();
  });

  test("a queued company run stops when its company is deleted", async () => {
    const t = harness();
    const { companyId, runId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Gone", createdAt: Date.now() });
      const agentId = await ctx.db.insert("agents", {
        name: "Company agent", companyId, modelId: "test", thinkingMode: false,
        isActive: true, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId, companyId, triggerType: "MANUAL", objective: "work", status: "QUEUED",
        startedAt: Date.now(), updatedAt: Date.now(),
      });
      return { companyId, runId };
    });
    expect(await t.query(internal.agentRuns.getRunExecutionStateInternal, { runId })).not.toBeNull();
    await t.run(async (ctx) => ctx.db.delete(companyId));
    expect(await t.query(internal.agentRuns.getRunExecutionStateInternal, { runId })).toBeNull();
  });
});
