import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("OWASP: Broken Access Control - Users", () => {
  test("Unauthenticated requests to read users are rejected", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    await expect(
      t.query(api.users.getAllUsers)
    ).rejects.toThrow("Unauthenticated");
  });

  test("Standard USER cannot read all users or super admins", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Standard User",
        email: "user@test.com",
        role: "USER",
        createdAt: Date.now()
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.users.getAllUsers)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.query(api.users.getSuperAdmins)
    ).rejects.toThrow("Unauthorized");
  });

  test("Standard USER cannot create a new user", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    // Inject a standard user
    const standardId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "standard@test.com",
        role: "USER"
      });
    });

    const client = t.withIdentity({ subject: standardId });

    await expect(
      client.mutation(api.users.addUser, { 
        name: "Hacked", 
        email: "hacked@test.com", 
        role: "ADMIN" 
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN cannot elevate a user to SUPER_ADMIN", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });

    // Create an Admin mapped to Test Corp
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@corp.com",
        role: "ADMIN",
        companyId: companyId
      });
    });

    // Create a target user in the same company
    const targetUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "target@corp.com",
        role: "USER",
        companyId: companyId
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    // The Admin should be blocked from elevating the target to SUPER_ADMIN
    await expect(
      adminClient.mutation(api.users.updateUser, { 
        id: targetUserId, 
        role: "SUPER_ADMIN" 
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN cannot manage users outside their company tenant", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const adminCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Admin Corp", createdAt: Date.now() });
    });
    
    const externalCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "External Corp", createdAt: Date.now() });
    });

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        role: "ADMIN",
        companyId: adminCompanyId
      });
    });

    const targetUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        role: "USER",
        companyId: externalCompanyId
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    // Attempting to delete a user outside their tenant
    await expect(
      adminClient.mutation(api.users.deleteUser, { id: targetUserId })
    ).rejects.toThrow("Unauthorized");
  });
});
