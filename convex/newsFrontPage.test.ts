import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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

    expect((await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).lead?._id).toBe(newest);

    await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, UPDATE);
    const withUpdate = await member.query(api.news.getFrontPage, { language: "en", today: TODAY });
    expect(withUpdate.lead).toMatchObject({ kind: "GOOGLE_UPDATE", title: UPDATE.titleEn, update: { startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 } });
    // Three weeks on, it has stopped leading.
    expect((await member.query(api.news.getFrontPage, { language: "en", today: "2026-10-22" })).lead?._id).toBe(newest);

    const older = await story(t, "Map results move up", "2026-09-28");
    await superAdmin.mutation(api.news.pinLeadStory, { itemId: older });
    expect((await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).lead?._id).toBe(older);
    // A pin lasts seven days, then the rule chooses again.
    expect((await member.query(api.news.getFrontPage, { language: "en", today: "2026-10-09" })).lead?.kind).toBe("GOOGLE_UPDATE");

    // One pin at a time: pinning another unpins the first.
    await superAdmin.mutation(api.news.pinLeadStory, { itemId: newest });
    const pinned = (await superAdmin.query(api.news.listNewsItemsForAdmin, { paginationOpts: { numItems: 10, cursor: null } })).page.filter((item) => item.leadUntil !== null);
    expect(pinned.map((item) => item._id)).toEqual([newest]);

    await superAdmin.mutation(api.news.unpinLeadStory, { itemId: newest });
    expect((await member.query(api.news.getFrontPage, { language: "en", today: TODAY })).lead?.kind).toBe("GOOGLE_UPDATE");
  });

  test("only the super admin pins the lead", async () => {
    const t = harness();
    const { member } = await people(t);
    const itemId = await story(t, "AI answers take more clicks", "2026-09-29");
    await expect(member.mutation(api.news.pinLeadStory, { itemId })).rejects.toThrow();
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
      articles: { all: 2, TRAFFIC: 1, RANKINGS: 0, AI_ANSWERS: 0, BACKLINKS: 0 },
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

    expect(await member.query(api.knowledgeArticles.listPublishedArticles, { language: "en", topic: "TRAFFIC" })).toEqual([
      expect.objectContaining({ _id: articleId, topic: "TRAFFIC", excerpt: "The traffic figure is our best estimate of the visits a search sends you, worked out from a study." }),
    ]);
    expect(await member.query(api.knowledgeArticles.listPublishedArticles, { language: "en", topic: "RANKINGS" })).toEqual([]);

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
