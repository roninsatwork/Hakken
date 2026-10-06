import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
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
  test("only the super admin reads or changes the Library", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    await expect(member.mutation(api.libraryArticles.createArticle, ARTICLE)).rejects.toThrow();
    await expect(member.query(api.libraryArticles.listArticles, {})).rejects.toThrow();
    await expect(member.action(api.libraryArticleActions.readPage, { url: ARTICLE.url })).rejects.toThrow();
    await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    expect(await superAdmin.query(api.libraryArticles.listArticles, {})).toHaveLength(1);
  });

  test("an article keeps its details, its words apart from the list, and one address per article", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    const articleId = await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);
    const [listed] = await superAdmin.query(api.libraryArticles.listArticles, {});
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
      .rejects.toThrow("That article is already in the Library: “AI features and your website”.");
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
      .toEqual([expect.stringContaining('From "AI features and your website" (Google Search Central, published 2026-09-18) — https://developers.google.com/search/docs/appearance/ai-features\nBest practices that still matter')]);
    // A one-person blog's author and publication are named once.
    await superAdmin.mutation(api.libraryArticles.updateArticle, { articleId, ...ARTICLE, author: "Google Search Central" });
    expect(await t.query(internal.libraryArticles.searchLibraryInternal, { question: "best practices structured data" }))
      .toEqual([expect.stringContaining('From "AI features and your website" (Google Search Central, published 2026-09-18) —')]);
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

  test("an address already in the Library is named before Firecrawl is paid for it", async () => {
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
  /** The words Ask Hakken's answer was asked with, for one question in a new thread. */
  async function promptFor(t: ReturnType<typeof harness>, thread: { userId: Id<"users">; companyId: Id<"companies">; widget: boolean }) {
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
    generate.mockReset().mockResolvedValue({ text: "An answer.", inputTokens: 1, outputTokens: 1 });
    await t.action(internal.aiChat.generateHakkenResponse, { threadId, content: "What are the best practices for structured data in AI features?" });
    const prompts = generate.mock.calls.map(([request]) =>
      (request.contents as { type: string; text?: string }[]).filter((part) => part.type === "text").map((part) => part.text).join("\n"));
    return prompts.find((text) => text.includes("User Prompt:")) ?? "";
  }

  test("a signed-in user's question gets the article, marked as someone else's words; a widget visitor's never does", async () => {
    const t = harness();
    const { superAdmin, memberId, companyId } = await people(t);
    await superAdmin.mutation(api.libraryArticles.createArticle, ARTICLE);

    const signedIn = await promptFor(t, { userId: memberId, companyId, widget: false });
    expect(signedIn).toContain("[UNTRUSTED REFERENCE DATA: the Library");
    expect(signedIn).toContain('From "AI features and your website" (Google Search Central, published 2026-09-18)');

    const visitor = await promptFor(t, { userId: memberId, companyId, widget: true });
    expect(visitor).toContain("User Prompt:");
    expect(visitor).not.toContain("AI features and your website");
  });
});
