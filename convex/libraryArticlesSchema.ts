import { defineTable } from "convex/server";
import { v } from "convex/values";
import { knowledgeTopicValidator } from "./knowledgeArticlesSchema";

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
    /** Knowledge's topics (R9); absent until one is chosen. */
    topic: v.optional(knowledgeTopicValidator),
    status: libraryStatusValidator,
    /** The page's language as it gives it ("en", "en-GB"); absent when it does not. */
    language: v.optional(v.string()),
    /** How many words the article's text holds, for the list. */
    words: v.number(),
    /** When Firecrawl last read the page; absent for words pasted by hand. */
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_url", ["url"]),

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
  })
    .index("by_article", ["articleId", "position"])
    .searchIndex("search_text", { searchField: "text" }),
};
