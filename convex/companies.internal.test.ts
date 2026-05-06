import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("GARBAGE COLLECTION: purgeCompanyEntitiesInternal", () => {
  test("Successfully purges a small number of entities without recurring scheduling", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", {
        name: "Test Corp",
        createdAt: Date.now()
      });
    });

    // Seed 50 users and 50 invites (< 100 limit)
    await t.run(async (ctx) => {
      for (let i = 0; i < 50; i++) {
        await ctx.db.insert("users", {
          companyId,
          name: `User ${i}`,
          email: `user${i}@corp.com`,
          role: "USER"
        });
        await ctx.db.insert("invitations", {
          companyId,
          email: `invite${i}@corp.com`,
          role: "USER",
          token: `token${i}`,
          status: "PENDING",
          invitedAt: Date.now()
        });
      }
    });

    // Run the internal purge mutation once
    await t.mutation(internal.companies.purgeCompanyEntitiesInternal, { companyId });

    // Assert that the 50 users and invites are completely deleted
    const remainingUsers = await t.run(async (ctx) => {
      return await ctx.db.query("users").withIndex("by_company", q => q.eq("companyId", companyId)).collect();
    });
    const remainingInvites = await t.run(async (ctx) => {
      return await ctx.db.query("invitations").withIndex("by_company_status", q => q.eq("companyId", companyId)).collect();
    });

    expect(remainingUsers.length).toBe(0);
    expect(remainingInvites.length).toBe(0);
  });

  test("Correctly batches deletions over limits to prevent transaction errors", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", {
        name: "Heavy Corp",
        createdAt: Date.now()
      });
    });

    // Seed 150 users and 150 invites (> 100 limit)
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i++) {
        await ctx.db.insert("users", {
          companyId,
          name: `Heavy User ${i}`,
          email: `heavy${i}@corp.com`,
          role: "USER"
        });
        await ctx.db.insert("invitations", {
          companyId,
          email: `heavyinvite${i}@corp.com`,
          role: "USER",
          token: `heavytoken${i}`,
          status: "PENDING",
          invitedAt: Date.now()
        });
      }
    });

    // Phase 1: Run the mutation - it should only delete 100 in the first pass
    await t.mutation(internal.companies.purgeCompanyEntitiesInternal, { companyId });

    const remainingUsersPhase1 = await t.run(async (ctx) => {
      return await ctx.db.query("users").withIndex("by_company", q => q.eq("companyId", companyId)).collect();
    });
    const remainingInvitesPhase1 = await t.run(async (ctx) => {
      return await ctx.db.query("invitations").withIndex("by_company_status", q => q.eq("companyId", companyId)).collect();
    });
    
    expect(remainingUsersPhase1.length).toBe(50); // 150 - 100 = 50
    expect(remainingInvitesPhase1.length).toBe(50);

    // Phase 2: Simulating the scheduler's next tick manually
    await t.mutation(internal.companies.purgeCompanyEntitiesInternal, { companyId });

    const remainingUsersPhase2 = await t.run(async (ctx) => {
      return await ctx.db.query("users").withIndex("by_company", q => q.eq("companyId", companyId)).collect();
    });
    const remainingInvitesPhase2 = await t.run(async (ctx) => {
      return await ctx.db.query("invitations").withIndex("by_company_status", q => q.eq("companyId", companyId)).collect();
    });

    // Should be completely gone now
    expect(remainingUsersPhase2.length).toBe(0);
    expect(remainingInvitesPhase2.length).toBe(0);
  });
});
