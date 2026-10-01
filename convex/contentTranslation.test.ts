import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { TRANSLATOR, fingerprint, parseTranslation } from "./contentTranslation";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * The Translator (docs/plans/active/knowledge-news-and-digest-plan.md, revised
 * 2026-10-01): people write once, in English; every other language is the
 * machine's, made when the English is saved and shown only while it is of the
 * English as it stands.
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

/** Runs what the writes scheduled: the translations. Fake timers are on from the start of each test, as the harness needs. */
async function settle(t: ReturnType<typeof harness>) {
  await finishScheduled(t);
}

const ARTICLE = { titleEn: "How is traffic worked out?", bodyEn: "It is an estimate.", status: "PUBLISHED" as const };

describe("the Translator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generate.mockReset().mockResolvedValue({
      text: "```json\n" + JSON.stringify({ title: "Come viene calcolato il traffico?", body: "È una stima." }) + "\n```",
      inputTokens: 120,
      outputTokens: 40,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("translates a published article as soon as it is saved, and an Italian reader reads Italian", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, ARTICLE);
    await settle(t);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].systemInstruction).toContain("into Italian");
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "it" })).toMatchObject({
      title: "Come viene calcolato il traffico?",
      body: "È una stima.",
    });
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "en" })).toMatchObject({ title: ARTICLE.titleEn });
    expect((await superAdmin.query(api.knowledgeArticles.getArticle, { articleId }))?.translations).toEqual({ done: 1, total: 1 });

    // The Translator is a real agent, and its call is in the cost ledger.
    const { agents, transactions } = await t.run(async (ctx) => ({
      agents: (await ctx.db.query("agents").collect()).filter((agent) => agent.systemKey === TRANSLATOR.systemKey),
      transactions: await ctx.db.query("agentTransactions").collect(),
    }));
    expect(agents).toHaveLength(1);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ agentId: agents[0]._id, inputTokens: 120, outputTokens: 40 });
  });

  test("never shows a changed article half-translated: the English until the new translation lands", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, ARTICLE);
    await settle(t);
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, ...ARTICLE, bodyEn: "It is an estimate, worked out." });

    // Saved, not yet translated again: the Italian reader gets the new English, not the old Italian.
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "it" })).toMatchObject({ body: "It is an estimate, worked out." });
    await settle(t);
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "it" })).toMatchObject({ body: "È una stima." });
  });

  test("a draft is not translated, and nothing is translated while the Translator is switched off", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    await superAdmin.mutation(api.knowledgeArticles.createArticle, { ...ARTICLE, status: "DRAFT" });
    await settle(t);
    expect(generate).not.toHaveBeenCalled();

    await t.mutation(internal.contentTranslation.ensureTranslatorInternal, {});
    await t.run(async (ctx) => {
      const translator = (await ctx.db.query("agents").collect()).find((agent) => agent.systemKey === TRANSLATOR.systemKey);
      if (translator) await ctx.db.patch(translator._id, { isActive: false });
    });
    await superAdmin.mutation(api.knowledgeArticles.createArticle, ARTICLE);
    await settle(t);
    expect(generate).not.toHaveBeenCalled();
  });

  test("a reply that is not the same fields is not kept, and Run translates whatever is still missing", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    generate.mockResolvedValueOnce({ text: "Sorry, I cannot help with that." });
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, ARTICLE);
    await settle(t);
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "it" })).toMatchObject({ title: ARTICLE.titleEn });

    const missing = await t.query(internal.contentTranslation.missingTranslationsInternal, { limit: 10 });
    expect(missing).toEqual([{ owner: "knowledgeArticles", ownerId: articleId }]);

    const { runId } = await t.run(async (ctx) => {
      const agentId = await ctx.db.insert("agents", {
        name: TRANSLATOR.name, description: TRANSLATOR.description, systemPrompt: TRANSLATOR.systemPrompt, systemKey: TRANSLATOR.systemKey,
        modelId: "fast-chat", thinkingMode: false, isActive: true, isGlobal: true, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const runId = await ctx.db.insert("agentRuns", {
        agentId, objective: TRANSLATOR.standingObjective, status: "RUNNING", triggerType: "MANUAL", startedAt: Date.now(), updatedAt: Date.now(),
      });
      return { runId };
    });
    await t.action(internal.contentTranslationActions.runTranslatorNow, { runId });
    expect(await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "it" })).toMatchObject({ title: "Come viene calcolato il traffico?" });
    expect(await t.run(async (ctx) => (await ctx.db.get(runId))?.status)).toBe("SUCCESS");
  });

  test("reads a reply in or out of a code fence, and fingerprints the English whatever its key order", () => {
    expect(parseTranslation('```json\n{"title":"Titolo","body":"Testo"}\n```', ["title", "body"])).toEqual({ title: "Titolo", body: "Testo" });
    expect(parseTranslation('{"title":"Titolo"}', ["title", "body"])).toBeNull();
    expect(parseTranslation("not json", ["title"])).toBeNull();
    expect(fingerprint({ title: "A", body: "B" })).toBe(fingerprint({ body: "B", title: "A" }));
    expect(fingerprint({ title: "A", body: "B" })).not.toBe(fingerprint({ title: "A", body: "C" }));
  });
});
