import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { CORE_MODULES, DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * A capability switched off is unreachable, not merely hidden.
 *
 * Phase 6's own done-line, proven per module. Each block calls a capability's
 * server functions as a member of a company with the module withheld and
 * expects refusal — the menu never enters into it. The bypasses are proven
 * too: a super admin passes without any flag, because the admin console is
 * where a withheld capability is administered, and the one-shot migration
 * seeds companies from before the switch existed so the deploy that lands
 * this changes nothing for anyone.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type TestConvex = ReturnType<typeof makeTest>;

const WITHHELD = "This section is switched off for your workspace";

async function seedCompany(t: TestConvex, modules: string[]) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Withheld & Co",
      createdAt: Date.now(),
      enabledModules: modules,
    });
    const memberId = await ctx.db.insert("users", {
      name: "Member",
      email: "member@example.com",
      role: "USER",
      companyId,
      createdAt: Date.now(),
    });
    const adminId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@example.com",
      role: "ADMIN",
      companyId,
      createdAt: Date.now(),
    });
    const superId = await ctx.db.insert("users", {
      name: "Platform",
      email: "platform@example.com",
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    });
    return { companyId, memberId, adminId, superId };
  });
}

const asUser = (t: TestConvex, userId: Id<"users">) =>
  t.withIdentity({ subject: userId });

describe("a withheld capability refuses by URL, not by menu", () => {
  test("tasks", async () => {
    const t = makeTest();
    const { memberId } = await seedCompany(t, []);

    await expect(
      asUser(t, memberId).query(api.tasks.listTasks, { paginationOpts: { numItems: 5, cursor: null } })
    ).rejects.toThrow(WITHHELD);
  });

  test("calls", async () => {
    const t = makeTest();
    const { memberId } = await seedCompany(t, []);

    await expect(asUser(t, memberId).query(api.telephony.listCalls, {})).rejects.toThrow(WITHHELD);
  });

  test("reception, signed in and at the anonymous kiosk", async () => {
    const t = makeTest();
    const { companyId, memberId } = await seedCompany(t, []);

    await expect(
      asUser(t, memberId).query(api.kiosk.listMyReceptionScreens, {})
    ).rejects.toThrow(WITHHELD);

    // The kiosk is anonymous, so its refusal is the same quiet null a
    // non-kiosk widget gets — nothing for a visitor to read.
    const widgetId = await t.run(async (ctx) =>
      await ctx.db.insert("widgets", {
        companyId,
        name: "Front desk",
        allowedDomains: [],
        isActive: true,
        kioskEnabled: true,
        createdAt: Date.now(),
      })
    );
    expect(await t.query(api.kiosk.getKioskConfig, { widgetId })).toBeNull();
    expect(await t.mutation(api.kiosk.createKioskThread, { widgetId })).toBeNull();
  });



  test("wiki", async () => {
    const t = makeTest();
    const { memberId } = await seedCompany(t, []);

    await expect(
      asUser(t, memberId).query(api.wikiPages.listCompanyPages, {})
    ).rejects.toThrow(WITHHELD);
  });
});

describe("who still passes", () => {
  test("the same calls succeed once the module is on", async () => {
    const t = makeTest();
    const { memberId, adminId: _adminId } = await seedCompany(t, [...DEFAULT_COMPANY_MODULE_KEYS]);

    await expect(
      asUser(t, memberId).query(api.tasks.listTasks, { paginationOpts: { numItems: 5, cursor: null } })
    ).resolves.toBeDefined();
    await expect(asUser(t, memberId).query(api.telephony.listCalls, {})).resolves.toBeDefined();

  });

  test("a super admin passes with every module withheld, because the console is where withholding is administered", async () => {
    const t = makeTest();
    const { superId } = await seedCompany(t, []);

    await expect(
      asUser(t, superId).query(api.tasks.listTasks, { paginationOpts: { numItems: 5, cursor: null } })
    ).resolves.toBeDefined();
    await expect(asUser(t, superId).query(api.telephony.listCalls, {})).resolves.toBeDefined();
  });
});

describe("the deploy that changes the meaning of absence", () => {
  test("the migration seeds old companies and leaves decisions alone", async () => {
    const t = makeTest();
    const before = await t.run(async (ctx) => {
      const legacy = await ctx.db.insert("companies", { name: "Legacy", createdAt: Date.now() });
      const bespoke = await ctx.db.insert("companies", {
        name: "Bespoke",
        createdAt: Date.now(),
        enabledModules: ["salesData"],
      });
      const complete = await ctx.db.insert("companies", {
        name: "Complete",
        createdAt: Date.now(),
        enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
      });
      return { legacy, bespoke, complete };
    });

    await t.mutation(internal.dataMigrations.run, { name: "2026-08-18-core-company-modules-backfill" });
    await finishScheduled(t);

    const [legacy, bespoke, complete] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(before.legacy), ctx.db.get(before.bespoke), ctx.db.get(before.complete)])
    );

    for (const key of DEFAULT_COMPANY_MODULE_KEYS) {
      expect(legacy?.enabledModules).toContain(key);
      expect(bespoke?.enabledModules).toContain(key);
    }
    expect(bespoke?.enabledModules).toContain("salesData");
    expect(complete?.enabledModules).toEqual([...DEFAULT_COMPANY_MODULE_KEYS]);
  });
});

describe("a plan grants capabilities", () => {
  test("moving a company between plans changes what it can reach, and the override still wins", async () => {
    const t = makeTest();
    const { companyId, memberId } = await seedCompany(t, []);

    const { starter, pro } = await t.run(async (ctx) => ({
      starter: await ctx.db.insert("plans", {
        name: "Starter",
        messageLimit: 1000,
        priceGBP: 49,
        grantedModules: [],
        isActive: true,
        createdAt: Date.now(),
      }),
      pro: await ctx.db.insert("plans", {
        name: "Pro",
        messageLimit: -1,
        priceGBP: 199,
        grantedModules: [CORE_MODULES.tasks],
        isActive: true,
        createdAt: Date.now(),
      }),
    }));

    const listTasks = () =>
      asUser(t, memberId).query(api.tasks.listTasks, { paginationOpts: { numItems: 5, cursor: null } });

    // On Starter: nothing granted, nothing held.
    await t.run(async (ctx) => { await ctx.db.patch(companyId, { planId: starter }); });
    await expect(listTasks()).rejects.toThrow(WITHHELD);

    // Moved to Pro: the tier turns the capability on. No company edit anywhere.
    await t.run(async (ctx) => { await ctx.db.patch(companyId, { planId: pro }); });
    await expect(listTasks()).resolves.toBeDefined();

    // Back to Starter, but given the capability directly: the override wins.
    await t.run(async (ctx) => {
      await ctx.db.patch(companyId, { planId: starter, enabledModules: [CORE_MODULES.tasks] });
    });
    await expect(listTasks()).resolves.toBeDefined();
  });

  test("the workspace query the sidebar and gates read reports the plan's grants", async () => {
    const t = makeTest();
    const { companyId, memberId } = await seedCompany(t, []);
    await t.run(async (ctx) => {
      const planId = await ctx.db.insert("plans", {
        name: "Pro",
        messageLimit: -1,
        priceGBP: 199,
        grantedModules: [CORE_MODULES.calls],
        isActive: true,
        createdAt: Date.now(),
      });
      await ctx.db.patch(companyId, { planId });
    });

    const workspace = await asUser(t, memberId).query(api.companies.getMyWorkspaceModules, {});
    expect(workspace.enabledModules).toContain(CORE_MODULES.calls);
    expect(workspace.enabledModules).not.toContain(CORE_MODULES.tasks);
  });
});

describe("what a company is offered", () => {
  test("the registry names every core capability and the defaults grant them all", () => {
    expect(DEFAULT_COMPANY_MODULE_KEYS).toEqual(
      expect.arrayContaining([
        ...Object.values(CORE_MODULES),
      ])
    );
  });

  test("governance is not one of them — it is a platform surface, not a purchase", () => {
    // Anthony, 2026-08-18: "governance is not something to turn on or off per
    // company, it's a platform feature for super admins." The workspace's own
    // governance pages stay gated on the role that opens them.
    expect(DEFAULT_COMPANY_MODULE_KEYS).not.toContain("governance");
    expect(Object.values(CORE_MODULES)).not.toContain("governance");
  });
});
