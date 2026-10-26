import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * The screens' boxes kept (insightBoxes.ts): the week's replace the last, a
 * screen not written this week keeps none, and only the company's own people
 * read them.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

async function seeded(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
    const otherId = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Anthony", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: 1 });
    const strangerId = await ctx.db.insert("users", { name: "Stranger", email: "someone@rival.test", role: "ADMIN", companyId: otherId, createdAt: 1 });
    return { holdId, userId, strangerId };
  });
}

describe("the screens' boxes kept", () => {
  test("the week's replace the last; a screen not written keeps its previous week; another company reads none", async () => {
    const t = harness();
    const { holdId, userId, strangerId } = await seeded(t);
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-05", boxes: [
      { screen: "AI_SEARCH", says: ["Named 4 times."], role: "INSIGHTS_AI_VISIBILITY" },
      { screen: "LEADERBOARDS", says: ["Third of five."], role: "INSIGHTS_MARKET" },
    ] });
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-12", boxes: [{ screen: "AI_SEARCH", says: ["Named 12 times."], role: "INSIGHTS_AI_VISIBILITY" }] });
    const me = t.withIdentity({ subject: userId });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH" })).toEqual({ says: ["Named 12 times."], role: "INSIGHTS_AI_VISIBILITY", week: "2026-10-12", period: null });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "LEADERBOARDS" })).toMatchObject({ says: ["Third of five."], week: "2026-10-05" });
    expect(await t.withIdentity({ subject: strangerId }).query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH" })).toBeNull();
    await expect(t.withIdentity({ subject: strangerId }).query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH", siteId: holdId })).rejects.toThrow();
  });

  test("Page decisions' box, written after the rest, replaces only its own", async () => {
    const t = harness();
    const { holdId, userId } = await seeded(t);
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-12", boxes: [{ screen: "FUNNEL", says: ["Weakest at the click."], role: "INSIGHTS_CONVERSION" }], screens: ["FUNNEL", "TRACK_RECORD"] });
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-12", boxes: [{ screen: "PAGE_DECISIONS", says: ["Merge two pages."], role: "INSIGHTS_PAGE_DECISIONS" }], screens: ["PAGE_DECISIONS"] });
    const me = t.withIdentity({ subject: userId });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "FUNNEL" })).toMatchObject({ says: ["Weakest at the click."] });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "PAGE_DECISIONS" })).toMatchObject({ says: ["Merge two pages."], role: "INSIGHTS_PAGE_DECISIONS" });
  });

  test("Track record's and Page decisions' figures are read from the website's findings and decisions as kept", async () => {
    const t = harness();
    const { holdId } = await seeded(t);
    await t.run(async (ctx) => {
      const hold = (await ctx.db.get(holdId))!;
      const base = { companyId: hold.companyId, companyWebsiteId: holdId };
      const finding = (outcome?: "RIGHT" | "WRONG") => ({
        ...base, week: "2026-09-07", createdAt: 1, specialist: "search" as const, pattern: "P", status: "PUBLISHED" as const, rank: 1, headline: `Was ${outcome ?? "open"}`, story: "s", ruledOut: [], action: "a",
        howWeKnow: "h", sure: "MEDIUM" as const, sources: ["searchConsole"], facts: [], comparisons: [], checkOn: "2026-10-05", ...(outcome ? { outcome } : {}),
      });
      for (const outcome of ["RIGHT", "WRONG", undefined] as const) await ctx.db.insert("insightFindings", finding(outcome));
      await ctx.db.insert("insightPageDecisions", { ...base, part: 0, createdAt: 1, pages: 2, creates: [], decisions: [
        { path: "/old/", kind: null, type: "NOT_SORTED", verdict: "REDIRECT", reason: "SPECIALIST", into: "/new/", visits: 5, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 0, flags: [], decidedBy: "AGENT", decidedWeek: "2026-10-12", why: "It repeats /new/." },
        { path: "/new/", kind: "Service", type: "SERVICE", verdict: "KEEP", reason: "WORKING", into: null, visits: 40, enquiries: 3, views: 0, shown: 0, clicks: 0, domains: 0, flags: [] },
      ] });
    });
    const read = await t.query(internal.insightBoxes.boxFactsInternal, { holdId, screens: ["TRACK_RECORD", "PAGE_DECISIONS"] });
    const value = (key: string) => read.facts.find((entry) => entry.key === key)?.value;
    expect([value("track.right"), value("track.wrong"), value("track.waiting"), value("decisions.redirect"), value("decisions.bySpecialist")]).toEqual([1, 1, 1, 1, 1]);
    expect(read.about.PAGE_DECISIONS).toEqual([{ page: "/old/", do: "redirect", into: "/new/", why: "It repeats /new/." }]);
    expect(read.about.TRACK_RECORD?.map((entry) => entry.checked)).toEqual(expect.arrayContaining(["RIGHT", "WRONG"]));
  });
  test("an answered screen whose prose fails evidence checks clears its older prose, while an uncompleted writer keeps it", async () => {
    const t = harness(), { holdId, userId } = await seeded(t);
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-05", boxes: [{ screen: "AI_SEARCH", says: ["Older completed words"], role: "INSIGHTS_AI_VISIBILITY" }, { screen: "LEADERBOARDS", says: ["Keep while its writer failed"], role: "INSIGHTS_MARKET" }] });
    await t.mutation(internal.insightBoxes.saveBoxes, { holdId, week: "2026-10-12", boxes: [], completedScreens: ["AI_SEARCH"] });
    const me = t.withIdentity({ subject: userId });
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "AI_SEARCH" })).toBeNull();
    expect(await me.query(api.insightBoxes.insightsScreenBox, { screen: "LEADERBOARDS" })).toMatchObject({ says: ["Keep while its writer failed"], week: "2026-10-05" });
  });

});
