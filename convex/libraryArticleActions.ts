import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { superAdminAction } from "./tenantFunctions";
import { checkedUrl } from "./utils/contentAdmin";
import { LIBRARY_MIN_WORDS, libraryPageFrom, libraryUrlKey } from "./utils/libraryPage";
import { validateSafeUrl } from "./utils/security";
import { fetchPage } from "./webScrapeActions";

/**
 * "Read the page" (docs/plans/active/content-library-plan.md, L3): one page
 * through Firecrawl, its words and details handed back to the form. Nothing
 * is stored here — the admin checks what came back and saves it. One press is
 * one paid page; an address already in the Library is named before Firecrawl
 * is asked (L2).
 */

const why = v.union(
  v.literal("bad_address"),
  v.literal("not_configured"),
  v.literal("refused"),
  v.literal("no_text"),
  v.literal("few_words"),
  v.literal("timeout"),
  v.literal("failed"),
);

const readValidator = v.union(
  v.object({
    status: v.literal("read"),
    url: v.string(),
    readAt: v.number(),
    title: v.string(),
    publication: v.string(),
    author: v.optional(v.string()),
    publishedOn: v.optional(v.string()),
    updatedOn: v.optional(v.string()),
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    body: v.string(),
    words: v.number(),
    /** The page ran past the Library's ceiling and was cut there. */
    cut: v.boolean(),
  }),
  /** Another article already has this address (L2). */
  v.object({ status: v.literal("duplicate"), articleId: v.id("libraryArticles"), title: v.string() }),
  /** Firecrawl could not read it (L6): why, and the publication when the page gave it. */
  v.object({
    status: v.literal("unread"),
    why,
    httpStatus: v.optional(v.number()),
    words: v.optional(v.number()),
    publication: v.optional(v.string()),
  }),
);

/** What a read hands back; written out so the function's type never waits on the API it is part of. */
type ReadResult = Infer<typeof readValidator>;

export const readPage = superAdminAction({
  args: {
    url: v.string(),
    /** On an article's own page, its own address is not a second copy. */
    articleId: v.optional(v.id("libraryArticles")),
  },
  returns: readValidator,
  handler: async (ctx, args): Promise<ReadResult> => {
    let url: string;
    try {
      url = libraryUrlKey(checkedUrl(args.url, "The article's address"));
      validateSafeUrl(url, "Library");
    } catch {
      return { status: "unread" as const, why: "bad_address" as const };
    }

    const existing: { articleId: Id<"libraryArticles">; title: string } | null =
      await ctx.runQuery(internal.libraryArticles.findByUrlInternal, { url, exceptId: args.articleId });
    if (existing) return { status: "duplicate" as const, articleId: existing.articleId, title: existing.title };

    const page = await fetchPage({ url, mainContentOnly: true });
    if (page.status === "error") {
      return { status: "unread" as const, why: page.reason, ...(page.httpStatus ? { httpStatus: page.httpStatus } : {}) };
    }

    const read = libraryPageFrom(page.markdown, page.metadata, url);
    if (read.words < LIBRARY_MIN_WORDS) {
      return { status: "unread" as const, why: "few_words" as const, words: read.words, publication: read.publication };
    }
    return { status: "read" as const, url, readAt: Date.now(), ...read };
  },
});
