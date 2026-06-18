import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Webhook delivery logs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("admins list only visible tenant deliveries while super admins see platform deliveries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, adminBId, superAdminId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { companyAId, companyBId, adminAId, adminBId, superAdminId };
    });

    const now = Date.now();
    const deliveryAId = await t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId: companyAId,
      eventType: "agent.run.completed",
      destinationUrl: "https://example.com/a",
      sourceType: "agentRun",
      sourceId: "run_a",
      requestBodyPreview: JSON.stringify({ runId: "run_a", status: "SUCCESS" }),
      now,
    });
    await t.mutation(internal.webhookDeliveries.recordAttemptInternal, {
      deliveryId: deliveryAId,
      status: "SUCCESS",
      statusCode: 200,
      responseBodyPreview: "ok",
      now: now + 100,
    });
    const deliveryBId = await t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId: companyBId,
      eventType: "agent.run.failed",
      destinationUrl: "https://example.com/b",
      sourceType: "agentRun",
      sourceId: "run_b",
      now: now + 200,
    });
    await t.mutation(internal.webhookDeliveries.recordAttemptInternal, {
      deliveryId: deliveryBId,
      status: "RETRY_SCHEDULED",
      statusCode: 503,
      error: "Service unavailable",
      nextAttemptAt: now + 1_000,
      now: now + 300,
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const adminAList = await adminAClient.query(api.webhookDeliveries.list, { paginationOpts });
    expect(adminAList.page.map((delivery) => delivery._id)).toEqual([deliveryAId]);
    expect(adminAList.page[0]).toMatchObject({
      companyName: "Company A",
      eventType: "agent.run.completed",
      status: "SUCCESS",
      attemptCount: 1,
      deliveredAt: now + 100,
    });

    const adminBRetryList = await adminBClient.query(api.webhookDeliveries.list, {
      status: "RETRY_SCHEDULED",
      paginationOpts,
    });
    expect(adminBRetryList.page.map((delivery) => delivery._id)).toEqual([deliveryBId]);

    await expect(adminBClient.query(api.webhookDeliveries.list, {
      companyId: companyAId,
      paginationOpts,
    })).rejects.toThrow("Unauthorized");

    const superAdminList = await superAdminClient.query(api.webhookDeliveries.list, { paginationOpts });
    expect(superAdminList.page.map((delivery) => delivery._id)).toEqual([deliveryBId, deliveryAId]);

    const adminSummary = await adminAClient.query(api.webhookDeliveries.getSummary, { lookbackDays: 90 });
    expect(adminSummary).toMatchObject({
      scope: "company",
      total: 1,
      statusCounts: {
        SUCCESS: 1,
        RETRY_SCHEDULED: 0,
      },
      successRate: 1,
    });

    const platformSummary = await superAdminClient.query(api.webhookDeliveries.getSummary, { lookbackDays: 90 });
    expect(platformSummary.total).toBe(2);
    expect(platformSummary.statusCounts.SUCCESS).toBe(1);
    expect(platformSummary.statusCounts.RETRY_SCHEDULED).toBe(1);
  });

  test("delivery recording validates destination, retry windows, and preview truncation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() })
    );

    await expect(t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId,
      eventType: "agent.run.completed",
      destinationUrl: "ftp://example.com/hook",
    })).rejects.toThrow("Webhook destination URL must be valid");

    const deliveryId = await t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId,
      eventType: " agent run completed ",
      destinationUrl: " https://example.com/hook ",
      requestBodyPreview: "x".repeat(2200),
      maxAttempts: 3,
      now: 5_000,
    });

    await expect(t.mutation(internal.webhookDeliveries.recordAttemptInternal, {
      deliveryId,
      status: "RETRY_SCHEDULED",
      statusCode: 500,
      error: "No retry date",
      now: 5_100,
    })).rejects.toThrow("Retry deliveries require nextAttemptAt");

    const failed = await t.mutation(internal.webhookDeliveries.recordAttemptInternal, {
      deliveryId,
      status: "FAILED",
      statusCode: 500,
      error: "x".repeat(2200),
      responseBodyPreview: "y".repeat(2200),
      now: 5_200,
    });

    expect(failed).toMatchObject({
      eventType: "agent.run.completed",
      destinationUrl: "https://example.com/hook",
      status: "FAILED",
      attemptCount: 1,
      maxAttempts: 3,
      lastStatusCode: 500,
      lastAttemptAt: 5_200,
      updatedAt: 5_200,
    });
    expect(failed.requestBodyPreview?.length).toBe(2003);
    expect(failed.lastError?.length).toBe(2003);
    expect(failed.responseBodyPreview?.length).toBe(2003);
  });

  test("queue dispatch records a pending delivery and schedules the dispatcher", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() })
    );

    const deliveryId = await t.mutation(internal.webhookDeliveries.queueDispatchInternal, {
      companyId,
      eventType: "agent.run.completed",
      destinationUrl: "https://example.com/webhooks",
      payloadJson: JSON.stringify({ runId: "run_1", status: "SUCCESS" }),
      headers: [{ name: "X-Test", value: "yes" }],
      sourceType: "agentRun",
      sourceId: "run_1",
      maxAttempts: 4,
      now: 10_000,
    });

    const delivery = await t.run(async (ctx) => await ctx.db.get(deliveryId));
    expect(delivery).toMatchObject({
      companyId,
      eventType: "agent.run.completed",
      destinationUrl: "https://example.com/webhooks",
      status: "PENDING",
      sourceType: "agentRun",
      sourceId: "run_1",
      attemptCount: 0,
      maxAttempts: 4,
      createdAt: 10_000,
    });
    expect(delivery?.requestBodyPreview).toContain("run_1");
  });

  test("dispatcher records successful webhook delivery attempts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const fetchMock = vi.fn().mockResolvedValue(new Response("accepted", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const companyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() })
    );
    const deliveryId = await t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId,
      eventType: "agent.run.completed",
      destinationUrl: "https://example.com/webhooks",
      maxAttempts: 3,
    });

    const result = await t.action(internal.webhookDeliveryActions.dispatchInternal, {
      deliveryId,
      payloadJson: JSON.stringify({ ok: true }),
      headers: [{ name: "X-Sonae-Test", value: "yes" }],
    });

    expect(result).toMatchObject({
      status: "SUCCESS",
      attemptCount: 1,
      lastStatusCode: 202,
      responseBodyPreview: "accepted",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/webhooks", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ok: true }),
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "X-Sonae-Test": "yes",
      }),
    }));
  });

  test("dispatcher schedules retries and abandons after max attempts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const fetchMock = vi.fn().mockImplementation(async () => new Response("temporarily unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const companyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() })
    );
    const deliveryId = await t.mutation(internal.webhookDeliveries.recordQueuedInternal, {
      companyId,
      eventType: "agent.run.failed",
      destinationUrl: "https://example.com/webhooks",
      maxAttempts: 2,
    });

    const retry = await t.action(internal.webhookDeliveryActions.dispatchInternal, {
      deliveryId,
      payloadJson: JSON.stringify({ ok: false }),
    });
    expect(retry).toMatchObject({ retryScheduled: true });
    let delivery = await t.run(async (ctx) => await ctx.db.get(deliveryId));
    expect(delivery).toMatchObject({
      status: "RETRY_SCHEDULED",
      attemptCount: 1,
      lastStatusCode: 503,
      lastError: "Webhook destination returned HTTP 503.",
      responseBodyPreview: "temporarily unavailable",
    });
    expect(delivery?.nextAttemptAt).toEqual(expect.any(Number));

    const abandoned = await t.action(internal.webhookDeliveryActions.dispatchInternal, {
      deliveryId,
      payloadJson: JSON.stringify({ ok: false }),
    });
    expect(abandoned).toMatchObject({
      status: "ABANDONED",
      attemptCount: 2,
      lastStatusCode: 503,
    });
    delivery = await t.run(async (ctx) => await ctx.db.get(deliveryId));
    expect(delivery?.status).toBe("ABANDONED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
