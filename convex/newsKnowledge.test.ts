import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { articleLinkOf } from "./xRead";

/**
 * News into Knowledge (docs/plans/active/content-people-knowledge-plan.md,
 * phase 2, C4): a story ticked In knowledge has its whole article read once
 * and kept in Knowledge, with the story's summary, its person and their
 * count; an X post keeps the article it links to; a video has none to keep
 * and is never paid for; an article already kept is joined, never copied;
 * unticking takes out only the copy the story kept; and a story taken down
 * from News leaves its article in Knowledge.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const WORDS = Array.from({ length: 30 }, () => "Sites that lost traffic in the core update had thin pages written for search engines first.").join(" ");

function firecrawlAnswers(markdown: string) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
    success: true,
    data: { markdown, metadata: { title: "What the October core update changed", ogSiteName: "GSQi", language: "en" } },
  })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function setUp(t: ReturnType<typeof harness>) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" }));
  const admin = t.withIdentity({ subject: userId });
  const followId = await admin.mutation(api.newsFollows.createFollow, { name: "Glenn Gabe", whyEn: "Core updates, explained.", channels: ["https://gsqi.com", "https://x.com/glenngabe"] });
  const story = (kind: "WEBSITE" | "X" | "YOUTUBE", url: string, extra: { linkUrl?: string; publishedAt?: number } = {}) =>
    t.run(async (ctx) => await ctx.db.insert("newsItems", {
      kind, followId, sourceName: "Glenn Gabe", titleEn: `A ${kind} story`, summaryEn: "What changed, by site type.", meaningEn: "Check your thin pages.",
      url, externalKey: url, publishedAt: extra.publishedAt ?? Date.parse("2026-10-07"), createdAt: Date.now(),
      ...(extra.linkUrl ? { linkUrl: extra.linkUrl } : {}),
    }));
  const person = async () => (await t.run(async (ctx) => await ctx.db.get(followId)))?.inKnowledge ?? 0;
  const knowledgeOf = async (itemId: Id<"newsItems">) => {
    const page = await admin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 50, cursor: null } });
    return page.page.find((row) => row._id === itemId)?.knowledge;
  };
  return { admin, followId, story, person, knowledgeOf };
}

describe("a News story ticked into Knowledge", () => {
  // A save schedules its translation and its sections' embedding; on fake timers they run only when a test asks.
  beforeEach(() => {
    useFixedDay();
    vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a website story is read once and kept whole, with the story's summary, its person, and their count", async () => {
    const t = harness();
    const { admin, followId, story, person, knowledgeOf } = await setUp(t);
    const itemId = await story("WEBSITE", "https://gsqi.com/marketing-blog/october-core-update");
    const fetchMock = firecrawlAnswers(`# What the October core update changed\n\n${WORDS}`);

    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId, keep: true });
    expect(await knowledgeOf(itemId)).toEqual({ state: "READING", words: null, problem: null });

    await t.action(internal.newsKnowledge.keepWholeInternal, { itemId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const article = await t.run(async (ctx) => (await ctx.db.query("libraryArticles").collect())[0]);
    expect(article).toMatchObject({
      url: "https://gsqi.com/marketing-blog/october-core-update", title: "What the October core update changed", publication: "GSQi",
      author: "Glenn Gabe", status: "IN_KNOWLEDGE", newsItemId: itemId, followId, summaryEn: "What changed, by site type.", meaningEn: "Check your thin pages.",
    });
    expect(await knowledgeOf(itemId)).toEqual({ state: "IN", words: article.words, problem: null });
    expect(article.words).toBeGreaterThan(120);
    expect(await person()).toBe(1);
    expect(await admin.query(api.news.countNewsInKnowledgeForAdmin, {})).toEqual({ count: 1, more: false });
    // News narrowed to what is in Knowledge, and to what is not.
    const narrowed = async (knowledge: "IN" | "OUT") =>
      (await admin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 50, cursor: null }, knowledge })).page.map((row) => row._id);
    expect(await narrowed("IN")).toEqual([itemId]);
    expect(await narrowed("OUT")).toEqual([]);

    // Unticked: the copy it kept goes, the story stays, and so does the count.
    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId, keep: false });
    expect(await t.run(async (ctx) => await ctx.db.query("libraryArticles").collect())).toEqual([]);
    expect(await knowledgeOf(itemId)).toEqual({ state: null, words: null, problem: null });
    expect(await person()).toBe(0);
  });

  test("an X post keeps the article it links to; a video, or a post linking nowhere, says why and is never paid for", async () => {
    const t = harness();
    const { admin, story, knowledgeOf } = await setUp(t);
    const post = await story("X", "https://x.com/glenngabe/status/1", { linkUrl: "https://gsqi.com/marketing-blog/thin-pages" });
    const bare = await story("X", "https://x.com/glenngabe/status/2");
    const video = await story("YOUTUBE", "https://www.youtube.com/watch?v=abc");
    const fetchMock = firecrawlAnswers(`# Thin pages\n\n${WORDS}`);

    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: post, keep: true });
    await t.action(internal.newsKnowledge.keepWholeInternal, { itemId: post });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ url: "https://gsqi.com/marketing-blog/thin-pages" });
    expect(await knowledgeOf(post)).toMatchObject({ state: "IN" });

    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: bare, keep: true });
    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: video, keep: true });
    expect(await knowledgeOf(bare)).toEqual({ state: "FAILED", words: null, problem: "This post points to no article, so there is nothing to keep." });
    expect(await knowledgeOf(video)).toEqual({ state: "FAILED", words: null, problem: "A video has no article to keep: News keeps its summary." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a page with too few words to be the article is not kept, and says how many it had", async () => {
    const t = harness();
    const { admin, story, knowledgeOf } = await setUp(t);
    const itemId = await story("WEBSITE", "https://gsqi.com/paywalled");
    firecrawlAnswers("Sign in to keep reading.");

    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId, keep: true });
    await t.action(internal.newsKnowledge.keepWholeInternal, { itemId });
    expect(await knowledgeOf(itemId)).toEqual({ state: "FAILED", words: null, problem: "The page had only 5 words: too few to be the article." });
    expect(await t.run(async (ctx) => await ctx.db.query("libraryArticles").collect())).toEqual([]);
  });

  test("an article already in Knowledge is joined, never read again, and unticking leaves it there", async () => {
    const t = harness();
    const { admin, story, person, knowledgeOf } = await setUp(t);
    const url = "https://gsqi.com/marketing-blog/october-core-update";
    const fetchMock = firecrawlAnswers(`# What the October core update changed\n\n${WORDS}`);
    const first = await story("WEBSITE", url);
    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: first, keep: true });
    await t.action(internal.newsKnowledge.keepWholeInternal, { itemId: first });
    // The same article, linked from his X post.
    const post = await story("X", "https://x.com/glenngabe/status/3", { linkUrl: url });

    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: post, keep: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [article] = await t.run(async (ctx) => await ctx.db.query("libraryArticles").collect());
    expect(await knowledgeOf(post)).toEqual({ state: "IN", words: article.words, problem: null });
    expect(await person()).toBe(2);

    // The post never kept it, so unticking the post leaves it for the story that did.
    await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId: post, keep: false });
    expect(await t.run(async (ctx) => await ctx.db.get(article._id))).not.toBeNull();
    expect(await person()).toBe(1);
  });

  test("taken down from News, a story's article stays in Knowledge; deleted in Knowledge, its story is unticked", async () => {
    const t = harness();
    const { admin, story, person, knowledgeOf } = await setUp(t);
    firecrawlAnswers(`# Kept\n\n${WORDS}`);
    const takenDown = await story("WEBSITE", "https://gsqi.com/one");
    const deleted = await story("WEBSITE", "https://gsqi.com/two");
    for (const itemId of [takenDown, deleted]) {
      await admin.mutation(api.newsKnowledge.setNewsItemInKnowledge, { itemId, keep: true });
      await t.action(internal.newsKnowledge.keepWholeInternal, { itemId });
    }
    expect(await person()).toBe(2);

    await admin.mutation(api.news.deleteNewsItem, { itemId: takenDown });
    const kept = await t.run(async (ctx) => await ctx.db.query("libraryArticles").collect());
    expect(kept.map((article) => [article.url, article.newsItemId ?? null])).toEqual([
      ["https://gsqi.com/one", null],
      ["https://gsqi.com/two", deleted],
    ]);
    expect(await person()).toBe(1);

    await admin.mutation(api.libraryArticles.deleteArticle, { articleId: kept[1]._id });
    expect(await knowledgeOf(deleted)).toEqual({ state: null, words: null, problem: null });
    expect(await person()).toBe(0);
  });

  test("News narrowed to Google holds only its updates, newest or oldest first", async () => {
    const t = harness();
    const { admin, story } = await setUp(t);
    const older = await story("WEBSITE", "https://gsqi.com/older", { publishedAt: Date.parse("2026-10-01") });
    const newer = await story("WEBSITE", "https://gsqi.com/newer", { publishedAt: Date.parse("2026-10-08") });
    const list = async (args: Record<string, unknown>) =>
      (await admin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 50, cursor: null }, ...args })).page.map((row) => row._id);

    expect(await list({})).toEqual([newer, older]);
    expect(await list({ direction: "asc" })).toEqual([older, newer]);
    expect(await list({ from: "GOOGLE" })).toEqual([]);
    expect(await list({ from: "GOOGLE", kind: "X" })).toEqual([]);
  });
});

describe("the article an X post points to", () => {
  test("is its first link that leaves X, where the link really goes", () => {
    expect(articleLinkOf({ id: "1", entities: { urls: [
      { expanded_url: "https://x.com/glenngabe/status/0" },
      { expanded_url: "https://t.co/abc", unwound_url: "https://www.gsqi.com/marketing-blog/thin-pages" },
    ] } })).toBe("https://www.gsqi.com/marketing-blog/thin-pages");
    expect(articleLinkOf({ id: "2", text: "No links here." })).toBeUndefined();
    expect(articleLinkOf({ id: "3", entities: { urls: [{ expanded_url: "not an address" }] } })).toBeUndefined();
  });
});
