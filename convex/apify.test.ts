import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const originalApifyToken = process.env.APIFY_API_TOKEN;
const originalConvexSiteUrl = process.env.CONVEX_SITE_URL;
const originalWebhookSecret = process.env.APIFY_WEBHOOK_SECRET;

afterEach(() => {
  process.env.APIFY_API_TOKEN = originalApifyToken;
  process.env.CONVEX_SITE_URL = originalConvexSiteUrl;
  process.env.APIFY_WEBHOOK_SECRET = originalWebhookSecret;
});

describe("Apify actions", () => {
  test("scrape and sync actions fail fast when required external configuration is absent", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    delete process.env.APIFY_API_TOKEN;
    delete process.env.CONVEX_SITE_URL;
    delete process.env.APIFY_WEBHOOK_SECRET;

    const userId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      await ctx.db.insert("apifyRuns", {
        runId: "run-1",
        actorId: "actor-1",
        status: "PENDING",
        startedBy: userId,
        companyId,
        startedAt: Date.now(),
      });
      return userId;
    });
    const client = t.withIdentity({ subject: userId });


    await expect(t.action(internal.apify.pollRunStatus, { runId: "run-1" })).resolves.toBeNull();
    await expect(
      t.action(internal.apify.fetchDatasetAndStore, {
        runId: "run-1",
        datasetId: "dataset-1",
        status: "SUCCEEDED",
      })
    ).rejects.toThrow("Apify API Token not configured.");
    await expect(t.action(api.apify.syncRunStatus, { runId: "run-1" })).rejects.toThrow("Unauthenticated");
    await expect(t.action(api.apify.debugDatasetItem, { runId: "run-1" })).rejects.toThrow("Unauthenticated");
    await expect(client.action(api.apify.syncRunStatus, { runId: "run-1" })).rejects.toThrow(
      "Apify token not configured"
    );
  });

  test("manual Apify sync is scoped to the caller company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    process.env.APIFY_API_TOKEN = "test-token";

    const { adminAId, adminBId } = await t.run(async (ctx) => {
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
      await ctx.db.insert("apifyRuns", {
        runId: "run-a",
        actorId: "actor-1",
        status: "PENDING",
        startedBy: adminAId,
        companyId: companyAId,
        startedAt: Date.now(),
      });
      return { adminAId, adminBId };
    });

    await expect(t.withIdentity({ subject: adminBId }).action(api.apify.syncRunStatus, { runId: "run-a" }))
      .rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({ subject: adminAId }).action(api.apify.debugDatasetItem, { runId: "run-a" }))
      .rejects.toThrow("Unauthorized");
  });
});
