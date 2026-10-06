import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { HAKKEN_ASSISTANT } from "./utils/hakkenAssistant";

/**
 * The assistant's agent (docs/plans/active/assistant-foundation-plan.md,
 * item 4), created on first use and kept in step, as the Translator's is.
 *
 * Shown on the Agents screen like any agent: it can be switched off, its
 * spending limits set, and its model calls and costs land in the same ledger
 * every run's do. The definition's own words are kept current; what an
 * administrator decides — on or off, its prompt, its limits — is never
 * overwritten.
 */
export const ensureAssistantInternal = internalMutation({
  args: {},
  returns: v.id("agents"),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", HAKKEN_ASSISTANT.systemKey))
      .first();
    const definition = {
      name: HAKKEN_ASSISTANT.name,
      description: HAKKEN_ASSISTANT.description,
      standingObjective: HAKKEN_ASSISTANT.standingObjective,
    };
    if (!existing) {
      return await ctx.db.insert("agents", {
        ...definition,
        systemKey: HAKKEN_ASSISTANT.systemKey,
        // What it says it is comes from the platform's and the company's
        // prompts; anything here is added to them.
        systemPrompt: "",
        modelId: `${HAKKEN_ASSISTANT.modelUseCase} (resolved at run time)`,
        modelSelectionMode: "inherit",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    return existing._id;
  },
});

/** The assistant's agent and whether it is on; null before its first use. */
export const getAssistantInternal = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ agentId: v.id("agents"), isActive: v.boolean() })),
  handler: async (ctx) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_system_key", (q) => q.eq("systemKey", HAKKEN_ASSISTANT.systemKey))
      .first();
    return agent ? { agentId: agent._id, isActive: agent.isActive } : null;
  },
});
