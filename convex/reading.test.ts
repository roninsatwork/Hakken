import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Reading in Insights, counted (docs/plans/active/content-people-knowledge-
 * plan.md, phase 4; Q1–Q4 answered 2026-10-10): each view, read and click a
 * client makes lands as one event and moves the day's totals — overall, the
 * item, its person, the company, the user, the item at the company and the
 * user's topic — with running totals carried day to day, and who read first
 * that day counted once. A story kept in Knowledge counts as its article;
 * Ask Hakken's answers count the articles they drew on; super admins never
 * count.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function setUp(t: ReturnType<typeof harness>) {
  const ids = await t.run(async (ctx) => {
    const korda = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const hartley = await ctx.db.insert("companies", { name: "Hartley Dental", createdAt: Date.now() });
    const james = await ctx.db.insert("users", { email: "james@korda.example", role: "USER", companyId: korda });
    const priya = await ctx.db.insert("users", { email: "priya@korda.example", role: "USER", companyId: korda });
    const sarah = await ctx.db.insert("users", { email: "sarah@hartley.example", role: "USER", companyId: hartley });
    const admin = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN", companyId: korda });
    const followId = await ctx.db.insert("newsFollows", {
      kind: "WEBSITE", name: "Glenn Gabe", nameKey: "glenn gabe", url: "https://gsqi.com", whyEn: "Core updates.", topic: "RANKINGS", order: 1, createdAt: 1, updatedAt: 1,
    });
    const now = Date.now();
    const articleId = await ctx.db.insert("libraryArticles", {
      url: "https://gsqi.com/october", title: "What the October core update changed", publication: "GSQi", topic: "RANKINGS", status: "IN_KNOWLEDGE",
      words: 3412, followId, createdAt: now, updatedAt: now,
    });
    const story = (title: string, extra: Record<string, unknown> = {}) => ctx.db.insert("newsItems", {
      kind: "WEBSITE", followId, sourceName: "Glenn Gabe", titleEn: title, summaryEn: "", meaningEn: "", url: `https://gsqi.com/${title.length}`,
      externalKey: title, publishedAt: now, createdAt: now, ...extra,
    });
    const keptStory = await story("Kept", { knowledgeArticleId: articleId });
    const newsStory = await story("Thin pages after an update");
    const oursId = await ctx.db.insert("knowledgeArticles", { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED", topic: "TRAFFIC", updatedAt: now });
    return { korda, hartley, james, priya, sarah, admin, followId, articleId, keptStory, newsStory, oursId };
  });
  const as = (userId: Id<"users">) => t.withIdentity({ subject: userId });
  const totals = (scope: string, key: string) =>
    t.run(async (ctx) => (await ctx.db.query("readingTotals").collect()).filter((row) => row.scope === scope && row.key === key)
      .map(({ day, views, reads, clicks, answers, sumViews, sumReads, sumClicks, sumAnswers, readers, companies }) => ({ day, views, reads, clicks, answers, sumViews, sumReads, sumClicks, sumAnswers, readers, companies })));
  return { ...ids, as, totals };
}

describe("reading in Insights, counted", () => {
  beforeEach(() => {
    useFixedDay("2026-10-09");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a view, a read and a click move every total they touch, and the item names itself for Analytics", async () => {
    const t = harness();
    const s = await setUp(t);
    const web = { type: "WEB" as const, id: s.articleId };
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: web });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "READ", thing: web });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "CLICK", thing: web });

    const itemKey = `WEB:${s.articleId}`;
    const day = { day: "2026-10-09", views: 1, reads: 1, clicks: 1, answers: 0, sumViews: 1, sumReads: 1, sumClicks: 1, sumAnswers: 0 };
    expect(await s.totals("ALL", "")).toEqual([{ ...day, readers: 1, companies: 1 }]);
    for (const [scope, key] of [["ITEM", itemKey], ["PERSON", s.followId], ["COMPANY", s.korda], ["USER", s.james], ["ITEM_COMPANY", `${itemKey}|${s.korda}`], ["USER_TOPIC", `${s.james}|RANKINGS`]]) {
      expect(await s.totals(scope, key)).toEqual([{ ...day, readers: undefined, companies: undefined }]);
    }
    const active = await t.run(async (ctx) => await ctx.db.query("readingActive").collect());
    expect(active.find((row) => row.scope === "ITEM")).toMatchObject({ key: itemKey, title: "What the October core update changed", fromName: "Glenn Gabe", topic: "RANKINGS", where: "KNOWLEDGE", followId: s.followId });
    expect(active.map((row) => row.scope).sort()).toEqual(["COMPANY", "ITEM", "ITEM_USER", "PERSON", "USER"]);
    expect(await t.run(async (ctx) => (await ctx.db.query("readingEvents").collect()).map((event) => [event.kind, event.itemKey, event.day]))).toEqual([
      ["VIEW", itemKey, "2026-10-09"], ["READ", itemKey, "2026-10-09"], ["CLICK", itemKey, "2026-10-09"],
    ]);
  });

  test("readers and companies count once a day each; running totals carry from day to day", async () => {
    const t = harness();
    const s = await setUp(t);
    const ours = { type: "OURS" as const, id: s.oursId };
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: ours });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: ours });
    await s.as(s.priya).mutation(api.reading.recordReading, { kind: "VIEW", thing: ours });
    await s.as(s.sarah).mutation(api.reading.recordReading, { kind: "VIEW", thing: ours });
    vi.setSystemTime(Date.parse("2026-10-10T09:00:00Z"));
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: ours });

    expect((await s.totals("ALL", "")).map((row) => [row.day, row.views, row.sumViews, row.readers, row.companies])).toEqual([
      ["2026-10-09", 4, 4, 3, 2],
      ["2026-10-10", 1, 5, 1, 1],
    ]);
    expect((await s.totals("ITEM", `OURS:${s.oursId}`)).map((row) => [row.day, row.views, row.sumViews])).toEqual([["2026-10-09", 4, 4], ["2026-10-10", 1, 5]]);
  });

  test("a story kept in Knowledge counts as its article; a story not kept counts as itself, under its person", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: { type: "STORY", id: s.keptStory } });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: { type: "STORY", id: s.newsStory } });

    expect(await s.totals("ITEM", `WEB:${s.articleId}`)).toHaveLength(1);
    const story = await t.run(async (ctx) => (await ctx.db.query("readingActive").collect()).find((row) => row.key === `STORY:${s.newsStory}`));
    expect(story).toMatchObject({ title: "Thin pages after an update", fromName: "Glenn Gabe", where: "NEWS", topic: "RANKINGS" });
    expect((await s.totals("PERSON", s.followId))[0]).toMatchObject({ views: 2 });
  });

  test("a click through to a person's channel counts to them; a view of a person, a super admin, or something gone counts nothing", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "CLICK", thing: { type: "PERSON", id: s.followId } });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: { type: "PERSON", id: s.followId } });
    await s.as(s.admin).mutation(api.reading.recordReading, { kind: "VIEW", thing: { type: "WEB", id: s.articleId } });
    await s.as(s.james).mutation(api.reading.recordReading, { kind: "VIEW", thing: { type: "WEB", id: "not-an-article" } });

    expect((await s.totals("PERSON", s.followId)).map((row) => [row.views, row.clicks])).toEqual([[0, 1]]);
    expect((await s.totals("ALL", "")).map((row) => [row.views, row.clicks])).toEqual([[0, 1]]);
    expect(await t.run(async (ctx) => (await ctx.db.query("readingEvents").collect()).length)).toBe(1);
  });

  test("an answer counts the web articles it drew on and ours through their wiki pages, once each, and makes nobody a reader", async () => {
    const t = harness();
    const s = await setUp(t);
    await t.mutation(internal.reading.recordAnswerInternal, {
      userId: s.james, companyId: s.korda, libraryArticleIds: [s.articleId, s.articleId], wikiPageKeys: [`global:PRODUCT:knowledge-${s.oursId}`, "global:PRODUCT:pricing"],
    });
    await t.mutation(internal.reading.recordAnswerInternal, { userId: s.admin, companyId: s.korda, libraryArticleIds: [s.articleId], wikiPageKeys: [] });

    expect((await s.totals("ITEM", `WEB:${s.articleId}`)).map((row) => row.answers)).toEqual([1]);
    expect((await s.totals("ITEM", `OURS:${s.oursId}`)).map((row) => row.answers)).toEqual([1]);
    expect((await s.totals("PERSON", s.followId)).map((row) => row.answers)).toEqual([1]);
    expect(await s.totals("ALL", "")).toEqual([expect.objectContaining({ answers: 2, readers: 0, companies: 0 })]);
    expect(await s.totals("USER", s.james)).toEqual([]);
  });
});
