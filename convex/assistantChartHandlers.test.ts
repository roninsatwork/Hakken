import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ASSISTANT_CHART_HANDLERS } from "./assistantChartHandlers";
import schema from "./schema";
import type { AnswerChart } from "./utils/assistantCharts";

/**
 * The Assistant's chart (docs/plans/active/hakken-tasks-plan.md, item 2.1):
 * drawn from the figures Search Console collection keeps, never the model's,
 * against as many days before, and only where Google gives the figures.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const own = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId: own, relationship: "OWNED", createdAt: now });
    const rival = await ctx.db.insert("websites", { host: "rival.test", displayHost: "rival.test", firstSeenAt: now });
    await ctx.db.insert("companyWebsites", { companyId, websiteId: rival, relationship: "TRACKED", againstWebsiteId: own, createdAt: now });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId: own, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      oldestDay: "2026-08-20", newestDay: "2026-09-30", createdAt: now, updatedAt: now,
    });
    // Every day from 20 August to 30 September: 10 visitors in August, 20 in September.
    for (let day = Date.UTC(2026, 7, 20); day <= Date.UTC(2026, 8, 30); day += 86_400_000) {
      const key = new Date(day).toISOString().slice(0, 10);
      const clicks = key < "2026-09-01" ? 10 : 20;
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: key, clicks, impressions: clicks * 30, ctr: 0.03, position: 6, fetchedAt: now });
    }
    return { companyId, siteId };
  });
}

/** The runtime's part, as a handler sees it: each call sent to the test's backend. */
function runtime(t: Harness): ToolHandlerExecutionInput["ctx"] {
  type Call = (reference: unknown, args: unknown) => Promise<unknown>;
  const loose = t as unknown as { query: Call; mutation: Call; action: Call };
  return {
    runQuery: (reference: unknown, args: unknown) => loose.query(reference, args),
    runMutation: (reference: unknown, args: unknown) => loose.mutation(reference, args),
    runAction: (reference: unknown, args: unknown) => loose.action(reference, args),
  } as unknown as ToolHandlerExecutionInput["ctx"];
}

type Drawn = { ok: boolean; problem?: string; total?: number; theDaysBefore?: { total: number }; chart?: AnswerChart; note?: string };

async function draw(t: Harness, companyId: ToolHandlerExecutionInput["companyId"], args: Record<string, unknown>) {
  return (await ASSISTANT_CHART_HANDLERS["assistant.chart"]({ ctx: runtime(t), handlerMapping: "assistant.chart", args, companyId })) as Drawn;
}

describe("a chart the Assistant asks for", () => {
  test("a calendar month against the month before, as far back as Search Console holds", async () => {
    const t = harness();
    const { companyId, siteId } = await seed(t);
    const drawn = await draw(t, companyId, { lookup: "search_console", website: "ronins.test", measure: "visitors", month: "2026-09" });
    expect(drawn.ok).toBe(true);
    expect(drawn.total).toBe(600);
    // August is held only from the 20th: twelve days of 10.
    expect(drawn.theDaysBefore?.total).toBe(120);
    const chart = drawn.chart!;
    expect(chart).toMatchObject({ look: "searchConsoleDays", measure: "visitors", website: "ronins.test", from: "2026-09-01", to: "2026-09-30", beforeFrom: "2026-08-01", beforeTo: "2026-08-31", link: `/app/search-console/${siteId}` });
    expect(chart.points).toHaveLength(30);
    expect(chart.points[0]).toEqual({ day: "2026-09-01", value: 20 });
    expect(chart.points[19]).toEqual({ day: "2026-09-20", value: 20, before: 10 });
    expect(drawn.note).toContain("{{chart}}");
  });

  test("the newest 7 days of impressions against the 7 before them", async () => {
    const t = harness();
    const { companyId } = await seed(t);
    const chart = (await draw(t, companyId, { website: "ronins.test", measure: "impressions", days: 7 })).chart!;
    expect(chart).toMatchObject({ from: "2026-09-24", to: "2026-09-30", beforeFrom: "2026-09-17", beforeTo: "2026-09-23" });
    expect(chart.points.map((point) => [point.value, point.before])).toEqual(Array(7).fill([600, 600]));
  });

  test("says plainly what it cannot draw", async () => {
    const t = harness();
    const { companyId } = await seed(t);
    expect((await draw(t, companyId, { website: "rival.test" })).problem).toMatch(/competitor/);
    expect((await draw(t, companyId, { website: "elsewhere.test" })).problem).toMatch(/not one of this company's websites/);
    expect((await draw(t, companyId, { website: "ronins.test", measure: "position" })).problem).toMatch(/visitors from Google/);
    expect((await draw(t, companyId, { website: "ronins.test", month: "September" })).problem).toMatch(/YYYY-MM/);
    expect((await draw(t, companyId, { website: "ronins.test", month: "2026-10" })).problem).toMatch(/no figures for 2026-10 yet/);
    expect((await draw(t, companyId, { website: "ronins.test", lookup: "rankings" })).problem).toMatch(/search_console/);
    expect((await draw(t, undefined, { website: "ronins.test" })).problem).toMatch(/no company/);
  });
});
