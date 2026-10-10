import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { encryptConnectorToken } from "./connectorTokenCrypto";

/**
 * Search Console's Changes and Breakdowns reads (docs/plans/active/
 * search-console-plan.md §13.3): New and lost from when each keyword was
 * first and last shown, Google updates against the website's day totals,
 * the website's click rate at each position, its brand words, and the pages
 * shown in each kind of rich result — asked of Google, faked at the network.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const NEWEST = "2026-09-26";
const OLDEST = "2026-06-29";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(Date.parse("2026-09-28T09:00:00Z"));
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup(role: "USER" | "SUPER_ADMIN" = "USER") {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Reader", email: "reader@acme-shop.test", role, companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: "sc-domain:acme-shop.test", dataProperty: "sc-domain:acme-shop.test",
      newestDay: NEWEST, oldestDay: OLDEST, createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    return { companyId, userId, websiteId, siteId };
  });
  return { t, ...ids, reader: t.withIdentity({ subject: ids.userId }) };
}

const seen = (t: Harness, siteId: Id<"companyWebsites">, kind: "query" | "page", key: string, firstDay: string, lastDay: string) =>
  t.run(async (ctx) => await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind, key, firstDay, lastDay }));

async function period(t: Harness, siteId: Id<"companyWebsites">, period: "30" | "90", rows: [string, number, number, number][]) {
  await t.mutation(internal.searchConsolePeriods.writePeriodPart, {
    companyWebsiteId: siteId, searchType: "web", list: "query", period, which: "NOW", part: 0, from: "2026-06-29", to: NEWEST,
    keys: rows.map((row) => row[0]), clicks: rows.map((row) => row[1]), impressions: rows.map((row) => row[2]),
    positionSums: rows.map((row) => row[3] * row[2]), builtAt: 1,
  });
}

describe("New and lost", () => {
  test("keywords first shown in the dates, and those not shown for 14 days, with the page's counts and chart", async () => {
    const { t, siteId, reader } = await setup();
    // Watched from 29 June, so a keyword counts as new from 13 July.
    await seen(t, siteId, "query", "drain unblocking", "2026-09-20", NEWEST);
    await seen(t, siteId, "query", "seen from the start", OLDEST, NEWEST);
    await seen(t, siteId, "query", "boiler repair", "2026-07-20", "2026-09-05");
    await seen(t, siteId, "query", "still around", "2026-07-20", "2026-09-20");
    await seen(t, siteId, "page", "https://acme-shop.test/drains/", "2026-09-20", NEWEST);
    await period(t, siteId, "90", [["drain unblocking", 6, 200, 4.5], ["boiler repair", 3, 90, 12]]);

    const answer = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 });
    expect(answer.counts).toEqual({ newKeywords: 1, lostKeywords: 1, newPages: 1, lostPages: 0 });
    expect(answer.rows.map((row) => [row.key, row.status, row.when, row.clicks, row.band])).toEqual([
      ["drain unblocking", "new", "2026-09-20", 6, "4-10"],
      // Last shown on 5 September: lost 14 days later.
      ["boiler repair", "lost", "2026-09-19", 0, "11-20"],
    ]);
    expect(answer.watchedFrom).toBe("2026-07-13");
    const lostOnly = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", what: "lost", page: 1, rows: 25 });
    expect(lostOnly.rows.map((row) => row.key)).toEqual(["boiler repair"]);
    // The chart draws the dates chosen, in their step (2026-10-04): the same keywords the counts hold.
    expect(answer.periods[0]).toEqual({ start: "2026-08-24", lastDay: "2026-08-30", gained: 0, lost: 0 });
    expect(answer.periods.at(-1)?.lastDay).toBe(NEWEST);
    expect(answer.periods.find((entry) => entry.start === "2026-09-14")).toEqual({ start: "2026-09-14", lastDay: "2026-09-20", gained: 1, lost: 1 });
    const byDay = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-09-15", to: "2026-09-21", step: "day", page: 1, rows: 25 });
    expect(byDay.periods.map((entry) => [entry.start, entry.gained, entry.lost])).toEqual([
      ["2026-09-15", 0, 0], ["2026-09-16", 0, 0], ["2026-09-17", 0, 0], ["2026-09-18", 0, 0], ["2026-09-19", 0, 1], ["2026-09-20", 1, 0], ["2026-09-21", 0, 0],
    ]);
    const byMonth = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "month", page: 1, rows: 25 });
    expect(byMonth.periods.map((entry) => [entry.start, entry.lastDay, entry.gained, entry.lost])).toEqual([
      ["2026-08-01", "2026-08-31", 0, 0], ["2026-09-01", NEWEST, 1, 1],
    ]);

    const otherReader = t.withIdentity({ subject: await t.run(async (ctx) => await ctx.db.insert("users", {
      name: "Rival", email: "rival@rival.test", role: "USER", companyId: await ctx.db.insert("companies", { name: "Rival", createdAt: 1 }), createdAt: 1,
    })) });
    await expect(otherReader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 })).rejects.toThrow("not one your company holds");
  });
});

describe("New and lost, past the list's limit (2026-10-04)", () => {
  test("its counts and chart take every one from the counts by day; the table keeps its limit", async () => {
    const { t, siteId, reader } = await setup();
    await seen(t, siteId, "query", "drain unblocking", "2026-09-20", NEWEST);
    await seen(t, siteId, "query", "boiler repair", "2026-07-20", "2026-09-05");
    await t.run(async (ctx) => {
      const day = (kind: "query" | "page", date: string, first: number, last: number) =>
        ctx.db.insert("searchConsoleSeenDays", { companyWebsiteId: siteId, kind, day: date, first, last, builtAt: 1 });
      // Far more than the 5,000 its list reads, as a busy website has.
      await day("query", "2026-07-20", 1_500, 0);
      await day("query", "2026-09-05", 0, 6_200);
      await day("query", "2026-09-20", 4_800, 0);
      await day("page", "2026-09-20", 7, 0);
    });
    const answer = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-07-01", to: NEWEST, step: "month", page: 1, rows: 25 });
    // Watched from 13 July, so July's 1,500 count; lost 14 days after 5 September.
    expect(answer.counts).toEqual({ newKeywords: 6_300, lostKeywords: 6_200, newPages: 7, lostPages: 0 });
    expect(answer.periods.map((period) => [period.start, period.gained, period.lost])).toEqual([
      ["2026-07-01", 1_500, 0], ["2026-08-01", 0, 0], ["2026-09-01", 4_800, 6_200],
    ]);
    // The table lists the register's own rows, as before.
    expect(answer.rows.map((row) => `${row.status} ${row.key}`).sort()).toEqual(["lost boiler repair", "new boiler repair", "new drain unblocking"]);
  });
});

describe("New and lost, by kind of result (drift fixes, 2026-10-03)", () => {
  test("web results read the rows that carry no kind; other kinds say New and lost is kept for web only (store less round two, F)", async () => {
    const { t, siteId, reader } = await setup();
    await seen(t, siteId, "query", "drain unblocking", "2026-09-20", NEWEST);
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, searchType: "image", kind: "query", key: "drain photos", firstDay: "2026-09-21", lastDay: NEWEST });
    });
    const ask = { siteId, from: "2026-08-28", to: NEWEST, step: "week" as const, page: 1, rows: 25 };
    const web = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { ...ask, searchType: "web" });
    const image = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { ...ask, searchType: "image" });
    expect(web.rows.map((row) => row.key)).toEqual(["drain unblocking"]);
    expect(image).toMatchObject({ notKept: true, rows: [] });
  });

  test("a changed lost-after limit moves when a keyword counts as lost", async () => {
    const { t, siteId, companyId, reader } = await setup();
    await seen(t, siteId, "query", "boiler repair", "2026-07-20", "2026-09-05");
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, consoleLostAfterDays: 7, updatedAt: 1 });
    });
    const answer = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 });
    // Last shown on 5 September: lost 7 days later.
    expect(answer.rows.map((row) => [row.key, row.status, row.when])).toEqual([["boiler repair", "lost", "2026-09-12"]]);
  });
});

describe("New and lost, on a busy day", () => {
  test("more keywords first shown on one day than one read holds are all counted", async () => {
    const { t, siteId, reader } = await setup();
    await t.run(async (ctx) => {
      for (let index = 0; index < 520; index += 1) {
        await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind: "query", key: `search ${index}`, firstDay: "2026-09-20", lastDay: NEWEST });
      }
      await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind: "query", key: "the day before", firstDay: "2026-09-19", lastDay: NEWEST });
    });
    const answer = await reader.query(api.searchConsoleChanges.searchConsoleNewLost, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST, step: "week", page: 1, rows: 25 });
    expect(answer.counts.newKeywords).toBe(521);
    expect(answer.total).toBe(521);
  });
});

describe("Google updates", () => {
  test("each update's 14 days before against the 14 after it finished; one still rolling out, or finished too lately, has no after", async () => {
    const { t, siteId, reader } = await setup();
    await t.run(async (ctx) => {
      for (let day = 0; day < 90; day += 1) {
        const date = new Date(Date.parse(`${OLDEST}T00:00:00Z`) + day * 86_400_000).toISOString().slice(0, 10);
        // Ten clicks a day before 1 August, twenty after.
        const clicks = date < "2026-08-01" ? 10 : 20;
        await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day: date, clicks, impressions: 100, ctr: clicks / 100, position: date < "2026-08-01" ? 12 : 9, fetchedAt: 1 });
      }
      const update = (titleEn: string, startedOn: string, finishedOn?: string) => ctx.db.insert("googleUpdates", {
        titleEn, descriptionEn: `${titleEn}, as Google said it.`, startedOn, ...(finishedOn ? { finishedOn } : {}), url: "https://status.search.google.com/", createdAt: 1, updatedAt: 1,
      });
      await update("July 2026 core update", "2026-07-20", "2026-07-31");
      await update("September 2026 spam update", "2026-09-20", "2026-09-22");
      await update("Rolling update", "2026-09-24");
      await update("Before the days held", "2026-05-01", "2026-05-10");
    });
    const answer = await reader.query(api.searchConsoleChanges.searchConsoleUpdates, { siteId, searchType: "web", language: "en", from: "2025-10-01", to: NEWEST });
    // The dates chosen, cut to the days held.
    expect([answer.from, answer.to]).toEqual([OLDEST, NEWEST]);
    expect(answer.updates.map((update) => [update.title, update.state, update.before?.clicks ?? null, update.after?.clicks ?? null])).toEqual([
      ["July 2026 core update", "done", 140, 280],
      ["September 2026 spam update", "waiting", 280, null],
      ["Rolling update", "rolling", 280, null],
    ]);
    expect(answer.updates[0].before?.position).toBe(12);
    expect(answer.updates[0].after?.position).toBe(9);

    // Only the updates that began in the dates (2026-10-04), each still compared on days outside them.
    const july = await reader.query(api.searchConsoleChanges.searchConsoleUpdates, { siteId, searchType: "web", language: "en", from: "2026-07-15", to: "2026-07-25" });
    expect([july.from, july.to]).toEqual(["2026-07-15", "2026-07-25"]);
    expect(july.updates.map((update) => [update.title, update.before?.clicks ?? null, update.after?.clicks ?? null])).toEqual([["July 2026 core update", 140, 280]]);
    const none = await reader.query(api.searchConsoleChanges.searchConsoleUpdates, { siteId, searchType: "web", language: "en", from: "2025-01-01", to: "2025-02-01" });
    expect(none).toEqual({ from: null, to: null, updates: [], live: false });
  });
});

describe("Position bands and Brand charts, in the dates and step chosen (2026-10-04)", () => {
  const row = (siteId: Id<"companyWebsites">, grain: "DAY" | "WEEK" | "MONTH" | undefined, week: string, top3: number, days?: number) => ({
    companyWebsiteId: siteId, searchType: "web" as const, ...(grain ? { grain } : {}), week, ...(days === undefined ? {} : { days }),
    top3, top10: 0, top20: 0, rest: 0, brandClicks: top3, otherClicks: 0, builtAt: 1,
  });
  const ask = (siteId: Id<"companyWebsites">, from: string, step: "day" | "week" | "month") => ({ siteId, searchType: "web" as const, from, to: NEWEST, step });

  test("the days, weeks or months touching the dates, a part-week marked by its days", async () => {
    const { t, siteId, reader } = await setup();
    await t.run(async (ctx) => {
      for (const day of ["2026-09-19", "2026-09-20", "2026-09-21", NEWEST]) await ctx.db.insert("searchConsoleWeeks", row(siteId, "DAY", day, 1, 1));
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "WEEK", "2026-09-14", 2, 7));
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "WEEK", "2026-09-21", 3, 6));
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "MONTH", "2026-09-01", 4, 26));
      // Built before 2026-10-04: no grain, so a week, and its days worked out.
      await ctx.db.insert("searchConsoleWeeks", row(siteId, undefined, "2026-08-31", 5));
    });
    const weeks = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-15", "week"));
    expect(weeks).toMatchObject({ step: "week", byWeek: false, reach: null, notBuilt: false });
    expect(weeks.periods.map((period) => [period.start, period.lastDay, period.days, period.length, period.top3])).toEqual([
      ["2026-09-14", "2026-09-20", 7, 7, 2],
      ["2026-09-21", NEWEST, 6, 7, 3],
    ]);
    const older = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-01", "week"));
    expect(older.periods.map((period) => [period.start, period.days])).toEqual([["2026-08-31", 7], ["2026-09-14", 7], ["2026-09-21", 6]]);
    const days = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-20", "day"));
    expect(days.periods.map((period) => period.start)).toEqual(["2026-09-20", "2026-09-21", NEWEST]);
    const months = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-20", "month"));
    expect(months.periods.map((period) => [period.start, period.lastDay, period.days, period.length])).toEqual([["2026-09-01", NEWEST, 26, 30]]);
  });

  test("daily dates reaching past the 60 days kept as days are drawn by week; past the charts' weeks, from the first of them", async () => {
    const { t, siteId, companyId, reader } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "DAY", NEWEST, 1, 1));
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "WEEK", "2026-09-21", 1, 6));
      // Held from the 60-day line itself (keep-less-history-plan.md, part 3).
      const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first();
      await ctx.db.patch(connection!._id, { oldestDay: "2026-07-29" });
    });
    // Nothing older is held by week, so days stay days.
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-06-01", "day"))).toMatchObject({ step: "day", byWeek: false });
    await t.run(async (ctx) => {
      const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first();
      await ctx.db.patch(connection!._id, { oldestDay: "2026-03-02" });
    });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-20", "day"))).toMatchObject({ step: "day", byWeek: false });
    const reaching = await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-06-01", "day"));
    expect(reaching).toMatchObject({ step: "week", byWeek: true, reach: "2026-06-08", chartWeeks: 16 });
    expect(reaching.periods.map((period) => period.start)).toEqual(["2026-09-21"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("fanOutLimits", { companyId, companyWebsiteId: siteId, consoleChartWeeks: 8, updatedAt: 1 });
    });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-08-10", "week"))).toMatchObject({ reach: null, chartWeeks: 8 });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-07-01", "week"))).toMatchObject({ reach: "2026-08-03", chartWeeks: 8 });
  });

  test("weekly dates reaching past the six months kept as weeks are drawn by month (store less round two)", async () => {
    const { t, siteId, reader } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "WEEK", "2026-09-21", 1, 6));
      await ctx.db.insert("searchConsoleWeeks", row(siteId, "MONTH", "2026-09-01", 1, 26));
      const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", siteId)).first();
      await ctx.db.patch(connection!._id, { oldestDay: "2025-10-01" });
    });
    // Inside the six months: weeks.
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-06-01", "week"))).toMatchObject({ step: "week", byMonth: false });
    // Reaching before 2026-03-27, six months before the newest day: months, and so for days reaching that far.
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-01-01", "week"))).toMatchObject({ step: "month", byMonth: true });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-01-01", "day"))).toMatchObject({ step: "month", byWeek: true, byMonth: true });
  });

  test("a step not built yet says so, rather than drawing nothing", async () => {
    const { t, siteId, reader } = await setup();
    await t.run(async (ctx) => await ctx.db.insert("searchConsoleWeeks", row(siteId, undefined, "2026-09-21", 1)));
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-20", "month"))).toMatchObject({ periods: [], notBuilt: true });
    expect(await reader.query(api.searchConsolePeriods.searchConsoleChartFigures, ask(siteId, "2026-09-20", "week"))).toMatchObject({ notBuilt: false });
  });
});

describe("Click rate by position and brand words", () => {
  test("the website's own rate at each whole position, from a ready-made period; other dates are the page's to work out", async () => {
    const { t, siteId, reader } = await setup();
    await period(t, siteId, "30", [["a", 18, 100, 1.2], ["b", 2, 100, 0.9], ["c", 1, 50, 7.4], ["far", 0, 500, 44]]);
    const curve = await reader.query(api.searchConsoleChanges.searchConsoleCurve, { siteId, searchType: "web", from: "2026-08-28", to: NEWEST });
    expect(curve).toEqual({
      live: false,
      preparing: false,
      points: [
        { position: 1, keywords: 2, impressions: 200, clicks: 20, ctr: 0.1 },
        { position: 7, keywords: 1, impressions: 50, clicks: 1, ctr: 0.02 },
      ],
    });
    expect(await reader.query(api.searchConsoleChanges.searchConsoleCurve, { siteId, searchType: "web", from: "2026-09-01", to: "2026-09-10" })).toMatchObject({ live: true, points: [] });
  });

  test("the brand words come from the website's Profile; only the platform's team is offered the way to change them", async () => {
    const user = await setup();
    await user.t.run(async (ctx) => await ctx.db.insert("holdProfiles", {
      companyWebsiteId: user.siteId, companyId: user.companyId, websiteId: user.websiteId,
      brandNames: [{ name: "Acme", isPrimary: true }, { name: "Akme", isPrimary: false, kind: "MISSPELLING" }], hasBrandNames: true, updatedAt: 1,
    }));
    expect(await user.reader.query(api.searchConsoleChanges.searchConsoleBrandWords, { siteId: user.siteId })).toEqual({ names: ["Acme", "Akme"], profileHref: null });
    const team = await setup("SUPER_ADMIN");
    expect((await team.reader.query(api.searchConsoleChanges.searchConsoleBrandWords, { siteId: team.siteId })).profileHref)
      .toBe(`/admin/companies/${team.companyId}/websites/site/${team.siteId}/profile`);
  });
});

describe("Rich results", () => {
  test("the pages Google showed in each kind of rich result, asked one kind at a time", async () => {
    const { siteId, reader } = await setup();
    const asks: Array<{ dimensions: string[]; dimensionFilterGroups: Array<{ filters: Array<{ dimension: string; expression: string }> }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const ask = JSON.parse(String(init?.body)) as (typeof asks)[number];
      asks.push(ask);
      const kind = ask.dimensionFilterGroups[0].filters[0].expression;
      return Response.json({ rows: Array.from({ length: kind === "REVIEW_SNIPPET" ? 3 : 1 }, (_, index) => ({ keys: [`https://acme-shop.test/${index}/`], clicks: 1, impressions: 1, ctr: 1, position: 1 })) });
    }));
    const answer = await reader.action(api.searchConsoleLists.searchConsoleAppearancePages, {
      siteId, searchType: "web", from: "2026-08-28", to: NEWEST, kinds: ["REVIEW_SNIPPET", "VIDEO"],
    });
    expect(answer).toEqual({ ok: true, pages: [{ kind: "REVIEW_SNIPPET", pages: 3 }, { kind: "VIDEO", pages: 1 }] });
    expect(asks.map((ask) => [ask.dimensions.join("+"), ask.dimensionFilterGroups[0].filters[0].dimension])).toEqual([["page", "searchAppearance"], ["page", "searchAppearance"]]);
  });
});
