import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import schema from "./schema";

describe("OWASP: BOLA / Data Isolation Shield", () => {
  test("Agent Transactions are strictly isolated to the tenant", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Seed Companies
    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });
    
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
    });

    // Seed Admin for Company A
    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    // Seed Agent
    const agentId = await t.run(async (ctx) => {
      return await ctx.db.insert("agents", {
        name: "Test Agent",
        modelId: "test-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Seed Transactions
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("agentTransactions", {
          agentId,
          companyId: companyAId,
          actionContext: "Test Action",
          inputTokens: 100,
          outputTokens: 50,
          modelUsed: "test-model",
          costGBP: 0.05,
          status: "SUCCESS",
          createdAt: Date.now()
        });
        
        await ctx.db.insert("agentTransactions", {
          agentId,
          companyId: companyBId,
          actionContext: "Test Action",
          inputTokens: 100,
          outputTokens: 50,
          modelUsed: "test-model",
          costGBP: 0.05,
          status: "SUCCESS",
          createdAt: Date.now()
        });
      }
    });

    const client = t.withIdentity({ subject: adminAId });

    // Ensure Company A only sees its own 5 transactions
    const transactions = await client.query(api.agentTransactions.getForAgent, { 
      agentId,
      paginationOpts: { numItems: 10, cursor: null }
    });
    
    expect(transactions.page.length).toBe(5);
    transactions.page.forEach((transaction: Doc<"agentTransactions">) => {
      expect(transaction.companyId).toBe(companyAId);
    });
  });

  test("Admin cannot bulk delete websites for a foreign company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });
    
    const companyBId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const client = t.withIdentity({ subject: adminAId });

    // Admin A tries to delete data scoped to Company B
    await expect(
      client.mutation(api.knowledge.deleteWebsiteBulk, { 
        companyId: companyBId,
        rootDomain: "https://example.com"
      })
    ).rejects.toThrowError(/Unauthorized/);
  });
});
