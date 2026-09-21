import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
describe("Apify webhook persistence", () => {
  test("records run starts and maps terminal webhook statuses onto Apify runs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      return { userId, companyId };
    });

    await t.mutation(internal.webhooks.recordRunStart, {
      runId: "run-1",
      actorId: "generic-actor",
      startedBy: userId,
      companyId,
    });

    await t.mutation(internal.webhooks.updateRunStatus, { runId: "run-1", status: "SUCCEEDED" });
    let run = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-1")).unique()
    );
    expect(run).toMatchObject({
      runId: "run-1",
      actorId: "generic-actor",
      startedBy: userId,
      companyId,
      status: "COMPLETED",
    });
    expect(run?.completedAt).toEqual(expect.any(Number));

    // A job started through the generic Apify tool is not a property scrape.
    // Its items are a shape nobody here has seen, so the run is recorded as
    // finished and nothing is written into the properties table — a fabricated
    // property is indistinguishable from a real one.
    await t.mutation(internal.webhooks.recordRunStart, {
      runId: "run-other",
      actorId: "somebody-elses-scraper",
      startedBy: userId,
      companyId,
    });
    await t.mutation(internal.webhooks.storeRightmoveData, {
      runId: "run-other",
      status: "SUCCEEDED",
      items: [JSON.stringify({ id: "x1", address: "Not a property", price: 1 })],
    });
    const otherRun = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-other")).unique()
    );
    expect(otherRun).toMatchObject({ status: "COMPLETED", propertiesScraped: 0 });


    await t.mutation(internal.webhooks.updateRunStatus, { runId: "run-1", status: "RUNNING" });
    run = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-1")).unique()
    );
    expect(run).toMatchObject({ status: "PENDING" });
    expect(run?.completedAt).toBeUndefined();

    await t.mutation(internal.webhooks.updateRunStatus, { runId: "run-1", status: "TIMED-OUT" });
    run = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-1")).unique()
    );
    expect(run).toMatchObject({ status: "FAILED" });
    expect(run?.completedAt).toEqual(expect.any(Number));

    await expect(
      t.mutation(internal.webhooks.updateRunStatus, { runId: "missing", status: "SUCCEEDED" })
    ).resolves.toBeNull();
  });

});

/**
 * The secret proves who is calling. It says nothing about how much they intend
 * to send, and this handler used to read whatever arrived before it could
 * object — the public API and the workflow webhook both learned to cap first.
 */
describe("Apify webhook request body limits", () => {
  const secret = "apify-webhook-secret";
  const oversized = "x".repeat(128 * 1024 + 1);

  const post = (t: ReturnType<typeof convexTest>, body: string, headers: Record<string, string> = {}) =>
    t.fetch("/apify-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-apify-secret": secret, ...headers },
      body,
    });

  beforeEach(() => {
    vi.stubEnv("APIFY_WEBHOOK_SECRET", secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("turns away an oversized payload without acting on it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const response = await post(t, oversized);

    expect(response.status).toBe(413);
    expect(await t.run(async (ctx) => ctx.db.query("apifyRuns").collect())).toEqual([]);
  });

  test("still refuses an oversized payload that arrives without the secret", async () => {
    // The secret is checked first, so a stranger never reaches the reader at all.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const response = await post(t, oversized, { "x-apify-secret": "wrong" });

    expect(response.status).toBe(401);
  });

  test("lets an ordinary payload through", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const startedBy = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN" })
    );
    await t.mutation(internal.webhooks.recordRunStart, {
      runId: "run-capped",
      actorId: "generic-actor",
      startedBy,
    });

    const response = await post(t, JSON.stringify({ runId: "run-capped", status: "FAILED" }));

    expect(response.status).toBe(200);
    const run = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-capped")).unique()
    );
    expect(run?.status).toBe("FAILED");
  });
});
