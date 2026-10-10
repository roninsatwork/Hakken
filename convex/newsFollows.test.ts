import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MAX_PICKS } from "./newsFollows";

/**
 * Who to follow's topic and "Our picks" (docs/plans/active/insights-helpful-
 * content-plan.md, IH13, IH14): a topic from the shared list, and at most four
 * picks — refused past that whatever asks, kept in the order picked, and
 * staying until changed — and readers' numbered pages, counted and narrowed
 * on the server (IH21).
 */

function harness() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

async function people(t: ReturnType<typeof harness>) {
  await t.mutation(internal.topics.seedFirstTopicsInternal, {});
  const { superAdminId, memberId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdminId = await ctx.db.insert("users", { email: "admin@hakken.example", role: "SUPER_ADMIN" });
    const memberId = await ctx.db.insert("users", { email: "member@korda.example", role: "USER", companyId });
    return { superAdminId, memberId };
  });
  return { superAdmin: t.withIdentity({ subject: superAdminId }), member: t.withIdentity({ subject: memberId }) };
}

/** A person's details, as Edit details saves them. */
const details = (name: string, extra: { topic?: string; picked?: boolean } = {}) => ({
  name,
  whyEn: `Why ${name}.`,
  ...extra,
});

/** A person as Add a person saves them: their details and one X account. */
const entry = (name: string, extra: { topic?: string; picked?: boolean } = {}) => ({
  ...details(name, extra),
  channels: [`https://x.com/${name.toLowerCase().replace(/\s+/g, "").slice(0, 15)}`],
});

describe("Who to follow: topics and our picks", () => {
  // A save schedules its translation; on fake timers it runs only when a test asks, never after the test.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("an entry keeps a topic from the list; readers see it, and an unknown topic is refused", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const followId = await superAdmin.mutation(api.newsFollows.createFollow, entry("Lily Ray", { topic: "RANKINGS" }));

    expect((await member.query(api.newsFollows.listFollowsByPage, { language: "en", page: 1, rows: 25 })).rows).toEqual([
      expect.objectContaining({ _id: followId, name: "Lily Ray", topic: "RANKINGS", pickedAt: null }),
    ]);
    await expect(superAdmin.mutation(api.newsFollows.createFollow, entry("Someone", { topic: "GARDENING" }))).rejects.toThrow("no longer in the list");
    // Blank is none.
    await superAdmin.mutation(api.newsFollows.updateFollow, { followId, ...details("Lily Ray", { topic: "" }) });
    expect((await superAdmin.query(api.newsFollows.getFollow, { followId }))?.topic).toBeNull();
  });

  test(`at most ${MAX_PICKS} picks, in the order picked; a fifth is refused, naming the four`, async () => {
    const t = harness();
    const { superAdmin } = await people(t);
    const names = ["Nacho Mascort", "Lily Ray", "Kevin Indig", "Google Search Central", "Edward Sturm"];
    const ids = [];
    for (const name of names) ids.push(await superAdmin.mutation(api.newsFollows.createFollow, entry(name)));

    for (const followId of ids.slice(0, MAX_PICKS)) await superAdmin.mutation(api.newsFollows.setFollowPick, { followId, picked: true });
    expect((await superAdmin.query(api.newsFollows.listPicksForAdmin, {})).map((pick) => pick.name)).toEqual(names.slice(0, MAX_PICKS));

    await expect(superAdmin.mutation(api.newsFollows.setFollowPick, { followId: ids[4], picked: true }))
      .rejects.toThrow("4 are picked already: Nacho Mascort, Lily Ray, Kevin Indig, Google Search Central. Untick one of them first.");
    // Saving the entry's page with the tick on is refused the same way.
    await expect(superAdmin.mutation(api.newsFollows.updateFollow, { followId: ids[4], ...details("Edward Sturm", { picked: true }) })).rejects.toThrow("Untick one of them first");

    await superAdmin.mutation(api.newsFollows.setFollowPick, { followId: ids[1], picked: false });
    await superAdmin.mutation(api.newsFollows.updateFollow, { followId: ids[4], ...details("Edward Sturm", { picked: true }) });
    expect((await superAdmin.query(api.newsFollows.listPicksForAdmin, {})).map((pick) => pick.name)).toEqual(["Nacho Mascort", "Kevin Indig", "Google Search Central", "Edward Sturm"]);
  });

  test("a save that leaves the tick alone leaves the picks alone, and only the super admin picks", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    const followId = await superAdmin.mutation(api.newsFollows.createFollow, entry("Kevin Indig", { picked: true }));
    await superAdmin.mutation(api.newsFollows.updateFollow, { followId, ...details("Kevin Indig") });
    expect((await superAdmin.query(api.newsFollows.getFollow, { followId }))?.pickedAt).not.toBeNull();
    await expect(member.mutation(api.newsFollows.setFollowPick, { followId, picked: false })).rejects.toThrow();
  });
});

describe("Who to follow for readers: numbered pages from the server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("A to Z a page at a time with the exact total, under Where, Topic or a search; a page past the end is the last", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    for (const name of ["Rand Fishkin", "aleyda Solis", "Lily Ray", "Kevin Indig", "Barry Schwartz"]) {
      await superAdmin.mutation(api.newsFollows.createFollow, entry(name, { topic: name === "Lily Ray" ? "RANKINGS" : undefined }));
    }
    await superAdmin.mutation(api.newsFollows.createFollow, { ...details("Google Search Central", { topic: "RANKINGS" }), channels: ["https://www.youtube.com/@googlesearchcentral"] });
    const read = (args: { page: number; rows: number; kind?: "X" | "YOUTUBE"; topic?: string; search?: string }) =>
      member.query(api.newsFollows.listFollowsByPage, { language: "en", ...args });

    const first = await read({ page: 1, rows: 4 });
    expect(first).toMatchObject({ total: 6, pages: 2, page: 1, size: 4 });
    // A to Z whatever the capitals.
    expect(first.rows.map((row) => row.name)).toEqual(["aleyda Solis", "Barry Schwartz", "Google Search Central", "Kevin Indig"]);
    expect((await read({ page: 9, rows: 4 }))).toMatchObject({ page: 2, rows: [expect.objectContaining({ name: "Lily Ray" }), expect.objectContaining({ name: "Rand Fishkin" })] });

    expect(await read({ page: 1, rows: 25, kind: "YOUTUBE" })).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Google Search Central" })] });
    expect((await read({ page: 1, rows: 25, topic: "RANKINGS" })).rows.map((row) => row.name)).toEqual(["Google Search Central", "Lily Ray"]);
    expect(await read({ page: 1, rows: 25, kind: "X", topic: "RANKINGS" })).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Lily Ray" })] });
    expect(await read({ page: 1, rows: 25, search: "lily" })).toMatchObject({ total: 1, rows: [expect.objectContaining({ name: "Lily Ray" })] });
    expect(await member.query(api.newsFollows.getFollowTotals, {})).toMatchObject({ all: 6, byKind: { X: 5, YOUTUBE: 1 }, byTopic: { RANKINGS: 2 } });
  });

  test("our picks reach readers in the order picked, and a page never shows more than a hundred", async () => {
    const t = harness();
    const { superAdmin, member } = await people(t);
    await superAdmin.mutation(api.newsFollows.createFollow, entry("Kevin Indig", { picked: true }));
    await superAdmin.mutation(api.newsFollows.createFollow, entry("Aleyda Solis", { picked: true }));
    expect((await member.query(api.newsFollows.listPicks, { language: "en" })).map((pick) => pick.name)).toEqual(["Kevin Indig", "Aleyda Solis"]);
    expect(await member.query(api.newsFollows.listFollowsByPage, { language: "en", page: 1, rows: 500 })).toMatchObject({ size: 100 });
  });
});
