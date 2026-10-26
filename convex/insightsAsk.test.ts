import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { ask } from "./insightsAsk";
import { internal } from "./_generated/api";
import { useFixedDay } from "@/src/test/realTime";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (original) => ({ ...(await original<typeof import("./aiProviderRegistry")>()), generateTextWithResolvedModel: generate }));
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => { useFixedDay(); generate.mockReset(); });
afterEach(() => vi.useRealTimers());

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const agentId = await ctx.db.insert("agents", { name: "Insights", modelId: "test", thinkingMode: false, isActive: true, createdAt: 1, updatedAt: 1 });
    const runId = await ctx.db.insert("agentRuns", { agentId, companyId, triggerType: "EVENT", objective: "Inspect", status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now() });
    return { runId, companyId, host: "acme.test" };
  });
}

describe("Insights answers on continuation", () => {
  test("reuses the complete answer without a second model call or charge; changed instructions ask again", async () => {
    const t = harness(), run = await seeded(t);
    const answer = { text: "x".repeat(10_000) };
    generate.mockResolvedValue({ text: JSON.stringify(answer), inputTokens: 10, outputTokens: 20 });
    const read = (system = "Use saved evidence") => t.action(async (ctx) => await ask(ctx, run, undefined, "review", system, "the pages"));
    expect(await read()).toEqual(answer);
    expect(await read()).toEqual(answer);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await t.action(async (ctx) => await ask(ctx, run, undefined, "review", "Use saved evidence", "the pages", undefined, undefined, true))).toEqual(answer);
    await expect(t.action(async (ctx) => await ask(ctx, run, undefined, "review", "Use saved evidence", "different inputs", undefined, undefined, true))).rejects.toThrow("prepared answer");
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await t.run(async (ctx) => await ctx.db.query("agentTransactions").collect()))).toHaveLength(1);
    expect(await read("Changed instructions")).toEqual(answer);
    expect(generate).toHaveBeenCalledTimes(2);
    const logs = await t.run(async (ctx) => await ctx.db.query("agentLogs").collect());
    expect(logs[0].responseContent).toHaveLength(8_000);
    expect(logs[0].completeResponse).toBe(JSON.stringify(answer));
    const otherId = await t.run(async (ctx) => await ctx.db.insert("companies", { name: "Other", createdAt: 1 }));
    await expect(t.query(internal.insightsRunSteps.modelAnswer, { runId: run.runId, companyId: otherId, requestKey: logs[0].requestKey! })).rejects.toThrow("another company");
  });

  test("invalid review answers are recorded, retried once and then stop asking", async () => {
    const t = harness(), run = await seeded(t);
    generate.mockResolvedValue({ text: '{"pages":[]}' });
    const accepts = (answer: unknown) => answer !== null && typeof answer === "object" && "complete" in answer;
    const read = () => t.action(async (ctx) => await ask(ctx, run, undefined, "reviews", "rules", "pages", 180_000, accepts));
    await expect(read()).rejects.toThrow("complete valid answer");
    await expect(read()).rejects.toThrow("complete valid answer");
    await expect(read()).rejects.toThrow("Two recorded attempts failed");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test("unreadable JSON fails even when the caller has no additional shape check; a valid empty draft list succeeds", async () => {
    const t = harness(), run = await seeded(t);
    generate.mockResolvedValueOnce({ text: "No JSON answer" }).mockResolvedValueOnce({ text: '{"drafts":[]}' });
    const read = () => t.action(async (ctx) => await ask(ctx, run, undefined, "drafts", "rules", "profiles"));
    await expect(read()).rejects.toThrow("complete valid answer");
    expect(await read()).toEqual({ drafts: [] });
    expect(await read()).toEqual({ drafts: [] });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
