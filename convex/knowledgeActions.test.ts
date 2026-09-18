import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  KNOWLEDGE_WEBSITE_MAPS_PER_HOUR,
  KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS,
  KNOWLEDGE_WEBSITE_URLS_PER_REQUEST,
} from "./knowledgeImportPolicy";

const { embedContentMock } = vi.hoisted(() => ({
  embedContentMock: vi.fn(),
}));

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(function GoogleGenAI() {
      return {
        models: {
          embedContent: embedContentMock,
        },
      };
    }),
  };
});

const originalFirecrawlKey = process.env.FIRECRAWL_API_KEY;
const originalGoogleClientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const originalGooglePrivateKey = process.env.GOOGLE_PRIVATE_KEY;

afterEach(() => {
  process.env.FIRECRAWL_API_KEY = originalFirecrawlKey;
  process.env.GOOGLE_CLIENT_EMAIL = originalGoogleClientEmail;
  process.env.GOOGLE_PRIVATE_KEY = originalGooglePrivateKey;
  embedContentMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("knowledge actions", () => {
  test("website mapping enforces admin auth, configuration, and SSRF boundaries", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    delete process.env.FIRECRAWL_API_KEY;

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

  test("website mapping caps the links returned by the provider", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      return await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      links: Array.from(
        { length: KNOWLEDGE_WEBSITE_URLS_PER_REQUEST + 20 },
        (_, index) => `https://example.com/${index}`,
      ),
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const links = await t.withIdentity({ subject: adminId }).action(api.knowledgeActions.mapWebsite, {
      url: "https://example.com",
    });
    expect(links).toHaveLength(KNOWLEDGE_WEBSITE_URLS_PER_REQUEST);
  });

  test("website mapping is capped per workspace hour before another provider call", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      return await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      links: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const adminClient = t.withIdentity({ subject: adminId });

    for (let index = 0; index < KNOWLEDGE_WEBSITE_MAPS_PER_HOUR; index++) {
      await adminClient.action(api.knowledgeActions.mapWebsite, {
        url: `https://example.com/map-${index}`,
      });
    }

    await expect(adminClient.action(api.knowledgeActions.mapWebsite, {
      url: "https://example.com/over-map-limit",
    })).rejects.toThrow(`at most ${KNOWLEDGE_WEBSITE_MAPS_PER_HOUR} websites per hour`);
    expect(fetchMock).toHaveBeenCalledTimes(KNOWLEDGE_WEBSITE_MAPS_PER_HOUR);
  });

  test("website queue no-ops when empty and marks pending documents failed without Firecrawl credentials", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    delete process.env.FIRECRAWL_API_KEY;

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

  test("website ingestion refuses oversized extracted text before embedding", async () => {
    process.env.FIRECRAWL_API_KEY = "test-key";
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const documentId = await t.run(async (ctx) => await ctx.db.insert("knowledgeDocuments", {
      title: "Oversized page",
      sourceUrl: "https://example.com/oversized",
      status: "pending",
      format: "url",
      createdAt: Date.now(),
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: { markdown: "x".repeat(KNOWLEDGE_WEBSITE_SOURCE_MAX_CHARACTERS + 1) },
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await t.action(internal.knowledgeActions.processWebsiteQueue, {});

    expect(await t.run(async (ctx) => ctx.db.get(documentId))).toMatchObject({ status: "failed" });
    expect(embedContentMock).not.toHaveBeenCalled();
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

  test("document ingestion marks documents failed when chunk embedding fails permanently", async () => {
    process.env.GOOGLE_CLIENT_EMAIL = "svc@example.com";
    process.env.GOOGLE_PRIVATE_KEY = "private-key";
    embedContentMock.mockRejectedValue(Object.assign(new Error("Invalid embedding request"), {
      status: 400,
    }));

    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const documentId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      return await ctx.db.insert("knowledgeDocuments", {
        title: "Retry Exhaustion Doc",
        textContent: "This content should not become ready when embeddings fail.",
        companyId,
        status: "processing",
        format: "text/plain",
        createdBy: adminId,
        createdAt: Date.now(),
      });
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(t.action(internal.knowledgeActions.ingestDocument, { documentId })).resolves.toBeNull();

    const result = await t.run(async (ctx) => ({
      document: await ctx.db.get(documentId),
      chunks: await ctx.db
        .query("knowledgeChunks")
        .withIndex("by_document", (q) => q.eq("documentId", documentId))
        .collect(),
    }));

    expect(result.document).toMatchObject({ status: "failed" });
    expect(result.chunks).toEqual([]);
    expect(embedContentMock).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("Critical Failure in Knowledge Ingestion:", expect.any(Error));
  });
});
