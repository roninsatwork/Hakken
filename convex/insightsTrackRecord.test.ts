import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * Track record's tally (insightsReads.insightsTrackRecord;
 * insights-one-voice-plan.md phase 6): with one website chosen, that
 * website's own findings as they were checked; with none, the company's.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

const finding = (outcome: "RIGHT" | "WRONG" | "TOO_EARLY") => ({
  week: "2026-09-07", createdAt: 1, specialist: "search" as const, pattern: "P", status: "PUBLISHED" as const, rank: 1, headline: outcome, story: "s", ruledOut: [], action: "a",
  howWeKnow: "h", sure: "MEDIUM" as const, sources: ["searchConsole"], facts: [], comparisons: [], checkOn: "2026-10-05", outcome,
});

describe("each open finding's check, kept", () => {
  test("its figure, page changes and days are read; the week's clock and figure so far are saved and shown", async () => {
    const t = harness();
    const { userId, ronins, findingId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "www.ronins.co.uk", firstSeenAt: 1 });
      const ronins = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const watched = { key: "ga.landing./guide/.conversions.365.now", value: 1, unit: "count" as const, source: "analytics" as const, label: "conversions landing on /guide/" };
      const findingId = await ctx.db.insert("insightFindings", {
        companyId, companyWebsiteId: ronins, ...finding("RIGHT"), outcome: undefined, createdAt: Date.parse("2026-10-11T07:00:00Z"), checkOn: "2027-01-09",
        facts: [watched], watch: { key: watched.key, direction: "UP" },
      });
      await ctx.db.insert("insightChanges", { companyId, companyWebsiteId: ronins, week: "2026-10-12", kind: "TOP_REWRITTEN", from: "/guide/", to: null, day: "2026-10-12", seenIn: "pageCheck", before: 0, after: 0, result: "TOO_EARLY", createdAt: 1 });
      const userId = await ctx.db.insert("users", { name: "Anthony", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: 1 });
      return { userId, ronins, findingId };
    });
    const open = await t.query(internal.insightsTeam.openFindings, { holdId: ronins });
    expect(open).toMatchObject({ origin: "https://www.ronins.co.uk", changes: [{ page: "/guide/", day: "2026-10-12" }] });
    expect(open.findings).toMatchObject([{ findingId, written: "2026-10-11", checkInDays: 90, clock: null, then: { value: 1 } }]);
    const clock = { from: "2026-10-12", why: "PAGE_CHANGED" as const, days: 90, key: "ga.landing./guide/.conversions.90", page: "/guide/" };
    const progress = { day: "2026-10-12", now: 1, against: 0, than: "YEAR" as const, unit: "count" as const, to: "2026-10-10" };
    await t.mutation(internal.insightsTeam.scoreFindings, { companyId: (await t.run(async (ctx) => (await ctx.db.get(ronins))!.companyId)), outcomes: [], updates: [{ findingId, clock, checkOn: "2027-01-13", progress }] });
    const row = (await t.withIdentity({ subject: userId }).query(api.insightsReads.insightsTrackRecord, { siteId: ronins })).findings[0];
    expect(row).toMatchObject({ checkOn: "2027-01-13", clock, progress });
  });
});

describe("Track record's tally", () => {
  test("counts the chosen website's own checked findings; the company's with none chosen", async () => {
    const t = harness();
    const { userId, ronins } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
      const hold = async (host: string) => {
        const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: 1 });
        return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      };
      const ronins = await hold("ronins.co.uk");
      const other = await hold("ronins-group.co.uk");
      for (const outcome of ["RIGHT", "RIGHT", "WRONG"] as const) await ctx.db.insert("insightFindings", { companyId, companyWebsiteId: ronins, ...finding(outcome) });
      await ctx.db.insert("insightFindings", { companyId, companyWebsiteId: other, ...finding("TOO_EARLY") });
      await ctx.db.insert("insightTally", { companyId, specialist: "search", right: 5, wrong: 2, unclear: 1, updatedAt: 1 });
      const userId = await ctx.db.insert("users", { name: "Anthony", email: "anthony@ronins.test", role: "ADMIN", companyId, createdAt: 1 });
      return { userId, ronins };
    });
    const me = t.withIdentity({ subject: userId });
    expect((await me.query(api.insightsReads.insightsTrackRecord, { siteId: ronins })).tally).toEqual({ right: 2, wrong: 1, unclear: 0 });
    expect((await me.query(api.insightsReads.insightsTrackRecord, {})).tally).toEqual({ right: 5, wrong: 2, unclear: 1 });
  });
});
