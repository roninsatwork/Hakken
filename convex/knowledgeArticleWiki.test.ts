import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { knowledgeSubjectKey } from "./knowledgeArticleWiki";
import { KNOWLEDGE_PAGE_REFUSAL } from "./utils/knowledgePageGuard";

/**
 * Knowledge in Ask Hakken (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 2, D3): a published article is on the shared brain for every company;
 * a draft or a deleted one is not; and the copy is a person's writing that the
 * wiki staff and the Platform Wiki screen leave alone.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const WHOLE = {
  titleEn: "How is traffic worked out?",
  bodyEn: "It is an estimate, not a count.",
  titleIt: "Come viene calcolato il traffico?",
  bodyIt: "È una stima, non un conteggio.",
};

async function setUp(t: ReturnType<typeof harness>) {
  const { superAdminId, companyId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    return { superAdminId, companyId };
  });
  return { superAdmin: t.withIdentity({ subject: superAdminId }), companyId };
}

const brainPages = (t: ReturnType<typeof harness>) =>
  t.run(async (ctx) => (await ctx.db.query("wikiPages").collect()).filter((page) => page.companyId === undefined));

describe("Knowledge articles on the shared brain", () => {
  test("a published article is a global page every company's Ask Hakken reads, and follows the article", async () => {
    const t = harness();
    const { superAdmin, companyId } = await setUp(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "PUBLISHED" });
    const [page] = await brainPages(t);
    expect(page).toMatchObject({ kind: "PRODUCT", subjectKey: knowledgeSubjectKey(articleId), title: WHOLE.titleEn, content: WHOLE.bodyEn, knowledgeArticleId: articleId });
    expect(page.lastRewriteSource.startsWith("HUMAN:")).toBe(true);

    // The global index is what every company's answers choose from.
    const index = await t.query(internal.wikiPages.getWikiIndexInternal, { includeCustomerPages: false });
    expect(index.map((entry) => entry.title)).toContain(WHOLE.titleEn);
    expect(companyId).toBeDefined();

    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, bodyEn: "Searches times who clicks.", status: "PUBLISHED" });
    expect((await brainPages(t))[0]).toMatchObject({ content: "Searches times who clicks.", rewriteCount: 2 });
  });

  test("a draft or a deleted article is taken off the shared brain, history and all", async () => {
    const t = harness();
    const { superAdmin } = await setUp(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "PUBLISHED" });
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, bodyEn: "Changed.", status: "PUBLISHED" });
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, status: "DRAFT" });
    expect(await brainPages(t)).toHaveLength(0);
    expect(await t.run(async (ctx) => (await ctx.db.query("wikiPageRevisions").collect()).length)).toBe(0);

    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, status: "PUBLISHED" });
    expect(await brainPages(t)).toHaveLength(1);
    await superAdmin.mutation(api.knowledgeArticles.deleteArticle, { articleId });
    expect(await brainPages(t)).toHaveLength(0);
  });

  test("the wiki staff never rewrite it, and the Platform Wiki screen neither edits, pins nor deletes it", async () => {
    const t = harness();
    const { superAdmin } = await setUp(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "PUBLISHED" });
    const [page] = await brainPages(t);

    // A Distiller or Filing Clerk rewrite of the same subject is refused, with a trace.
    await t.mutation(internal.wikiPages.applyRewriteInternal, {
      subjectKey: knowledgeSubjectKey(articleId),
      kind: "PRODUCT",
      title: "Traffic",
      content: "A model's shorter version.",
      source: "TENDING",
    });
    expect((await brainPages(t))[0].content).toBe(WHOLE.bodyEn);
    const refused = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).filter((row) => row.actionType === "WIKI_PAGE_REFUSED"));
    expect(refused).toHaveLength(1);

    await expect(superAdmin.mutation(api.wikiPages.editPageContentForGlobal, { pageId: page._id, content: "Edited on the wiki." }))
      .rejects.toThrow(KNOWLEDGE_PAGE_REFUSAL);
    await expect(superAdmin.mutation(api.wikiPages.pinCorrectionForGlobal, { pageId: page._id, text: "Pinned." }))
      .rejects.toThrow(KNOWLEDGE_PAGE_REFUSAL);
    await expect(superAdmin.mutation(api.wikiPages.deletePageForGlobal, { pageId: page._id })).rejects.toThrow(KNOWLEDGE_PAGE_REFUSAL);

    // Nor does the Linker offer it to a model.
    const sparse = await t.query(internal.wikiPages.listSparselyLinkedTopicsInternal, { limit: 10 });
    expect(sparse.map((entry) => entry.subjectKey)).not.toContain(knowledgeSubjectKey(articleId));
  });
});
