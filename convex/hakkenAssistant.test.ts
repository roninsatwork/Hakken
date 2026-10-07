import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { HAKKEN_ASSISTANT, reasoningEffortFor } from "./utils/hakkenAssistant";

/**
 * The assistant's agent (assistant-foundation-plan.md, item 4): the built-in
 * agent every door answers through. Created on first use like the
 * Translator, shown and switched on the Agents screen, and answering on the
 * model and thinking a conversation chose.
 */

const { agentTurnMock } = vi.hoisted(() => ({ agentTurnMock: vi.fn() }));

vi.mock("./vertexProviderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./vertexProviderService")>();
  return {
    ...actual,
    createVertexGenAIClient: () => ({}),
    createVertexEmbeddingClient: () => ({}),
    embedVertexContentWithRetry: async () => ({ embeddings: [] }),
    createVertexPromptCache: async () => undefined,
    streamVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
    generateVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurnMock(params),
  };
});

beforeEach(() => {
  agentTurnMock.mockReset();
  agentTurnMock.mockResolvedValue({
    text: "Here you are.",
    functionCalls: undefined,
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  });
});

const makeTest = () => convexTest(schema, import.meta.glob("./**/*.*s"));

describe("the assistant's agent", () => {
  test("is created once, keeps its words current, and never overwrites what an administrator decided", async () => {
    const t = makeTest();
    const first = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    expect(await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {})).toBe(first);

    const created = await t.run(async (ctx) => await ctx.db.get(first));
    expect(created).toMatchObject({
      systemKey: HAKKEN_ASSISTANT.systemKey,
      // Named from the platform's name (hakken-tasks-plan.md, across all of it).
      name: "The Hakken Assistant Agent",
      modelSelectionMode: "inherit",
      isActive: true,
      isGlobal: true,
      // Empty, so it is told exactly what typed Ask Hakken was.
      systemPrompt: "",
    });

    // Switched off, given a prompt of its own, and its words gone stale.
    await t.run(async (ctx) => await ctx.db.patch(first, { isActive: false, systemPrompt: "Be brief.", description: "old" }));
    await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    const kept = await t.run(async (ctx) => await ctx.db.get(first));
    expect(kept).toMatchObject({ isActive: false, systemPrompt: "Be brief.", description: HAKKEN_ASSISTANT.description });
    expect(await t.query(internal.hakkenAssistant.getAssistantInternal, {})).toEqual({ agentId: first, isActive: false });

    const agents = await t.run(async (ctx) => await ctx.db.query("agents").collect());
    expect(agents).toHaveLength(1);
  });

  test("has no Run of its own: it answers conversations", async () => {
    const t = makeTest();
    const agentId = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    const superAdminId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "super@platform.test", role: "SUPER_ADMIN" }));

    await expect(
      t.withIdentity({ subject: superAdminId }).mutation(api.scheduler.manualRunSchedule, { agentId }),
    ).rejects.toThrow("has no run of its own");
    expect(await t.run(async (ctx) => await ctx.db.query("agentRuns").collect())).toEqual([]);
  });

  test("answers on the model and the thinking the conversation chose, and keeps them on the run", async () => {
    const t = makeTest();
    const agentId = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    const threadId = await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Chooser Ltd", createdAt: now });
      const userId = await ctx.db.insert("users", { email: "owner@chooser.test", role: "ADMIN", companyId, createdAt: now });
      // Provider-neutral ids: the drift guards forbid real model names here.
      for (const [modelId, isDefault] of [["default-model", true], ["chosen-model", false]] as const) {
        await ctx.db.insert("aiModels", {
          modelId,
          providerKey: "google",
          providerModelId: `${modelId}-provider`,
          displayName: modelId,
          isEnabled: true,
          isDefault,
          lastSyncedAt: now,
          standardInputCostBelow200k: 1,
          outputResponseCost: 2,
        });
      }
      return await ctx.db.insert("threads", { userId, companyId, agentId, title: "Chosen", createdAt: now, updatedAt: now });
    });

    await t.action(internal.agentRuntime.runAgentObjective, {
      threadId,
      agentId,
      content: "What changed this week?",
      modelId: "chosen-model",
      thinkingLevel: "HIGH",
    });

    const run = await t.run(async (ctx) => (await ctx.db.query("agentRuns").collect())[0]);
    expect(run).toMatchObject({ modelId: "chosen-model", reasoningEffort: "HIGH", status: "SUCCESS" });
    const request = agentTurnMock.mock.calls[0][0] as { model: string; config?: { thinkingConfig?: unknown } };
    expect(request.model).toBe("chosen-model-provider");
    expect(request.config?.thinkingConfig).toBeDefined();
  });

  /** A company, a person and a model; Ask Hakken's thread has no agent of its own. */
  async function seedAskHakken(t: ReturnType<typeof makeTest>) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const companyId = await ctx.db.insert("companies", { name: "Asker Ltd", createdAt: now });
      const userId = await ctx.db.insert("users", { email: "owner@asker.test", role: "ADMIN", companyId, createdAt: now });
      await ctx.db.insert("aiModels", {
        modelId: "default-model",
        providerKey: "google",
        providerModelId: "default-model-provider",
        displayName: "Default",
        isEnabled: true,
        isDefault: true,
        lastSyncedAt: now,
        standardInputCostBelow200k: 1,
        outputResponseCost: 2,
      });
      const threadId = await ctx.db.insert("threads", { userId, companyId, title: "Ask", createdAt: now, updatedAt: now });
      return { companyId, userId, threadId };
    });
  }

  test("a message in Ask Hakken is answered by the Assistant (item 5)", async () => {
    const t = makeTest();
    const { userId, threadId } = await seedAskHakken(t);

    vi.useFakeTimers();
    try {
      await t.withIdentity({ subject: userId }).mutation(api.chat.sendMessage, { threadId, content: "Hello?" });
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.map((job) => job.name)).toContain("hakkenAssistant:answerInternal");
      expect(scheduled.map((job) => job.name).some((name) => name.includes("aiChat") || name.includes("swarm"))).toBe(false);
      await finishScheduled(t);
    } finally {
      vi.useRealTimers();
    }

    const { runs, messages, thread } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("agentRuns").collect(),
      messages: await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect(),
      thread: await ctx.db.get(threadId),
    }));
    const assistant = await t.query(internal.hakkenAssistant.getAssistantInternal, {});
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentId: assistant?.agentId, threadId, triggerType: "CHAT", status: "SUCCESS" });
    expect(messages.some((message) => message.role === "assistant" && message.content === "Here you are.")).toBe(true);
    // The pre-reply pill is cleared once the reply lands.
    expect(thread?.assistantStage).toBeUndefined();
  });

  test("switched off, the Assistant does not answer, and the conversation says so", async () => {
    const t = makeTest();
    const { threadId } = await seedAskHakken(t);
    const agentId = await t.mutation(internal.hakkenAssistant.ensureAssistantInternal, {});
    await t.run(async (ctx) => await ctx.db.patch(agentId, { isActive: false }));

    await t.action(internal.hakkenAssistant.answerInternal, { threadId, content: "Hello?" });
    const { runs, messages } = await t.run(async (ctx) => ({
      runs: await ctx.db.query("agentRuns").collect(),
      messages: await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", threadId)).collect(),
    }));
    expect(runs).toEqual([]);
    expect(agentTurnMock).not.toHaveBeenCalled();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain("is switched off");
    expect(messages[0].content).toContain("Admin → Agents");
  });

  test("takes Ask Hakken's thinking levels as the runtime's, none as no extra effort", () => {
    expect(reasoningEffortFor("NONE")).toBeUndefined();
    expect(reasoningEffortFor(undefined)).toBeUndefined();
    expect(reasoningEffortFor("LOW")).toBe("LOW");
    expect(reasoningEffortFor("HIGH")).toBe("HIGH");
    expect(reasoningEffortFor("SWARM")).toBeUndefined();
  });
});
