import { convexTest } from "convex-test";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("Audit log access controls", () => {
  test("non-super-admin users receive empty audit log reads", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
      });
    });

    const userClient = t.withIdentity({ subject: userId });

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "TEST_ACTION",
        entityType: "systemConfig",
        timestamp: Date.now(),
      });
    });

    await expect(userClient.query(api.auditLogs.getRecentLogs)).resolves.toEqual([]);
  });

  test("super-admin users read recent logs with the actor named", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        name: "Admin User",
        role: "SUPER_ADMIN",
      });
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLogs", {
        actorId: superAdminId,
        actionType: "UPDATE_SYSTEM_PREFERENCES",
        entityType: "systemConfig",
        timestamp: Date.now(),
      });
    });

    const logs = await superAdminClient.query(api.auditLogs.getRecentLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].actionType).toBe("UPDATE_SYSTEM_PREFERENCES");
    expect(logs[0].actorName).toBe("Admin User");
  });
});

/**
 * Widening the audit trail past super admins made scope a live question: the
 * governance read roles include `ADMIN`, and an unscoped trail would have shown
 * a company administrator every other tenant's activity.
 */
describe("audit trail tenancy", () => {
  test("a company admin sees their own workspace and no one else's", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyA, companyB } = await t.run(async (ctx) => {
      const companyA = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const companyB = await ctx.db.insert("companies", { name: "Other", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const adminId = await ctx.db.insert("users", {
        email: "admin@acme.test",
        role: "ADMIN",
        companyId: companyA,
      });

      await ctx.db.insert("auditLogs", {
        actorId: adminId,
        actionType: "UPDATE_COMPANY",
        entityType: "companies",
        companyId: companyA,
        timestamp: Date.now(),
      });
      await ctx.db.insert("auditLogs", {
        actorId: adminId,
        actionType: "UPDATE_COMPANY",
        entityType: "companies",
        companyId: companyB,
        timestamp: Date.now(),
      });

      return { adminId, companyA, companyB };
    });

    const logs = await t
      .withIdentity({ subject: adminId })
      .query(api.auditLogs.getRecentLogs, {});

    expect(logs).toHaveLength(1);
    expect(logs[0].companyId).toBe(companyA);
    expect(logs.some((log) => log.companyId === companyB)).toBe(false);
  });

  test("an ordinary user sees nothing at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "user@acme.test", role: "USER" })
    );

    expect(await t.withIdentity({ subject: userId }).query(api.auditLogs.getRecentLogs, {})).toEqual([]);
  });
});

/**
 * Three things the list did not carry, so answering "what did this person do in
 * that client's workspace last month" meant opening rows one at a time — and
 * there was no way to hand the answer to anyone.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
describe("reading the trail without opening every row", () => {
  const seed = async (t: ReturnType<typeof convexTest>) => {
    return await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        name: "Admin User",
        role: "SUPER_ADMIN",
      });
      const companyId = await ctx.db.insert("companies", { name: "Comax", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], });
      const agentId = await ctx.db.insert("agents", {
        name: "Housekeeping Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("auditLogs", {
        actorId: superAdminId,
        actionType: "UPDATE_AGENT",
        entityType: "agents",
        entityId: agentId,
        companyId,
        timestamp: Date.now(),
        metadata: JSON.stringify({ changes: [{ field: "description", from: "Old", to: "New" }] }),
      });

      return { superAdminId, companyId, agentId };
    });
  };

  test("names what it was done to, and which workspace it belonged to", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, companyId } = await seed(t);

    const result = await t
      .withIdentity({ subject: superAdminId })
      .query(api.auditLogs.getAuditPage, { paginationOpts: { numItems: 10, cursor: null } });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].targetName).toBe("Housekeeping Agent");
    expect(result.page[0].companyName).toBe("Comax");
    expect(result.page[0].companyId).toBe(companyId);
    expect(result.page[0].change).toBe("Purpose: Old → New");
  });

  test("narrows to one person and one workspace", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, companyId } = await seed(t);

    const client = t.withIdentity({ subject: superAdminId });
    const page = { paginationOpts: { numItems: 10, cursor: null } };

    expect((await client.query(api.auditLogs.getAuditPage, { ...page, actorId: superAdminId })).page)
      .toHaveLength(1);
    expect((await client.query(api.auditLogs.getAuditPage, { ...page, companyId })).page)
      .toHaveLength(1);

    const otherCompanyId = await t.run(
      async (ctx) => await ctx.db.insert("companies", { name: "Elsewhere", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS], }),
    );
    expect(
      (await client.query(api.auditLogs.getAuditPage, { ...page, companyId: otherCompanyId })).page,
    ).toEqual([]);
  });

  test("offers everyone who could appear, not everyone on the page", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);

    const options = await t
      .withIdentity({ subject: superAdminId })
      .query(api.auditLogs.getAuditFilterOptions, {});

    expect(options.actions).toEqual(["UPDATE_AGENT"]);
    expect(options.people.map((person) => person.name)).toContain("Admin User");
    expect(options.workspaces.map((workspace) => workspace.name)).toContain("Comax");
  });

  test("exports what the reader was looking at, and says when it stopped short", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seed(t);

    const exported = await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.auditLogs.getAuditExport, {});

    expect(exported.truncated).toBe(false);
    expect(exported.rows).toEqual([
      {
        when: expect.any(String),
        action: "UPDATE_AGENT",
        who: "Admin User",
        whatHappened: "Purpose: Old → New",
        target: "Housekeeping Agent",
        workspace: "Comax",
      },
    ]);
  });

  test("an ordinary user exports nothing at all", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seed(t);

    const userId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "user@test.com", role: "USER" }),
    );

    const exported = await t
      .withIdentity({ subject: userId })
      .mutation(api.auditLogs.getAuditExport, {});

    expect(exported.rows).toEqual([]);
  });
});

/**
 * Taking a copy of the whole trail off the platform is the one read on this
 * screen worth recording, and a Convex query cannot write — so the export is a
 * mutation. Viewing the trail is a page view and stays unrecorded, by the
 * decision at the top of the plan.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
describe("the export records itself", () => {
  test("names who took a copy, and what they narrowed it to", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: "admin@test.com",
          name: "Admin User",
          role: "SUPER_ADMIN",
        }),
    );

    await t
      .withIdentity({ subject: superAdminId })
      .mutation(api.auditLogs.getAuditExport, { actionType: "UPDATE_AGENT", search: "purpose" });

    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const exportEntries = logs.filter((log) => log.actionType === "EXPORT_AUDIT_TRAIL");

    expect(exportEntries).toHaveLength(1);
    expect(exportEntries[0].actorId).toBe(superAdminId);
    expect(JSON.parse(exportEntries[0].metadata ?? "{}")).toEqual({
      recordsTaken: 0,
      narrowedToAction: "UPDATE_AGENT",
      searchedFor: "purpose",
    });
  });

  test("an ordinary user takes nothing and leaves no entry", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const userId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "user@test.com", role: "USER" }),
    );

    await t.withIdentity({ subject: userId }).mutation(api.auditLogs.getAuditExport, {});

    const logs = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(logs).toEqual([]);
  });
});
