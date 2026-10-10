import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { finishScheduled } from "@/src/test/finishScheduled";
import { api } from "./_generated/api";
import schema from "./schema";
import { checkedChannel } from "./followChannels";
import { useFixedDay } from "@/src/test/realTime";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 3): Google
 * updates entered by hand show in the feed at once and follow their update;
 * an item taken down stays down; every reader reads their language.
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

const UPDATE = {
  titleEn: "March 2025 core update",
  descriptionEn: "Google re-ranked results across many searches.",
  startedOn: "2025-03-13",
  finishedOn: "",
  url: "https://status.search.google.com/incidents/1",
};

const firstPage = { numItems: 10, cursor: null };

describe("News", () => {
  beforeEach(() => {
    useFixedDay();
    generate.mockReset().mockResolvedValue({ text: JSON.stringify({ title: "Core update di marzo 2025", description: "Google ha riordinato i risultati." }) });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a Google update is a News item at once, in the reader's language once translated, and follows its update", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const updateId = await superAdmin.mutation(api.googleUpdates.createGoogleUpdate, UPDATE);
    const english = await member.query(api.news.listNewsItems, { paginationOpts: firstPage, language: "en" });
    expect(english.page).toEqual([expect.objectContaining({ kind: "GOOGLE_UPDATE", sourceName: "Google", title: UPDATE.titleEn, summary: UPDATE.descriptionEn, meaning: "" })]);

    await finishScheduled(t);
    const italian = await member.query(api.news.listNewsItems, { paginationOpts: firstPage, language: "it" });
    expect(italian.page[0]).toMatchObject({ title: "Core update di marzo 2025", summary: "Google ha riordinato i risultati." });
    // The same translation marks the charts (phase 10).
    expect(await member.query(api.googleUpdates.listGoogleUpdatesBetween, { from: "2025-01-01", to: "2025-12-31", language: "it" }))
      .toEqual([expect.objectContaining({ title: "Core update di marzo 2025", startedOn: "2025-03-13", finishedOn: null })]);

    await superAdmin.mutation(api.googleUpdates.updateGoogleUpdate, { updateId, ...UPDATE, finishedOn: "2025-03-27" });
    expect((await superAdmin.query(api.googleUpdates.getGoogleUpdate, { updateId }))?.finishedOn).toBe("2025-03-27");
    await superAdmin.mutation(api.googleUpdates.updateGoogleUpdate, { updateId, ...UPDATE, finishedOn: "" });
    expect((await superAdmin.query(api.googleUpdates.getGoogleUpdate, { updateId }))?.finishedOn).toBeNull();

    // Taken down only with its update.
    const [item] = (await superAdmin.query(api.news.listNewsItemsForAdmin, { paginationOpts: firstPage })).page;
    await expect(superAdmin.mutation(api.news.deleteNewsItem, { itemId: item._id })).rejects.toThrow("Delete it in Google updates");
    await superAdmin.mutation(api.googleUpdates.deleteGoogleUpdate, { updateId });
    expect((await member.query(api.news.listNewsItems, { paginationOpts: firstPage, language: "en" })).page).toHaveLength(0);
  });

  test("refuses an update that finishes before it starts, or links nowhere", async () => {
    const t = harness();
    const { superAdmin } = await people(t);

    await expect(superAdmin.mutation(api.googleUpdates.createGoogleUpdate, { ...UPDATE, finishedOn: "2025-03-01" })).rejects.toThrow("cannot finish before it started");
    await expect(superAdmin.mutation(api.googleUpdates.createGoogleUpdate, { ...UPDATE, url: "status page" })).rejects.toThrow("web address");
  });

  test("an item taken down is remembered, so the collector will not bring it back", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    const itemId = await t.run(async (ctx) => ctx.db.insert("newsItems", {
      kind: "WEBSITE", sourceName: "Search Engine Land", titleEn: "Old news", summaryEn: "", meaningEn: "",
      url: "https://searchengineland.com/old", publishedAt: 1, externalKey: "https://searchengineland.com/old", createdAt: 1,
    }));
    await superAdmin.mutation(api.news.deleteNewsItem, { itemId });
    expect((await member.query(api.news.listNewsItems, { paginationOpts: firstPage, language: "en" })).page).toHaveLength(0);
    expect(await t.run(async (ctx) => (await ctx.db.query("newsTakenDown").collect()).map((row) => row.externalKey))).toEqual(["https://searchengineland.com/old"]);
  });

  test("a channel's kind is read from its address, X is kept as its profile however it was typed, and only the super admin manages channels", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);

    expect(checkedChannel("@googlesearchc")).toEqual({ kind: "X", address: "https://x.com/googlesearchc" });
    expect(checkedChannel("https://twitter.com/googlesearchc?lang=en")).toEqual({ kind: "X", address: "https://x.com/googlesearchc" });
    expect(checkedChannel("searchengineland.com")).toEqual({ kind: "WEBSITE", address: "https://searchengineland.com" });
    expect(checkedChannel("https://www.youtube.com/@GoogleSearchCentral")).toMatchObject({ kind: "YOUTUBE" });
    expect(checkedChannel("https://www.linkedin.com/in/lily-ray-44755615/")).toMatchObject({ kind: "LINKEDIN" });
    expect(() => checkedChannel("https://x.com/not a handle!")).toThrow("An X account is its address");
    expect(() => checkedChannel("  ")).toThrow("A channel's address is needed");

    const followId = await superAdmin.mutation(api.newsFollows.createFollow, { name: "Google Search Central", whyEn: "Google's own word.", channels: ["@googlesearchc"] });
    expect(await superAdmin.query(api.followChannels.listChannelsForAdmin, { followId })).toEqual([
      expect.objectContaining({ kind: "X", address: "https://x.com/googlesearchc", collect: true, lastCheckedAt: null, found: 0 }),
    ]);
    await expect(member.query(api.followChannels.listChannelsForAdmin, { followId })).rejects.toThrow();
  });

  test("Who to follow is read in the reader's language once translated", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    generate.mockResolvedValue({ text: JSON.stringify({ why: "Opinioni chiare su ogni core update." }) });

    await superAdmin.mutation(api.newsFollows.createFollow, { name: "Lily Ray", whyEn: "Clear takes on every core update.", channels: ["https://x.com/lilyraynyc"] });
    expect((await member.query(api.newsFollows.listFollowsByPage, { language: "it", page: 1, rows: 25 })).rows[0].why).toBe("Clear takes on every core update.");
    await finishScheduled(t);
    expect((await member.query(api.newsFollows.listFollowsByPage, { language: "it", page: 1, rows: 25 })).rows[0].why).toBe("Opinioni chiare su ogni core update.");
  });
});
