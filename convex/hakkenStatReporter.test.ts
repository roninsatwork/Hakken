import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderOutboxRow } from "./outboxTemplates";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The Stat Report Agent's round (docs/plans/active/hakken-tasks-plan.md, item
 * 4.1, board EmailReportB): each report whose owner's day and time have come
 * reads the website's Pages list over the newest 7 days against the 7 before,
 * picks the pages that moved its way, and sends them to its owner.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

afterEach(() => {
  vi.useRealTimers();
});

const NEWEST = "2026-09-26";

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const owner = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      oldestDay: "2026-06-01", newestDay: NEWEST, createdAt: now, updatedAt: now,
    });
    // The newest 7 days and the 7 before, as the Pages list keeps them ready.
    const pages = ["https://ronins.test/a/", "https://ronins.test/b/", "https://ronins.test/c/", "https://ronins.test/d/"];
    for (const [which, clicks, from, to] of [["NOW", [412, 188, 50, 141], "2026-09-20", NEWEST], ["BEFORE", [508, 249, 20, 171], "2026-09-13", "2026-09-19"]] as const) {
      await ctx.db.insert("searchConsolePeriods", {
        companyWebsiteId: siteId, searchType: "web", list: "page", period: "7", which, part: 0, from, to,
        keys: pages, clicks: [...clicks], impressions: clicks.map((count) => count * 20), positionSums: clicks.map((count) => count * 20 * 4),
        counts: pages.map(() => 1), tops: pages, builtAt: 1,
      });
    }
    return { companyId, owner, siteId };
  });
}

async function mondayReport(t: Harness, seeded: Awaited<ReturnType<typeof seed>>) {
  const taskId = await t.mutation(internal.hakkenTasks.createInternal, {
    companyId: seeded.companyId, userId: seeded.owner, kind: "REPORT", title: "Every Monday, send me the two pages that lost the most visitors",
    measure: "visitors", target: { companyWebsiteId: seeded.siteId, website: "ronins.test" },
    report: { look: "pagesChange", direction: "lost", count: 2, every: "week", weekday: 1 },
    channels: { bell: true, email: true, telegram: false },
  });
  await t.run((ctx) => ctx.db.patch(taskId, { nextCheckAt: Date.now() - 1 }));
  return taskId;
}

async function round(t: Harness) {
  vi.useFakeTimers();
  await t.action(internal.hakkenStatReporter.reportDue, {});
  await finishScheduled(t);
  vi.useRealTimers();
}

describe("The Stat Report Agent's round", () => {
  test("sends the pages that lost the most to the report's owner, by email and in the bell, then waits for next week", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await mondayReport(t, seeded);

    await round(t);

    const [email] = await t.run((ctx) => ctx.db.query("outboxMessages").collect());
    expect(email).toMatchObject({ messageType: "TASK_REPORT", userId: seeded.owner, idempotencyKey: `TASK_REPORT:${taskId}:${NEWEST}` });
    const rendered = await t.run((ctx) => renderOutboxRow(ctx, email));
    if (!("email" in rendered)) throw new Error(rendered.skip);
    expect(rendered.email.subject).toBe("Your Monday report: 157 fewer visitors on 2 pages");
    for (const said of [">MONDAY REPORT · RONINS.TEST<", ">−157<", ">visitors from Google, across these 2 pages<", ">/a/", ">−96<", ">412 visitors in these 7 days<", ">/b/", ">−61<", ">See all your pages<"]) {
      expect(rendered.email.html).toContain(said);
    }
    expect(rendered.email.html).not.toContain(">/c/");
    expect(rendered.email.html).toContain(">20 September to 26 September, against the 7 days before.<");

    const [notification] = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notification).toMatchObject({ kind: "HAKKEN_TASK_REPORT", title: "Your Monday report is ready", href: `/app/search-console/${seeded.siteId}/pages` });
    const task = await t.run((ctx) => ctx.db.get(taskId));
    expect(task?.nextCheckAt).toBeGreaterThan(Date.now());

    // Its next Monday has not come: a second round leaves it alone.
    await round(t);
    expect(await t.run((ctx) => ctx.db.query("outboxMessages").collect())).toHaveLength(1);
  });

  test("the Watcher never sends a report, and a paused report is not sent", async () => {
    const t = harness();
    const seeded = await seed(t);
    const taskId = await mondayReport(t, seeded);
    vi.useFakeTimers();
    await t.action(internal.hakkenWatcherActions.watchDue, {});
    await finishScheduled(t);
    vi.useRealTimers();
    expect(await t.run((ctx) => ctx.db.query("outboxMessages").collect())).toEqual([]);

    await t.run((ctx) => ctx.db.patch(taskId as Id<"hakkenTasks">, { state: "PAUSED" }));
    await round(t);
    expect(await t.run((ctx) => ctx.db.query("outboxMessages").collect())).toEqual([]);
  });

  test("its agent is named as Anthony named it", async () => {
    const t = harness();
    await t.mutation(internal.hakkenStatReporter.ensureStatReporterInternal, {});
    const agent = await t.run((ctx) => ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "HAKKEN_STAT_REPORTER")).first());
    expect(agent?.name).toBe("The Stat Report Agent");
  });
});
