/**
 * The lists Learn's screens and its tables share (docs/plans/active/knowledge-
 * news-and-digest-plan.md): what a News item can be, and what a Knowledge
 * article can be about (revised again 2026-10-01, R9). Kept here, apart from
 * the schema files, so a screen can read them without taking the backend with
 * it.
 */

/** What a News item is, and the side menu's kinds. */
export const NEWS_ITEM_KINDS = ["GOOGLE_UPDATE", "WEBSITE", "YOUTUBE", "X"] as const;
export type NewsItemKind = (typeof NEWS_ITEM_KINDS)[number];

/** What an article is about, the same four things a site is measured by: Learn's side menu lists each topic that has articles. */
export const KNOWLEDGE_TOPICS = ["TRAFFIC", "RANKINGS", "AI_ANSWERS", "BACKLINKS"] as const;
export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number];
