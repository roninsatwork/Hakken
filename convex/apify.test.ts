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
      return await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
    });
    const client = t.withIdentity({ subject: userId });

    await expect(
      client.action(api.apify.startRightmoveScrape, {
        listUrls: ["https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E87490"],
        maxProperties: 10,
      })
    ).rejects.toThrow("Apify API Token not configured.");
    await expect(t.action(internal.apify.pollRunStatus, { runId: "run-1" })).resolves.toBeNull();
    await expect(
      t.action(internal.apify.fetchDatasetAndStore, {
        runId: "run-1",
        datasetId: "dataset-1",
        status: "SUCCEEDED",
      })
    ).rejects.toThrow("Apify API Token not configured.");
    await expect(t.action(api.apify.syncRunStatus, { runId: "run-1" })).rejects.toThrow(
      "Apify token not configured"
    );
  });
});
