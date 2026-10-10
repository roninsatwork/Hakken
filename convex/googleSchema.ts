import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The Google connection a company's own website signs in with, shared by
 * Search Console and Google Analytics (docs/plans/active/google-analytics-plan.md
 * GA2, GA18 and §4.6; its name agreed in §10, Q11). One sign-in per website
 * serves both sections: the account, the access Google granted, and the
 * encrypted tokens are kept here once, and each section keeps only its own
 * choice — Search Console's property, Analytics' property and address — on its
 * own connection, which names this one by `googleConnectionId`.
 *
 * One row per website and Google account. Nearly always one account serves
 * both sections; an agency whose Search Console is on one account and the
 * client's Analytics on another keeps two, and neither section's sign-in takes
 * the other's away. A row no section names any more is given back to Google
 * and dropped (`googleConnection.releaseUnused`).
 */
export const googleTables = {
  googleConnections: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    /** The Google account that signed in, as Google names it; absent when Google would not say. */
    account: v.optional(v.string()),
    /** The access Google granted, as it lists it: each section checks for its own. */
    scopes: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hold_account", ["companyWebsiteId", "account"])
    /** Whether anyone else still uses an account's grant, before it is revoked at Google. */
    .index("by_account", ["account"]),

  /**
   * A Google connection's tokens, as ciphertext only (`connectorTokenCrypto`).
   * Read by `googleConnection.ts` alone, as `connectorOAuthTokens` is by the
   * admin connectors.
   */
  googleTokens: defineTable({
    googleConnectionId: v.id("googleConnections"),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_connection", ["googleConnectionId"]),

  /**
   * Each page address of a company's own website, numbered once, 250 to a
   * record in the order first seen (`holdPageRefs.ts`): the numbers every
   * Search Console and Google Analytics list names its pages by, so the two
   * name one page by one number (google-analytics-plan.md §4.6; named in
   * §10, Q11). Moved from `searchConsolePageAddresses` on 2026-10-10.
   */
  holdPageAddresses: defineTable({
    companyWebsiteId: v.id("companyWebsites"),
    record: v.number(),
    addresses: v.array(v.string()),
  }).index("by_hold_record", ["companyWebsiteId", "record"]),
};
