import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ASSISTANT_PAGE_CHART_HANDLERS } from "./assistantPageChartHandlers";
import schema from "./schema";

/**
 * Ask Hakken redraws a chart from the page its conversation started on (ask-hakken-every-chart-page-plan-2026-11-03.md,
 * shared work 9): the run finds its conversation, the conversation its page's charts, and only a conversation of the
 * run's own company is read.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

const CHANNELS = { title: "Visits by channel", columns: ["Channel", "Visits", "Visits before"], rows: [["Organic Search", 4000, 3900], ["Referral", 1640, 1000], ["Direct", 1200, 2000]] };

async function seed(t: Harness, charts: Array<typeof CHANNELS> | undefined) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Someone else", createdAt: now });
    const agentId = await ctx.db.insert("agents", { name: "Hakken", modelId: "model-test", thinkingMode: false, isActive: true, createdAt: now, updatedAt: now });
    const threadId = await ctx.db.insert("threads", {
      companyId, agentId, createdAt: now, updatedAt: now,
      startedOn: { path: "/app/analytics/s1/channels", about: "Channels", dates: "lastMonth", findings: [], said: [], ...(charts ? { charts } : {}) },
    });
    const runId = await ctx.db.insert("agentRuns", { agentId, companyId, threadId, triggerType: "CHAT", objective: "Answer", status: "RUNNING", startedAt: now, updatedAt: now });
    return { companyId, otherCompanyId, runId };
  });
}

function runtime(t: Harness): ToolHandlerExecutionInput["ctx"] {
  type Call = (reference: unknown, args: unknown) => Promise<unknown>;
  const loose = t as unknown as { query: Call; mutation: Call; action: Call };
  return {
    runQuery: (reference: unknown, args: unknown) => loose.query(reference, args),
    runMutation: (reference: unknown, args: unknown) => loose.mutation(reference, args),
    runAction: (reference: unknown, args: unknown) => loose.action(reference, args),
  } as unknown as ToolHandlerExecutionInput["ctx"];
}

const redraw = (t: Harness, companyId: Id<"companies">, runId: Id<"agentRuns">, args: Record<string, unknown>) =>
  ASSISTANT_PAGE_CHART_HANDLERS["assistant.pageChart"]({ ctx: runtime(t), handlerMapping: "assistant.pageChart", args, companyId, runId }) as Promise<{ ok: boolean; problem?: string; chart?: { kind: string; groups: unknown[]; link: string } }>;

describe("a chart from the page, redrawn by Ask Hakken", () => {
  test("by its number, as a pie of the page's own figures, linked back to the page", async () => {
    const t = harness();
    const { companyId, runId } = await seed(t, [CHANNELS]);
    const drawn = await redraw(t, companyId, runId, { chart: 1, kind: "pie" });
    expect(drawn).toMatchObject({ ok: true, chart: { kind: "pie", link: "/app/analytics/s1/channels", groups: [{ name: "Organic Search", value: 4000 }, { name: "Referral", value: 1640 }, { name: "Direct", value: 1200 }] } });
  });

  test("a chart the page doesn't have, a page with none, and another company's conversation say so", async () => {
    const t = harness();
    const { companyId, otherCompanyId, runId } = await seed(t, [CHANNELS]);
    expect(await redraw(t, companyId, runId, { chart: 4 })).toMatchObject({ ok: false, problem: expect.stringContaining("1. Visits by channel") });
    expect(await redraw(t, otherCompanyId, runId, { chart: 1 })).toMatchObject({ ok: false, problem: expect.stringContaining("didn't start from a page with charts") });
    const none = harness();
    const bare = await seed(none, undefined);
    expect(await redraw(none, bare.companyId, bare.runId, { chart: 1 })).toMatchObject({ ok: false });
  });
});
