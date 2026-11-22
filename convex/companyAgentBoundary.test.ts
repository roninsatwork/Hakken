import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { buildAgentSystemInstruction } from "./aiPromptAssembly";
import schema from "./schema";

async function fixture() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  const ids = await t.run(async (ctx) => {
    const companyA = await ctx.db.insert("companies", { name: "Dummy A", createdAt: Date.now() });
    const companyB = await ctx.db.insert("companies", { name: "Dummy B", createdAt: Date.now() });
    const userA = await ctx.db.insert("users", { email: "a@test.invalid", role: "USER", companyId: companyA });
    const adminA = await ctx.db.insert("users", { email: "admin@test.invalid", role: "ADMIN", companyId: companyA });
    const agentId = await ctx.db.insert("agents", {
      name: "Dummy agent", modelId: "model-test", modelSelectionMode: "override",
      thinkingMode: false, systemPrompt: "Give short answers.", isActive: true,
      temperature: 0.2, humanApprovalRequired: false, createdAt: Date.now(), updatedAt: Date.now(),
    });
    const ownRule = await ctx.db.insert("aiRules", {
      name: "A rule", trigger: "a", instruction: "A only", priority: "NORMAL", isActive: true,
      agentId, companyId: companyA, createdBy: adminA, createdAt: Date.now(),
    });
    const foreignRule = await ctx.db.insert("aiRules", {
      name: "B rule", trigger: "b", instruction: "B_MARKER_DUMMY", priority: "NORMAL", isActive: true,
      agentId, companyId: companyB, createdBy: adminA, createdAt: Date.now(),
    });
    const platformRule = await ctx.db.insert("aiRules", {
      name: "Platform rule", trigger: "platform", instruction: "PLATFORM_MARKER_DUMMY", priority: "NORMAL", isActive: true,
      agentId, createdBy: adminA, createdAt: Date.now(),
    });
    return { companyA, companyB, userA, adminA, agentId, ownRule, foreignRule, platformRule };
  });
  return { t, ...ids };
}

describe("company agent boundary", () => {
  test("a regular user's agent rule lists show only their company's rules", async () => {
    const { t, companyA, userA, agentId, ownRule, foreignRule, platformRule } = await fixture();
    const caller = t.withIdentity({ subject: userA });
    const list = await caller.query(api.aiRules.getRules, { agentId });
    const page = await caller.query(api.aiRules.getOffsetPaginatedRules, { agentId, page: 1, pageSize: 10 });
    const deniedB = await caller.query(api.aiRules.getRuleById, { id: foreignRule }).then(() => false, () => true);
    const deniedPlatform = await caller.query(api.aiRules.getRuleById, { id: platformRule }).then(() => false, () => true);
    const listIds = list.map((rule) => rule._id);
    const pageIds = page.data.map((rule) => rule._id);
    expect(listIds).toEqual([ownRule]);
    expect(pageIds).toEqual([ownRule]);
    expect(deniedB).toBe(true);
    expect(deniedPlatform).toBe(true);
    const active = await t.query(internal.aiRules.getActiveRulesInternal, {
      companyId: companyA,
      agentId,
    });
    expect(active.some((rule) => rule._id === ownRule)).toBe(true);
    expect(active.some((rule) => rule._id === foreignRule)).toBe(false);
  });

  test("A's agent snapshot and replay exclude B's rule text", async () => {
    const { t, companyA, companyB, adminA, agentId } = await fixture();
    const caller = t.withIdentity({ subject: adminA });
    const versionId = await caller.mutation(api.agentVersions.createSnapshot, { agentId });
    const page = await caller.query(api.agentVersions.getForAgent, { agentId, paginationOpts: { numItems: 10, cursor: null } });
    const detail = await caller.query(api.agentVersions.getVersionDetail, { versionId });
    const inPage = page.page.some((version) => version.snapshotJson.includes("B_MARKER_DUMMY"));
    const inDetail = detail?.version.snapshotJson.includes("B_MARKER_DUMMY") ?? false;
    const replayRunId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
      agentId, agentVersionId: versionId, companyId: companyA, userId: adminA,
      triggerType: "MANUAL", objective: "Dummy replay", status: "FAILED",
      replayMode: "SAME_VERSION", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    const replay = await t.query(internal.agentRuns.getReplayExecutionContextInternal, { runId: replayRunId });
    const inReplayContext = replay?.rules?.some((rule) => rule.instruction === "B_MARKER_DUMMY") ?? false;
    expect(inPage).toBe(false);
    expect(inDetail).toBe(false);
    expect(inReplayContext).toBe(false);
    const crossCompanyRunId = await t.run(async (ctx) => ctx.db.insert("agentRuns", {
      agentId, agentVersionId: versionId, companyId: companyB, userId: adminA,
      triggerType: "MANUAL", objective: "Wrong company replay", status: "FAILED",
      replayMode: "SAME_VERSION", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    expect(await t.query(internal.agentRuns.getReplayExecutionContextInternal, { runId: crossCompanyRunId })).toBeNull();
  });

  test("old mixed-company snapshots keep A's history but hide B's content", async () => {
    const { t, companyA, companyB, adminA, agentId, ownRule, foreignRule } = await fixture();
    const caller = t.withIdentity({ subject: adminA });
    const versionId = await caller.mutation(api.agentVersions.createSnapshot, { agentId });
    await t.run(async (ctx) => {
      const version = await ctx.db.get(versionId);
      if (!version) throw new Error("Missing version");
      const old = JSON.parse(version.snapshotJson);
      delete old.tenantSafeVersion;
      old.rules.push({ id: foreignRule, name: "B rule", instruction: "B_MARKER_DUMMY" });
      old.prompt.systemPrompt += "\n\nApproved learning note 123: B_PROMPT_DUMMY";
      const foreignMemory = await ctx.db.insert("agentMemories", {
        agentId, companyId: companyB, kind: "INSTRUCTION", applyMode: "ALWAYS",
        content: "B_MEMORY_DUMMY", normalizedContent: "b_memory_dummy", importance: 1,
        isActive: true, createdAt: 1, updatedAt: 1,
      });
      old.memory.items.push({ id: foreignMemory, content: "B_MEMORY_DUMMY" });
      await ctx.db.patch(versionId, { snapshotJson: JSON.stringify(old) });
    });
    const page = await caller.query(api.agentVersions.getForAgent, {
      agentId, paginationOpts: { numItems: 10, cursor: null },
    });
    const detail = await caller.query(api.agentVersions.getVersionDetail, { versionId });
    const replayRunId = await t.run(async (ctx) => ctx.db.insert("agentRuns", {
      agentId, agentVersionId: versionId, companyId: companyA, userId: adminA,
      triggerType: "MANUAL", objective: "Dummy replay", status: "FAILED",
      replayMode: "SAME_VERSION", startedAt: Date.now(), updatedAt: Date.now(),
    }));
    const replay = await t.query(internal.agentRuns.getReplayExecutionContextInternal, { runId: replayRunId });
    for (const json of [page.page[0].snapshotJson, detail?.version.snapshotJson ?? ""]) {
      expect(json).toContain(ownRule);
      expect(json).not.toContain("B_MARKER_DUMMY");
      expect(json).not.toContain("B_MEMORY_DUMMY");
      expect(json).not.toContain("B_PROMPT_DUMMY");
    }
    expect(replay?.rules?.some((rule) => rule.instruction === "A only")).toBe(true);
    expect(replay?.rules?.some((rule) => rule.instruction === "B_MARKER_DUMMY")).toBe(false);
    expect(replay?.systemPrompt).toBe("Give short answers.");
    expect(buildAgentSystemInstruction("Give short answers.\n\nApproved learning note 123: B_PROMPT_DUMMY"))
      .not.toContain("B_PROMPT_DUMMY");
  });

  test("A admin's approved prompt guidance is scoped to A", async () => {
    const { t, companyA, companyB, adminA, agentId } = await fixture();
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("agentRuns", {
        agentId, companyId: companyA, userId: adminA, triggerType: "WORKFLOW",
        objective: "Dummy work", status: "FAILED", error: "Dummy failed tool args",
        startedAt: 100, completedAt: 140, updatedAt: 140,
      });
      const reflectionId = await ctx.db.insert("agentRunReflections", {
        runId, agentId, companyId: companyA, createdBy: adminA,
        category: "BAD_TOOL_ARGUMENTS", sourceStatus: "FAILED", objectiveSummary: "Dummy work",
        rootCause: "Dummy invalid args", proposedPromptChange: "A_MARKER_DUMMY",
        proposedToolChange: "Dummy tool examples", proposedEvalFixture: "Dummy valid args",
        confidence: 0.85, evidenceJson: "{}", status: "GENERATED", createdAt: 130, updatedAt: 130,
      });
      await ctx.db.insert("agentEvalFixtures", {
        agentId, companyId: companyA, sourceRunId: runId, sourceReflectionId: reflectionId,
        createdBy: adminA, type: "BAD_TOOL_ARGS", objective: "Dummy work",
        expectedToolPlanJson: "[]", expectedFinalOutputRubric: "Dummy valid tool args",
        sourceEvidenceJson: "{}", tags: ["bad_tool_args"], status: "ACTIVE",
        createdAt: 150, updatedAt: 150,
      });
      return runId;
    });
    const caller = t.withIdentity({ subject: adminA });
    const directDenied = await caller.mutation(api.agents.updateAgent, { id: agentId, systemPrompt: "A_MARKER_DUMMY" }).then(() => false, () => true);
    const generated = await caller.mutation(api.agentImprovementSuggestions.generateForRun, { runId });
    const suggestions = await caller.query(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
    const prompt = suggestions.find((one) => one.type === "PROMPT_CHANGE");
    expect(prompt).toBeDefined();
    await caller.mutation(api.agentImprovementSuggestions.decideSuggestion, { suggestionId: prompt!._id, decision: "APPROVED", apply: true });
    const { agent, memories } = await t.run(async (ctx) => ({
      agent: await ctx.db.get(agentId),
      memories: await ctx.db.query("agentMemories")
        .withIndex("by_agent_company_active_updated", (q) => q.eq("agentId", agentId).eq("companyId", companyA).eq("isActive", true))
        .take(10),
    }));
    const reachesB = buildAgentSystemInstruction(agent?.systemPrompt).includes("A_MARKER_DUMMY");
    expect(directDenied).toBe(true);
    expect(generated.createdIds.length).toBeGreaterThan(0);
    expect(reachesB).toBe(false);
    expect(memories.some((memory) => memory.applyMode === "ALWAYS" && memory.content.includes("A_MARKER_DUMMY"))).toBe(true);
    const aAlways = await t.query(internal.agentMemories.getAlwaysMemoriesInternal, { agentId, companyId: companyA });
    const bAlways = await t.query(internal.agentMemories.getAlwaysMemoriesInternal, { agentId, companyId: companyB });
    expect(aAlways.some((memory) => memory.content.includes("A_MARKER_DUMMY"))).toBe(true);
    expect(bAlways.some((memory) => memory.content.includes("A_MARKER_DUMMY"))).toBe(false);
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await ctx.db.insert("agentMemories", {
          agentId, kind: "INSTRUCTION", applyMode: "ALWAYS", content: `Platform ${index}`,
          normalizedContent: `platform ${index}`, importance: 1, isActive: true,
          createdAt: Date.now() + index, updatedAt: Date.now() + index,
        });
      }
    });
    const withPlatform = await t.query(internal.agentMemories.getAlwaysMemoriesInternal, { agentId, companyId: companyA });
    expect(withPlatform.some((memory) => memory.content.includes("A_MARKER_DUMMY"))).toBe(true);
    expect(withPlatform.filter((memory) => memory.content.startsWith("Platform"))).toHaveLength(5);
  });

  test("only a super admin can apply a shared approval policy suggestion", async () => {
    const { t, companyA, adminA, agentId } = await fixture();
    const superAdminId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "super@test.invalid", role: "SUPER_ADMIN" });
      const runId = await ctx.db.insert("agentRuns", {
        agentId, companyId: companyA, userId: adminA, triggerType: "WORKFLOW",
        objective: "Dummy approval review", status: "FAILED", error: "Approval refused",
        startedAt: 100, completedAt: 140, updatedAt: 140,
      });
      await ctx.db.insert("agentRunReflections", {
        runId, agentId, companyId: companyA, createdBy: adminA,
        category: "APPROVAL_REJECTED", sourceStatus: "FAILED",
        objectiveSummary: "Dummy approval review", rootCause: "Approval refused",
        confidence: 0.9, evidenceJson: "{}", status: "GENERATED",
        createdAt: 130, updatedAt: 130,
      });
      return { id, runId };
    });
    const admin = t.withIdentity({ subject: adminA });
    const superAdmin = t.withIdentity({ subject: superAdminId.id });
    await admin.mutation(api.agentImprovementSuggestions.generateForRun, { runId: superAdminId.runId });
    const suggestions = await admin.query(api.agentImprovementSuggestions.getRecentForAgent, { agentId });
    const policy = suggestions.find((one) => one.type === "APPROVAL_POLICY_CHANGE");
    expect(policy).toBeDefined();
    await expect(admin.mutation(api.agentImprovementSuggestions.decideSuggestion, {
      suggestionId: policy!._id, decision: "APPROVED", apply: true,
    })).rejects.toThrow("Only super admins");
    const before = await t.run(async (ctx) => ctx.db.get(agentId));
    expect(before?.humanApprovalRequired).toBe(false);
    await superAdmin.mutation(api.agentImprovementSuggestions.decideSuggestion, {
      suggestionId: policy!._id, decision: "APPROVED", apply: true,
    });
    const after = await t.run(async (ctx) => ctx.db.get(agentId));
    expect(after?.humanApprovalRequired).toBe(true);
    expect(after?.autonomousToolExecution).toBe(false);
  });
});
