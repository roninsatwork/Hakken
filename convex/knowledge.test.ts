import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Object Level Authorization - Knowledge Base", () => {
  test("Standard USER cannot upload knowledge documents at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const standardId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "standard@test.com",
        role: "USER",
        createdAt: Date.now()
      });
    });

    const standardClient = t.withIdentity({ subject: standardId });

    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Knowledge Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Attempt to generate upload URL
    await expect(
      standardClient.mutation(api.knowledge.generateUploadUrl, {})
    ).rejects.toThrow("Unauthorized");

    // Attempt to save manual text
    await expect(
      standardClient.mutation(api.knowledge.saveManualText, {
        title: "Malicious Injection",
        textContent: "I am injecting knowledge.",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      standardClient.query(api.knowledge.getDocuments, { agentId })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN from Company A cannot view or delete documents from Company B", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Setup companies
    const companyA = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });
    
    const companyB = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
    });

    // Create Admin for A
    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyA,
        createdAt: Date.now()
      });
    });

    // Create Document for B
    const docBId = await t.run(async (ctx) => {
        // Need a user to represent "createdBy"
        const creatorId = await ctx.db.insert("users", {
          email: "creator@test.com", role: "USER", companyId: companyB, createdAt: Date.now()
        });
        return await ctx.db.insert("knowledgeDocuments", {
            title: "Secret Co B Data",
            textContent: "Secret info",
            companyId: companyB,
            status: "ready",
            createdBy: creatorId,
            format: "text/plain",
            createdAt: Date.now()
        });
    });

    const clientA = t.withIdentity({ subject: adminAId });

    // 1. Try to read companyB documents directly bypassing the undefined default
    await expect(
      clientA.query(api.knowledge.getDocuments, { companyId: companyB })
    ).rejects.toThrow("Unauthorized");

    // 2. Try to pass no company id (global knowledge attempt)
    await expect(
        clientA.query(api.knowledge.getDocuments, {})
    ).rejects.toThrow("Unauthorized");

    // 3. Try to maliciously delete the document of company B
    await expect(
        clientA.mutation(api.knowledge.deleteDocument, { documentId: docBId })
    ).rejects.toThrow("Unauthorized");
  });

  test("SSRF Shield blocks internal URL crawling for RAG ingestion", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Inject super admin capable of running global ingestor
    const adminId = await t.run(async (ctx) => {
        return await ctx.db.insert("users", {
            email: "admin@test.com",
            role: "SUPER_ADMIN",
            createdAt: Date.now()
        });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    // Attempting to scrape the database's own local loopback
    await expect(
        adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["http://localhost:3000/admin"] })
    ).rejects.toThrow("SSRF Prevention");

    // Attempting to scrape an internal network IP
    await expect(
        adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["http://192.168.1.1/router-login"] })
    ).rejects.toThrow("SSRF Prevention");

    // Attempting standard external URL should succeed natively 
    const result = await adminClient.mutation(api.knowledge.queueWebsiteUrls, { urls: ["https://google.com"] });
    expect(result.length).toBeGreaterThan(0);
  });
});
