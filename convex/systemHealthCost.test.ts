import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The high-cost agent check counts AI model spend only (Anthony, 2026-10-09):
 * the data the Collector buys and X's reads are the platform's work, capped
 * by each agent's own run limit, and read as a "high-cost agent" every week.
 */
function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function seedAgent(t: ReturnType<typeof setup>, name: string, spend: Array<{ providerKey: string; costUsd: number }>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const agentId: Id<"agents"> = await ctx.db.insert("agents", {
      name,
      modelId: "model-test",
      thinkingMode: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    for (const [index, row] of spend.entries()) {
      await ctx.db.insert("agentTransactions", {
        agentId,
        actionContext: row.providerKey === "google" ? "Writing a summary" : `${row.providerKey}:purchase`,
        modelUsed: row.providerKey === "google" ? "model-test" : row.providerKey,
        providerKey: row.providerKey,
        inputTokens: row.providerKey === "google" ? 1000 : 0,
        outputTokens: row.providerKey === "google" ? 100 : 0,
        costUsd: row.costUsd,
        status: "SUCCESS",
        createdAt: now - 60_000 - index,
      });
    }
    return agentId;
  });
}

describe("health: high-cost agents", () => {
  test("data bought and X's reads are left out; AI model spend over the line is reported alone", async () => {
    const t = setup();
    await seedAgent(t, "Collector", [
      { providerKey: "dataforseo", costUsd: 22.5 },
      { providerKey: "dataforseo", costUsd: 11.74 },
      { providerKey: "x", costUsd: 3 },
      { providerKey: "google", costUsd: 0.2 },
    ]);
    await seedAgent(t, "Writer", [
      { providerKey: "google", costUsd: 6.5 },
      { providerKey: "dataforseo", costUsd: 20 },
    ]);

    const health = await t.query(internal.systemHealth.getSystemHealth, { daysBack: 7 });

    expect(health.operations.highCostAgents.count).toBe(1);
    expect(health.operations.highCostAgents.examples[0]).toMatchObject({
      summary: "$6.50 of AI model spend across 1 call",
      targetName: "Writer",
    });
  });
});
