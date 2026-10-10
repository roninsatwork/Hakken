import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { embedVertexContentWithRetry } from "./vertexProviderService";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";

const { generate, agentTurn } = vi.hoisted(() => ({ generate: vi.fn(), agentTurn: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));
vi.mock("./vertexProviderService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./vertexProviderService")>()),
  createVertexGenAIClient: vi.fn(() => ({})),
  createVertexEmbeddingClient: vi.fn(() => ({})),
  embedVertexContentWithRetry: vi.fn(),
  generateVertexContentWithRetry: vi.fn(),
  // Ask Hakken answers through the Assistant (assistant-foundation-plan.md, item 9).
  createVertexPromptCache: async () => undefined,
  streamVertexContentWithRetry: async (_ai: unknown, params: unknown) => agentTurn(params),
}));

/**
 * The Library (docs/plans/active/content-library-plan.md): other websites'
 * articles, kept whole with their details by the super admin alone, one
 * article per address, and read by Ask Hakken — for signed-in users, never a
 * widget visitor — only while it is in Ask Hakken's knowledge.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function people(t: ReturnType<typeof harness>) {
  // The shared topic list's first rows (topics.ts, IH20): an article's topic must be one of them.
  await t.mutation(internal.topics.seedFirstTopicsInternal, {});
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const memberId = await ctx.db.insert("users", { email: "member@korda.example", role: "USER", companyId });
    return { companyId, superAdminId, memberId };
  });
  return { ...ids, superAdmin: t.withIdentity({ subject: ids.superAdminId }), member: t.withIdentity({ subject: ids.memberId }) };
}

const BODY = [
  "AI features in Google Search show links to the pages they draw on.",
  "",
  "## Best practices that still matter",
  "",
  "Let Google crawl the page and keep structured data in line with what is visible.",
].join("\n");

const ARTICLE = {
  url: "https://developers.google.com/search/docs/appearance/ai-features/",
  title: "AI features and your website",
  publication: "Google Search Central",
  author: "",
  publishedOn: "2026-09-18",
  updatedOn: "",
  description: "How AI features in Google Search work.",
  topic: "AI_ANSWERS" as const,
  status: "IN_KNOWLEDGE" as const,
  language: "en",
  body: BODY,
};

describe("Library articles", () => {
  // A published article's save schedules its sections' embedding (IH9); on fake timers it runs only when a test asks, never after the test.
  beforeEach(() => {
    useFixedDay();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("only the super admin reads or changes the Library", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    await expect(member.mutation(api.libraryArticles.createArticle, ARTICLE)).rejects.toThrow();
    await expect(member.query(api.libraryArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).rejects.toThrow();
    await expect(member.action(api.libraryArticleActions.readPage, { url: ARTICLE.url })).rejects.toThrow();
    await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    expect((await superAdmin.query(api.libraryArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).page).toHaveLength(1);
  });

  test("an article keeps its details, its words apart from the list, and one address per article", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    const [listed] = (await superAdmin.query(api.libraryArticles.listArticlesPage, { paginationOpts: { numItems: 50, cursor: null } })).page;
    // The address is kept without its trailing slash; blanks are "not given".
    expect(listed).toMatchObject({
      url: "https://developers.google.com/search/docs/appearance/ai-features",
      title: "AI features and your website",
      publication: "Google Search Central",
      author: null,
      publishedOn: "2026-09-18",
      updatedOn: null,
      topic: "AI_ANSWERS",
      status: "IN_KNOWLEDGE",
      words: 33,
    });
    expect(listed).not.toHaveProperty("body");
    expect(await superAdmin.query(api.libraryArticles.getArticle, { articleId })).toMatchObject({ body: BODY });

    // The same page however it was pasted is refused, naming the article that has it.
    await expect(superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, url: "https://DEVELOPERS.google.com/search/docs/appearance/ai-features#top" }))
      .rejects.toThrow("That article is already in Helpful content: “AI features and your website”.");
    // Its own page saving its own address is not a second copy.
    await superAdmin.mutation(api.libraryArticles.updateArticle, { articleId, ...ARTICLE, author: "Google" });
    expect(await superAdmin.query(api.libraryArticles.getArticle, { articleId })).toMatchObject({ author: "Google" });
  });

  test("Ask Hakken's copy follows the article: sections while it is in knowledge, none as a draft, gone with it", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const sections = () => t.run((ctx) => ctx.db.query("libraryArticleSections").collect());

    await expect(superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, body: "  " }))
      .rejects.toThrow("For the assistant to read it, the article needs its words.");

    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    expect((await sections()).map((section) => section.heading)).toEqual(["AI features and your website", "Best practices that still matter"]);
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "What are the best practices for structured data?" }))
      .toEqual([{ articleId, text: expect.stringContaining('From "AI features and your website" (Google Search Central, published 2026-09-18) — https://developers.google.com/search/docs/appearance/ai-features\nBest practices that still matter') }]);
    // A one-person blog's author and publication are named once.
    await superAdmin.mutation(api.libraryArticles.updateArticle, { articleId, ...ARTICLE, author: "Google Search Central" });
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "best practices structured data" }))
      .toEqual([{ articleId, text: expect.stringContaining('From "AI features and your website" (Google Search Central, published 2026-09-18) —') }]);
    // One shared word is not enough to bring an article into an answer.
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "How many backlinks does my website have?" })).toEqual([]);

    await superAdmin.mutation(api.libraryArticles.updateArticle, { articleId, ...ARTICLE, status: "DRAFT" });
    expect(await sections()).toEqual([]);
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "best practices structured data" })).toEqual([]);

    await superAdmin.mutation(api.libraryArticles.updateArticle, { articleId, ...ARTICLE });
    await superAdmin.mutation(api.libraryArticles.deleteArticle, { articleId });
    const left = await t.run(async (ctx) => ({
      articles: await ctx.db.query("libraryArticles").collect(),
      texts: await ctx.db.query("libraryArticleTexts").collect(),
      sections: await ctx.db.query("libraryArticleSections").collect(),
      audit: (await ctx.db.query("auditLogs").collect()).map((entry) => entry.actionType),
    }));
    expect(left).toMatchObject({ articles: [], texts: [], sections: [] });
    expect(left.audit).toEqual(["CREATE_LIBRARY_ARTICLE", "UPDATE_LIBRARY_ARTICLE", "UPDATE_LIBRARY_ARTICLE", "UPDATE_LIBRARY_ARTICLE", "DELETE_LIBRARY_ARTICLE"]);
  });
});

describe("Read the page", () => {
  const WORDS = Array.from({ length: 40 }, () => "Clicks and impressions from AI features are counted in Search Console.").join(" ");

  function firecrawlAnswers(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  });

  test("reads the page's words and details, and stores nothing", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const fetchMock = firecrawlAnswers({
      success: true,
      data: {
        markdown: `# AI features and your website\n\n${WORDS}`,
        metadata: {
          title: "AI features and your website | Google Search Central",
          ogSiteName: "Google Search Central",
          "article:published_time": "2026-09-18T10:00:00Z",
          language: "en",
          description: "How AI features work.",
        },
      },
    });

    const read = await superAdmin.action(api.libraryArticleActions.readPage, { url: ARTICLE.url });
    expect(read).toMatchObject({
      status: "read",
      url: "https://developers.google.com/search/docs/appearance/ai-features",
      title: "AI features and your website",
      publication: "Google Search Central",
      publishedOn: "2026-09-18",
      language: "en",
      description: "How AI features work.",
      cut: false,
    });
    expect(read).not.toHaveProperty("author");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.query("libraryArticles").collect())).toEqual([]);
  });

  test("a page that is only a sign-in box is not read, and says how little it held", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    firecrawlAnswers({ success: true, data: { markdown: "Sign in to keep reading. Subscribe today.", metadata: { ogSiteName: "Financial Times" } } });

    expect(await superAdmin.action(api.libraryArticleActions.readPage, { url: "https://www.ft.com/content/abc" }))
      .toEqual({ status: "unread", why: "few_words", words: 7, publication: "Financial Times" });
  });

  test("an address already in Helpful content is named before Firecrawl is paid for it", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const fetchMock = firecrawlAnswers({});
    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);

    expect(await superAdmin.action(api.libraryArticleActions.readPage, { url: `${ARTICLE.url}#best-practices` }))
      .toEqual({ status: "duplicate", articleId, title: "AI features and your website" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an address that is not a web page, or a deployment with no key, is said plainly", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    expect(await superAdmin.action(api.libraryArticleActions.readPage, { url: "http://localhost:3000/secret" }))
      .toEqual({ status: "unread", why: "bad_address" });
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(await superAdmin.action(api.libraryArticleActions.readPage, { url: ARTICLE.url }))
      .toEqual({ status: "unread", why: "not_configured" });
  });
});

describe("Ask Hakken reads the Library", () => {
  beforeEach(() => {
    useFixedDay();
    vi.mocked(embedVertexContentWithRetry).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The words Ask Hakken's answer was asked with, for one question in a new thread. */
  async function promptFor(t: ReturnType<typeof harness>, thread: { userId: Id<"users">; companyId: Id<"companies">; widget: boolean; question?: string }) {
    const threadId = await t.run(async (ctx) => {
      const widgetId = thread.widget
        ? await ctx.db.insert("widgets", { companyId: thread.companyId, name: "Main website", allowedDomains: ["https://korda.example"], isActive: true, createdAt: Date.now() })
        : undefined;
      return await ctx.db.insert("threads", {
        userId: thread.userId,
        companyId: thread.companyId,
        ...(widgetId ? { widgetId } : {}),
        title: "Question",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    agentTurn.mockReset().mockResolvedValue({ text: "An answer.", functionCalls: undefined, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } });
    await t.action(internal.hakkenAssistant.answerInternal, { threadId, content: thread.question ?? "What are the best practices for structured data in AI features?" });
    // The turn the model was asked to answer: the question, and what was read for it.
    const request = agentTurn.mock.calls.at(-1)?.[0] as { contents?: Array<{ parts: Array<{ text?: string }> }> } | undefined;
    return request?.contents?.at(-1)?.parts.map((part) => part.text ?? "").join("") ?? "";
  }

  test("a signed-in user's question gets the article, marked as someone else's words; a widget visitor's never does", async () => {
    const t = harness();
    const { superAdmin, memberId, companyId } = await people(t);
    await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);

    const signedIn = await promptFor(t, { userId: memberId, companyId, widget: false });
    expect(signedIn).toContain("[UNTRUSTED REFERENCE DATA: Helpful content");
    expect(signedIn).toContain('From "AI features and your website" (Google Search Central, published 2026-09-18)');

    const visitor = await promptFor(t, { userId: memberId, companyId, widget: true });
    expect(visitor).toContain("best practices for structured data");
    expect(visitor).not.toContain("AI features and your website");
  });

  // insights-helpful-content-plan.md, IH9: by meaning as well as by words.
  test("each section is embedded after the save, and a question sharing none of its words still finds it by meaning", async () => {
    const t = harness();
    const { superAdmin, memberId, companyId } = await people(t);
    // One meaning for every text: the question and the article's sections are as close as can be.
    const vector = Array.from({ length: 768 }, (_, index) => (index % 7) / 7);
    vi.mocked(embedVertexContentWithRetry).mockResolvedValue({ embeddings: [{ values: vector }] } as never);
    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    await finishScheduled(t);
    const sections = await t.run(async (ctx) => ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", articleId)).collect());
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((section) => section.embedding?.length === 768 && section.embeddingModelId)).toBe(true);

    const prompt = await promptFor(t, { userId: memberId, companyId, widget: false, question: "Explain visibility inside automated summaries" });
    expect(prompt).toContain('From "AI features and your website"');
  });

  test("the voice assistant reads it to a signed-in user in their own conversation, never on a phone call", async () => {
    const t = harness();
    const { superAdmin, memberId, companyId } = await people(t);
    vi.mocked(embedVertexContentWithRetry).mockResolvedValue({ embeddings: [{ values: Array.from({ length: 768 }, (_, index) => (index % 5) / 5) }] } as never);
    await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    await finishScheduled(t);
    const threadId = await t.run(async (ctx) => ctx.db.insert("threads", { userId: memberId, companyId, title: "Spoken", createdAt: Date.now(), updatedAt: Date.now() }));

    const spoken = await t.action(internal.aiVoiceSession.searchKnowledgeForVoiceInternal, { threadId, query: "best practices for structured data" });
    expect(spoken.context).toContain("Helpful content");
    expect(spoken.context).toContain('From "AI features and your website"');
    const phone = await t.action(internal.aiVoiceSession.searchKnowledgeForVoiceInternal, { query: "best practices for structured data", fallbackCompanyId: companyId });
    expect(phone.context).not.toContain("AI features and your website");
  });

  test("a section embedded by another model is not compared with the question's, and its words must still match", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    const [section] = await t.run(async (ctx) => ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", articleId)).collect());
    await t.run(async (ctx) => ctx.db.patch(section._id, { embedding: Array.from({ length: 768 }, () => 0.1), embeddingModelId: "an-older-model" }));

    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "Explain visibility", byMeaning: [section._id], embeddingModelId: "the-model-now" })).toEqual([]);
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "Explain visibility", byMeaning: [section._id], embeddingModelId: "an-older-model" })).toHaveLength(1);
  });
});

// Helpful content for readers (docs/plans/active/insights-helpful-content-plan.md, IH1, IH2, IH5–IH7).
describe("Helpful content for readers", () => {
  // A save with a summary schedules its translation; on fake timers it runs only when a test asks, never in the next test.
  beforeEach(() => {
    useFixedDay();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("readers get a published article with a summary — its details and Hakken's words, never the article's", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const shownId = await superAdmin.mutation(api.libraryArticles.createArticle, {
      ...ARTICLE,
      summaryEn: "How Google's AI features choose and link the pages they draw on.",
      meaningEn: "Be crawlable and keep your structured data true.",
    });
    await superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, url: "https://example.com/no-summary-yet", title: "No summary yet" });
    await superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, url: "https://example.com/a-draft", title: "A draft", status: "DRAFT", summaryEn: "Written." });

    const listed = (await member.query(api.libraryArticles.listForReaders, { language: "en", paginationOpts: { numItems: 50, cursor: null } })).page;
    expect(listed).toEqual([expect.objectContaining({
      _id: shownId,
      title: ARTICLE.title,
      publication: ARTICLE.publication,
      publishedOn: "2026-09-18",
      topic: "AI_ANSWERS",
      summary: "How Google's AI features choose and link the pages they draw on.",
      meaning: "Be crawlable and keep your structured data true.",
    })]);
    expect(Object.keys(listed[0])).not.toContain("body");
    expect((await member.query(api.libraryArticles.listForReaders, { language: "en", topic: "TRAFFIC", paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);
    expect(await member.query(api.libraryArticles.getForReader, { articleId: shownId, language: "en" })).toMatchObject({ summary: expect.any(String) });
  });

  test("readers' lists come through their indexes: by topic or publication, the overview's counts, and more on a topic without the one being read", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const shown = (url: string, extra: Record<string, unknown> = {}) =>
      superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, url, summaryEn: "A summary.", ...extra });
    const first = await shown("https://example.com/one");
    const second = await shown("https://example.com/two", { publication: "Ahrefs" });
    await shown("https://example.com/three", { topic: "TRAFFIC" });

    const page = { paginationOpts: { numItems: 50, cursor: null } };
    expect((await member.query(api.libraryArticles.listForReaders, { language: "en", publication: "Ahrefs", ...page })).page.map((row) => row._id)).toEqual([second]);
    expect(await member.query(api.libraryArticles.getReaderOverview, {})).toEqual({
      all: 3,
      publications: [{ name: "Google Search Central", count: 2 }, { name: "Ahrefs", count: 1 }],
    });
    const more = await member.query(api.libraryArticles.listMoreForReaders, { language: "en", topic: "AI_ANSWERS", exclude: first });
    expect(more.map((row) => row._id)).toEqual([second]);
  });

  test("a summary is checked for length, and the writer never overwrites one the admin wrote", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    await expect(superAdmin.mutation(api.libraryArticles.createArticle, { ...ARTICLE, summaryEn: "x".repeat(601) })).rejects.toThrow("at most 600");
    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);

    expect(await t.query(internal.libraryArticles.missingReaderWordsInternal, { limit: 5 })).toEqual([
      expect.objectContaining({ articleId, title: ARTICLE.title, body: BODY }),
    ]);
    expect(await t.mutation(internal.libraryArticles.saveReaderWordsInternal, { articleId, summaryEn: " Written by Hakken. ", meaningEn: "" })).toBe(true);
    expect(await t.mutation(internal.libraryArticles.saveReaderWordsInternal, { articleId, summaryEn: "A second go.", meaningEn: "" })).toBe(false);
    expect((await superAdmin.query(api.libraryArticles.getArticle, { articleId }))?.summaryEn).toBe("Written by Hakken.");
  });

  test("the writer writes from the article's words with the News Collector's model, and its cost lands on that agent", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    // The Collector left on the platform's default model: the writer asks for that, as News summaries do.
    const collectorId = await t.run(async (ctx) => await ctx.db.insert("agents", {
      name: "News Collector", modelId: "model-test", modelSelectionMode: "inherit", thinkingMode: false, isActive: true, systemKey: "NEWS_COLLECTOR", createdAt: 1, updatedAt: 1,
    }));
    generate.mockReset().mockResolvedValue({ text: JSON.stringify({ summary: " How AI features pick pages. ", meaning: "Stay crawlable." }), inputTokens: 900, outputTokens: 60 });

    expect(await superAdmin.action(api.libraryArticleWriter.writeForReaders, { title: ARTICLE.title, publication: ARTICLE.publication, body: BODY }))
      .toEqual({ status: "written", summary: "How AI features pick pages.", meaning: "Stay crawlable." });
    expect(generate.mock.calls[0][0].systemInstruction).toContain("Never copy or quote");
    expect(JSON.parse(generate.mock.calls[0][0].contents[0].text)).toMatchObject({ title: ARTICLE.title, words: BODY });
    const costs = await t.run(async (ctx) => ctx.db.query("agentTransactions").collect());
    expect(costs).toEqual([expect.objectContaining({ agentId: collectorId, inputTokens: 900, outputTokens: 60 })]);

    expect(await superAdmin.action(api.libraryArticleWriter.writeForReaders, { title: "Empty", publication: "Nobody", body: "  " })).toEqual({ status: "failed", why: "no_words" });
    generate.mockResolvedValue({ text: "Sorry, I cannot help with that." });
    expect(await superAdmin.action(api.libraryArticleWriter.writeForReaders, { title: ARTICLE.title, publication: ARTICLE.publication, body: BODY })).toEqual({ status: "failed", why: "model" });
  });
});
