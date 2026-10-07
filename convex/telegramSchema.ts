import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Telegram, another way in to the same Assistant (docs/plans/active/
 * hakken-tasks-plan.md, item 6.1): one platform bot, a person linked to their
 * own chat with it by a ten-minute code from their profile, and that chat's
 * conversation kept as a thread of theirs, so Ask Hakken shows it too. One
 * person per chat and one chat per person; nothing is sent to a chat that is
 * not linked. Only `telegram.ts` writes these.
 */
export const telegramTables = {
  /** A person's link to their chat with the bot. */
  telegramLinks: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    /** Telegram's chat id, as a string: it is a 64-bit number. */
    chatId: v.string(),
    /** Their Telegram name, to say who is linked: "@anthony" or "Anthony". */
    telegramName: v.optional(v.string()),
    /** Their conversation through Telegram: answers, alerts and reports alike. */
    threadId: v.id("threads"),
    linkedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"])
    .index("by_thread", ["threadId"]),

  /** A code on a person's profile, sent to the bot to link them; it works once, for ten minutes. */
  telegramLinkCodes: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    code: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_user", ["userId"]),

  /** The platform's bot, once it is set up: what the profile tells people to search for. */
  telegramBots: defineTable({
    username: v.string(),
    name: v.string(),
    setUpAt: v.number(),
  }),
};
