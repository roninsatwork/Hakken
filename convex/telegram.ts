import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  assertWithinMessageRateLimit,
  getThreadMessageDimensions,
  incrementChatQuota,
  isChatQuotaExceeded,
  loadPiiConfig,
  quotaRefusalMessage,
  resolveChatQuota,
} from "./chatService";
import { hakkenTaskProposalValidator } from "./hakkenTaskSchema";
import { generateCode } from "./oneTimeCodeService";
import { readerPreferencesOf } from "./readerPreferences";
import { tenantMutation, tenantQuery, requireTenant } from "./tenantFunctions";
import { redactPII } from "./utils/pii";

/**
 * Telegram's database side (docs/plans/active/hakken-tasks-plan.md, item
 * 6.1): what a person's profile shows, the ten-minute code that links their
 * chat, and the conversation through Telegram — kept as a thread of theirs,
 * so Ask Hakken shows it too — written with the same limits as typed Ask
 * Hakken. One person per chat, one chat per person, and nothing for a chat
 * that is not linked. The bot's own side is `telegramActions.ts`.
 */

/** How long a linking code works. */
export const CODE_MINUTES = 10;

const MOST_MESSAGE_CHARACTERS = 10_000;

// ── The person's own, on their profile ──────────────────────────────────────

/** The profile's Telegram section: the bot to search for, whether they are linked, and their code while it lasts. */
export const myTelegram = tenantQuery({
  args: {},
  returns: v.object({
    bot: v.union(v.null(), v.object({ username: v.string(), name: v.string() })),
    linked: v.union(v.null(), v.object({ telegramName: v.optional(v.string()), linkedAt: v.number() })),
    code: v.union(v.null(), v.object({ code: v.string(), expiresAt: v.number() })),
  }),
  handler: async (ctx) => {
    const bot = await ctx.db.query("telegramBots").first();
    const link = await ctx.db.query("telegramLinks").withIndex("by_user", (q) => q.eq("userId", ctx.userId)).first();
    const code = await ctx.db.query("telegramLinkCodes").withIndex("by_user", (q) => q.eq("userId", ctx.userId)).order("desc").first();
    return {
      bot: bot ? { username: bot.username, name: bot.name } : null,
      linked: link ? { ...(link.telegramName ? { telegramName: link.telegramName } : {}), linkedAt: link.linkedAt } : null,
      // While it lasts; a query cannot tell the time, so the screen hides an expired one too.
      code: code ? { code: code.code, expiresAt: code.expiresAt } : null,
    };
  },
});

/** A new code for the person to send the bot, replacing any they had. */
export const newTelegramCode = tenantMutation({
  args: {},
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx) => {
    const companyId = requireTenant(ctx);
    for (const old of await ctx.db.query("telegramLinkCodes").withIndex("by_user", (q) => q.eq("userId", ctx.userId)).take(10)) {
      await ctx.db.delete(old._id);
    }
    const now = Date.now();
    let code = generateCode((count) => crypto.getRandomValues(new Uint8Array(count)));
    // Codes are short: one already given out is never given twice.
    while (await ctx.db.query("telegramLinkCodes").withIndex("by_code", (q) => q.eq("code", code)).first()) {
      code = generateCode((count) => crypto.getRandomValues(new Uint8Array(count)));
    }
    const expiresAt = now + CODE_MINUTES * 60_000;
    await ctx.db.insert("telegramLinkCodes", { userId: ctx.userId, companyId, code, expiresAt, createdAt: now });
    return { code, expiresAt };
  },
});

/** The person's chat unlinked: nothing more is sent there, and nothing it sends is answered. */
export const unlinkTelegram = tenantMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const link of await ctx.db.query("telegramLinks").withIndex("by_user", (q) => q.eq("userId", ctx.userId)).take(10)) {
      await unlink(ctx, link);
    }
    return null;
  },
});

/** Whether a person's tasks tell them in Telegram, as their link now says: Hakken tasks shows how each one tells them. */
async function tellInTelegram(ctx: MutationCtx, userId: Id<"users">, companyId: Id<"companies">, on: boolean): Promise<void> {
  const now = Date.now();
  for (const task of await ctx.db.query("hakkenTasks").withIndex("by_owner", (q) => q.eq("userId", userId).eq("companyId", companyId)).take(300)) {
    if (task.state !== "DELETED" && task.channels.telegram !== on) await ctx.db.patch(task._id, { channels: { ...task.channels, telegram: on }, updatedAt: now });
  }
}

/** A link gone, and its person's tasks no longer said to tell them there. Their conversation stays theirs, in Ask Hakken. */
async function unlink(ctx: MutationCtx, link: Doc<"telegramLinks">): Promise<void> {
  await ctx.db.delete(link._id);
  await tellInTelegram(ctx, link.userId, link.companyId, false);
}

// ── The bot's side ──────────────────────────────────────────────────────────

const linkValidator = v.object({ userId: v.id("users"), companyId: v.id("companies"), threadId: v.id("threads"), chatId: v.string(), language: v.string() });

/** A link as the bot uses it: whose it is, where to send, and the language they read the platform in. */
async function linkOut(ctx: QueryCtx, link: Doc<"telegramLinks"> | null) {
  if (!link) return null;
  const { language } = await readerPreferencesOf(ctx, link.userId);
  return { userId: link.userId, companyId: link.companyId, threadId: link.threadId, chatId: link.chatId, language };
}

/** The person a chat is linked to, or null: nothing is answered for a chat that is not linked. */
export const chatLinkInternal = internalQuery({
  args: { chatId: v.string() },
  returns: v.union(v.null(), linkValidator),
  handler: async (ctx, args) => {
    const link = await ctx.db.query("telegramLinks").withIndex("by_chat", (q) => q.eq("chatId", args.chatId)).first();
    return await linkOut(ctx, link);
  },
});

/** The chat a conversation is relayed to, or null when it is not a Telegram conversation (a write-up from "find out why"). */
export const threadLinkInternal = internalQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(v.null(), linkValidator),
  handler: async (ctx, args) => {
    const link = await ctx.db.query("telegramLinks").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).first();
    return await linkOut(ctx, link);
  },
});

/** A person's chat, or null when they have not linked one: what alerts and reports are sent to. */
export const userLinkInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), linkValidator),
  handler: async (ctx, args) => {
    const link = await ctx.db.query("telegramLinks").withIndex("by_user", (q) => q.eq("userId", args.userId)).first();
    return await linkOut(ctx, link);
  },
});

/**
 * A code sent to the bot: the chat linked to the person whose code it is, in
 * a conversation of their own; any chat they had before, and anyone this chat
 * was linked to, unlinked; their tasks set to tell them here too. The code
 * works once, while it lasts.
 */
export const redeemCodeInternal = internalMutation({
  args: { code: v.string(), chatId: v.string(), telegramName: v.optional(v.string()) },
  returns: v.union(
    v.object({ ok: v.literal(true), name: v.string(), threadId: v.id("threads") }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("UNKNOWN"), v.literal("EXPIRED")) }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await ctx.db.query("telegramLinkCodes").withIndex("by_code", (q) => q.eq("code", args.code)).first();
    if (!code) return { ok: false as const, reason: "UNKNOWN" as const };
    await ctx.db.delete(code._id);
    if (code.expiresAt < now) return { ok: false as const, reason: "EXPIRED" as const };
    const user = await ctx.db.get(code.userId);
    if (!user) return { ok: false as const, reason: "UNKNOWN" as const };

    for (const old of [
      ...(await ctx.db.query("telegramLinks").withIndex("by_chat", (q) => q.eq("chatId", args.chatId)).take(10)),
      ...(await ctx.db.query("telegramLinks").withIndex("by_user", (q) => q.eq("userId", user._id)).take(10)),
    ]) {
      if (await ctx.db.get(old._id)) await unlink(ctx, old);
    }
    const threadId = await ctx.db.insert("threads", { userId: user._id, companyId: code.companyId, title: "Telegram", createdAt: now, updatedAt: now });
    await ctx.db.insert("telegramLinks", {
      userId: user._id, companyId: code.companyId, chatId: args.chatId, ...(args.telegramName ? { telegramName: args.telegramName } : {}), threadId, linkedAt: now,
    });
    // "I'll send your alerts here": every task of theirs tells them in Telegram too.
    await tellInTelegram(ctx, user._id, code.companyId, true);
    const name = (user.name ?? "").trim().split(/\s+/)[0] || "there";
    return { ok: true as const, name, threadId };
  },
});

/**
 * A message from a linked chat, saved into its conversation as typed Ask
 * Hakken saves one — the same rate limit, quota and redaction — or the reply
 * to send instead when it cannot be answered.
 */
export const saveQuestionInternal = internalMutation({
  args: { chatId: v.string(), text: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), threadId: v.id("threads"), userId: v.id("users"), content: v.string(), receivedAt: v.number() }),
    v.object({ ok: v.literal(false), reply: v.string() }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db.query("telegramLinks").withIndex("by_chat", (q) => q.eq("chatId", args.chatId)).first();
    const thread = link ? await ctx.db.get(link.threadId) : null;
    const user = link ? await ctx.db.get(link.userId) : null;
    if (!link || !thread || !user) return { ok: false as const, reply: "" };
    const text = args.text.slice(0, MOST_MESSAGE_CHARACTERS);
    const now = Date.now();
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_thread_role_created", (q) => q.eq("threadId", thread._id).eq("role", "user"))
      .order("desc")
      .take(10);
    try {
      assertWithinMessageRateLimit(recent, now);
    } catch {
      return { ok: false as const, reply: "That's a lot at once: give me a moment, then try again." };
    }
    const quota = await resolveChatQuota(ctx, user, thread);
    const content = redactPII(text, await loadPiiConfig(ctx));
    if (isChatQuotaExceeded(quota)) return { ok: false as const, reply: quotaRefusalMessage(thread) };
    await incrementChatQuota(ctx, quota);
    await ctx.db.insert("messages", { threadId: thread._id, role: "user", content, createdAt: now, ...getThreadMessageDimensions(thread) });
    await ctx.db.patch(thread._id, { updatedAt: now });
    return { ok: true as const, threadId: thread._id, userId: user._id, content, receivedAt: now };
  },
});

/** Something sent to a person's chat, kept in their Telegram conversation so Ask Hakken shows it too: an alert, a report, a notice. */
export const saveSentInternal = internalMutation({
  args: { threadId: v.id("threads"), content: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await saveSent(ctx, args.threadId, args.content);
    return null;
  },
});

async function saveSent(ctx: MutationCtx, threadId: Id<"threads">, content: string): Promise<void> {
  const thread = await ctx.db.get(threadId);
  if (!thread) return;
  const now = Date.now();
  await ctx.db.insert("messages", { threadId, role: "assistant", content, createdAt: now, ...getThreadMessageDimensions(thread) });
  await ctx.db.patch(threadId, { updatedAt: now });
}

/** The newest reply in a conversation since a moment, to relay to Telegram: its words, its chart's link, and an offer waiting for a tap. */
export const newestReplyInternal = internalQuery({
  args: { threadId: v.id("threads"), since: v.number() },
  returns: v.union(
    v.null(),
    v.object({ messageId: v.id("messages"), content: v.string(), chartLink: v.optional(v.string()), taskProposal: v.optional(hakkenTaskProposalValidator) }),
  ),
  handler: async (ctx, args) => {
    const newest = await ctx.db
      .query("messages")
      .withIndex("by_thread_role_created", (q) => q.eq("threadId", args.threadId).eq("role", "assistant"))
      .order("desc")
      .first();
    if (!newest || newest.createdAt < args.since || newest.isStreaming) return null;
    const reply: Doc<"messages"> = newest;
    return {
      messageId: reply._id,
      content: reply.content,
      ...(reply.chart ? { chartLink: reply.chart.link } : {}),
      ...(reply.taskProposal?.status === "PENDING" ? { taskProposal: reply.taskProposal } : {}),
    };
  },
});

/** A message of this conversation's, from the id a button carries, or null: a button acts only in its own conversation. */
export const messageOfThreadInternal = internalQuery({
  args: { threadId: v.id("threads"), messageId: v.string() },
  returns: v.union(v.null(), v.id("messages")),
  handler: async (ctx, args) => {
    const messageId = ctx.db.normalizeId("messages", args.messageId);
    const message = messageId ? await ctx.db.get(messageId) : null;
    return message && message.threadId === args.threadId ? message._id : null;
  },
});

/** What an offer was, to say its answer back: its action, and whether it was a report. */
export const proposalOfInternal = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), v.object({ action: hakkenTaskProposalValidator.fields.action, report: v.boolean() })),
  handler: async (ctx, args) => {
    const proposal = (await ctx.db.get(args.messageId))?.taskProposal;
    return proposal?.status === "PENDING" ? { action: proposal.action, report: Boolean(proposal.report) } : null;
  },
});

/** The platform's bot, once set up. */
export const botInternal = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ username: v.string(), name: v.string() })),
  handler: async (ctx) => {
    const bot = await ctx.db.query("telegramBots").first();
    return bot ? { username: bot.username, name: bot.name } : null;
  },
});

export const saveBotInternal = internalMutation({
  args: { username: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const old of await ctx.db.query("telegramBots").take(10)) await ctx.db.delete(old._id);
    await ctx.db.insert("telegramBots", { username: args.username, name: args.name, setUpAt: Date.now() });
    return null;
  },
});
