import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
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
