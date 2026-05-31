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
      maliciousClient.query(api.users.getSuperAdmins, { paginationOpts: { numItems: 10, cursor: null } })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN read queries are scoped to their company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const adminCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Admin Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Foreign Corp", createdAt: Date.now() });
    });
    const [adminId, ownUserId, foreignUserId] = await t.run(async (ctx) => {
      const admin = await ctx.db.insert("users", {
        email: "admin@corp.com",
        role: "ADMIN",
        companyId: adminCompanyId,
      });
      const ownUser = await ctx.db.insert("users", {
        email: "own@corp.com",
        role: "USER",
        companyId: adminCompanyId,
      });
      const foreignUser = await ctx.db.insert("users", {
        email: "foreign@corp.com",
        role: "USER",
        companyId: foreignCompanyId,
      });

      return [admin, ownUser, foreignUser];
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const users = await adminClient.query(api.users.getAllUsers);
    const userIds = users.map((user) => user._id);

    expect(userIds).toContain(adminId);
    expect(userIds).toContain(ownUserId);
    expect(userIds).not.toContain(foreignUserId);

    await expect(
      adminClient.query(api.users.getUserById, { id: foreignUserId })
    ).rejects.toThrow("Unauthorized");
  });

  test("SUPER_ADMIN read queries can access users across companies", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Tenant Corp", createdAt: Date.now() });
    });
    const [superAdminId, tenantUserId] = await t.run(async (ctx) => {
      const superAdmin = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const tenantUser = await ctx.db.insert("users", {
        email: "tenant@corp.com",
        role: "USER",
        companyId,
      });

      return [superAdmin, tenantUser];
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const tenantUser = await superAdminClient.query(api.users.getUserById, { id: tenantUserId });

    expect(tenantUser?._id).toBe(tenantUserId);
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
    ).rejects.toThrowError(/Insufficient privileges/);
  });

  test("ADMIN cannot create a SUPER_ADMIN", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@corp.com",
        role: "ADMIN",
        companyId: companyId
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.users.addUser, { 
        name: "Hacker",
        email: "hacker@test.com", 
        role: "SUPER_ADMIN",
        companyId: companyId
      })
    ).rejects.toThrowError(/Insufficient privileges/);
  });

  test("ADMIN cannot modify or delete a SUPER_ADMIN", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });

    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@corp.com",
        role: "ADMIN",
        companyId: companyId
      });
    });

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@corp.com",
        role: "SUPER_ADMIN",
        companyId: companyId
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    // Attempting to modify a SUPER_ADMIN
    await expect(
      adminClient.mutation(api.users.updateUser, { 
        id: superAdminId, 
        name: "Hacked Admin"
      })
    ).rejects.toThrowError(/Cannot modify a Super Administrator/);

    // Attempting to delete a SUPER_ADMIN
    await expect(
      adminClient.mutation(api.users.deleteUser, { 
        id: superAdminId 
      })
    ).rejects.toThrowError(/Cannot delete a Super Administrator/);
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
