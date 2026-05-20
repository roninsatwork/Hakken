import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
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
        modelId: "gemini-2.5-flash",
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
          modelUsed: "gemini-2.5-flash",
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
          modelUsed: "gemini-2.5-flash",
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
    transactions.page.forEach((t: any) => {
      expect(t.companyId).toBe(companyAId);
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

  test("Properties are strictly isolated to the tenant (BOLA)", async () => {
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

    const propAId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "111",
        address: "123 safe street",
        price: 300000,
        url: "https://rightmove.co.uk/propA",
        companyId: companyAId,
        scrapedAt: Date.now()
      });
    });

    const propBId = await t.run(async (ctx) => {
      return await ctx.db.insert("properties", {
        rightmoveId: "222",
        address: "456 cross tenant road",
        price: 450000,
        url: "https://rightmove.co.uk/propB",
        companyId: companyBId,
        scrapedAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: adminAId });

    // Admin A lists properties
    const res = await client.query(api.properties.listProperties, {
      paginationOpts: { numItems: 10, cursor: null }
    });

    // Should only see Company A's property
    expect(res.page.length).toBe(1);
    expect(res.page[0].address).toBe("123 safe street");

    // Admin A tries to get Company B's property directly (BOLA)
    await expect(
      client.query(api.properties.getProperty, { id: propBId })
    ).rejects.toThrowError(/Unauthorized/);

    // Admin A tries to delete Company B's property directly (BOLA)
    await expect(
      client.mutation(api.properties.deleteProperty, { id: propBId })
    ).rejects.toThrowError(/Unauthorized/);
  });

  test("Apify runs are tenant-isolated and admin list is protected", async () => {
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

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "superadmin@test.com",
        role: "SUPER_ADMIN",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("apifyRuns", {
        runId: "run-A",
        actorId: "actor-1",
        startedBy: adminAId,
        companyId: companyAId,
        status: "PENDING",
        startedAt: Date.now()
      });

      await ctx.db.insert("apifyRuns", {
        runId: "run-B",
        actorId: "actor-1",
        startedBy: superAdminId,
        companyId: companyBId,
        status: "PENDING",
        startedAt: Date.now()
      });
    });

    const clientA = t.withIdentity({ subject: adminAId });
    const clientSuper = t.withIdentity({ subject: superAdminId });

    // Admin A gets their latest runs
    const runsA = await clientA.query(api.properties.getLatestRuns);
    expect(runsA.length).toBe(1);
    expect(runsA[0].runId).toBe("run-A");

    // Admin A tries to access getAllRunsAdmin (unauthorized)
    await expect(
      clientA.query(api.properties.getAllRunsAdmin)
    ).rejects.toThrowError(/Unauthorized/);

    // Super Admin gets all runs admin
    const allRuns = await clientSuper.query(api.properties.getAllRunsAdmin);
    expect(allRuns.length).toBe(2);
  });

  test("startRightmoveScrape rejects unsafe SSRF loopback URLs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const client = t.withIdentity({ subject: adminAId });

    await expect(
      client.action(api.apify.startRightmoveScrape, {
        listUrls: ["http://localhost:3000/malicious"],
        maxProperties: 5
      })
    ).rejects.toThrowError(/SSRF Prevention/);
  });
});
