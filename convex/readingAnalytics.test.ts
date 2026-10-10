import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * Admin → Content → Analytics (docs/plans/active/content-people-knowledge-
 * plan.md, phase 5, boards 7–12): every figure read from the daily totals as
 * clients read — a period's total from running totals, the period before for
 * the change, who read from who was last active — narrowed, sorted and paged
 * on the server, for super admins only.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function setUp(t: ReturnType<typeof harness>) {
  await t.mutation(internal.topics.seedFirstTopicsInternal, {});
  const ids = await t.run(async (ctx) => {
    const korda = await ctx.db.insert("companies", { name: "Korda", createdAt: 1 });
    const hartley = await ctx.db.insert("companies", { name: "Hartley Dental", createdAt: 1 });
    const james = await ctx.db.insert("users", { email: "james@korda.example", name: "James Okafor", role: "USER", companyId: korda });
    const priya = await ctx.db.insert("users", { email: "priya@korda.example", name: "Priya Shah", role: "USER", companyId: korda });
    await ctx.db.insert("users", { email: "zoe@korda.example", name: "Zoe Hall", role: "USER", companyId: korda });
    const sarah = await ctx.db.insert("users", { email: "sarah@hartley.example", name: "Sarah Patel", role: "USER", companyId: hartley });
    const admin = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const glenn = await ctx.db.insert("newsFollows", {
      kind: "WEBSITE", name: "Glenn Gabe", nameKey: "glenn gabe", url: "https://gsqi.com", whyEn: "Core updates.", topic: "RANKINGS", order: 1, collected: 8, createdAt: 1, updatedAt: 1, pickedAt: 1,
    });
    await ctx.db.insert("newsFollows", { kind: "X", name: "Lily Ray", nameKey: "lily ray", url: "https://x.com/lilyraynyc", whyEn: "AI answers.", topic: "AI_ANSWERS", order: 2, collected: 47, createdAt: 1, updatedAt: 1 });
    const web = await ctx.db.insert("libraryArticles", {
      url: "https://gsqi.com/october", title: "What the October core update changed", publication: "GSQi", topic: "RANKINGS", status: "IN_KNOWLEDGE", words: 3412, followId: glenn, createdAt: 1, updatedAt: 1,
    });
    const update = await ctx.db.insert("newsItems", {
      kind: "GOOGLE_UPDATE", sourceName: "Google", titleEn: "October 2026 core update", summaryEn: "", meaningEn: "", url: "https://status.search.google.com", externalKey: "update", publishedAt: 1, createdAt: 1,
    });
    const ours = await ctx.db.insert("knowledgeArticles", { titleEn: "How is traffic worked out?", bodyEn: "An estimate.", status: "PUBLISHED", topic: "TRAFFIC", publishedAt: 1, updatedAt: 1 });
    return { korda, hartley, james, priya, sarah, admin, glenn, web, update, ours };
  });
  const as = (userId: Id<"users">) => t.withIdentity({ subject: userId });
  const read = (userId: Id<"users">, kind: "VIEW" | "READ" | "CLICK", type: "OURS" | "WEB" | "STORY", id: string) =>
    as(userId).mutation(api.reading.recordReading, { kind, thing: { type, id } });
  return { ...ids, as, read, admin: as(ids.admin) };
}

describe("Analytics", () => {
  beforeEach(() => {
    useFixedDay("2026-10-09");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("Overview: the period's figures beside the one before, every day of it, the tabs' counts and the top five of each", async () => {
    const t = harness();
    const s = await setUp(t);
    // Forty days ago: in the 30 days before, not in these 30.
    vi.setSystemTime(Date.parse("2026-08-30T12:00:00Z"));
    await s.read(s.james, "VIEW", "OURS", s.ours);
    vi.setSystemTime(Date.parse("2026-10-08T12:00:00Z"));
    await s.read(s.james, "VIEW", "WEB", s.web);
    await s.read(s.james, "READ", "WEB", s.web);
    await s.read(s.priya, "VIEW", "WEB", s.web);
    vi.setSystemTime(Date.parse("2026-10-09T12:00:00Z"));
    await s.read(s.sarah, "VIEW", "STORY", s.update);
    await s.read(s.sarah, "CLICK", "STORY", s.update);

    const overview = await s.admin.query(api.readingAnalytics.analyticsOverview, { period: "30" });
    expect(overview.range).toEqual({ from: "2026-09-10", to: "2026-10-09", days: 30 });
    expect(overview.figures).toEqual({ views: 3, reads: 1, clicks: 1, answers: 0, viewsBefore: 1, readers: 3, companies: 2 });
    expect(overview.days.map((day) => [day.day, day.views])).toEqual([["2026-10-08", 2], ["2026-10-09", 1]]);
    expect(overview.counts).toEqual({ articles: 2, people: 2, companies: 2 });
    expect(overview.top.articles.map((row) => [row.title, row.fromName, row.source, row.where, row.views, row.reads, row.readRate])).toEqual([
      ["What the October core update changed", "Glenn Gabe", "PERSON", "KNOWLEDGE", 2, 1, 50],
      ["October 2026 core update", "Google", "GOOGLE", "NEWS", 1, 0, 0],
    ]);
    expect(overview.top.companies).toEqual([
      { companyId: s.korda, name: "Korda", readers: 2, views: 2 },
      { companyId: s.hartley, name: "Hartley Dental", readers: 1, views: 1 },
    ]);
    expect(overview.top.users.map((row) => [row.name, row.companyName, row.views]).sort()).toEqual([["James Okafor", "Korda", 1], ["Priya Shah", "Korda", 1], ["Sarah Patel", "Hartley Dental", 1]]);
    expect((await s.admin.query(api.readingAnalytics.analyticsOverview, { period: "90" })).figures.views).toBe(4);
  });

  test("Articles: narrowed by who it is from, where and topic, sorted over the whole list, with each row's days", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.read(s.james, "VIEW", "WEB", s.web);
    await s.read(s.james, "READ", "WEB", s.web);
    await s.read(s.priya, "VIEW", "OURS", s.ours);
    await s.read(s.priya, "VIEW", "OURS", s.ours);
    await s.read(s.sarah, "VIEW", "STORY", s.update);
    const list = (args: Record<string, unknown>) =>
      s.admin.query(api.readingAnalytics.analyticsArticles, { period: "30", sort: "views", direction: "desc", page: 1, rows: 15, ...args });

    const all = await list({});
    // The most views first; a tie A to Z.
    expect(all.page.rows.map((row) => [row.title, row.views])).toEqual([["How is traffic worked out?", 2], ["October 2026 core update", 1], ["What the October core update changed", 1]]);
    expect(all.page.rows[0].trend).toEqual([{ day: "2026-10-09", views: 2 }]);
    expect(all.people).toEqual([{ followId: s.glenn, name: "Glenn Gabe" }]);
    expect((await list({ from: "OURS" })).page.rows.map((row) => row.title)).toEqual(["How is traffic worked out?"]);
    expect((await list({ from: "GOOGLE" })).page.rows.map((row) => row.title)).toEqual(["October 2026 core update"]);
    expect((await list({ from: s.glenn })).page.rows.map((row) => row.title)).toEqual(["What the October core update changed"]);
    expect((await list({ where: "NEWS" })).page.rows.map((row) => row.title)).toEqual(["October 2026 core update"]);
    expect((await list({ topic: "TRAFFIC" })).days).toEqual([{ day: "2026-10-09", views: 2, reads: 0, clicks: 0, answers: 0 }]);
    expect((await list({ sort: "readRate", direction: "desc" })).page.rows[0].title).toBe("What the October core update changed");
    expect((await list({ all: true })).page).toMatchObject({ total: 3, pages: 1 });
  });

  test("one article: its figures, and each company that read it with its readers", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.read(s.james, "VIEW", "WEB", s.web);
    await s.read(s.priya, "VIEW", "WEB", s.web);
    await s.read(s.priya, "READ", "WEB", s.web);
    await s.read(s.sarah, "VIEW", "WEB", s.web);
    await s.read(s.sarah, "CLICK", "WEB", s.web);

    const article = await s.admin.query(api.readingAnalytics.analyticsArticle, { itemKey: `WEB:${s.web}`, period: "30" });
    expect(article?.item).toMatchObject({ title: "What the October core update changed", fromName: "Glenn Gabe", where: "KNOWLEDGE", url: "https://gsqi.com/october" });
    expect(article?.figures).toMatchObject({ views: 3, reads: 1, clicks: 1 });
    expect(article?.readers).toBe(3);
    expect(article?.companies.map((row) => [row.name, row.readers, row.views, row.reads, row.clicks])).toEqual([["Korda", 2, 2, 1, 0], ["Hartley Dental", 1, 1, 0, 1]]);
    expect(await s.admin.query(api.readingAnalytics.analyticsArticle, { itemKey: "WEB:nothing", period: "30" })).toBeNull();
  });

  test("People: everyone followed, read or not; Companies: who read, by company and by day; one company's people and what each reads most", async () => {
    const t = harness();
    const s = await setUp(t);
    await s.read(s.james, "VIEW", "WEB", s.web);
    await s.read(s.james, "READ", "WEB", s.web);
    await s.read(s.james, "VIEW", "OURS", s.ours);
    await s.read(s.sarah, "VIEW", "WEB", s.web);

    const people = await s.admin.query(api.readingAnalytics.analyticsPeople, { period: "30", sort: "views", direction: "desc", page: 1, rows: 15 });
    expect(people.page.rows.map((row) => [row.name, row.articles, row.views, row.reads, row.picked])).toEqual([["Glenn Gabe", 8, 2, 1, true], ["Lily Ray", 47, 0, 0, false]]);

    const companies = await s.admin.query(api.readingAnalytics.analyticsCompanies, { period: "30", sort: "views", direction: "desc", page: 1, rows: 15 });
    expect(companies.readers).toBe(2);
    expect(companies.days).toEqual([{ day: "2026-10-09", readers: 2, companies: 2 }]);
    expect(companies.page.rows.map((row) => [row.name, row.readers, row.views, row.reads])).toEqual([["Korda", 1, 2, 1], ["Hartley Dental", 1, 1, 0]]);

    const korda = await s.admin.query(api.readingAnalytics.analyticsCompany, { companyId: s.korda, period: "30" });
    expect(korda?.figures).toMatchObject({ views: 2, reads: 1, readers: 1, people: 3 });
    expect(korda?.people.map((row) => [row.name, row.views, row.reads, row.topMost])).toEqual([["James Okafor", 2, 1, "RANKINGS"]]);
  });

  test("only a super admin reads Analytics", async () => {
    const t = harness();
    const s = await setUp(t);
    await expect(s.as(s.james).query(api.readingAnalytics.analyticsOverview, { period: "7" })).rejects.toThrow();
  });
});
