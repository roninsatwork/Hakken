import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { useFixedDay } from "@/src/test/realTime";
import type { ReportBody } from "./utils/insightSummary";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
beforeEach(() => useFixedDay("2026-10-26"));
afterEach(() => vi.useRealTimers());
const body: ReportBody = { headline: "A report", summary: "Saved evidence", points: [], next: [], risks: [], opportunities: [], decision: null, facts: [{ key: "ga.visits.90.now", label: "Visits", value: 99, unit: "count" }], scorecard: [], findings: [], did: [], enquiriesByMonth: [], shareByMonth: [] };

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme.test", displayHost: "acme.test", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    return { holdId, companyId };
  });
}

describe("reports in a whole-section rerun", () => {
  test("scheduled work remains due-only; a manual refresh selects the latest reports with their exact dates and evidence", async () => {
    const t = harness(), site = await seeded(t);
    await t.mutation(internal.insightsTeam.saveReport, { ...site, kind: "MONTHLY", period: "2026-08", from: "2026-08-01", to: "2026-08-31", title: "Archived August", body });
    await t.mutation(internal.insightsTeam.saveReport, { ...site, kind: "MONTHLY", period: "2026-09", from: "2026-09-01", to: "2026-09-30", title: "September", body });
    await t.mutation(internal.insightsTeam.saveReport, { ...site, kind: "BOARD", period: "2026-Q4", from: "2026-07-15", to: "2026-10-12", title: "Board", body });
    expect(await t.query(internal.insightsTeam.reportTargetsForRun, { holdId: site.holdId, today: "2026-10-26" })).toEqual({ month: null, board: null });
    const targets = await t.query(internal.insightsTeam.reportTargetsForRun, { holdId: site.holdId, today: "2026-10-26", refreshLatest: true });
    expect(targets.month).toEqual({ period: "2026-09", from: "2026-09-01", to: "2026-09-30", previous: body });
    expect(targets.board).toEqual({ period: "2026-Q4", from: "2026-07-15", to: "2026-10-12", previous: body });
    await t.mutation(internal.insightsTeam.saveReport, { ...site, kind: "MONTHLY", period: "2026-09", from: "2026-09-01", to: "2026-09-30", title: "September replaced", body });
    const reports = await t.run(async (ctx) => await ctx.db.query("insightReports").collect());
    expect(reports.map((row) => row.title)).toEqual(expect.arrayContaining(["Archived August", "September replaced", "Board"]));
    expect(reports).toHaveLength(3);
  });

  test("a cancelled run cannot replace a saved report", async () => {
    const t = harness(), site = await seeded(t);
    const report = { ...site, kind: "MONTHLY" as const, period: "2026-09", from: "2026-09-01", to: "2026-09-30", title: "September", body };
    await t.mutation(internal.insightsTeam.saveReport, report);
    const runId = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
      return await ctx.db.insert("agentRuns", { agentId, companyId: site.companyId, triggerType: "EVENT", objective: "Inspect", status: "FAILED", startedAt: 1, updatedAt: 1 });
    });
    await expect(t.mutation(internal.insightsTeam.saveReport, { ...report, title: "Old worker", runId })).rejects.toThrow("run stopped");
    await expect(t.mutation(internal.insightsDrafts.saveDrafts, { ...site, runId, week: "2026-10-26", origin: "https://acme.test", drafts: [] })).rejects.toThrow("run stopped");
    await expect(t.mutation(internal.insightsPanel.savePanel, { ...site, runId, questions: [] })).rejects.toThrow("run stopped");
    await expect(t.mutation(internal.insightsPanel.syncPanel, { holdId: site.holdId, runId })).rejects.toThrow("run stopped");
    expect((await t.run(async (ctx) => await ctx.db.query("insightReports").first()))?.title).toBe("September");
  });
  test("an incomplete replacement preserves the completed week while independently completed measurement is saved", async () => {
    const t = harness(), site = await seeded(t);
    const runs = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
      const make = () => ctx.db.insert("agentRuns", { agentId, companyId: site.companyId, triggerType: "EVENT", objective: "Inspect", status: "RUNNING", startedAt: 1, updatedAt: 1 });
      return [await make(), await make()];
    });
    const week = { ...site, week: "2026-10-26", verdict: "Completed earlier", sources: [], problems: [], findings: [], costUsd: 0 };
    await t.mutation(internal.insightsTeam.saveWeek, { ...week, runId: runs[0] });
    await t.mutation(internal.insightsTeam.saveWeek, { ...week, runId: runs[1], verdict: "Incomplete replacement", analysisComplete: false, measurement: { checks: [], byDay: [] } });
    const saved = await t.run(async (ctx) => ({ week: await ctx.db.query("insightWeeks").first(), measurement: await ctx.db.query("insightMeasurements").first() }));
    expect(saved.week).toMatchObject({ runId: runs[0], verdict: "Completed earlier" });
    expect(saved.measurement).toMatchObject({ companyWebsiteId: site.holdId, week: "2026-10-26" });
  });

});
