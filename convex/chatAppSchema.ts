import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Ask Hakken in ChatGPT and Claude (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md):
 * the apps that have asked to connect, who allowed which, the one-use codes and
 * passes, and every question asked. A pass or code is kept only as its
 * fingerprint (SHA-256), never the secret itself (`utils/chatApps.ts`).
 */
const chatAppValidator = v.union(v.literal("chatgpt"), v.literal("claude"), v.literal("local"));

export const chatAppTables = {
  /** An app's client: from its own published document, or signed up by it (Dynamic Client Registration). */
  chatAppClients: defineTable({
    clientId: v.string(),
    app: chatAppValidator,
    /** The name the app gave itself, shown nowhere a client reads: the Allow page names the app. */
    name: v.string(),
    redirectUris: v.array(v.string()),
    source: v.union(v.literal("document"), v.literal("signedUp")),
    createdAt: v.number(),
    /** When its published document was last read, so it's read again after a day. */
    readAt: v.optional(v.number()),
  })
    .index("by_client_id", ["clientId"])
    .index("by_created", ["createdAt"]),

  /** A person's Allow: one app may read one company's figures as that person. */
  chatAppGrants: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    app: chatAppValidator,
    clientId: v.string(),
    allowedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    /** Unlinked: every pass of it stops at once. */
    cutOffAt: v.optional(v.number()),
    cutOffBy: v.optional(v.union(v.literal("person"), v.literal("reused"), v.literal("left"))),
  })
    .index("by_user_app", ["userId", "app"])
    .index("by_client", ["clientId"]),

  /** The one-use code an app swaps for its first passes, good for five minutes. */
  chatAppCodes: defineTable({
    fingerprint: v.string(),
    grantId: v.id("chatAppGrants"),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_expires", ["expiresAt"]),

  /**
   * Passes: an access pass (an hour) and its renewal pass (30 days, used once).
   * Every pass from one Allow shares a chain; a renewal pass used twice cuts the
   * whole chain off.
   */
  chatAppPasses: defineTable({
    fingerprint: v.string(),
    kind: v.union(v.literal("access"), v.literal("renew")),
    grantId: v.id("chatAppGrants"),
    chain: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    cutOffAt: v.optional(v.number()),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_grant", ["grantId"])
    .index("by_chain", ["chain"])
    .index("by_expires", ["expiresAt"]),

  /** Every question an app asked, answered or refused, as the API's request log (`publicApiRequests`). */
  chatAppRequests: defineTable({
    grantId: v.optional(v.id("chatAppGrants")),
    userId: v.optional(v.id("users")),
    companyId: v.optional(v.id("companies")),
    app: v.optional(chatAppValidator),
    method: v.string(),
    tool: v.optional(v.string()),
    /** What the tool was asked for within itself: a screen (`searchConsole.newLost`) or a list (`searchConsole.keywords`). */
    detail: v.optional(v.string()),
    website: v.optional(v.string()),
    period: v.optional(v.string()),
    outcome: v.union(v.literal("answered"), v.literal("refused")),
    reason: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_grant_at", ["grantId", "at"])
    .index("by_user_at", ["userId", "at"]),
};
