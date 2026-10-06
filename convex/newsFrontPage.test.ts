import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { NewsItemKind } from "./newsSchema";
import schema from "./schema";
import { updateLeadsOn } from "./news";
import { excerptOf } from "./knowledgeArticles";
import { giveTrafficArticleItsTopic } from "./knowledgeArticleSeeds";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * Learn and the News front page (docs/plans/active/knowledge-news-and-digest-
 * plan.md, revised again 2026-10-01, R4–R10): which story leads, a Google
 * update's rollout and meaning, a story on its own page, the side menu's
 * numbers, and Knowledge's topics.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function people(t: ReturnType<typeof harness>) {
  // The shared topic list's first rows (topics.ts, IH20): an article's topic must be one of them.
  await t.mutation(internal.topics.seedFirstTopicsInternal, {});
  const { superAdminId, memberId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const memberId = await ctx.db.insert("users", { email: "member@korda.example", role: "USER", companyId });
    return { superAdminId, memberId };
  });
  return { superAdmin: t.withIdentity({ subject: superAdminId }), member: t.withIdentity({ subject: memberId }) };
}

/** A collected story, published on `day` at noon. */
async function story(t: ReturnType<typeof harness>, title: string, day: string, kind: NewsItemKind = "WEBSITE") {
  return await t.run(async (ctx) => ctx.db.insert("newsItems", {
    kind,
    sourceName: "Search Engine Land",
    titleEn: title,
    summaryEn: `${title}, in short.`,
    meaningEn: "",
    url: `https://searchengineland.com/${encodeURIComponent(title)}`,
    publishedAt: Date.parse(`${day}T12:00:00Z`),
    externalKey: `test:${title}`,
    createdAt: Date.now(),
  }));
}

const UPDATE = {
  titleEn: "September 2026 spam update",
  descriptionEn: "Google is rolling out a spam update in every country and language.",
  startedOn: "2026-09-24",
  finishedOn: "",
  url: "https://status.search.google.com/incidents/2",
};

const TODAY = "2026-10-01";

describe("the News front page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
    generate.mockReset().mockResolvedValue({ text: "{}" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a Google update leads while it rolls out, and for a week after it finishes", () => {
    const rolling = { startedOn: "2026-09-24" };
    expect(updateLeadsOn(rolling, "2026-09-23")).toBe(false);
    expect(updateLeadsOn(rolling, "2026-10-01")).toBe(true);
    // Never finished in Admin: no longer than its 14 days and a week more.
    expect(updateLeadsOn(rolling, "2026-10-15")).toBe(true);
    expect(updateLeadsOn(rolling, "2026-10-16")).toBe(false);
    expect(updateLeadsOn({ ...rolling, expectedDays: 30 }, "2026-10-16")).toBe(true);

    const finished = { startedOn: "2026-09-24", finishedOn: "2026-10-07" };
    expect(updateLeadsOn(finished, "2026-10-14")).toBe(true);
    expect(updateLeadsOn(finished, "2026-10-15")).toBe(false);
  });

  test("the lead is a pinned story, else a Google update that still leads, else the newest", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    await story(t, "AI answers take more clicks", "2026-09-29");
    const newest = await story(t, "Search Console shows AI clicks", "2026-09-30");

    const leadOn = async (today: string) => (await member.query(api.news.getFrontPage, { language: "en", today })).lead;
    expect(await leadOn(TODAY)).toMatchObject({ source: "NEWS", item: { _id: newest } });

    await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, UPDATE);
    expect(await leadOn(TODAY)).toMatchObject({ source: "NEWS", item: { kind: "GOOGLE_UPDATE", title: UPDATE.titleEn, update: { startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 } } });
    // Three weeks on, it has stopped leading.
    expect(await leadOn("2026-10-22")).toMatchObject({ item: { _id: newest } });

    const older = await story(t, "Map results move up", "2026-09-28");
    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: older });
    expect(await leadOn(TODAY)).toMatchObject({ item: { _id: older } });
    // A pin lasts seven days, then the rule chooses again.
    expect(await leadOn("2026-10-09")).toMatchObject({ item: { kind: "GOOGLE_UPDATE" } });

    // One pin at a time: pinning another unpins the first.
    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: newest });
    const pinned = (await superAdmin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 10, cursor: null } })).page.filter((item) => item.leadUntil !== null);
    expect(pinned.map((item) => item._id)).toEqual([newest]);

    await superAdmin.mutation(api.leadStory.unpinLeadStory, { storyId: newest });
    expect(await leadOn(TODAY)).toMatchObject({ item: { kind: "GOOGLE_UPDATE" } });
  });

  test("only the super admin pins the lead", async () => {
    const t = harness();
    const { member } = await people(t);
    const itemId = await story(t, "AI answers take more clicks", "2026-09-29");
    await expect(member.mutation(api.leadStory.pinLeadStory, { storyId: itemId })).rejects.toThrow();
  });

  // One lead story, pinned from News, Knowledge or Helpful content (insights-helpful-content-plan.md, IH11).
  test("a Knowledge or Helpful content article pinned to lead leads the front page and its own page, and unpins any other", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const newsStory = await story(t, "Search Console shows AI clicks", "2026-09-30");
    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: newsStory });
    const knowledgeId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED", topic: "TRAFFIC" });
    const helpfulId = await superAdmin.mutation(api.libraryArticles.createArticle, {
      url: "https://nachomascort.com/en/blog/quality", title: "Quality at Google", publication: "Nacho Mascort", author: "", publishedOn: "", updatedOn: "",
      description: "", topic: "RANKINGS", status: "IN_KNOWLEDGE", language: "en", body: "## Quality\n\nWords.", summaryEn: "How Google judges quality.",
    });
    const leadOn = async () => (await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).lead;

    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: knowledgeId });
    expect(await leadOn()).toMatchObject({ source: "KNOWLEDGE", article: { _id: knowledgeId, title: "How is traffic worked out?" } });
    expect(await member.query(api.knowledgeArticles.getPinnedForReaders, { language: "en", today: TODAY })).toMatchObject({ _id: knowledgeId });
    // The News story's pin went when the article was pinned.
    expect((await superAdmin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 10, cursor: null } })).page[0].leadUntil).toBeNull();
    expect(await superAdmin.query(api.news.getLeadForAdmin, { today: TODAY })).toMatchObject({ storyId: knowledgeId, place: "KNOWLEDGE", pinned: true });

    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: helpfulId });
    expect(await leadOn()).toMatchObject({ source: "HELPFUL", article: { _id: helpfulId, summary: "How Google judges quality." } });
    expect(await member.query(api.libraryArticles.getPinnedForReaders, { language: "en", today: TODAY })).toMatchObject({ _id: helpfulId });
    expect(await member.query(api.knowledgeArticles.getPinnedForReaders, { language: "en", today: TODAY })).toBeNull();

    // Unpinned, the rule chooses again, and Admin is told so.
    await superAdmin.mutation(api.leadStory.unpinLeadStory, { storyId: helpfulId });
    expect(await leadOn()).toMatchObject({ source: "NEWS", item: { _id: newsStory } });
    expect(await superAdmin.query(api.news.getLeadForAdmin, { today: TODAY })).toMatchObject({ storyId: newsStory, place: "NEWS", pinned: false, leadUntil: null });
  });

  test("a draft never leads: it cannot be pinned, and going back to a draft takes the pin off", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const draft = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Not yet", bodyEn: "", status: "DRAFT" });
    await expect(superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: draft })).rejects.toThrow("Publish it first");

    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED" });
    await superAdmin.mutation(api.leadStory.pinLeadStory, { storyId: articleId });
    expect((await superAdmin.query(api.knowledgeArticles.getArticle, { articleId }))?.leadUntil).not.toBeNull();
    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "DRAFT" });
    expect((await superAdmin.query(api.knowledgeArticles.getArticle, { articleId }))?.leadUntil).toBeNull();
  });

  test("the week counts today and the six days before it", async () => {
    const t = harness();
    const { member } = await people(t);
    await story(t, "Too old", "2026-09-24");
    await story(t, "First day of the week", "2026-09-25");
    await story(t, "Today", TODAY, "YOUTUBE");

    expect((await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).weekCount).toBe(2);
    await expect(member.query(api.news.getFrontPage, { language: "en", today: "1 October" })).rejects.toThrow("must be a date");
  });

  test("an empty News has no lead", async () => {
    const t = harness();
    const { member } = await people(t);
    expect(await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).toEqual({ lead: null, weekCount: 0 });
  });

  test("a story opens on its own page, with its rollout and meaning, until it is taken down", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const updateId = await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, {
      ...UPDATE,
      expectedDays: 10,
      meaningEn: "Wait for it to finish before changing pages.",
    });
    const [item] = (await member.query(api.news.listNewsItems, { paginationOpts: { numItems: 5, cursor: null }, language: "en" })).page;

    expect(await member.query(api.news.getNewsItem, { itemId: item._id, language: "en" })).toMatchObject({
      title: UPDATE.titleEn,
      meaning: "Wait for it to finish before changing pages.",
      update: { startedOn: "2026-09-24", finishedOn: null, expectedDays: 10 },
    });

    await superAdmin.mutation(api.googleUpdates.deleteGoogleUpdate, { updateId });
    expect(await member.query(api.news.getNewsItem, { itemId: item._id, language: "en" })).toBeNull();
  });
});

describe("Google updates for Learn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generate.mockReset().mockResolvedValue({ text: "{}" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("how long it may take is 14 days unless set, and a whole number of days up to 60", async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const updateId = await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, UPDATE);
    expect(await superAdmin.query(api.googleUpdates.getGoogleUpdate, { updateId })).toMatchObject({ expectedDays: 14, meaningEn: "" });

    for (const expectedDays of [0, 61, 1.5]) {
      await expect(superAdmin.mutation(api.googleUpdates.createGoogleUpdate, { ...UPDATE, expectedDays })).rejects.toThrow("whole number of days");
    }
  });

  test("the last three to start, newest first, each with the story that opens it", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    for (const [month, title] of [["03", "March"], ["06", "June"], ["08", "August"], ["09", "September"]]) {
      await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, { ...UPDATE, titleEn: `${title} 2026 core update`, startedOn: `2026-${month}-10` });
    }

    const latest = await member.query(api.googleUpdates.listLatestGoogleUpdates, { language: "en" });
    expect(latest.map((update) => update.title)).toEqual(["September 2026 core update", "August 2026 core update", "June 2026 core update"]);
    expect(latest.every((update) => update.itemId !== null)).toBe(true);
  });
});

describe("Learn's side menu and Knowledge's topics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generate.mockReset().mockResolvedValue({ text: "{}" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("counts this week's stories by kind, the people to follow, and the articles on each topic", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    await story(t, "Old news", "2026-09-01");
    await story(t, "A website story", "2026-09-30");
    await story(t, "A video", "2026-09-30", "YOUTUBE");
    await story(t, "Another video", TODAY, "YOUTUBE");
    await superAdmin.mutation(api.newsFollows.createFollow, { kind: "YOUTUBE", name: "Edward Sturm", url: "https://youtube.com/@edwardsturm", whyEn: "Short, useful videos." });
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED", topic: "TRAFFIC" });
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "Why rankings move", bodyEn: "Many reasons.", status: "PUBLISHED" });
    await superAdmin.mutation(api.knowledgeArticles.createArticle, { titleEn: "A draft", bodyEn: "", status: "DRAFT", topic: "BACKLINKS" });

    expect(await member.query(api.learnMenu.getLearnMenuCounts, { today: TODAY })).toEqual({
      news: { all: 3, GOOGLE_UPDATE: 0, WEBSITE: 1, YOUTUBE: 2, X: 0 },
      follows: 1,
      topics: [
        { key: "TRAFFIC", name: "Traffic" },
        { key: "RANKINGS", name: "Rankings" },
        { key: "AI_ANSWERS", name: "AI answers" },
        { key: "BACKLINKS", name: "Backlinks" },
      ],
      articles: { all: 2, byTopic: { TRAFFIC: 1 } },
      helpful: { all: 0, byTopic: {} },
    });
  });

  test("an article's topic lists it under that topic, and can be taken away", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const articleId = await superAdmin.mutation(api.knowledgeArticles.createArticle, {
      titleEn: "How is traffic worked out?",
      bodyEn: "## Where you rank\n\nThe traffic figure is our **best estimate** of the visits a search sends you, worked out from [a study](https://example.com).",
      status: "PUBLISHED",
      topic: "TRAFFIC",
    });

    expect((await member.query(api.knowledgeArticles.listPublishedPage, { language: "en", topic: "TRAFFIC", paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([
      expect.objectContaining({ _id: articleId, topic: "TRAFFIC", excerpt: "The traffic figure is our best estimate of the visits a search sends you, worked out from a study." }),
    ]);
    expect((await member.query(api.knowledgeArticles.listPublishedPage, { language: "en", topic: "RANKINGS", paginationOpts: { numItems: 50, cursor: null } })).page).toEqual([]);

    await superAdmin.mutation(api.knowledgeArticles.updateArticle, { articleId, titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED" });
    expect((await member.query(api.knowledgeArticles.getPublishedArticle, { articleId, language: "en" }))?.topic).toBeNull();
  });

  test("an excerpt is the opening paragraph in plain words, cut at a word", () => {
    expect(excerptOf("# Title\n\n| a | b |\n|---|---|\n\nFirst **real** paragraph.\n\nSecond.")).toBe("First real paragraph.");
    const long = excerptOf(`${"word ".repeat(80)}end.`);
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(221);
    expect(excerptOf("")).toBe("");
  });

  test("the traffic article is given Traffic once, and keeps a topic chosen in Admin", async () => {
    const t = harness();
    const articleId = await t.run(async (ctx) => ctx.db.insert("knowledgeArticles", { key: "traffic", titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED", updatedAt: 1 }));

    await t.run(async (ctx) => giveTrafficArticleItsTopic(ctx));
    expect((await t.run(async (ctx) => ctx.db.get(articleId)))?.topic).toBe("TRAFFIC");

    await t.run(async (ctx) => ctx.db.patch(articleId, { topic: "RANKINGS" }));
    expect((await t.run(async (ctx) => giveTrafficArticleItsTopic(ctx))).updated).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.get(articleId)))?.topic).toBe("RANKINGS");
  });
});
