import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { rebuildKnowledgeList } from "./knowledgeList";

/**
 * Knowledge's one list (docs/plans/active/content-people-knowledge-plan.md,
 * phase 3, board 5): ours and the web's in one list, each article's row kept
 * in step on every save — written, added from a link, ticked in News, edited,
 * deleted, its topic or its person gone — then narrowed, sorted by any heading
 * over the whole list, counted and paged on the server.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

const WORDS = (count: number) => Array.from({ length: count }, () => "word").join(" ");

const WEB = {
  url: "https://nachomascort.com/en/blog/google-quality-core-updates/",
  title: "Google quality and core updates",
  publication: "nachomascort.com",
  author: "Nacho Mascort",
  publishedOn: "",
  updatedOn: "",
  description: "",
  topic: "RANKINGS",
  status: "IN_KNOWLEDGE" as const,
  language: "en",
  body: WORDS(300),
};

async function setUp(t: ReturnType<typeof harness>) {
  await t.mutation(internal.topics.seedFirstTopicsInternal, {});
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" }));
  const admin = t.withIdentity({ subject: userId });
  const list = (args: Record<string, unknown> = {}) =>
    admin.query(api.knowledgeList.listKnowledgeForAdmin, { sort: "added", direction: "desc", page: 1, rows: 15, ...args });
  const rows = async () => await t.run(async (ctx) => await ctx.db.query("knowledgeList").collect());
  return { admin, list, rows };
}

describe("Knowledge's one list", () => {
  // A save schedules its translation and its sections' embedding; on fake timers they run only when a test asks.
  beforeEach(() => {
    useFixedDay();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("each article keeps its row in step: written, edited, added from a link, ticked in News, deleted", async () => {
    const t = harness();
    const { admin, rows } = await setUp(t);
    const oursId = await admin.mutation(api.knowledgeArticles.createArticle, { titleEn: "How is traffic worked out?", bodyEn: WORDS(40), status: "DRAFT", topic: "TRAFFIC" });
    expect(await rows()).toEqual([expect.objectContaining({ kind: "OURS", knowledgeArticleId: oursId, came: "WRITTEN", fromName: "", topic: "TRAFFIC", words: 40, status: "DRAFT" })]);

    await admin.mutation(api.knowledgeArticles.updateArticle, { articleId: oursId, titleEn: "How traffic is worked out", bodyEn: WORDS(55), status: "PUBLISHED" });
    expect(await rows()).toEqual([expect.objectContaining({ title: "How traffic is worked out", words: 55, status: "PUBLISHED" })]);
    expect((await rows())[0].topic).toBeUndefined();

    const webId = await admin.mutation(api.libraryArticles.createArticle, WEB);
    const followId = await admin.mutation(api.newsFollows.createFollow, { name: "Glenn Gabe", whyEn: "Core updates.", channels: ["https://gsqi.com"] });
    const tickedId = await t.run(async (ctx) => {
      const { storeArticle, checkedLibraryArticle } = await import("./libraryArticles");
      const { article, body } = checkedLibraryArticle({ ...WEB, url: "https://gsqi.com/october", title: "What the October core update changed", author: "", publication: "GSQi", status: "IN_KNOWLEDGE" });
      return await storeArticle(ctx, article, body, { followId });
    });
    const web = (await rows()).filter((row) => row.kind === "WEB");
    expect(web).toEqual(expect.arrayContaining([
      expect.objectContaining({ libraryArticleId: webId, came: "LINK", fromName: "Nacho Mascort", topic: "RANKINGS", words: 300, status: "PUBLISHED" }),
      expect.objectContaining({ libraryArticleId: tickedId, came: "NEWS", fromName: "Glenn Gabe", followId }),
    ]));

    // An edit keeps the person it was ticked from (an edit once dropped it).
    await admin.mutation(api.libraryArticles.updateArticle, { articleId: tickedId, ...WEB, url: "https://gsqi.com/october", title: "October, by site type", author: "", publication: "GSQi", status: "DRAFT" });
    expect(await t.run(async (ctx) => await ctx.db.get(tickedId))).toMatchObject({ followId });
    expect((await rows()).find((row) => row.libraryArticleId === tickedId)).toMatchObject({ title: "October, by site type", came: "NEWS", status: "DRAFT" });

    // Renamed, the person is named again; deleted, the article says its publication and no longer narrows to them.
    await admin.mutation(api.newsFollows.updateFollow, { followId, name: "Glenn Gabe (GSQi)", whyEn: "Core updates." });
    expect((await rows()).find((row) => row.libraryArticleId === tickedId)).toMatchObject({ fromName: "Glenn Gabe (GSQi)" });
    await admin.mutation(api.newsFollows.deleteFollow, { followId });
    const orphan = (await rows()).find((row) => row.libraryArticleId === tickedId);
    expect(orphan).toMatchObject({ fromName: "GSQi", came: "NEWS" });
    expect(orphan?.followId).toBeUndefined();

    // A topic deleted is taken off the rows that had it.
    const rankings = await t.run(async (ctx) => await ctx.db.query("topics").withIndex("by_key", (q) => q.eq("key", "RANKINGS")).first());
    await admin.mutation(api.topics.deleteTopic, { topicId: rankings!._id });
    expect((await rows()).find((row) => row.libraryArticleId === webId)?.topic).toBeUndefined();

    await admin.mutation(api.knowledgeArticles.deleteArticle, { articleId: oursId });
    await admin.mutation(api.libraryArticles.deleteArticle, { articleId: webId });
    expect((await rows()).map((row) => row.libraryArticleId)).toEqual([tickedId]);
  });

  test("the list narrows to ours, the web's or one person, sorts by any heading over the whole list, and counts what it holds", async () => {
    const t = harness();
    const { admin, list } = await setUp(t);
    await admin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Backlinks that still count", bodyEn: WORDS(980), status: "DRAFT", topic: "BACKLINKS" });
    vi.advanceTimersByTime(60_000);
    await admin.mutation(api.libraryArticles.createArticle, WEB);
    vi.advanceTimersByTime(60_000);
    const followId = await admin.mutation(api.newsFollows.createFollow, { name: "Lily Ray", whyEn: "AI answers.", channels: ["https://x.com/lilyraynyc"] });
    await t.run(async (ctx) => {
      const { storeArticle, checkedLibraryArticle } = await import("./libraryArticles");
      const { article, body } = checkedLibraryArticle({ ...WEB, url: "https://lilyray.nyc/experience", title: "What experience looks like", author: "", publication: "lilyray.nyc", body: WORDS(1240) });
      await storeArticle(ctx, article, body, { followId });
    });

    const titles = async (args: Record<string, unknown>) => (await list(args)).page.rows.map((row) => row.title);
    // Newest added first.
    expect(await titles({})).toEqual(["What experience looks like", "Google quality and core updates", "Backlinks that still count"]);
    expect(await list({})).toMatchObject({ counts: { published: 2, ours: 1, web: 2 }, people: [{ followId, name: "Lily Ray" }] });
    expect(await titles({ from: "OURS" })).toEqual(["Backlinks that still count"]);
    expect(await titles({ from: "WEB" })).toEqual(["What experience looks like", "Google quality and core updates"]);
    expect(await titles({ from: followId })).toEqual(["What experience looks like"]);
    expect(await titles({ status: "DRAFT" })).toEqual(["Backlinks that still count"]);
    expect(await titles({ topic: "RANKINGS" })).toEqual(["What experience looks like", "Google quality and core updates"]);
    expect(await titles({ search: "nacho" })).toEqual(["Google quality and core updates"]);
    // The most words first; A to Z by who it is from, ours as "Ours".
    expect(await titles({ sort: "words", direction: "desc" })).toEqual(["What experience looks like", "Backlinks that still count", "Google quality and core updates"]);
    expect(await titles({ sort: "from", direction: "asc" })).toEqual(["What experience looks like", "Google quality and core updates", "Backlinks that still count"]);
    expect((await list({ rows: 2, page: 2 })).page).toMatchObject({ total: 3, pages: 2, page: 2, rows: [expect.objectContaining({ title: "Backlinks that still count", kind: "OURS", came: "WRITTEN" })] });

    const csv = await admin.query(api.knowledgeList.listKnowledgeForCsv, { from: "WEB", sort: "title", direction: "asc" });
    expect(csv.map((row) => [row.title, row.came, row.fromName])).toEqual([
      ["Google quality and core updates", "LINK", "Nacho Mascort"],
      ["What experience looks like", "NEWS", "Lily Ray"],
    ]);
  });

  test("the first fill writes a row for every article already there, and run again changes nothing", async () => {
    const t = harness();
    const { admin, rows } = await setUp(t);
    await admin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Ours", bodyEn: WORDS(10), status: "PUBLISHED" });
    await admin.mutation(api.libraryArticles.createArticle, WEB);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("knowledgeList").collect()) await ctx.db.delete(row._id);
    });

    expect(await t.run(async (ctx) => await rebuildKnowledgeList(ctx))).toEqual({ ours: 1, web: 1 });
    await t.run(async (ctx) => await rebuildKnowledgeList(ctx));
    expect((await rows()).map((row) => row.kind).sort()).toEqual(["OURS", "WEB"]);
  });
});
