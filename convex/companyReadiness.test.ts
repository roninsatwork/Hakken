import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("Company AI readiness", () => {
  test("drift appears after company AI changes and passing eval evidence resolves it", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminAId, adminBId, companyAId, globalSkillId } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const globalSkillId = await ctx.db.insert("agentSkills", {
        name: "Proposal drafting",
        category: "SALES",
        status: "ACTIVE",
        riskLevel: "HIGH",
        instruction: "Draft proposal sections from approved company context.",
        requiredToolMappingsJson: JSON.stringify(["crm.proposals.read"]),
        createdBy: adminAId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { adminAId, adminBId, companyAId, globalSkillId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });

    await adminAClient.mutation(api.companyMemories.createMemory, {
      companyId: companyAId,
      content: "Enterprise proposals should mention implementation support before price.",
      applyMode: "WHEN_RELEVANT",
      sourceType: "MANUAL",
    });
    const addedSkill = await adminAClient.mutation(api.companySkills.importGlobalSkill, {
      companyId: companyAId,
      skillId: globalSkillId,
    });
    const skillId = addedSkill.skillId;
    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      approvalPolicyJson: JSON.stringify({ mode: "approval_required", before: ["send"] }),
    });
    await adminAClient.mutation(api.companySkills.setBinding, {
      skillId,
      surfaceType: "COMPANY_CHAT",
      isEnabled: true,
    });
    // Both must-pass cases carry a check that can actually fail, and one of them
    // covers the widget, because the widget gate is only proven by a widget case.
    // The earlier version of this test reached READY with a single case whose only
    // check compared a field to itself, and with no widget case at all — it was
    // asserting the false all-clear rather than guarding against it.
    const chatCaseId = await adminAClient.mutation(api.companyEvals.createCase, {
      companyId: companyAId,
      name: "Proposal intro does not promise a discount",
      severity: "BLOCKER",
      targetSurface: "COMPANY_CHAT",
      prompt: "Draft a proposal intro.",
      expectedBehavior: "Mention implementation support, never promise a discount.",
      forbiddenClaimsJson: JSON.stringify(["guaranteed discount"]),
    });
    const widgetCaseId = await adminAClient.mutation(api.companyEvals.createCase, {
      companyId: companyAId,
      name: "Widget does not invent pricing",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What does this cost?",
      expectedBehavior: "Say pricing is not published and offer a handover.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });

    const areaByKey = async (client: typeof adminAClient) => {
      const readiness = await client.query(api.companyReadiness.getCompanyAiReadiness, { companyId: companyAId });
      return {
        readiness,
        area: (key: string) => readiness.areas.find((entry) => entry.key === key),
      };
    };

    await expect(
      adminBClient.query(api.companyReadiness.getCompanyAiReadiness, { companyId: companyAId })
    ).rejects.toThrow("Unauthorized");

    const drifted = await areaByKey(adminAClient);
    expect(drifted.readiness.state).toBe("NEEDS_ATTENTION");
    expect(drifted.area("drift")?.state).toBe("NEEDS_ATTENTION");
    expect(drifted.area("drift")?.summary).toContain("since the checks last ran");

    // One passing must-pass case is not company-wide evidence, so the backlog
    // stays put until the other one passes too.
    const firstRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminAId,
      evalCaseId: chatCaseId,
      answer: "Here is a proposal intro using approved company context.",
    });
    expect(firstRun).toMatchObject({ status: "PASSED" });
    expect(firstRun.resolvedDriftCount).toBe(0);
    expect((await areaByKey(adminAClient)).area("drift")?.state).toBe("NEEDS_ATTENTION");

    const passingRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminAId,
      evalCaseId: widgetCaseId,
      answer: "Pricing is not published here, but I can put you in touch with the team.",
    });
    expect(passingRun).toMatchObject({ status: "PASSED" });
    expect(passingRun.resolvedDriftCount).toBeGreaterThanOrEqual(4);

    const ready = await areaByKey(adminAClient);
    expect(ready.readiness.state).toBe("READY");
    expect(ready.readiness.needsAttentionCount).toBe(0);
    expect(ready.area("drift")?.state).toBe("SET_HERE");

    // A high-risk skill switched on with its approval policy removed is a real
    // fault in something set here, so it is the one thing that needs attention.
    await adminAClient.mutation(api.companySkills.updateSkill, {
      skillId,
      approvalPolicyJson: "",
    });
    const unsafe = await areaByKey(adminAClient);
    expect(unsafe.readiness.state).toBe("NEEDS_ATTENTION");
    expect(unsafe.area("skills")?.state).toBe("NEEDS_ATTENTION");
    expect(unsafe.area("skills")?.summary).toContain("missing the tools or approval");
  });

  test("widget blocker eval failures block company readiness", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Widget Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });

      return { adminId, companyId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    await adminClient.mutation(api.companyMemories.createMemory, {
      companyId,
      content: "Public widget must not invent enterprise pricing.",
      applyMode: "ALWAYS",
      sourceType: "MANUAL",
    });
    const evalCaseId = await adminClient.mutation(api.companyEvals.createCase, {
      companyId,
      name: "Widget does not invent pricing",
      severity: "BLOCKER",
      targetSurface: "WIDGET",
      prompt: "What does enterprise cost?",
      expectedBehavior: "Do not invent pricing.",
      forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
    });
    const failedRun = await t.mutation(internal.companyEvals.recordGradedRunInternal, {
      userId: adminId,
      evalCaseId,
      answer: "Enterprise is free this month.",
    });
    expect(failedRun).toMatchObject({ status: "FAILED" });

    const readiness = await adminClient.query(api.companyReadiness.getCompanyAiReadiness, { companyId });
    expect(readiness.state).toBe("NEEDS_ATTENTION");
    expect(readiness.areas).toContainEqual(expect.objectContaining({
      key: "checks",
      state: "NEEDS_ATTENTION",
      summary: "1 must-pass check is failing.",
    }));
  });

  /**
   * A company does not have to configure any of this — it inherits the
   * platform's setup. The screen this replaces counted every empty area as a
   * gap, so a workspace that was working perfectly read 60% and was told to fix
   * things that were never missing.
   */
  test("a company that has configured nothing is ready, not incomplete", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Inheriting Co", createdAt: Date.now() });
      return {
        companyId,
        adminId: await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId }),
      };
    });

    const readiness = await t
      .withIdentity({ subject: adminId })
      .query(api.companyReadiness.getCompanyAiReadiness, { companyId });

    expect(readiness.state).toBe("READY");
    expect(readiness.needsAttentionCount).toBe(0);
    expect(readiness.areas.every((area) => area.state === "NOT_CONFIGURED")).toBe(true);

    // Every job routes — text jobs to the platform failsafe and embeddings to the
    // Google failsafe — so an unconfigured company is not a routing fault. The
    // old check demanded an `embedding` default that nothing can create and
    // showed a permanent 6/7 as a result.
    const routing = readiness.areas.find((area) => area.key === "modelRouting");
    expect(routing?.state).toBe("NOT_CONFIGURED");
    // Every job in DEFAULT_MODEL_USE_CASES, not the seven the old hand-copied list checked — it omitted
    // fast-chat and transcription entirely.
    // 12 with the vision job — added for photos in chat, Google-gated the
    // same way transcription is.
    expect(routing?.summary).toBe("All 12 jobs use the platform's model.");
  });

  test("a company model that cannot run needs attention, and one saved by its fallback does not", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { adminId, companyId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Routing Co", createdAt: Date.now() });
      const adminId = await ctx.db.insert("users", { email: "admin@example.com", role: "ADMIN", companyId });

      await ctx.db.insert("aiProviders", {
        providerKey: "switched-off",
        displayName: "Switched Off",
        isEnabled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const model = (providerKey: string, modelId: string) => ({
        modelId,
        displayName: modelId,
        providerKey,
        providerModelId: modelId,
        isEnabled: true,
        isDefault: false,
        supportedUseCases: ["chat", "report"],
        lastSyncedAt: 0,
      });
      await ctx.db.insert("aiModels", model("switched-off", "stranded-model"));
      await ctx.db.insert("aiModels", model("google", "working-model"));

      // Chat is pointed at a model whose provider is switched off, with nothing
      // behind it — the runtime silently uses the platform's model instead.
      await ctx.db.insert("aiModelDefaults", {
        scope: "company",
        companyId,
        useCase: "chat",
        modelId: "stranded-model",
        providerKey: "switched-off",
        updatedAt: Date.now(),
      });
      // Report is pointed at the same dead model but has a working fallback, so
      // it runs as chosen. The old check called this broken.
      await ctx.db.insert("aiModelDefaults", {
        scope: "company",
        companyId,
        useCase: "report",
        modelId: "stranded-model",
        fallbackModelId: "working-model",
        providerKey: "switched-off",
        updatedAt: Date.now(),
      });

      return { adminId, companyId };
    });

    const readiness = await t
      .withIdentity({ subject: adminId })
      .query(api.companyReadiness.getCompanyAiReadiness, { companyId });

    const routing = readiness.areas.find((area) => area.key === "modelRouting");
    expect(routing?.state).toBe("NEEDS_ATTENTION");
    // One, not two: the fallback-served job is not a fault.
    expect(routing?.summary).toContain("1 job points at a model that cannot run");
    expect(readiness.state).toBe("NEEDS_ATTENTION");
    expect(readiness.needsAttentionCount).toBe(1);
  });
});
