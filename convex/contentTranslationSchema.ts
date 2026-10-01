import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Machine translations of what people write in English (docs/plans/active/
 * knowledge-news-and-digest-plan.md, revised 2026-10-01): one row per thing
 * and language, made by the Translator (`contentTranslation.ts`). A reader in
 * that language sees it; until it exists, or while the English has changed
 * since, they see the English.
 */

/** The tables whose rows are translated. */
export const TRANSLATED_OWNERS = ["knowledgeArticles", "googleUpdates", "newsFollows", "newsItems"] as const;
export type TranslatedOwner = (typeof TRANSLATED_OWNERS)[number];
export const translatedOwnerValidator = v.union(
  v.literal("knowledgeArticles"),
  v.literal("googleUpdates"),
  v.literal("newsFollows"),
  v.literal("newsItems"),
);

export const contentTranslationTables = {
  contentTranslations: defineTable({
    owner: translatedOwnerValidator,
    ownerId: v.string(),
    language: v.string(),
    /** The translated words, under the same names as the English they came from. */
    fields: v.record(v.string(), v.string()),
    /** A fingerprint of the English it was made from: a different one means the English has changed since. */
    sourceHash: v.string(),
    translatedAt: v.number(),
  })
    .index("by_owner_language", ["owner", "ownerId", "language"])
    .index("by_owner", ["owner", "ownerId"]),
};
