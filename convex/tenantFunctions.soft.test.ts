import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The soft builders' whole contract, exercised through real endpoints: no
 * session gets `empty` and the handler never runs; the wrong role gets
 * `empty`; a qualifying caller gets the handler. One migrated endpoint per
 * case, chosen for having the simplest data needs.
 */

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

describe("softQuery", () => {
  test("no session returns empty without running the handler", async () => {
    const t = setup();
    await expect(t.query(api.plans.getMyCompanyPlanStatus, {})).resolves.toBeNull();
    await expect(t.query(api.aiRules.getRules, {})).resolves.toEqual([]);
    await expect(
      t.query(api.aiRules.getOffsetPaginatedRules, { page: 1, pageSize: 15 })
    ).resolves.toEqual({ data: [], totalCount: 0, totalPages: 1 });
  });

  test("the wrong role returns empty", async () => {
    const t = setup();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "user@example.com", role: "USER" })
    );
    const asUser = t.withIdentity({ subject: userId });
    await expect(asUser.query(api.users.getMyLoginsCount, {})).resolves.toBe(0);
    await expect(asUser.query(api.auditLogs.getRecentLogs, {})).resolves.toEqual([]);
  });

  test("a qualifying caller reaches the handler", async () => {
    const t = setup();
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "root@example.com", role: "SUPER_ADMIN" })
    );
    const asAdmin = t.withIdentity({ subject: adminId });
    await expect(asAdmin.query(api.users.getMyLoginsCount, {})).resolves.toBe(0);
    const plan = await asAdmin.query(api.plans.getMyCompanyPlanStatus, {});
    expect(plan).not.toBeNull();
  });
});

describe("softMutation", () => {
  test("no session is a no-op that writes nothing", async () => {
    const t = setup();
    await expect(
      t.mutation(api.users.recordLogin, { device: "d", ip: "1.2.3.4", location: "x" })
    ).resolves.toBeNull();
    await expect(t.mutation(api.users.recordLogout, {})).resolves.toBeNull();
    const logins = await t.run(async (ctx) => ctx.db.query("logins").collect());
    expect(logins).toHaveLength(0);
  });

  test("a signed-in caller's write lands", async () => {
    const t = setup();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "user@example.com", role: "USER" })
    );
    const asUser = t.withIdentity({ subject: userId });
    const loginId = await asUser.mutation(api.users.recordLogin, {
      device: "test-device",
      ip: "1.2.3.4",
      location: "somewhere",
    });
    expect(loginId).not.toBeNull();
    const logins = await t.run(async (ctx) => ctx.db.query("logins").collect());
    expect(logins).toHaveLength(1);
  });
});
