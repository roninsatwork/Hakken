import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Collection pipeline's Collecting now (docs/plans/active/
 * collection-progress-plan.md): what each collection is doing, how far it has
 * got, what is out and for how long, and the one thing that needs a person —
 * read for a super admin alone.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seed(t: Harness, options: { sending: boolean; ceilingReached?: boolean }) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const owner = await ctx.db.insert("users", { email: "owner@example.com", name: "Anthony Basker", role: "SUPER_ADMIN" });
    const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
    const admin = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId: acme });
    const collector = await ctx.db.insert("agents", {
      name: "Collector", modelId: "test-model", thinkingMode: false, isActive: true, systemKey: "DATAFORSEO_COLLECTOR",
      ...(options.ceilingReached ? { maxDailyCostUsd: 10 } : {}), createdAt: now, updatedAt: now,
    } as never);
    await ctx.db.insert("agentRuns", {
      agentId: collector, triggerType: "MANUAL", objective: "send", title: "Collect now — Acme",
      status: options.sending ? "RUNNING" : "SUCCESS", costUsd: options.ceilingReached ? 12 : 1, startedAt: now, updatedAt: now,
    } as never);
    const planner = await ctx.db.insert("agentRuns", {
      agentId: collector, triggerType: "MANUAL", objective: "plan", title: "Collect now — Acme", status: "SUCCESS",
      userId: owner, startedAt: now, updatedAt: now,
    } as never);
    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId: acme, agentRunId: planner, trigger: "MANUAL", status: "SENDING", plannedCount: 6, reusedCount: 1,
      sentCount: 3, readyCount: 2, failedCount: 0, totalCostUsd: 1.62, startedAt: now - 60_000,
    });
    const pull = (fields: { operationId: string; status: "PENDING" | "CLAIMED" | "SUBMITTED" | "READY"; mode?: "LIVE" | "QUEUED"; target?: string; ago?: number }) =>
      ctx.db.insert("seoDataPulls", {
        operationId: fields.operationId, family: "Backlinks", mode: fields.mode ?? "QUEUED", taskArgsJson: "{}", status: fields.status,
        tag: `tag-${Math.random()}`, dueAt: now, attempts: 0, costUsd: 0, sandbox: false, submittedAt: now - (fields.ago ?? 0), cycleId,
        ...(fields.target ? { target: fields.target } : {}),
      });
    await pull({ operationId: "backlinks_summary", status: "READY" });
    await pull({ operationId: "backlinks_list", status: "READY" });
    await pull({ operationId: "site_crawl", status: "SUBMITTED", target: "a.com", ago: 16 * 60_000 });
    await pull({ operationId: "backlinks_summary", status: "CLAIMED", target: "b.com" });
    await pull({ operationId: "ai_citation_chatgpt", status: "PENDING", mode: "LIVE" });
    await pull({ operationId: "backlinks_all", status: "PENDING", target: "c.com" });
    await ctx.db.insert("creditCharges", {
      companyId: acme, entry: "charge", state: "open", at: now, kind: "backlinks", how: "byHand", units: 2002, lines: 2, failedUnits: 0,
      price: { credits: 10, per: 1000 }, creditsOut: 0, creditsIn: 0, paidFrom: [], owed: 0, realCostUsd: 0.4, reusedValueUsd: 0,
      runKey: `cycle:${cycleId}:x:backlinks`, cycleId, createdAt: now,
    });
    return { owner, admin, cycleId };
  });
}

const read = (t: Harness, user: Id<"users">, show: "IN_PROGRESS" | "FINISHED_TODAY" | "EVERYTHING" = "IN_PROGRESS") =>
  t.withIdentity({ subject: user }).query(api.seoCollectionProgress.listCollectionsNow, { show });

describe("Collecting now", () => {
  test("says what a collection is sending, what is out and for how long, and what it will count", async () => {
    const t = harness();
    const { owner, cycleId } = await seed(t, { sending: true });

    const now = await read(t, owner);

    expect(now.headline).toMatchObject({ kind: "SENDING", sendingFor: "Acme", collections: 1, downloads: 0 });
    expect(now.rows).toHaveLength(1);
    const [row] = now.rows;
    expect(row).toMatchObject({
      key: cycleId, companyName: "Acme", how: "COLLECT_NOW", startedBy: "Anthony Basker", state: "SENDING",
      back: 2, out: 1, toSend: 3, planned: 6, reused: 1, costUsd: 1.62, credits: 21, creditsCounted: false,
      sending: { host: "b.com", operationId: "backlinks_summary" },
    });
    expect(row.outGroups).toMatchObject([{ operationId: "site_crawl", count: 1, hosts: ["a.com"] }]);
    expect(Date.now() - row.outGroups[0].since).toBeGreaterThanOrEqual(16 * 60_000);
    // One live request at a few seconds, and a queued hundred in one request.
    expect(row.sendSecondsLeft).toBe(Math.round(1.6 * 1 + 3 * 1));
  });

  test("names what needs a person — today's ceiling — and nothing else waits", async () => {
    const t = harness();
    const { owner } = await seed(t, { sending: false, ceilingReached: true });

    const now = await read(t, owner);

    expect(now.headline.kind).toBe("NEEDS_YOU");
    expect(now.rows[0].state).toBe("NEEDS_YOU");
    expect(now.headline.needsYou).toBe(
      "Stopped: today's $10.00 limit for all collecting is reached ($12.00 spent). The rest waits and goes after midnight, "
      + "or as soon as the limit is raised on the Collector's Settings.",
    );
  });

  test("a finished collection is today's, not in progress", async () => {
    const t = harness();
    const { owner, cycleId } = await seed(t, { sending: false });
    await t.run(async (ctx) => { await ctx.db.patch(cycleId, { status: "DONE", finishedAt: Date.now() }); });

    expect((await read(t, owner)).rows).toEqual([]);
    expect((await read(t, owner, "FINISHED_TODAY")).rows).toMatchObject([{ key: cycleId, state: "DONE" }]);
  });

  test("is a super admin's alone", async () => {
    const t = harness();
    const { admin } = await seed(t, { sending: true });

    await expect(read(t, admin)).rejects.toThrow();
  });
});
