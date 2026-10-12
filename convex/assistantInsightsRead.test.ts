import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";

/**
 * What Ask Hakken reads of Insights (assistantReads.insightsInternal;
 * insights-one-voice-plan.md phase 5): everything saved, as saved — the
 * week's findings and the earlier ones still open, Page decisions,
 * Strategy's calls and each screen's box — so it never says other than the
 * screens.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  useFixedDay("2026-10-12");
});

afterEach(() => {
  vi.useRealTimers();
});

const finding = (week: string, headline: string, extra: Record<string, unknown> = {}) => ({
  week, createdAt: 1, specialist: "search" as const, pattern: "P", status: "PUBLISHED" as const, rank: 1, headline, story: "s", ruledOut: [], action: `Do ${headline}`,
  howWeKnow: "h", sure: "MEDIUM" as const, sources: ["searchConsole"], facts: [], comparisons: [], checkOn: "2026-12-07", ...extra,
});

describe("Ask Hakken's read of Insights", () => {
  test("holds the week's findings, the earlier ones still open, Page decisions, Strategy's calls and the screens' boxes", async () => {
    const t = harness();
    const companyId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: 1 });
      const websiteId = await ctx.db.insert("websites", { host: "ronins.co.uk", displayHost: "ronins.co.uk", firstSeenAt: 1 });
      const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      const base = { companyId, companyWebsiteId: holdId };
      const services = [{
        page: "/app-developers-london/", title: "App developers London", kind: "SERVICE" as const, enquiries: 4, enquiriesBefore: 6, visits: 30, people: 25, clicks: 4, clicksBefore: 5,
        impressions: 48_000, impressionsBefore: 40_000, verdict: "STEADY" as const, decidedBy: "AGENT" as const, decidedWeek: "2026-10-12", why: "Its London searches still bring work.",
      }];
      await ctx.db.insert("insightWeeks", { ...base, week: "2026-10-12", verdict: "Steady.", sources: [], problems: [], published: 1, sentBack: 0, costUsd: 0.3, createdAt: 2, summary: { scorecard: [], enquiriesByMonth: [], shareByMonth: [], services, checked: 0, ruledOut: 0 } });
      await ctx.db.insert("insightFindings", { ...base, ...finding("2026-10-12", "This week") });
      await ctx.db.insert("insightFindings", { ...base, ...finding("2026-10-05", "Still open") });
      await ctx.db.insert("insightFindings", { ...base, ...finding("2026-09-28", "Checked", { outcome: "RIGHT" }) });
      await ctx.db.insert("insightPageDecisions", { ...base, part: 0, createdAt: 1, pages: 2, creates: [], decisions: [
        { path: "/old-offer/", kind: null, type: "NOT_SORTED", verdict: "REDIRECT", reason: "SPECIALIST", into: "/working/", visits: 0, enquiries: 0, views: 0, shown: 0, clicks: 0, domains: 2, flags: [], decidedBy: "AGENT", decidedWeek: "2026-10-12", why: "Its old offer lives on at the working page." },
        { path: "/working/", kind: "Service", type: "SERVICE", verdict: "KEEP", reason: "WORKING", into: null, visits: 40, enquiries: 3, views: 300, shown: 900, clicks: 20, domains: 0, flags: [] },
      ] });
      await ctx.db.insert("insightScreenBoxes", { ...base, week: "2026-10-12", screen: "AI_SEARCH", says: ["Named 12 times."], role: "INSIGHTS_AI_VISIBILITY", createdAt: 1 });
      return companyId;
    });
    const read = await t.query(internal.assistantReads.insightsInternal, { companyId, website: "ronins.co.uk" }) as Record<string, unknown> & { findings: Array<{ headline: string }> };
    expect(read.findings.map((entry) => entry.headline)).toEqual(["This week"]);
    expect((read.earlierStillOpen as Array<{ headline: string }>).map((entry) => entry.headline)).toEqual(["Still open"]);
    expect(read.pageDecisions).toMatchObject({ pages: 1, kept: 1, toActOn: [{ page: "/old-offer/", do: "redirect", into: "/working/", why: "Its old offer lives on at the working page.", decided_by: "the Page decisions specialist, on 2026-10-12" }] });
    expect(read.strategy).toMatchObject({ services: [{ page: "/app-developers-london/", call: "keep it steady", why: "Its London searches still bring work.", called_by: "the Head of Strategy, on 2026-10-12" }] });
    expect(read.screens).toMatchObject({ screens: [{ screen: "/app/insights/ai-search", says: "Named 12 times.", written_by: "the AI visibility specialist, in the week of 2026-10-12" }] });
  });
});
