import { convexTest } from "convex-test";
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "./_generated/api";
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
      // The role it changed *from* is recorded alongside the new one. A record
      // saying someone was made an administrator does not say whether that was
      // a promotion or the quiet removal of an oversight restriction, and the
      // second is what an auditor is looking for.
      metadata: JSON.stringify({ updatedRole: "USER", previousRole: "ADMIN" }),
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

    await expect(userClient.mutation(api.users.impersonateCompany, { companyId })).rejects.toThrow("Unauthorized");
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

/*
 * Login recording — the two columns the admin user directory reports depend on
 * this being accurate. See docs/plans/active/user-directory-plan.md.
 */
describe("recordLogin", () => {
  async function seedUser(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "person@example.com", role: "USER" })
    );
  }

  test("collapses a burst from the same device into one session", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await seedUser(t);
    const client = t.withIdentity({ subject: userId });

    for (let i = 0; i < 4; i += 1) {
      await client.mutation(api.users.recordLogin, {
        device: "Chrome on macOS",
        ip: "1.2.3.4",
        location: "London, United Kingdom",
      });
    }

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("logins").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
    );
    expect(rows).toHaveLength(1);
  });

  test("a changing IP no longer defeats the throttle", async () => {
    // The old key included the IP, so a mobile connection changing address —
    // or the geo lookup falling back to "Concealed IP" — wrote a duplicate.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await seedUser(t);
    const client = t.withIdentity({ subject: userId });

    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });
    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "Concealed IP",
      location: "Unknown Location",
    });

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("logins").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
    );
    expect(rows).toHaveLength(1);
  });

  test("a genuinely different device is still recorded", async () => {
    // Device stays in the throttle key on purpose: a new device is a real
    // session and the profile's Logins tab exists to surface it.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await seedUser(t);
    const client = t.withIdentity({ subject: userId });

    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });
    await client.mutation(api.users.recordLogin, {
      device: "Safari on iPhone",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("logins").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
    );
    expect(rows).toHaveLength(2);
  });

  test("records a session again once the window has passed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await seedUser(t);
    const client = t.withIdentity({ subject: userId });

    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });

    // Age the existing row past the one-hour window.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("logins")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (row) await ctx.db.patch(row._id, { timestamp: Date.now() - 2 * 60 * 60 * 1000 });
    });

    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });

    const rows = await t.run(async (ctx) =>
      await ctx.db.query("logins").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
    );
    expect(rows).toHaveLength(2);
  });

  test("lastLoginAt always equals the newest login row", async () => {
    // The invariant the directory's sort and the Phase 3 backfill both rely on.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const userId = await seedUser(t);
    const client = t.withIdentity({ subject: userId });

    // Convex serialises `undefined` to `null` on the way out of `t.run`.
    const before = await t.run(async (ctx) => (await ctx.db.get(userId))?.lastLoginAt ?? null);
    expect(before).toBeNull();

    await client.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });

    const { lastLoginAt, newestRow } = await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      const rows = await ctx.db
        .query("logins")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return { lastLoginAt: user?.lastLoginAt, newestRow: Math.max(...rows.map((r) => r.timestamp)) };
    });

    expect(lastLoginAt).toBe(newestRow);
  });

  test("does nothing for a caller with no session", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const result = await t.mutation(api.users.recordLogin, {
      device: "Chrome on macOS",
      ip: "1.2.3.4",
      location: "London, United Kingdom",
    });

    expect(result).toBeNull();
    const rows = await t.run(async (ctx) => await ctx.db.query("logins").collect());
    expect(rows).toHaveLength(0);
  });
});

describe("recomputeLoginCounts", () => {
  const DAY = 24 * 60 * 60 * 1000;

  test("counts the window, and resets a user who has fallen out of it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const { activeId, dormantId } = await t.run(async (ctx) => {
      const activeId = await ctx.db.insert("users", { email: "active@example.com", role: "USER" });
      // Already carries a stale count from when it was busy.
      const dormantId = await ctx.db.insert("users", {
        email: "dormant@example.com",
        role: "USER",
        loginCount30d: 7,
      });

      for (const daysAgo of [1, 10, 25]) {
        await ctx.db.insert("logins", {
          userId: activeId,
          ip: "1.2.3.4",
          device: "Chrome",
          location: "London",
          status: "SUCCESS",
          timestamp: now - daysAgo * DAY,
        });
      }
      // Outside the window entirely.
      await ctx.db.insert("logins", {
        userId: dormantId,
        ip: "1.2.3.4",
        device: "Chrome",
        location: "London",
        status: "SUCCESS",
        timestamp: now - 45 * DAY,
      });

      return { activeId, dormantId };
    });

    await t.mutation(internal.users.recomputeLoginCounts, {});

    const counts = await t.run(async (ctx) => ({
      active: (await ctx.db.get(activeId))?.loginCount30d,
      dormant: (await ctx.db.get(dormantId))?.loginCount30d,
    }));

    expect(counts.active).toBe(3);
    expect(counts.dormant).toBe(0);
  });

  test("failed attempts do not inflate the count", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const now = Date.now();

    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "person@example.com", role: "USER" });
      for (const status of ["SUCCESS", "FAILED", "FAILED"] as const) {
        await ctx.db.insert("logins", {
          userId,
          ip: "1.2.3.4",
          device: "Chrome",
          location: "London",
          status,
          timestamp: now - DAY,
        });
      }
      return userId;
    });

    await t.mutation(internal.users.recomputeLoginCounts, {});

    const count = await t.run(async (ctx) => (await ctx.db.get(userId))?.loginCount30d);
    expect(count).toBe(1);
  });

  test("reports what it did rather than returning silently", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const result = await t.mutation(internal.users.recomputeLoginCounts, {});

    expect(result).toMatchObject({ truncated: false, updated: 0 });
  });
});

describe("listDirectoryUsers", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const page = { numItems: 50, cursor: null };

  async function seed(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: now });
      const other = await ctx.db.insert("companies", { name: "Other", createdAt: now });

      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com", role: "SUPER_ADMIN", lastLoginAt: now,
      });
      const recentId = await ctx.db.insert("users", {
        email: "recent@acme.com", role: "USER", companyId: acme,
        lastLoginAt: now - 2 * DAY, loginCount30d: 9,
      });
      const dormantId = await ctx.db.insert("users", {
        email: "dormant@acme.com", role: "ADMIN", companyId: acme,
        lastLoginAt: now - 60 * DAY, loginCount30d: 0,
      });
      const neverId = await ctx.db.insert("users", {
        email: "never@other.com", role: "USER", companyId: other,
      });

      return { acme, other, superAdminId, recentId, dormantId, neverId };
    });
  }

  test("super admins are never listed — they have their own screen", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const result = await viewer.query(api.users.listDirectoryUsers, { paginationOpts: page });

    expect(result.page.map((u) => u.email)).not.toContain("super@example.com");
    expect(result.page).toHaveLength(3);
  });

  test("a non-super-admin is rejected by the wrapper, not merely redirected", async () => {
    // The /admin layout redirects in the browser. That is a UI convenience and
    // not a control; the query has to refuse on its own.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seed(t);
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "admin@acme.com", role: "ADMIN" })
    );

    await expect(
      t.withIdentity({ subject: adminId }).query(api.users.listDirectoryUsers, { paginationOpts: page })
    ).rejects.toThrow();
  });

  test("unauthenticated callers get nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seed(t);

    await expect(
      t.query(api.users.listDirectoryUsers, { paginationOpts: page })
    ).rejects.toThrow();
  });

  test("filters by company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, acme } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const result = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, companyId: acme,
    });

    expect(result.page.map((u) => u.email).sort()).toEqual(["dormant@acme.com", "recent@acme.com"]);
    expect(result.page[0].companyName).toBe("Acme");
  });

  test("filters by role", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const result = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, role: "ADMIN",
    });

    expect(result.page.map((u) => u.email)).toEqual(["dormant@acme.com"]);
  });

  test("filters by activity, including never", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const active = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, activity: "active7",
    });
    const dormant = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, activity: "dormant",
    });
    const never = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, activity: "never",
    });

    expect(active.page.map((u) => u.email)).toEqual(["recent@acme.com"]);
    expect(dormant.page.map((u) => u.email)).toEqual(["dormant@acme.com"]);
    expect(never.page.map((u) => u.email)).toEqual(["never@other.com"]);
  });

  test("sorts by last login, newest first by default", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const result = await viewer.query(api.users.listDirectoryUsers, { paginationOpts: page });

    expect(result.page.map((u) => u.email)).toEqual([
      "recent@acme.com",
      "dormant@acme.com",
      "never@other.com",
    ]);
  });

  test("sorts by the 30-day count", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const result = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, sortBy: "loginCount",
    });

    expect(result.page[0].email).toBe("recent@acme.com");
    expect(result.page[0].loginCount30d).toBe(9);
  });

  test("reports that sorting is unavailable while searching", async () => {
    // Convex search indexes cannot range filter, so the screen must explain the
    // disabled sort rather than appear to ignore it.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const searched = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: page, searchTerm: "recent@acme.com",
    });
    const browsed = await viewer.query(api.users.listDirectoryUsers, { paginationOpts: page });

    expect(searched.sortingAvailable).toBe(false);
    expect(browsed.sortingAvailable).toBe(true);
    expect(searched.page.map((u) => u.email)).toEqual(["recent@acme.com"]);
  });

  test("pages through every user exactly once", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);
    const viewer = t.withIdentity({ subject: superAdminId });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const result: Awaited<ReturnType<typeof viewer.query>> = await viewer.query(
        api.users.listDirectoryUsers,
        { paginationOpts: { numItems: 2, cursor } }
      );
      seen.push(...result.page.map((u: { email: string | null }) => u.email ?? ""));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    expect(seen.sort()).toEqual(["dormant@acme.com", "never@other.com", "recent@acme.com"]);
  });
});

describe("listDirectoryUsers — dormant versus never", () => {
  test("dormant excludes users who have never logged in", async () => {
    /*
     * Convex sorts `undefined` ahead of every number, so an upper bound on
     * `lastLoginAt` silently swallowed the never-logged-in users and reported
     * them as dormant. Those are different facts: one person stopped using the
     * platform, the other never started.
     */
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const DAY = 24 * 60 * 60 * 1000;

    const superAdminId = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com", role: "SUPER_ADMIN",
      });
      await ctx.db.insert("users", {
        email: "dormant@example.com", role: "USER", lastLoginAt: Date.now() - 60 * DAY,
      });
      await ctx.db.insert("users", { email: "never@example.com", role: "USER" });
      return superAdminId;
    });

    const viewer = t.withIdentity({ subject: superAdminId });
    const dormant = await viewer.query(api.users.listDirectoryUsers, {
      paginationOpts: { numItems: 50, cursor: null },
      activity: "dormant",
    });

    expect(dormant.page.map((u) => u.email)).toEqual(["dormant@example.com"]);
  });
});

describe("getPaginatedUsers scope", () => {
  /*
   * One query serves two screens with opposite requirements: the front-end team
   * page must follow the impersonated workspace, the admin section must ignore
   * it. Anthony, 2026-07-31: "the impersonation is user front end only not
   * admin section." The scope argument makes that explicit at each call site
   * rather than implied by whoever happens to be calling.
   */
  const page = { numItems: 50, cursor: null };

  async function seed(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const acme = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const other = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now() });

      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
        impersonatingCompanyId: acme,
      });
      await ctx.db.insert("users", { email: "inside@acme.com", role: "USER", companyId: acme });
      await ctx.db.insert("users", { email: "outside@other.com", role: "USER", companyId: other });

      return { superAdminId, acme, other };
    });
  }

  test("workspace scope follows the impersonated company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);

    const result = await t.withIdentity({ subject: superAdminId })
      .query(api.users.getPaginatedUsers, { paginationOpts: page, scope: "workspace" });

    expect(result.page.map((u) => u.email)).toEqual(["inside@acme.com"]);
  });

  test("workspace scope is the default, so the team page is unchanged", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);

    const result = await t.withIdentity({ subject: superAdminId })
      .query(api.users.getPaginatedUsers, { paginationOpts: page });

    expect(result.page.map((u) => u.email)).toEqual(["inside@acme.com"]);
  });

  test("platform scope ignores impersonation", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);

    const result = await t.withIdentity({ subject: superAdminId })
      .query(api.users.getPaginatedUsers, { paginationOpts: page, scope: "platform" });

    const emails = result.page.map((u) => u.email);
    expect(emails).toContain("inside@acme.com");
    expect(emails).toContain("outside@other.com");
  });

  test("a company admin cannot escape their tenant by asking for platform scope", async () => {
    // The argument is a statement of intent, never a grant of access.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { acme } = await seed(t);
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", { email: "admin@acme.com", role: "ADMIN", companyId: acme })
    );

    const result = await t.withIdentity({ subject: adminId })
      .query(api.users.getPaginatedUsers, { paginationOpts: page, scope: "platform" });

    expect(result.page.map((u) => u.email)).not.toContain("outside@other.com");
  });

  test("deleting a user clears the identity rows so the address can be invited again", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, targetId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const targetId = await ctx.db.insert("users", {
        email: "member@test.com",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });

      // The rows a sign-in reads. Before this fix, deletion left every one of
      // them behind: the auth account went on pointing at a user document that
      // no longer existed, and the accepted invitation made the address
      // impossible to re-invite.
      const accountId = await ctx.db.insert("authAccounts", {
        userId: targetId,
        provider: "resend",
        providerAccountId: "member@test.com",
      });
      await ctx.db.insert("authVerificationCodes", {
        accountId,
        provider: "resend",
        code: "unredeemed-code",
        expirationTime: Date.now() + 60_000,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: targetId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("invitations", {
        email: "member@test.com",
        companyId,
        role: "USER",
        status: "ACCEPTED",
        token: "spent-token",
        invitedAt: Date.now(),
        acceptedAt: Date.now(),
      });

      return { superAdminId, targetId };
    });

    await expect(
      t.withIdentity({ subject: superAdminId }).mutation(api.users.deleteUser, { id: targetId })
    ).resolves.toBe(true);

    const remaining = await t.run(async (ctx) => ({
      accounts: await ctx.db.query("authAccounts").collect(),
      codes: await ctx.db.query("authVerificationCodes").collect(),
      sessions: await ctx.db.query("authSessions").collect(),
      refreshTokens: await ctx.db.query("authRefreshTokens").collect(),
      invitations: await ctx.db.query("invitations").collect(),
    }));

    expect(remaining.accounts).toHaveLength(0);
    expect(remaining.codes).toHaveLength(0);
    expect(remaining.sessions).toHaveLength(0);
    expect(remaining.refreshTokens).toHaveLength(0);
    expect(remaining.invitations).toHaveLength(0);
  });

  /**
   * The reads on the deletion path are batched, and a batch is a cap unless
   * something drains it. This is the test that tells the two apart: every
   * fixture above sits inside one batch, so a `.take(200)` that silently drops
   * the rest would pass all of them and leave rows behind in production —
   * which is the original bug, an auth row outliving its user.
   */
  test("deletion drains past a single batch, so a heavy account leaves nothing behind", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const OVER_ONE_BATCH = 201;

    const { superAdminId, targetId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const targetId = await ctx.db.insert("users", {
        email: "heavy@test.com",
        role: "USER",
        createdAt: Date.now(),
      });

      for (let index = 0; index < OVER_ONE_BATCH; index += 1) {
        await ctx.db.insert("authSessions", {
          userId: targetId,
          expirationTime: Date.now() + 60_000,
        });
        await ctx.db.insert("authAccounts", {
          userId: targetId,
          provider: "resend",
          providerAccountId: `heavy@test.com#${index}`,
        });
      }

      return { superAdminId, targetId };
    });

    await t.withIdentity({ subject: superAdminId }).mutation(api.users.deleteUser, { id: targetId });

    const remaining = await t.run(async (ctx) => ({
      sessions: await ctx.db.query("authSessions").collect(),
      accounts: await ctx.db.query("authAccounts").collect(),
    }));

    expect(remaining.sessions).toHaveLength(0);
    expect(remaining.accounts).toHaveLength(0);
  });
});

/**
 * The sweep that clears identities orphaned before deletion purged them.
 *
 * It walks whole tables, so it runs one page per invocation and schedules the
 * next — Convex allows a single paginated query per function. The tests that
 * matter here are the two ways that shape can be got wrong: stalling on rows
 * it skips, and stopping at the first table.
 */
describe("purgeOrphanedAuthIdentities", () => {
  /** An id whose document is gone — exactly what an orphan row points at. */
  async function danglingUserId(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        email: "gone@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
  }

  async function runSweep(t: ReturnType<typeof convexTest>) {
    vi.useFakeTimers();
    try {
      await t.mutation(internal.users.purgeOrphanedAuthIdentities, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
  }

  /**
   * The failure this guards against is specific. The batch-from-the-start
   * pattern in `convex/purges.ts` works because it deletes everything it reads;
   * this sweep keeps the healthy rows, so the same pattern would re-read them
   * for ever. With more healthy rows than fit in one page, a cursor is the only
   * thing that reaches the orphan sitting behind them.
   */
  test("steps past healthy rows to reach an orphan beyond the first page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const orphanUserId = await danglingUserId(t);
    const PAST_ONE_PAGE = 201;

    await t.run(async (ctx) => {
      const liveUserId = await ctx.db.insert("users", {
        email: "live@test.com",
        role: "USER",
        createdAt: Date.now(),
      });

      for (let index = 0; index < PAST_ONE_PAGE; index += 1) {
        await ctx.db.insert("authAccounts", {
          userId: liveUserId,
          provider: "resend",
          providerAccountId: `live@test.com#${index}`,
        });
      }

      await ctx.db.insert("authAccounts", {
        userId: orphanUserId,
        provider: "resend",
        providerAccountId: "gone@test.com",
      });
    });

    await runSweep(t);

    const accounts = await t.run(async (ctx) => await ctx.db.query("authAccounts").collect());

    expect(accounts).toHaveLength(PAST_ONE_PAGE);
    expect(accounts.some((account) => account.userId === orphanUserId)).toBe(false);
  });

  test("carries on through every table, not just the first", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const orphanUserId = await danglingUserId(t);

    await t.run(async (ctx) => {
      const accountId = await ctx.db.insert("authAccounts", {
        userId: orphanUserId,
        provider: "resend",
        providerAccountId: "gone@test.com",
      });
      await ctx.db.insert("authVerificationCodes", {
        accountId,
        provider: "resend",
        code: "unredeemed",
        expirationTime: Date.now() + 60_000,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: orphanUserId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("invitations", {
        email: "gone@test.com",
        role: "USER",
        status: "ACCEPTED",
        token: "spent",
        invitedAt: Date.now(),
        acceptedAt: Date.now(),
      });
    });

    await runSweep(t);

    const remaining = await t.run(async (ctx) => ({
      accounts: await ctx.db.query("authAccounts").collect(),
      codes: await ctx.db.query("authVerificationCodes").collect(),
      sessions: await ctx.db.query("authSessions").collect(),
      refreshTokens: await ctx.db.query("authRefreshTokens").collect(),
      invitations: await ctx.db.query("invitations").collect(),
    }));

    expect(remaining.accounts).toHaveLength(0);
    expect(remaining.codes).toHaveLength(0);
    expect(remaining.sessions).toHaveLength(0);
    expect(remaining.refreshTokens).toHaveLength(0);
    expect(remaining.invitations).toHaveLength(0);
  });

  test("leaves healthy identities and pending invitations alone", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await t.run(async (ctx) => {
      const liveUserId = await ctx.db.insert("users", {
        email: "live@test.com",
        role: "USER",
        createdAt: Date.now(),
      });
      await ctx.db.insert("authAccounts", {
        userId: liveUserId,
        provider: "resend",
        providerAccountId: "live@test.com",
      });
      await ctx.db.insert("authSessions", {
        userId: liveUserId,
        expirationTime: Date.now() + 60_000,
      });
      // Invited and not yet signed in. No user document is the normal state
      // here, not an orphan — deleting it would cancel a live invitation.
      await ctx.db.insert("invitations", {
        email: "invited@test.com",
        role: "USER",
        status: "PENDING",
        token: "live-token",
        invitedAt: Date.now(),
      });
    });

    await runSweep(t);

    const remaining = await t.run(async (ctx) => ({
      accounts: await ctx.db.query("authAccounts").collect(),
      sessions: await ctx.db.query("authSessions").collect(),
      invitations: await ctx.db.query("invitations").collect(),
    }));

    expect(remaining.accounts).toHaveLength(1);
    expect(remaining.sessions).toHaveLength(1);
    expect(remaining.invitations).toHaveLength(1);
  });
});
