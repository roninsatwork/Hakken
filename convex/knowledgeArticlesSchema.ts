import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Knowledge articles: what the platform's own team writes for every signed-in user
 * (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1). General
 * knowledge, the same for every company and every role (D1, A14), written and
 * changed only in Admin → Content → Knowledge — in English alone; the
 * Translator writes every other language (`contentTranslation.ts`, revised
 * 2026-10-01).
 */

export const KNOWLEDGE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export const knowledgeStatusValidator = v.union(v.literal("DRAFT"), v.literal("PUBLISHED"));


export const knowledgeArticleTables = {
  knowledgeArticles: defineTable({
    /**
     * A stable name for an article the platform ships with — "traffic" for
     * the first — so a migration adds it once and never twice. Absent for an
     * article written in Admin.
     */
    key: v.optional(v.string()),
    titleEn: v.string(),
    /** Plain text with simple formatting: paragraphs, bold, lists and links (Markdown). */
    bodyEn: v.string(),
    /** Readers see only a published article; a draft is Admin's alone. */
    status: knowledgeStatusValidator,
    /**
     * The key of a topic in the shared list (`topics`, insights-helpful-content-
     * plan.md, IH20); absent until one is chosen, or after its topic is deleted.
     */
    topic: v.optional(v.string()),
    /** When it was first published; kept through later edits, cleared when it goes back to a draft. */
    publishedAt: v.optional(v.number()),
    /**
     * Pinned as the News front page's lead story, until then (insights-helpful-
     * content-plan.md, IH11): one pin across News, Knowledge and Helpful
     * content (`leadStory.ts`); cleared when the article goes back to a draft.
     */
    leadUntil: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_status_published", ["status", "publishedAt"])
    .index("by_lead_until", ["leadUntil"])
    .index("by_key", ["key"])
    .index("by_topic", ["topic"])
    // Readers' list by topic, newest first (IH12, IH21).
    .index("by_status_topic_published", ["status", "topic", "publishedAt"])
    // Admin's list, the most recently changed first, and searched by title, on the server (IH21).
    .index("by_updated", ["updatedAt"])
    .searchIndex("search_title", { searchField: "titleEn" }),
};
