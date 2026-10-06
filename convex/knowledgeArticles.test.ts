import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { addTrafficArticle, TRAFFIC_ARTICLE } from "./knowledgeArticleSeeds";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * Knowledge articles (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 1, revised 2026-10-01): written by the super admin in English, read by
 * every signed-in user whatever their company (A14), and only once published.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function people(t: ReturnType<typeof harness>) {
  const { superAdminId, memberId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const memberId = await ctx.db.insert("users", { email: "member@korda.example", role: "USER", companyId });
    return { superAdminId, memberId };
  });
  return { superAdmin: t.withIdentity({ subject: superAdminId }), member: t.withIdentity({ subject: memberId }) };
}

const ARTICLE = { titleEn: "Why rankings move", bodyEn: "Because Google changes." };

describe("Knowledge articles", () => {
  beforeEach(() => {
    generate.mockReset().mockResolvedValue({ text: JSON.stringify({ title: "Titolo", body: "Testo" }) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a reader sees a published article, never a draft, whatever their company", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const draftId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, titleEn: "Not yet", status: "DRAFT" });
    const publishedId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "PUBLISHED" });

    expect((await member.query(api.knowledgeArticles.listPublishedPage, { language: "en", paginationOpts: { numItems: 50, cursor: null } })).page.map((article) => article._id)).toEqual([publishedId]);
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId: draftId, language: "en" })).toBeNull();
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId: publishedId, language: "en" })).toMatchObject({
      title: "Why rankings move",
      body: "Because Google changes.",
    });
    // Until the Translator has it, an Italian reader reads the English.
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId: publishedId, language: "it" })).toMatchObject({ title: "Why rankings move" });
    // Admin sees both, drafts too, and how far the translations have got.
    // (Saved in the same moment, the two are a tie for "most recently changed", so the order is not asserted.)
    const rows = (await superAdmin.query(api.knowledgeArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).page;
    expect(rows.map((row) => [row.titleEn, row.translations])).toEqual(expect.arrayContaining([
      ["Why rankings move", { done: 0, total: 1 }],
      ["Not yet", { done: 0, total: 0 }],
    ]));
  });

  test("only the super admin writes, and a published article has words to read", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    await expect(member.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "DRAFT" })).rejects.toThrow();
    await expect(member.query(api.knowledgeArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).rejects.toThrow();
    await expect(superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, bodyEn: "  ", status: "PUBLISHED" }))
      .rejects.toThrow("To publish, write the article.");
    // A draft may wait for its words.
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Coming soon", bodyEn: "", status: "DRAFT" });
    expect(await superAdmin.query(api.knowledgeArticles.getArticle, { articleId })).toMatchObject({ titleEn: "Coming soon", status: "DRAFT" });
  });

  test("keeps the day it was first published through edits, forgets it on going back to a draft, and records each change", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "PUBLISHED" });
    const first = await t.run(async (ctx) => (await ctx.db.get(articleId))?.publishedAt);
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...ARTICLE, bodyEn: "Changed.", status: "PUBLISHED" });
    expect(await t.run(async (ctx) => (await ctx.db.get(articleId))?.publishedAt)).toBe(first);

    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...ARTICLE, status: "DRAFT" });
    expect(await t.run(async (ctx) => "publishedAt" in ((await ctx.db.get(articleId)) ?? {}))).toBe(false);

    await superAdmin.mutation(api.knowledgeArticles.deleteArticle, { articleId });
    expect(await t.run(async (ctx) => await ctx.db.get(articleId))).toBeNull();
    const trail = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).map((row) => row.actionType));
    expect(trail).toEqual(["CREATE_KNOWLEDGE_ARTICLE", "UPDATE_KNOWLEDGE_ARTICLE", "UPDATE_KNOWLEDGE_ARTICLE", "DELETE_KNOWLEDGE_ARTICLE"]);
  });

  test("Admin's list is searched by title and paged on the server, the most recently changed first", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "DRAFT" });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "DRAFT" });
    vi.useRealTimers();

    const page = { paginationOpts: { numItems: 50, cursor: null } };
    expect((await superAdmin.query(api.knowledgeArticles.listArticlesPage, page)).page.map((row) => row.titleEn)).toEqual(["How is traffic worked out?", "Why rankings move"]);
    expect((await superAdmin.query(api.knowledgeArticles.listArticlesPage, { ...page, search: "rankings" })).page.map((row) => row.titleEn)).toEqual(["Why rankings move"]);
  });

  test("Keep reading lists the same topic's newest, never the one being read, and every article says how long it is", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    await t.mutation(internal.topics.seedFirstTopicsInternal, {});
    const reading = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "PUBLISHED", topic: "RANKINGS" });
    const other = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, titleEn: "What a position is", status: "PUBLISHED", topic: "RANKINGS" });
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, titleEn: "Traffic", status: "PUBLISHED", topic: "TRAFFIC" });

    const more = await member.query(api.knowledgeArticles.listMoreForReaders, { language: "en", topic: "RANKINGS", exclude: reading });
    expect(more.map((article) => article._id)).toEqual([other]);
    expect(more[0].words).toBe(3);
  });

  test("ships the traffic article once, published, and running it again changes nothing", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    vi.useFakeTimers();
    await t.mutation(internal.dataMigrations.run, { name: "2026-10-01-knowledge-traffic-article" });
    await finishScheduled(t);
    vi.useRealTimers();
    const [article] = (await member.query(api.knowledgeArticles.listPublishedPage, { language: "en", paginationOpts: { numItems: 50, cursor: null } })).page;
    expect(article).toMatchObject({ title: TRAFFIC_ARTICLE.titleEn });

    // Edited in Admin, then the migration asked again: the edit stands, and there is still one.
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId: article._id, ...ARTICLE, status: "PUBLISHED" });
    await t.run(async (ctx) => {
      await addTrafficArticle(ctx);
    });
    const after = (await superAdmin.query(api.knowledgeArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).page;
    expect(after.map((row) => [row.key, row.titleEn])).toEqual([["traffic", "Why rankings move"]]);
  });

  test("the traffic article names its source and never the supplier", () => {
    expect(TRAFFIC_ARTICLE.bodyEn).toContain("https://www.advancedwebranking.com/seo/organic-ctr");
    expect(TRAFFIC_ARTICLE.bodyEn.toLowerCase()).not.toContain("dataforseo");
    expect(TRAFFIC_ARTICLE.bodyEn).toContain("About 1 in 85");
  });
});
