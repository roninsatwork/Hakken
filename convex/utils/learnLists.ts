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

/**
 * What an article is about is no longer a fixed list here: topics are the
 * shared list the super admin manages (`convex/topics.ts`,
 * insights-helpful-content-plan.md, IH20), kept by key. A key is upper case
 * letters, digits and underscores.
 */
export const TOPIC_KEY_PATTERN = /^[A-Z0-9_]{1,40}$/;
