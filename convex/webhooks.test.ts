import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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
      actorId: "actor-1",
      startedBy: userId,
      companyId,
    });

    await t.mutation(internal.webhooks.updateRunStatus, { runId: "run-1", status: "SUCCEEDED" });
    let run = await t.run(async (ctx) =>
      ctx.db.query("apifyRuns").withIndex("by_runId", (q) => q.eq("runId", "run-1")).unique()
    );
    expect(run).toMatchObject({
      runId: "run-1",
      actorId: "actor-1",
      startedBy: userId,
      companyId,
      status: "COMPLETED",
    });
    expect(run?.completedAt).toEqual(expect.any(Number));

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
        actorId: "actor-1",
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
});
