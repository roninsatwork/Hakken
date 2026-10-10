import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Ours: written in Admin (`knowledgeArticles`); WEB: kept whole from the web (`libraryArticles`). */
export const knowledgeListKindValidator = v.union(v.literal("OURS"), v.literal("WEB"));
/** How it came: written here, added from a link, or ticked in News. */
export const knowledgeCameValidator = v.union(v.literal("WRITTEN"), v.literal("LINK"), v.literal("NEWS"));

/**
 * Admin → Knowledge's one list (docs/plans/active/content-people-knowledge-
 * plan.md, phase 3, board 5): ours and the web's together. An article of ours
 * holds its whole text, so the two tables cannot be read whole to page and
 * sort across both; each article keeps one small row here instead, written on
 * every save, the way `insightsCounts` keeps Insights' totals.
 */
export const knowledgeListTables = {
  knowledgeList: defineTable({
    kind: knowledgeListKindValidator,
    knowledgeArticleId: v.optional(v.id("knowledgeArticles")),
    libraryArticleId: v.optional(v.id("libraryArticles")),
    title: v.string(),
    came: knowledgeCameValidator,
    /** The web's: the person it was ticked from, else its author, else its publication. Empty for ours. */
    fromName: v.string(),
    followId: v.optional(v.id("newsFollows")),
    topic: v.optional(v.string()),
    words: v.number(),
    /** Ours as published or a draft; the web's IN_KNOWLEDGE reads as published. */
    status: v.union(v.literal("PUBLISHED"), v.literal("DRAFT")),
    addedAt: v.number(),
  })
    .index("by_knowledge_article", ["knowledgeArticleId"])
    .index("by_library_article", ["libraryArticleId"])
    .index("by_follow", ["followId"])
    .index("by_added", ["addedAt"]),
};
