import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";


describe("Webhook delivery logs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The listing test went with the screen it covered.
   *
   * Nothing queues a delivery and there is nowhere to register a destination,
   * so the log had nothing to list. The engine below is the finished half and
   * stays covered: recording, dispatch, retry backoff, and abandonment.
   */
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
      headers: [{ name: "X-Hakken-Test", value: "yes" }],
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
        "X-Hakken-Test": "yes",
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
