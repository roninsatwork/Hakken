import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";

/**
 * A Hakken alert's page figures (review fixes, 18 November 2026): every country's, as the alerts set before that day
 * chose their numbers against, never the main home country's that Search Console's Pages shows since then — More
 * Handles' home page had about 396 clicks from every country in October against 184 from the UK, so an alert would fire
 * with nothing changed. Ask Hakken's chart of a page is the home country's, as the Pages it links to. Google faked at the
 * network.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(3)).toString("base64");
const PAGE = "https://ronins.test/services/";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Ask = { dimensions: string[]; dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; expression: string }> }> };
const countryOf = (ask: Ask) => ask.dimensionFilterGroups?.flatMap((group) => group.filters).find((filter) => filter.dimension === "country")?.expression;

/** Google, faked: the page's days, 9 clicks a day from every country and 4 from the UK, as Google answers each. */
function fakeGoogle() {
  const asks: Ask[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) return new Response("Not in this test", { status: 500 });
    const ask = JSON.parse(String(init?.body)) as Ask & { startDate: string; endDate: string };
    asks.push(ask);
    const clicks = countryOf(ask) === "gbr" ? 4 : 9;
    const rows = [];
    for (let day = ask.startDate; day <= ask.endDate; day = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      rows.push({ keys: [day], clicks, impressions: clicks * 10, ctr: 0.1, position: 4 });
    }
    return Response.json({ rows });
  }));
  return asks;
}

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: "Ronins Agency", createdAt: now });
    const owner = await ctx.db.insert("users", { name: "Anthony Basker", email: "anthony@ronins.test", role: "USER", companyId, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: "ronins.test", displayHost: "ronins.test", firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: now });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:ronins.test", dataProperty: "sc-domain:ronins.test",
      mainCountry: "gbr", oldestDay: "2026-09-20", newestDay: "2026-09-26", createdAt: now, updatedAt: now,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    return { companyId, owner, siteId };
  });
}

beforeEach(() => {
  useFixedDay("2026-09-27");
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a page's figures for an alert, and for a chart", () => {
  test("an alert's are every country's, asked of no country; a chart's the main home country's", async () => {
    const t = harness();
    const seeded = await seed(t);
    const asks = fakeGoogle();
    const target = { companyWebsiteId: seeded.siteId, website: "ronins.test", page: PAGE };
    const every = await t.action(internal.hakkenTaskFigures.targetDaysInternal, { companyId: seeded.companyId, target, from: "2026-09-24", to: "2026-09-26", countries: "EVERY" });
    expect(every).toEqual({ ok: true, days: ["2026-09-24", "2026-09-25", "2026-09-26"].map((day) => ({ day, clicks: 9, impressions: 90 })) });
    expect(countryOf(asks[0])).toBeUndefined();
    const home = await t.action(internal.hakkenTaskFigures.targetDaysInternal, { companyId: seeded.companyId, target, from: "2026-09-26", to: "2026-09-26", countries: "HOME" });
    expect(home).toEqual({ ok: true, days: [{ day: "2026-09-26", clicks: 4, impressions: 40 }] });
    expect(countryOf(asks[1])).toBe("gbr");
  });

  test("the Watcher judges a page alert on every country's figures, as its numbers were chosen", async () => {
    const t = harness();
    const seeded = await seed(t);
    const asks = fakeGoogle();
    // An alert set before 18 November against every country's clicks: fewer than 6 a day. The UK's 4 would meet it.
    const taskId = await t.mutation(internal.hakkenTasks.createInternal, {
      companyId: seeded.companyId, userId: seeded.owner, kind: "ALERT", title: "Tell me if /services/ gets fewer than 6 visitors a day",
      measure: "visitors", target: { companyWebsiteId: seeded.siteId, website: "ronins.test", page: PAGE }, condition: { op: "below", value: 6, days: 1 }, usual: 9,
      channels: { bell: true, email: false, telegram: false },
    });
    await t.run((ctx) => ctx.db.patch(taskId, { nextCheckAt: Date.now() - 1 }));
    await t.action(internal.hakkenWatcherActions.watchDue, {});
    await finishScheduled(t);
    const checks = await t.run((ctx) => ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", taskId)).take(10));
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((check) => check.value === 9 && !check.met)).toBe(true);
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((ask) => countryOf(ask) === undefined)).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("notifications").take(5))).toEqual([]);
  });
});
