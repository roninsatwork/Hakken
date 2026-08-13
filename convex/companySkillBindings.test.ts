import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * The binding is the switch. A company skill reaches the model only on the
 * surfaces where its binding is enabled, and absence means off — otherwise
 * the switch is painted on with the polarity flipped, which is the fault
 * this work removes. Import turns both switches on so that assigning a
 * skill keeps meaning "it works", and the migration catches up skills that
 * predate the switch so deploy day changes nothing.
 */

afterEach(() => {
  vi.useRealTimers();
});

async function seedWorkspace() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", { email: "super@test.com", role: "SUPER_ADMIN", createdAt: now });
    const companyId = await ctx.db.insert("companies", { name: "Company A", createdAt: now });
    return { adminId, companyId };
  });

  return { t, ...ids };
}

async function insertSkill(
  t: ReturnType<typeof convexTest>,
  args: { companyId: Id<"companies">; adminId: Id<"users">; name: string; instruction: string },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("companySkills", {
      companyId: args.companyId,
      name: args.name,
      category: "OPERATIONS",
      status: "ACTIVE",
      riskLevel: "LOW",
      instruction: args.instruction,
      createdBy: args.adminId,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("company skills apply where they are bound", () => {
  test("a skill with no bindings at all reaches no model", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    await insertSkill(t, { companyId, adminId, name: "Refunds", instruction: "Handle refunds politely." });

    const chat = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "COMPANY_CHAT" }),
    );
    const widget = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "WIDGET" }),
    );

    // Absence is not "default on" — that would reintroduce the painted
    // switch with the polarity flipped.
    expect(chat.skills).toEqual([]);
    expect(widget.skills).toEqual([]);
  });

  test("a disabled chat binding keeps the skill out of company chat", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const skillId = await insertSkill(t, { companyId, adminId, name: "Refunds", instruction: "Handle refunds politely." });
    const asAdmin = t.withIdentity({ subject: adminId });

    await asAdmin.mutation(api.companySkills.setBinding, { skillId, surfaceType: "COMPANY_CHAT", isEnabled: true });
    const before = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "COMPANY_CHAT" }),
    );
    expect(before.skills.map((skill) => skill.name)).toEqual(["Refunds"]);

    await asAdmin.mutation(api.companySkills.setBinding, { skillId, surfaceType: "COMPANY_CHAT", isEnabled: false });
    const after = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "COMPANY_CHAT" }),
    );
    expect(after.skills).toEqual([]);
  });

  test("a widget thread gets widget-bound skills and not chat-only ones", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const chatOnly = await insertSkill(t, { companyId, adminId, name: "Staff lookup", instruction: "Look up the customer's account." });
    const widgetToo = await insertSkill(t, { companyId, adminId, name: "Opening hours", instruction: "State the published hours." });
    const asAdmin = t.withIdentity({ subject: adminId });

    await asAdmin.mutation(api.companySkills.setBinding, { skillId: chatOnly, surfaceType: "COMPANY_CHAT", isEnabled: true });
    await asAdmin.mutation(api.companySkills.setBinding, { skillId: widgetToo, surfaceType: "WIDGET", isEnabled: true });

    const widget = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "WIDGET" }),
    );

    // A skill written for signed-in staff must not speak to anonymous
    // widget visitors just because it exists.
    expect(widget.skills.map((skill) => skill.name)).toEqual(["Opening hours"]);
  });

  test("importing a central skill switches it on for chat and widget", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const globalSkillId = await t.run(async (ctx) =>
      ctx.db.insert("agentSkills", {
        name: "Client Follow-up",
        category: "IMPORTED",
        status: "ACTIVE",
        riskLevel: "LOW",
        instruction: "Follow up within one working day.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const { skillId } = await t
      .withIdentity({ subject: adminId })
      .mutation(api.companySkills.importGlobalSkill, { companyId, skillId: globalSkillId });

    // Assigning is the selection; there is no second step to forget.
    for (const surfaceType of ["COMPANY_CHAT", "WIDGET"] as const) {
      const runtime = await t.run(async (ctx) =>
        ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType }),
      );
      expect(runtime.skills.map((skill) => skill.skillId)).toEqual([skillId]);
    }
  });

  test("re-importing an archived skill re-enables its bindings", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const asAdmin = t.withIdentity({ subject: adminId });
    const globalSkillId = await t.run(async (ctx) =>
      ctx.db.insert("agentSkills", {
        name: "Client Follow-up",
        category: "IMPORTED",
        status: "ACTIVE",
        riskLevel: "LOW",
        instruction: "Follow up within one working day.",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const { skillId } = await asAdmin.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: globalSkillId });
    await asAdmin.mutation(api.companySkills.archiveSkill, { skillId });

    const whileArchived = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "COMPANY_CHAT" }),
    );
    expect(whileArchived.skills).toEqual([]);

    await asAdmin.mutation(api.companySkills.importGlobalSkill, { companyId, skillId: globalSkillId });
    const revived = await t.run(async (ctx) =>
      ctx.runQuery(internal.companySkills.getRuntimeCompanySkillsInternal, { companyId, surfaceType: "COMPANY_CHAT" }),
    );
    expect(revived.skills.map((skill) => skill.skillId)).toEqual([skillId]);
  });

  test("the migration catches up skills from before the switch, and is idempotent", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    // A skill that predates bindings: active, serving every message, no rows
    // in the bindings table.
    await insertSkill(t, { companyId, adminId, name: "Refunds", instruction: "Handle refunds politely." });

    vi.useFakeTimers();
    const runOnce = async () => {
      await t.mutation(internal.dataMigrations.run, { name: "2026-08-13-company-skill-bindings-backfill", force: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    };

    await runOnce();
    const afterFirst = await t.run(async (ctx) => ctx.db.query("companySkillBindings").collect());
    // Deploy day must behave like the day before: on for both surfaces.
    expect(afterFirst).toHaveLength(2);
    expect(afterFirst.every((binding) => binding.isEnabled)).toBe(true);
    expect(new Set(afterFirst.map((binding) => binding.surfaceType))).toEqual(new Set(["COMPANY_CHAT", "WIDGET"]));

    await runOnce();
    const afterSecond = await t.run(async (ctx) => ctx.db.query("companySkillBindings").collect());
    expect(afterSecond).toHaveLength(2);
  });

  test("the migration leaves a deliberately disabled binding off", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const skillId = await insertSkill(t, { companyId, adminId, name: "Refunds", instruction: "Handle refunds politely." });
    const asAdmin = t.withIdentity({ subject: adminId });

    // An admin already made a decision; a backfill must not overrule it.
    await asAdmin.mutation(api.companySkills.setBinding, { skillId, surfaceType: "WIDGET", isEnabled: false });

    vi.useFakeTimers();
    await t.mutation(internal.dataMigrations.run, { name: "2026-08-13-company-skill-bindings-backfill", force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const bindings = await t.run(async (ctx) => ctx.db.query("companySkillBindings").collect());
    const widget = bindings.find((binding) => binding.surfaceType === "WIDGET");
    const chat = bindings.find((binding) => binding.surfaceType === "COMPANY_CHAT");
    expect(widget?.isEnabled).toBe(false);
    expect(chat?.isEnabled).toBe(true);
  });

  test("archived skills get no bindings from the migration", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("companySkills", {
        companyId,
        name: "Old ways",
        category: "OPERATIONS",
        status: "ARCHIVED",
        riskLevel: "LOW",
        instruction: "No longer used.",
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
    });

    vi.useFakeTimers();
    await t.mutation(internal.dataMigrations.run, { name: "2026-08-13-company-skill-bindings-backfill", force: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => ctx.db.query("companySkillBindings").collect())).toEqual([]);
  });

  test("the skills list reports each skill's switches", async () => {
    const { t, adminId, companyId } = await seedWorkspace();
    const skillId = await insertSkill(t, { companyId, adminId, name: "Refunds", instruction: "Handle refunds politely." });
    const asAdmin = t.withIdentity({ subject: adminId });

    await asAdmin.mutation(api.companySkills.setBinding, { skillId, surfaceType: "COMPANY_CHAT", isEnabled: true });

    const page = await asAdmin.query(api.companySkills.getSkillsForCompany, {
      companyId,
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(page.page).toHaveLength(1);
    // The screen reads the same switch the runtime does, not a parallel truth.
    expect(page.page[0].surfaces).toEqual({ chat: true, widget: false });
  });
});
