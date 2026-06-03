import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("AI Rules Validation", () => {
  test("getOffsetPaginatedRules isolates by companyId", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    // Set up standard user + company
    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "user@test.com",
        role: "USER",
        companyId: companyId
      });
    });

    // Create rules
    await t.run(async (ctx) => {
      await ctx.db.insert("aiRules", {
        name: "Legit Rule",
        trigger: "test",
        instruction: "Do it",
        priority: "NORMAL",
        isActive: true,
        companyId: companyId,
        createdBy: userId,
        createdAt: Date.now()
      });
      await ctx.db.insert("aiRules", {
        name: "Foreign Rule",
        trigger: "test",
        instruction: "Do it too",
        priority: "NORMAL",
        isActive: true,
        companyId: foreignCompanyId,
        createdBy: userId,
        createdAt: Date.now()
      });
    });

    const client = t.withIdentity({ subject: userId });

    const page = await client.query(api.aiRules.getOffsetPaginatedRules, {
      companyId: companyId,
      searchTerm: "",
      page: 1,
      pageSize: 15
    });
    expect(page.data.length).toBe(1);
    expect(page.data[0].name).toBe("Legit Rule");

    // Should FAIL for foreign company
    // Should FAIL for foreign company (returns empty array)
    const foreignPage = await client.query(api.aiRules.getOffsetPaginatedRules, {
      companyId: foreignCompanyId,
      searchTerm: "",
      page: 1,
      pageSize: 15
    });
    expect(foreignPage.data.length).toBe(0);
  });

  test("ADMIN can create own-company rules but not foreign or global rules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    const adminClient = t.withIdentity({ subject: adminId });

    const ruleId = await adminClient.mutation(api.aiRules.createRule, {
      companyId,
      name: "Own Rule",
      trigger: "own",
      instruction: "Allowed",
      priority: "NORMAL",
      isActive: true,
    });

    const ownRule = await t.run(async (ctx) => await ctx.db.get(ruleId));
    expect(ownRule?.companyId).toBe(companyId);

    await expect(
      adminClient.mutation(api.aiRules.createRule, {
        companyId: foreignCompanyId,
        name: "Foreign Rule",
        trigger: "foreign",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      adminClient.mutation(api.aiRules.createRule, {
        name: "Global Rule",
        trigger: "global",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("ADMIN cannot mutate global or foreign-company rules", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const companyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Test Corp", createdAt: Date.now() });
    });
    const foreignCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
    });
    const adminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
      });
    });

    const [globalRuleId, foreignRuleId] = await t.run(async (ctx) => {
      const globalRule = await ctx.db.insert("aiRules", {
        name: "Global Rule",
        trigger: "global",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
        createdBy: adminId,
        createdAt: Date.now(),
      });
      const foreignRule = await ctx.db.insert("aiRules", {
        name: "Foreign Rule",
        trigger: "foreign",
        instruction: "Denied",
        priority: "NORMAL",
        isActive: true,
        companyId: foreignCompanyId,
        createdBy: adminId,
        createdAt: Date.now(),
      });

      return [globalRule, foreignRule];
    });

    const adminClient = t.withIdentity({ subject: adminId });

    await expect(
      adminClient.mutation(api.aiRules.toggleRuleActive, {
        id: globalRuleId,
        isActive: false,
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      adminClient.mutation(api.aiRules.deleteRule, {
        id: foreignRuleId,
      })
    ).rejects.toThrow("Unauthorized");
  });

  test("SUPER_ADMIN can create, update, toggle, and delete global rules with audit logs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
    });

    const client = t.withIdentity({ subject: superAdminId });

    const ruleId = await client.mutation(api.aiRules.createRule, {
      name: "Global Safety Rule",
      trigger: "unsafe",
      instruction: "Escalate unsafe requests.",
      priority: "HIGH",
      isActive: true,
    });

    const fetchedRule = await client.query(api.aiRules.getRuleById, { id: ruleId });
    expect(fetchedRule).toMatchObject({
      name: "Global Safety Rule",
      trigger: "unsafe",
      priority: "HIGH",
      isActive: true,
    });

    await expect(
      client.mutation(api.aiRules.updateRule, {
        id: ruleId,
        name: "Updated Global Safety Rule",
        trigger: "unsafe, escalation",
        instruction: "Escalate unsafe or high-risk requests.",
        priority: "CRITICAL",
        isActive: true,
      })
    ).resolves.toBe(ruleId);

    await expect(client.mutation(api.aiRules.toggleRuleActive, { id: ruleId, isActive: false })).resolves.toBe(ruleId);
    await expect(client.mutation(api.aiRules.deleteRule, { id: ruleId })).resolves.toBe(true);

    const { deletedRule, auditLogs } = await t.run(async (ctx) => ({
      deletedRule: await ctx.db.get(ruleId),
      auditLogs: await ctx.db.query("auditLogs").collect(),
    }));

    expect(deletedRule).toBeNull();
    expect(auditLogs.map((log) => log.actionType)).toEqual([
      "CREATE_AI_RULE",
      "UPDATE_AI_RULE",
      "TOGGLE_AI_RULE",
      "DELETE_AI_RULE",
    ]);
    expect(auditLogs.map((log) => JSON.parse(log.metadata || "{}"))).toEqual([
      { trigger: "unsafe", scope: "global" },
      { updatedTrigger: "unsafe, escalation", updatedPriority: "CRITICAL" },
      { active: false },
      { trigger: "unsafe, escalation" },
    ]);
  });

  test("getRules and getRuleById enforce global, company, and agent rule visibility", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, foreignCompanyId, adminId, superAdminId, agentId, globalRuleId, companyRuleId, agentCompanyRuleId, agentGlobalRuleId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Tenant Corp", createdAt: Date.now() });
      const foreignCompanyId = await ctx.db.insert("companies", { name: "Other Corp", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@test.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Agent",
        modelId: "model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const globalRuleId = await ctx.db.insert("aiRules", {
        name: "Global Rule",
        trigger: "global",
        instruction: "Global instruction",
        priority: "NORMAL",
        isActive: true,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      const companyRuleId = await ctx.db.insert("aiRules", {
        name: "Company Rule",
        trigger: "company",
        instruction: "Company instruction",
        priority: "NORMAL",
        isActive: true,
        companyId,
        createdBy: adminId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("aiRules", {
        name: "Foreign Company Rule",
        trigger: "foreign",
        instruction: "Foreign instruction",
        priority: "NORMAL",
        isActive: true,
        companyId: foreignCompanyId,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });
      const agentCompanyRuleId = await ctx.db.insert("aiRules", {
        name: "Agent Company Rule",
        trigger: "agent-company",
        instruction: "Agent company instruction",
        priority: "HIGH",
        isActive: true,
        companyId,
        agentId,
        createdBy: adminId,
        createdAt: Date.now(),
      });
      const agentGlobalRuleId = await ctx.db.insert("aiRules", {
        name: "Agent Global Rule",
        trigger: "agent-global",
        instruction: "Agent global instruction",
        priority: "HIGH",
        isActive: true,
        agentId,
        createdBy: superAdminId,
        createdAt: Date.now(),
      });

      return {
        companyId,
        foreignCompanyId,
        adminId,
        superAdminId,
        agentId,
        globalRuleId,
        companyRuleId,
        agentCompanyRuleId,
        agentGlobalRuleId,
      };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    expect((await superAdminClient.query(api.aiRules.getRules, {})).map((rule) => rule._id)).toEqual([globalRuleId]);
    expect((await adminClient.query(api.aiRules.getRules, { companyId })).map((rule) => rule._id)).toContain(companyRuleId);
    expect(await adminClient.query(api.aiRules.getRules, { companyId: foreignCompanyId })).toEqual([]);

    const adminAgentRules = await adminClient.query(api.aiRules.getRules, { agentId });
    const superAdminAgentRules = await superAdminClient.query(api.aiRules.getRules, { agentId });

    expect(adminAgentRules.map((rule) => rule._id)).toEqual([agentCompanyRuleId]);
    expect(superAdminAgentRules.map((rule) => rule._id).toSorted()).toEqual([agentCompanyRuleId, agentGlobalRuleId].toSorted());

    await expect(adminClient.query(api.aiRules.getRuleById, { id: globalRuleId })).rejects.toThrow("Unauthorized");
    await expect(adminClient.query(api.aiRules.getRuleById, { id: agentGlobalRuleId })).rejects.toThrow("Unauthorized");
    await expect(adminClient.query(api.aiRules.getRuleById, { id: companyRuleId })).resolves.toMatchObject({
      name: "Company Rule",
    });
  });

  test("internal active rule resolution includes global, company, and agent active rules only", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, agentId, globalRuleId, companyRuleId, agentRuleId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Tenant Corp", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Agent",
        modelId: "model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const globalRuleId = await ctx.db.insert("aiRules", {
        name: "Global Active",
        trigger: "global",
        instruction: "Global",
        priority: "NORMAL",
        isActive: true,
        createdBy: userId,
        createdAt: Date.now(),
      });
      const companyRuleId = await ctx.db.insert("aiRules", {
        name: "Company Active",
        trigger: "company",
        instruction: "Company",
        priority: "NORMAL",
        isActive: true,
        companyId,
        createdBy: userId,
        createdAt: Date.now(),
      });
      const agentRuleId = await ctx.db.insert("aiRules", {
        name: "Agent Active",
        trigger: "agent",
        instruction: "Agent",
        priority: "NORMAL",
        isActive: true,
        agentId,
        createdBy: userId,
        createdAt: Date.now(),
      });
      await ctx.db.insert("aiRules", {
        name: "Inactive",
        trigger: "inactive",
        instruction: "Inactive",
        priority: "NORMAL",
        isActive: false,
        companyId,
        agentId,
        createdBy: userId,
        createdAt: Date.now(),
      });

      return { companyId, agentId, globalRuleId, companyRuleId, agentRuleId };
    });

    const rules = await t.run(async (ctx) => {
      return await ctx.runQuery(internal.aiRules.getActiveRulesInternal, { companyId, agentId });
    });

    expect(rules.map((rule) => rule._id)).toEqual([globalRuleId, companyRuleId, agentRuleId]);
  });

  test("seedPricingRule requires an existing super admin and creates the pricing protocol", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    await expect(t.mutation(internal.aiRules.seedPricingRule, {})).rejects.toThrow("No super administrators found");

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
    });

    const ruleId = await t.mutation(internal.aiRules.seedPricingRule, {});
    const rule = await t.run(async (ctx) => await ctx.db.get(ruleId));

    expect(rule).toMatchObject({
      name: "Pricing Protocol",
      priority: "HIGH",
      isActive: true,
    });
  });
});
