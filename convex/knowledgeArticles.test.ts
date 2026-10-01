import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { addTrafficArticle, TRAFFIC_ARTICLE } from "./knowledgeArticleSeeds";

/**
 * Knowledge articles (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 1): written by the super admin in both languages, read by every
 * signed-in user whatever their company (A14), and only once published.
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

const WHOLE = { titleEn: "Why rankings move", bodyEn: "Because Google changes.", titleIt: "Perché le posizioni cambiano", bodyIt: "Perché Google cambia." };

describe("Knowledge articles", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a reader sees a published article, never a draft, whatever their company", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const draftId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, titleEn: "Not yet", status: "DRAFT" });
    const publishedId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "PUBLISHED" });

    expect((await member.query(api.knowledgeArticles.listPublishedArticles, {})).map((article) => article._id)).toEqual([publishedId]);
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId: draftId })).toBeNull();
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId: publishedId })).toMatchObject({
      titleEn: "Why rankings move",
      bodyIt: "Perché Google cambia.",
    });
    // Admin sees both, drafts too.
    expect(await superAdmin.query(api.knowledgeArticles.listArticles, {})).toHaveLength(2);
  });

  test("only the super admin writes, and publishing needs both languages whole", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    await expect(member.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "DRAFT" })).rejects.toThrow();
    await expect(member.query(api.knowledgeArticles.listArticles, {})).rejects.toThrow();

    await expect(superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, bodyIt: "  ", status: "PUBLISHED" }))
      .rejects.toThrow("both English and Italian");
    // A draft may wait for its Italian.
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, titleIt: "", bodyIt: "", status: "DRAFT" });
    await expect(superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, titleIt: "", status: "PUBLISHED" }))
      .rejects.toThrow("both English and Italian");
  });

  test("keeps the day it was first published through edits, forgets it on going back to a draft, and records each change", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...WHOLE, status: "PUBLISHED" });
    const first = await t.run(async (ctx) => (await ctx.db.get(articleId))?.publishedAt);
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, bodyEn: "Changed.", status: "PUBLISHED" });
    expect(await t.run(async (ctx) => (await ctx.db.get(articleId))?.publishedAt)).toBe(first);

    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...WHOLE, status: "DRAFT" });
    expect(await t.run(async (ctx) => "publishedAt" in ((await ctx.db.get(articleId)) ?? {}))).toBe(false);

    await superAdmin.mutation(api.knowledgeArticles.deleteArticle, { articleId });
    expect(await t.run(async (ctx) => await ctx.db.get(articleId))).toBeNull();
    const trail = await t.run(async (ctx) => (await ctx.db.query("auditLogs").collect()).map((row) => row.actionType));
    expect(trail).toEqual(["CREATE_KNOWLEDGE_ARTICLE", "UPDATE_KNOWLEDGE_ARTICLE", "UPDATE_KNOWLEDGE_ARTICLE", "DELETE_KNOWLEDGE_ARTICLE"]);
  });

  test("ships the traffic article once, published, and running it again changes nothing", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    vi.useFakeTimers();
    await t.mutation(internal.dataMigrations.run, { name: "2026-10-01-knowledge-traffic-article" });
    await finishScheduled(t);
    vi.useRealTimers();
    const [article] = await member.query(api.knowledgeArticles.listPublishedArticles, {});
    expect(article).toMatchObject({ titleEn: TRAFFIC_ARTICLE.titleEn, titleIt: TRAFFIC_ARTICLE.titleIt });

    // Edited in Admin, then the migration asked again: the edit stands, and there is still one.
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId: article._id, ...WHOLE, status: "PUBLISHED" });
    await t.run(async (ctx) => {
      await addTrafficArticle(ctx);
    });
    const after = await superAdmin.query(api.knowledgeArticles.listArticles, {});
    expect(after.map((row) => [row.key, row.titleEn])).toEqual([["traffic", "Why rankings move"]]);
  });

  test("the traffic article names its source and never the supplier", () => {
    for (const body of [TRAFFIC_ARTICLE.bodyEn, TRAFFIC_ARTICLE.bodyIt]) {
      expect(body).toContain("https://www.advancedwebranking.com/seo/organic-ctr");
      expect(body.toLowerCase()).not.toContain("dataforseo");
      expect(body).toMatch(/1 (in|su) 85/);
    }
  });
});
