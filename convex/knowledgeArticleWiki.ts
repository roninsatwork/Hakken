import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { buildWikiSearchText } from "./wikiPages";
import { WIKI_PAGE_MAX_CHARS } from "./wikiRewriteService";

/**
 * Knowledge in Ask Hakken (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 2, D3): a published article is copied to the shared brain as a global
 * PRODUCT page — what the platform is and how it works — so every company's
 * Ask Hakken reads it (`wikiActions.selectWikiContextForQuery` already reads
 * the global shelf). Taking it down, as a draft or deleted, takes the page
 * down.
 *
 * The page is a person's writing, marked by `knowledgeArticleId`. The wiki
 * staff never rewrite, tidy or relink it (`applyRewriteInternal`, the
 * Tidier's and the Linker's lists), and the Platform Wiki screen neither
 * edits nor deletes it: the article is changed in one place, Admin → Content
 * → Knowledge, and the page follows.
 */

/** The topic kind a Knowledge page sits under: how the platform works, for every company. */
const KNOWLEDGE_PAGE_KIND = "PRODUCT" as const;

/** The page's subject key: the article's, so it is found again however the title changes. */
export function knowledgeSubjectKey(articleId: Id<"knowledgeArticles">): string {
  return `knowledge-${articleId}`;
}

async function findPage(ctx: MutationCtx, articleId: Id<"knowledgeArticles">) {
  return await ctx.db
    .query("wikiPages")
    .withIndex("by_company_kind_subject", (q) =>
      q.eq("companyId", undefined).eq("kind", KNOWLEDGE_PAGE_KIND).eq("subjectKey", knowledgeSubjectKey(articleId)))
    .unique();
}

/**
 * Brings the shared brain in line with the article: written while it is
 * published, in English — the brain's language; Ask Hakken answers in the
 * reader's — and gone while it is not. A wiki page holds at most
 * `WIKI_PAGE_MAX_CHARS`, so a longer article is read only that far.
 */
export async function syncArticleToWiki(ctx: MutationCtx, article: Doc<"knowledgeArticles">, writtenBy: string): Promise<void> {
  const existing = await findPage(ctx, article._id);
  if (article.status !== "PUBLISHED") {
    if (existing) await removePage(ctx, existing);
    return;
  }

  const now = Date.now();
  const subjectKey = knowledgeSubjectKey(article._id);
  const content = article.bodyEn.slice(0, WIKI_PAGE_MAX_CHARS);
  const searchText = buildWikiSearchText({ title: article.titleEn, subjectKey, content });
  const source = `HUMAN:${writtenBy}`;
  if (!existing) {
    await ctx.db.insert("wikiPages", {
      kind: KNOWLEDGE_PAGE_KIND,
      subjectKey,
      title: article.titleEn,
      content,
      searchText,
      links: [],
      pinnedCorrections: [],
      rewriteCount: 1,
      lastRewriteSource: source,
      knowledgeArticleId: article._id,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  if (existing.content === content && existing.title === article.titleEn) return;
  await ctx.db.insert("wikiPageRevisions", { pageId: existing._id, content: existing.content, source, createdAt: now });
  await ctx.db.patch(existing._id, {
    title: article.titleEn,
    content,
    searchText,
    rewriteCount: existing.rewriteCount + 1,
    lastRewriteSource: source,
    updatedAt: now,
  });
}

/** Takes the article's page off the shared brain, with its history. */
export async function removeArticleFromWiki(ctx: MutationCtx, articleId: Id<"knowledgeArticles">): Promise<void> {
  const existing = await findPage(ctx, articleId);
  if (existing) await removePage(ctx, existing);
}

async function removePage(ctx: MutationCtx, page: Doc<"wikiPages">): Promise<void> {
  const revisions = await ctx.db
    .query("wikiPageRevisions")
    .withIndex("by_page", (q) => q.eq("pageId", page._id))
    .take(500);
  for (const revision of revisions) await ctx.db.delete(revision._id);
  await ctx.db.delete(page._id);
}
