import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const originalFirecrawlKey = process.env.FIRECRAWL_API_KEY;

afterEach(() => {
  process.env.FIRECRAWL_API_KEY = originalFirecrawlKey;
  vi.restoreAllMocks();
});

describe("knowledge actions", () => {
  test("website mapping enforces admin auth, configuration, and SSRF boundaries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
        companyId,
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      return { userId, adminId };
    });

    await expect(
      t.withIdentity({ subject: userId }).action(api.knowledgeActions.mapWebsite, {
        url: "https://example.com",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.withIdentity({ subject: adminId }).action(api.knowledgeActions.mapWebsite, {
        url: "https://example.com",
      })
    ).rejects.toThrow("FIRECRAWL_API_KEY environment variable not set");

    process.env.FIRECRAWL_API_KEY = "test-key";
    await expect(
      t.withIdentity({ subject: adminId }).action(api.knowledgeActions.mapWebsite, {
        url: "http://127.0.0.1/internal",
      })
    ).rejects.toThrow("SSRF Prevention");
  });

  test("website queue no-ops when empty and marks pending documents failed without Firecrawl credentials", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await expect(t.action(internal.knowledgeActions.processWebsiteQueue, {})).resolves.toBeNull();

    const documentId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      return await ctx.db.insert("knowledgeDocuments", {
        title: "Queued URL",
        sourceUrl: "https://example.com",
        companyId,
        status: "pending",
        format: "url",
        createdBy: adminId,
        createdAt: Date.now(),
      });
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await t.action(internal.knowledgeActions.processWebsiteQueue, {});

    expect(await t.run(async (ctx) => ctx.db.get(documentId))).toMatchObject({ status: "failed" });
    expect(consoleError).toHaveBeenCalledWith("Queue Scrape Error", expect.any(Error));
  });

  test("document ingestion marks unextractable documents as failed without throwing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const documentId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const documentId = await ctx.db.insert("knowledgeDocuments", {
        title: "Empty Doc",
        companyId,
        status: "processing",
        format: "text/plain",
        createdBy: adminId,
        createdAt: Date.now(),
      });
      return documentId;
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(t.action(internal.knowledgeActions.ingestDocument, { documentId })).resolves.toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get(documentId))).toMatchObject({ status: "failed" });
    expect(consoleError).toHaveBeenCalledWith("Critical Failure in Knowledge Ingestion:", expect.any(Error));
  });
});
