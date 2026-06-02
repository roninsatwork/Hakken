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

  test("SUPER_ADMIN can create, update, and delete users with audit logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Tenant Corp", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { companyId, superAdminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const userId = await superAdminClient.mutation(api.users.addUser, {
      name: "Ada Lovelace",
      email: "ada@test.com",
      role: "ADMIN",
      companyId,
    });
    await expect(
      superAdminClient.mutation(api.users.updateUser, {
        id: userId,
        name: "Ada Byron",
        role: "USER",
      })
    ).resolves.toBe(userId);
    await expect(superAdminClient.mutation(api.users.deleteUser, { id: userId })).resolves.toBe(true);
    await expect(superAdminClient.mutation(api.users.deleteUser, { id: userId })).resolves.toBe(false);

    const { deletedUser, auditLogs } = await t.run(async (ctx) => ({
      deletedUser: await ctx.db.get(userId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(deletedUser).toBeNull();
    expect(auditLogs.map((log) => log.actionType)).toEqual(["CREATE_USER", "UPDATE_USER", "DELETE_USER"]);
    expect(auditLogs[0]).toMatchObject({
      actorId: superAdminId,
      entityType: "users",
      entityId: userId,
      metadata: JSON.stringify({ email: "ada@test.com", role: "ADMIN", companyId }),
    });
    expect(auditLogs[1]).toMatchObject({
      actorId: superAdminId,
      entityId: userId,
      metadata: JSON.stringify({ updatedRole: "USER" }),
    });
    expect(auditLogs[2]).toMatchObject({
      actorId: superAdminId,
      entityId: userId,
      metadata: JSON.stringify({ email: "ada@test.com", name: "Ada Byron" }),
    });
  });

  test("paginated user queries honor super admin, admin, and impersonation scope", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyAId, companyBId, adminAId, superAdminId, userAId, userBId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@test.com",
        role: "ADMIN",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        impersonatingCompanyId: companyAId,
        createdAt: Date.now(),
      });
      const userAId = await ctx.db.insert("users", {
        email: "user-a@test.com",
        role: "USER",
        companyId: companyAId,
        createdAt: Date.now(),
      });
      const userBId = await ctx.db.insert("users", {
        email: "user-b@test.com",
        role: "USER",
        companyId: companyBId,
        createdAt: Date.now(),
      });

      return { companyAId, companyBId, adminAId, superAdminId, userAId, userBId };
    });

    const paginationOpts = { numItems: 10, cursor: null };
    const adminAClient = t.withIdentity({ subject: adminAId });
    const impersonatingSuperClient = t.withIdentity({ subject: superAdminId });

    const adminPage = await adminAClient.query(api.users.getPaginatedUsers, { paginationOpts });
    const companyPage = await adminAClient.query(api.users.getUsersByCompany, {
      companyId: companyAId,
      paginationOpts,
    });
    const impersonatedPage = await impersonatingSuperClient.query(api.users.getPaginatedUsers, { paginationOpts });
    const impersonatedAll = await impersonatingSuperClient.query(api.users.getAllUsers);

    expect(adminPage.page.map((user) => user._id).sort()).toEqual([adminAId, userAId].sort());
    expect(adminPage.page.find((user) => user._id === userAId)?.companyName).toBe("Company A");
    expect(companyPage.page.map((user) => user._id).sort()).toEqual([adminAId, userAId].sort());
    expect(impersonatedPage.page.map((user) => user._id).sort()).toEqual([adminAId, userAId].sort());
    expect(impersonatedAll.map((user) => user._id).sort()).toEqual([adminAId, userAId].sort());

    await expect(
      adminAClient.query(api.users.getUsersByCompany, {
        companyId: companyBId,
        paginationOpts,
      })
    ).rejects.toThrow("Unauthorized");
    expect(userBId).toBeDefined();
  });

  test("login tracking throttles duplicate sessions and enforces login visibility", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, adminId, userId, foreignUserId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const foreignCompanyId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const foreignUserId = await ctx.db.insert("users", {
        email: "foreign@test.com",
        role: "USER",
        companyId: foreignCompanyId,
        createdAt: Date.now(),
      });

      return { companyId, adminId, userId, foreignUserId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const userClient = t.withIdentity({ subject: userId });
    const paginationOpts = { numItems: 10, cursor: null };

    const firstLoginId = await adminClient.mutation(api.users.recordLogin, {
      device: "Chrome",
      ip: "203.0.113.10",
      location: "London",
    });
    const duplicateLoginId = await adminClient.mutation(api.users.recordLogin, {
      device: "Chrome",
      ip: "203.0.113.10",
      location: "London",
    });

    expect(duplicateLoginId).toBe(firstLoginId);

    const ownLogins = await adminClient.query(api.users.getUserLogins, {
      userId: adminId,
      paginationOpts,
    });
    const sameCompanyLogins = await adminClient.query(api.users.getUserLogins, {
      userId,
      paginationOpts,
    });
    const globalLoginListForAdmin = await adminClient.query(api.users.getLogins, { paginationOpts });

    expect(ownLogins.page.map((login) => login._id)).toEqual([firstLoginId]);
    expect(sameCompanyLogins.page).toEqual([]);
    expect(globalLoginListForAdmin.page).toEqual([]);
    expect(await adminClient.query(api.users.getMyLoginsCount, {})).toBe(0);

    await expect(
      adminClient.query(api.users.getUserLogins, {
        userId: foreignUserId,
        paginationOpts,
      })
    ).rejects.toThrow("Unauthorized");

    await userClient.mutation(api.users.recordLogin, {
      device: "Safari",
      ip: "203.0.113.20",
      location: "London",
    });

    const auditLogs = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    expect(auditLogs.map((log) => log.actionType)).toEqual(["SYSTEM_AUTHENTICATION"]);
    expect(companyId).toBeDefined();
  });

  test("super admin impersonation and company assignment mutations are audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, standardUserId, superAdminId, targetSuperAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Tenant Corp", createdAt: Date.now() });
      const standardUserId = await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const targetSuperAdminId = await ctx.db.insert("users", {
        email: "target-super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });

      return { companyId, standardUserId, superAdminId, targetSuperAdminId };
    });

    const userClient = t.withIdentity({ subject: standardUserId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.mutation(api.users.impersonateCompany, { companyId })).rejects.toThrow(
      "Unauthorized: Only super admins can impersonate tenants"
    );
    await expect(superAdminClient.mutation(api.users.assignSuperAdminToCompany, { userId: standardUserId, companyId })).rejects.toThrow(
      "Invalid target user"
    );

    await expect(superAdminClient.mutation(api.users.impersonateCompany, { companyId })).resolves.toBe(true);
    expect(await superAdminClient.query(api.users.getUnassignedSuperAdmins, { companyId })).toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: targetSuperAdminId })])
    );

    await expect(
      superAdminClient.mutation(api.users.assignSuperAdminToCompany, {
        userId: targetSuperAdminId,
        companyId,
      })
    ).resolves.toBe(true);
    expect(await superAdminClient.query(api.users.getUnassignedSuperAdmins, { companyId })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: targetSuperAdminId })])
    );

    await expect(superAdminClient.mutation(api.users.detachSuperAdminFromCompany, { userId: targetSuperAdminId })).resolves.toBe(true);
    await expect(superAdminClient.mutation(api.users.impersonateCompany, {})).resolves.toBe(true);

    const { caller, target, auditLogs } = await t.run(async (ctx) => ({
      caller: await ctx.db.get(superAdminId),
      target: await ctx.db.get(targetSuperAdminId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(caller?.impersonatingCompanyId).toBeUndefined();
    expect(target?.companyId).toBeUndefined();
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "IMPERSONATE_COMPANY",
      "ASSIGN_SUPER_ADMIN",
      "DETACH_SUPER_ADMIN",
      "IMPERSONATE_COMPANY",
    ]);
  });
});
