import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { bindConnector } from "./hakkenAssistant";
import { readerPreferencesOf } from "./readerPreferences";
import { resolvePlatformName } from "./settingsService";
import { emailWording } from "./utils/emailWording";
import { RESEARCHER } from "./utils/hakkenResearcher";

/**
 * The Research Agent (docs/plans/active/hakken-tasks-plan.md, item 4.2): "find
 * out why", run once in the background when its owner taps yes on the
 * Assistant's offer. It looks with the read tools in the same conversation —
 * the agent runtime answers into the thread, its look-ups and chart with it
 * — then tells its owner in the bell that the write-up is there.
 */

/** Idempotent: the Research Agent, created once and kept in step — its name from the platform's — with its read tools bound. */
export const ensureResearcherInternal = internalMutation({
  args: { installedBy: v.optional(v.id("users")) },
  returns: v.id("agents"),
  handler: async (ctx, args): Promise<Id<"agents">> => {
    const now = Date.now();
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    const definition = {
      name: RESEARCHER.nameFor(platformName),
      description: RESEARCHER.description,
      systemPrompt: RESEARCHER.systemPrompt,
      standingObjective: RESEARCHER.standingObjective,
    };
    const existing = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", RESEARCHER.systemKey)).first();
    const agentId = existing?._id ?? await ctx.db.insert("agents", {
      ...definition,
      systemKey: RESEARCHER.systemKey,
      modelId: "agent (resolved at run time)",
      modelSelectionMode: "inherit",
      thinkingMode: false,
      isActive: true,
      isGlobal: true,
      createdAt: now,
      updatedAt: now,
    });
    if (existing && Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
    for (const key of RESEARCHER.connectorKeys) await bindConnector(ctx, agentId, key, args.installedBy);
    return agentId;
  },
});

/** Whether it is switched on; it is, until someone switches it off on the Agents screen. */
export const isResearcherOnInternal = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", RESEARCHER.systemKey)).first();
    return agent?.isActive ?? true;
  },
});

const researchValidator = v.object({ question: v.string(), website: v.optional(v.string()), page: v.optional(v.string()) });

/**
 * One "find out why": the Research Agent's run in the conversation it was
 * asked in, from what to find out and where, then the bell. Switched off, it
 * says so in the conversation rather than leaving the yes unanswered.
 */
export const researchInternal = internalAction({
  args: { threadId: v.id("threads"), userId: v.id("users"), research: researchValidator },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const startedAt = Date.now();
    const agentId: Id<"agents"> = await ctx.runMutation(internal.hakkenResearch.ensureResearcherInternal, { installedBy: args.userId });
    const thread = await ctx.runQuery(internal.chat.getThreadInternal, { threadId: args.threadId });
    if (!thread) return null;
    const { platformName } = await ctx.runQuery(internal.settings.getEmailBranding, {});
    if (!(await ctx.runQuery(internal.hakkenResearch.isResearcherOnInternal, {}))) {
      await ctx.runMutation(internal.chat.saveAssistantNoticeInternal, {
        threadId: args.threadId,
        content: `${RESEARCHER.nameFor(platformName)} is switched off, so this wasn't looked into. An administrator can switch it back on in Admin → Agents.`,
      });
      return null;
    }

    const where = [args.research.website ? `the website ${args.research.website}` : null, args.research.page ? `the page ${args.research.page}` : null].filter(Boolean).join(", ");
    await ctx.runAction(internal.agentRuntime.runAgentObjective, {
      threadId: args.threadId,
      agentId,
      content: `Find out: ${args.research.question}${where ? ` (${where})` : ""}. The person said yes to this a moment ago; look with your tools first, then write up what you found for them here.`,
    });

    // Asked in Telegram: the write-up goes there too (item 6.1).
    await ctx.scheduler.runAfter(0, internal.telegramActions.relayInternal, { threadId: args.threadId, since: startedAt });
    await ctx.runMutation(internal.hakkenResearch.tellOwnerInternal, {
      userId: args.userId, threadId: args.threadId, question: args.research.question, ...(thread.companyId ? { companyId: thread.companyId } : {}),
    });
    return null;
  },
});

/** The bell, in its owner's language: the write-up is in their conversation. */
export const tellOwnerInternal = internalMutation({
  args: { userId: v.id("users"), threadId: v.id("threads"), question: v.string(), companyId: v.optional(v.id("companies")) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { language } = await readerPreferencesOf(ctx, args.userId);
    const platformName = resolvePlatformName((await ctx.db.query("systemSettings").first())?.platformName);
    await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
      userId: args.userId,
      ...(args.companyId ? { companyId: args.companyId } : {}),
      kind: "HAKKEN_RESEARCH",
      title: emailWording(language).research.bellTitle({ platformName }),
      body: args.question,
      href: `/app/assistant/${args.threadId}`,
    });
    return null;
  },
});
