import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
// template:remove:start properties
import { RIGHTMOVE_ACTOR_ID } from "./apifyActors";

// template:remove:end
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
    // template:remove:start properties
    const strays = await t.run(async (ctx) =>
      ctx.db.query("properties").filter((q) => q.eq(q.field("runId"), "run-other")).collect()
    );
    expect(strays).toHaveLength(0);
    // template:remove:end


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

// template:remove:start properties
  test("stores Rightmove data as idempotent company-scoped property records", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      await ctx.db.insert("apifyRuns", {
        runId: "run-2",
        actorId: RIGHTMOVE_ACTOR_ID,
        status: "PENDING",
        startedBy: userId,
        companyId,
        startedAt: Date.now(),
      });
      return { userId, companyId };
    });

    const item = {
      id: 123,
      displayAddress: "1 Webhook Street",
      price: "£425,000",
      images: [{ url: "https://example.com/image.jpg" }, { bad: true }],
      floorplans: [{ url: "https://example.com/floorplan.jpg" }],
      epc: { rating: "B" },
      coordinates: { latitude: 51.5, longitude: -0.1 },
      agent: { name: "Agent Co", phone: "020 0000 0000" },
      features: ["Garden"],
    };

    await t.mutation(internal.webhooks.storeRightmoveData, {
      runId: "run-2",
      status: "SUCCEEDED",
      items: [JSON.stringify(item)],
    });
    await t.mutation(internal.webhooks.storeRightmoveData, {
      runId: "run-2",
      status: "SUCCEEDED",
      items: [JSON.stringify({ ...item, price: 450000, summary: "Updated description" })],
    });

    const { run, properties } = await t.run(async (ctx) => ({
      run: await ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-2")).unique(),
      properties: await ctx.db.query("properties").withIndex("by_company", (q) => q.eq("companyId", companyId)).collect(),
    }));

    expect(userId).toBeDefined();
    expect(run).toMatchObject({
      status: "COMPLETED",
      propertiesScraped: 1,
    });
    expect(properties).toHaveLength(1);
    expect(properties[0]).toMatchObject({
      runId: "run-2",
      rightmoveId: "123",
      address: "1 Webhook Street",
      price: 450000,
      companyId,
      imageUrl: "https://example.com/image.jpg",
      floorplans: ["https://example.com/floorplan.jpg"],
      epcRating: "B",
      agentName: "Agent Co",
      description: "Updated description",
    });
    await expect(
      t.mutation(internal.webhooks.storeRightmoveData, {
        runId: "missing",
        status: "SUCCEEDED",
        items: [],
      })
    ).rejects.toThrow("Run not found");
  });
// template:remove:end
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
