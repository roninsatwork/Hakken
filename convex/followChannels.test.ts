import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "@/src/test/realTime";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { channelsFromFollows } from "./contentPeopleMigrations";
import { MAX_CHANNELS } from "./utils/followChannels";

/**
 * People and their channels (docs/plans/active/content-people-knowledge-
 * plan.md, phase 1, C2, C3): a person is added with their channels, each
 * named by its address and collected unless it is LinkedIn; channels are added,
 * ticked and removed by hand; Admin's list narrows by any channel a person has
 * and sorts by any heading over the whole list; the News Collector reads only
 * channels being collected; and the old one-link rows become people.
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function superAdmin(t: ReturnType<typeof harness>) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" }));
  return t.withIdentity({ subject: userId });
}

const person = (name: string, channels: string[], extra: { topic?: string; picked?: boolean } = {}) => ({ name, whyEn: `Why ${name}.`, channels, ...extra });

describe("people and their channels", () => {
  // A save schedules its translation; on fake timers it runs only when a test asks, never after the test.
  // The list's newest dates are fixed days, so the clock starts on one.
  beforeEach(() => {
    useFixedDay();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("a person added with their channels: each named by its address, in the order given, LinkedIn shown and never collected", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const followId = await admin.mutation(api.newsFollows.createFollow, person("Glenn Gabe", ["gsqi.com/marketing-blog", "@glenngabe", "https://www.linkedin.com/in/glenngabe/", "  "]));

    expect(await admin.query(api.followChannels.listChannelsForAdmin, { followId })).toEqual([
      expect.objectContaining({ kind: "WEBSITE", address: "https://gsqi.com/marketing-blog", collect: true, status: "COLLECTING" }),
      // X waits for the app's token.
      expect.objectContaining({ kind: "X", address: "https://x.com/glenngabe", collect: true, status: "X_NOT_SET_UP" }),
      expect.objectContaining({ kind: "LINKEDIN", collect: false, status: "LINKEDIN" }),
    ]);
    // The person's row keeps every kind, and their first channel as Insights' link.
    expect(await t.run(async (ctx) => await ctx.db.get(followId))).toMatchObject({
      channelKinds: ["WEBSITE", "X", "LINKEDIN"], kind: "WEBSITE", url: "https://gsqi.com/marketing-blog",
    });
  });

  test("a person needs a channel, has at most six, and never the same one twice", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    await expect(admin.mutation(api.newsFollows.createFollow, person("Nobody", [" "]))).rejects.toThrow("Add at least one of their channels.");
    const seven = Array.from({ length: MAX_CHANNELS + 1 }, (_, index) => `https://site${index}.example`);
    await expect(admin.mutation(api.newsFollows.createFollow, person("Busy", seven))).rejects.toThrow(`at most ${MAX_CHANNELS} channels`);
    await expect(admin.mutation(api.newsFollows.createFollow, person("Twice", ["https://x.com/twice", "@twice"]))).rejects.toThrow("one of their channels already");

    const followId = await admin.mutation(api.newsFollows.createFollow, person("Lily Ray", ["https://x.com/lilyraynyc"]));
    await expect(admin.mutation(api.followChannels.addChannel, { followId, address: "@lilyraynyc" })).rejects.toThrow("one of their channels already");
  });

  test("channels are added, ticked and removed by hand; LinkedIn can't be ticked, the last channel can't go, and the first one is Insights' link", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const followId = await admin.mutation(api.newsFollows.createFollow, person("Edward Sturm", ["https://x.com/edwardeachday"]));
    await admin.mutation(api.followChannels.addChannel, { followId, address: "https://www.youtube.com/@buildinpublic" });
    await admin.mutation(api.followChannels.addChannel, { followId, address: "linkedin.com/in/edwardsturm" });
    const [x, youtube, linkedin] = await admin.query(api.followChannels.listChannelsForAdmin, { followId });

    await admin.mutation(api.followChannels.setChannelCollect, { channelId: youtube._id, collect: false });
    expect((await admin.query(api.followChannels.listChannelsForAdmin, { followId }))[1]).toMatchObject({ collect: false, status: "OFF" });
    await expect(admin.mutation(api.followChannels.setChannelCollect, { channelId: linkedin._id, collect: true })).rejects.toThrow("LinkedIn can't be read");

    await admin.mutation(api.followChannels.removeChannel, { channelId: x._id });
    expect(await t.run(async (ctx) => await ctx.db.get(followId))).toMatchObject({
      channelKinds: ["YOUTUBE", "LINKEDIN"], kind: "YOUTUBE", url: "https://www.youtube.com/@buildinpublic",
    });
    await admin.mutation(api.followChannels.removeChannel, { channelId: linkedin._id });
    await expect(admin.mutation(api.followChannels.removeChannel, { channelId: youtube._id })).rejects.toThrow("This is their only channel");

    // A person's channels go with them.
    await admin.mutation(api.newsFollows.deleteFollow, { followId });
    expect(await t.run(async (ctx) => await ctx.db.query("followChannels").collect())).toEqual([]);
  });

  test("Admin's list: narrowed by any channel a person has, sorted by any heading over the whole list, counted exactly", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const glenn = await admin.mutation(api.newsFollows.createFollow, person("Glenn Gabe", ["https://x.com/glenngabe", "https://gsqi.com"]));
    const lily = await admin.mutation(api.newsFollows.createFollow, person("Lily Ray", ["https://x.com/lilyraynyc"], { picked: true }));
    await admin.mutation(api.newsFollows.createFollow, person("Ahrefs", ["https://www.youtube.com/@AhrefsCom"]));
    await t.run(async (ctx) => {
      await ctx.db.patch(glenn, { collected: 8, newestAt: Date.parse("2026-10-07") });
      await ctx.db.patch(lily, { collected: 47, newestAt: Date.parse("2026-10-09") });
    });
    const list = (args: Record<string, unknown>) =>
      admin.query(api.newsFollows.listFollowsForAdmin, { sort: "name", direction: "asc", page: 1, rows: 15, ...args });

    expect((await list({})).rows.map((row) => row.name)).toEqual(["Ahrefs", "Glenn Gabe", "Lily Ray"]);
    // Glenn's website counts, though X is his first channel.
    expect(await list({ channel: "WEBSITE" })).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Glenn Gabe", channelKinds: ["X", "WEBSITE"] })] });
    expect((await list({ channel: "X" })).rows.map((row) => row.name)).toEqual(["Glenn Gabe", "Lily Ray"]);
    // The most articles first; a person with none sorts as none, after.
    expect((await list({ sort: "collected", direction: "desc" })).rows.map((row) => [row.name, row.collected])).toEqual([["Lily Ray", 47], ["Glenn Gabe", 8], ["Ahrefs", 0]]);
    // Newest first, blanks last either way.
    expect((await list({ sort: "newest", direction: "asc" })).rows.map((row) => row.name)).toEqual(["Glenn Gabe", "Lily Ray", "Ahrefs"]);
    expect(await list({ picks: true })).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Lily Ray" })] });
    expect(await list({ rows: 2, page: 2 })).toMatchObject({ total: 3, pages: 2, page: 2, rows: [expect.objectContaining({ name: "Lily Ray" })] });
  });

  test("the News Collector reads only channels being collected, never read first, never LinkedIn", async () => {
    const t = harness();
    const admin = await superAdmin(t);
    const followId = await admin.mutation(api.newsFollows.createFollow, person("Glenn Gabe", ["https://gsqi.com", "https://x.com/glenngabe", "https://linkedin.com/in/glenngabe"]));
    const [website, x] = await admin.query(api.followChannels.listChannelsForAdmin, { followId });
    await t.run(async (ctx) => await ctx.db.patch(website._id, { lastCheckedAt: Date.now() - 3_600_000 }));
    expect((await t.query(internal.newsCollector.listChannelsToRead, {})).map((channel) => [channel.kind, channel.name, channel.firstRead])).toEqual([
      ["X", "Glenn Gabe", true],
      ["WEBSITE", "Glenn Gabe", false],
    ]);
    await admin.mutation(api.followChannels.setChannelCollect, { channelId: x._id, collect: false });
    expect((await t.query(internal.newsCollector.listChannelsToRead, {})).map((channel) => channel.kind)).toEqual(["WEBSITE"]);
  });
});

describe("the old one-link rows become people", () => {
  test("each row's link becomes its first channel, and rows for the same person become one, keeping the pick and the topic", async () => {
    const t = harness();
    const ids = await t.run(async (ctx) => {
      const row = (name: string, kind: "X" | "YOUTUBE", url: string, createdAt: number, extra: Record<string, unknown> = {}) =>
        ctx.db.insert("newsFollows", { kind, name, nameKey: name.toLowerCase(), url, whyEn: `Why ${name}.`, order: createdAt, createdAt, updatedAt: createdAt, ...extra });
      return {
        sturmX: await row("Edward Sturm", "X", "https://x.com/edwardeachday", 1),
        sturmYouTube: await row("Edward Sturm", "YOUTUBE", "https://www.youtube.com/@buildinpublic", 2, { pickedAt: 5, topic: "TRAFFIC" }),
        lily: await row("Lily Ray", "X", "https://x.com/lilyraynyc", 3),
      };
    });

    await t.run(async (ctx) => {
      await channelsFromFollows(ctx);
      // Run again, it changes nothing.
      await channelsFromFollows(ctx);
    });

    const after = await t.run(async (ctx) => ({
      follows: await ctx.db.query("newsFollows").collect(),
      channels: await ctx.db.query("followChannels").collect(),
    }));
    expect(after.follows.map((row) => row._id).sort()).toEqual([ids.sturmX, ids.lily].sort());
    expect(after.follows.find((row) => row._id === ids.sturmX)).toMatchObject({ channelKinds: ["X", "YOUTUBE"], pickedAt: 5, topic: "TRAFFIC", url: "https://x.com/edwardeachday" });
    expect(after.channels.map((channel) => [channel.followId === ids.sturmX ? "sturm" : "lily", channel.kind, channel.address]).sort()).toEqual([
      ["lily", "X", "https://x.com/lilyraynyc"],
      ["sturm", "X", "https://x.com/edwardeachday"],
      ["sturm", "YOUTUBE", "https://www.youtube.com/@buildinpublic"],
    ]);
  });
});
