import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { INSIGHT_RUN_STAGES } from "./utils/insightRunStages";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
beforeEach(() => useFixedDay());
afterEach(() => vi.useRealTimers());

describe("a company's whole-section refresh", () => {
  test("shows its own run and stages; a second company sharing the website reads none of them", async () => {
    const t = harness();
    const seeded = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("companyWebsites", { companyId: otherCompanyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const user = (companyId: typeof otherCompanyId) => ctx.db.insert("users", { name: "Admin", role: "ADMIN", email: `${companyId}@test.example`, companyId, createdAt: 1 });
      const userId = await user(companyId), otherId = await user(otherCompanyId);
      const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
      const parentRunId = await ctx.db.insert("agentRuns", { agentId, companyId, triggerType: "MANUAL", objective: "Inspect", status: "RUNNING", startedAt: 1, updatedAt: 1 });
      return { companyId, holdId, userId, otherId, parentRunId };
    });
    const runId = (await t.mutation(internal.insightsTeam.startWebsiteRun, { parentRunId: seeded.parentRunId, companyId: seeded.companyId, holdId: seeded.holdId, host: "acme.test", delayMs: 0 }))!;
    await t.mutation(internal.insightsRunSteps.recordStage, { runId, companyId: seeded.companyId, stage: "History", detail: "Complete", failed: false });
    const mine = await t.withIdentity({ subject: seeded.userId }).query(api.insightsReads.sectionRefresh, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ host: "acme.test", status: "QUEUED", recorded: true });
    expect(mine[0].stages).toHaveLength(INSIGHT_RUN_STAGES.length);
    expect(mine[0].stages.find((stage) => stage.stage === "History")?.status).toBe("SUCCESS");
    expect(await t.withIdentity({ subject: seeded.otherId }).query(api.insightsReads.sectionRefresh, {})).toEqual([]);
    await expect(t.withIdentity({ subject: seeded.otherId }).query(api.insightsReads.sectionRefresh, { siteId: seeded.holdId })).rejects.toThrow();
  });
});
