import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The Library (docs/plans/active/content-library-plan.md): articles from other
 * websites, read through Firecrawl and kept whole with their details, so Ask
 * Hakken can learn from them and point readers to the original (L7). Added,
 * changed and deleted only in Admin → Content → Library, by the super admin.
 */

/** Who reads it (L5): Ask Hakken, or nobody yet. */
export const LIBRARY_STATUSES = ["IN_KNOWLEDGE", "DRAFT"] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export const libraryStatusValidator = v.union(v.literal("IN_KNOWLEDGE"), v.literal("DRAFT"));

export const libraryArticleTables = {
  libraryArticles: defineTable({
    /** The article's own address, as added; one article per address (L2). */
    url: v.string(),
    title: v.string(),
    /** The website or magazine it is from. */
    publication: v.string(),
    /** Absent when the page does not say (L4). */
    author: v.optional(v.string()),
    /** Calendar days, "YYYY-MM-DD"; absent when the page does not say. */
    publishedOn: v.optional(v.string()),
    updatedOn: v.optional(v.string()),
    /** The page's own summary of itself. */
    description: v.optional(v.string()),
    /** The key of a topic in the shared list (`topics`, IH20); absent until one is chosen. */
    topic: v.optional(v.string()),
    status: libraryStatusValidator,
    /** The page's language as it gives it ("en", "en-GB"); absent when it does not. */
    language: v.optional(v.string()),
    /** How many words the article's text holds, for the list. */
    words: v.number(),
    /** When Firecrawl last read the page; absent for words pasted by hand. */
    readAt: v.optional(v.number()),
    /**
     * What readers see in Insights (insights-helpful-content-plan.md, IH1, IH2):
     * Hakken's own summary of the article and what it means for them, never
     * the article's words. Written when the page is read, or on Write again,
     * and changed by the admin as they like; translated. An article without a
     * summary is not shown to readers.
     */
    summaryEn: v.optional(v.string()),
    meaningEn: v.optional(v.string()),
    /**
     * Shown to readers — published, with a summary — stored on each write so
     * readers' lists read an index instead of filtering (IH21).
     */
    shown: v.optional(v.boolean()),
    /**
     * Pinned as the News front page's lead story, until then (IH11): one pin
     * across News, Knowledge and Helpful content (`leadStory.ts`); cleared
     * when the article is no longer shown.
     */
    leadUntil: v.optional(v.number()),
    /**
     * Kept from News by its In knowledge tick (content-people-knowledge-plan.md,
     * C4): the story it came from, and the person in "Who to follow" who
     * published it. Unticking the story takes the article out again.
     */
    newsItemId: v.optional(v.id("newsItems")),
    followId: v.optional(v.id("newsFollows")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_lead_until", ["leadUntil"])
    .index("by_url", ["url"])
    .index("by_topic", ["topic"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_topic_created", ["topic", "createdAt"])
    .index("by_publication_created", ["publication", "createdAt"])
    // Readers' lists (IH5, IH6, IH21), newest added first.
    .index("by_shown_created", ["shown", "createdAt"])
    .index("by_shown_topic_created", ["shown", "topic", "createdAt"])
    .index("by_shown_publication_created", ["shown", "publication", "createdAt"])
    // Admin's list, searched by title and narrowed by its filters on the server (IH21).
    .searchIndex("search_title", { searchField: "title", filterFields: ["status", "topic", "publication"] }),

  /**
   * An article's words, one row per article, apart from its details so the
   * list never reads them: a few hundred articles of up to 100,000 characters
   * would otherwise be megabytes on every look at the list.
   */
  libraryArticleTexts: defineTable({
    articleId: v.id("libraryArticles"),
    /** Plain text with simple formatting (Markdown), as Firecrawl read it or as pasted. */
    body: v.string(),
  }).index("by_article", ["articleId"]),

  /**
   * Ask Hakken's copy (L11): an article in its knowledge, cut at its headings
   * and searched by a question's words. Replaced whole on every save; none for
   * a draft. Never the wiki — see the plan for why.
   */
  libraryArticleSections: defineTable({
    articleId: v.id("libraryArticles"),
    /** Its place in the article, from 0. */
    position: v.number(),
    /** The heading it sits under; the article's title for the opening. */
    heading: v.string(),
    /** The heading and its words, as searched and as Ask Hakken reads them. */
    text: v.string(),
    /**
     * Its meaning, for a search by meaning as well as by words (insights-
     * helpful-content-plan.md, IH9): embedded after each save with the
     * embedding model set in Admin → AI, and which model it was — a question
     * embedded by another is not compared with it. Absent until embedded.
     */
    embedding: v.optional(v.array(v.number())),
    embeddingModelId: v.optional(v.string()),
  })
    .index("by_article", ["articleId", "position"])
    .searchIndex("search_text", { searchField: "text" })
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 768 }),
};
