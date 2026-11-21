import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { pageChecksOnFor } from "./searchConsolePageChecks";
import { checkFrom, countsMoved, DAILY_CHECKS, GOOGLE_DAILY_CHECKS, googleDay, googleDayStart, refusalOf, restDoneBy } from "./utils/pageIndexChecks";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";

/**
 * Search Console's page checks (search-console-indexing-v1-plan-2026-11-18.md, "Reads, and the new collector"), end to
 * end with Google faked at the network, so no test asks the real one: the pages in the plan's order, the daily limit,
 * the stop on a refusal, a page Google fails on waiting its turn, and the steps handing on. Steps of two pages here,
 * so a few pages show the hand-on, and a save every eight asks, so a piece of the website's list shows its slices.
 */
vi.mock("./utils/pageIndexChecks", async (importOriginal) => ({ ...(await importOriginal<typeof import("./utils/pageIndexChecks")>()), CHECKS_A_STEP: 2, CHECKS_SAVED_EVERY: 8 }));

const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const DAY = "2026-11-18";
const PROPERTY = "sc-domain:acme-shop.test";
const ORIGIN = "https://www.acme-shop.test";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Page = { page: string; clicks?: number; shown?: boolean; sitemap?: boolean };
type Answer = { coverageState: string; verdict?: string; lastCrawlTime?: string; sitemap?: string[]; referringUrls?: string[]; googleCanonical?: string };

/**
 * Google's URL inspection, faked: each link's answer, or a refusal from the ask named on; the links asked, in order.
 * `onAsk` is told of each ask as it's made, before it's answered.
 */
function fakeGoogle(answers: Record<string, Answer | { status: number; detail?: string }> = {}, refuseFrom?: { ask: number; status: number; detail: string }, onAsk?: () => Promise<void>) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!url.endsWith("/v1/urlInspection/index:inspect")) throw new Error(`Unexpected fetch in test: ${url}`);
    const body = JSON.parse(String(init?.body)) as { inspectionUrl: string; siteUrl: string };
    expect(body.siteUrl).toBe(PROPERTY);
    asked.push(body.inspectionUrl);
    if (onAsk) await onAsk();
    if (refuseFrom && asked.length >= refuseFrom.ask) return new Response(refuseFrom.detail, { status: refuseFrom.status });
    const path = body.inspectionUrl.replace(ORIGIN, "");
    const answer = answers[path] ?? { coverageState: "Submitted and indexed", verdict: "PASS", lastCrawlTime: "2026-11-16T09:00:00Z" };
    if ("status" in answer) return new Response(answer.detail ?? "Internal error encountered.", { status: answer.status });
    return Response.json({ inspectionResult: { indexStatusResult: { verdict: "NEUTRAL", ...answer } } });
  }));
  return asked;
}

/** A company's own website, connected, with the pages its own list knows and the pages Google showed lately on www. */
async function setup(pages: Page[]) {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Reader", email: "reader@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY,
      newestDay: "2026-11-16", oldestDay: "2026-08-18", mainCountry: "gbr", createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    for (const page of pages) {
      await ctx.db.insert("holdPages", {
        companyWebsiteId: siteId, page: page.page, crawled: !page.shown, shown: page.shown ?? true, clicks: page.clicks ?? 0, ranks: false,
        ...(page.sitemap ? { sitemapFile: "https://www.acme-shop.test/sitemap.xml" } : {}),
      });
    }
    // Google shows the website's pages on its www twin: the checks ask that, never the bare address.
    await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind: "page", key: `${ORIGIN}/`, firstDay: "2026-09-01", lastDay: "2026-11-16" });
    return { companyId, userId, siteId, connectionId };
  });
  return { t, ...ids };
}

/** The day's checks started, and every step run to its end. */
async function runChecks(t: Harness, siteId: Id<"companyWebsites">) {
  const started = await t.mutation(internal.searchConsolePageChecks.startPageChecks, { siteId });
  await finishScheduled(t);
  return started;
}

const checksOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("pageIndexChecks").withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", siteId)).take(100));
const dayOf = (t: Harness, siteId: Id<"companyWebsites">) =>
  t.run(async (ctx) => await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", siteId).eq("day", DAY)).unique());
const chainOf = (t: Harness, connectionId: Id<"searchConsoleConnections">) =>
  t.run(async (ctx) => await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", `SC_CHECKS:${connectionId}`)).unique());

beforeEach(() => {
  useFixedDay(DAY);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
  vi.stubEnv("SEARCH_CONSOLE_PAGE_CHECKS", "on");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the limits and Google's day", () => {
  test("1,600 checks a day, a fifth of Google's 2,000 kept in hand", () => {
    expect(DAILY_CHECKS).toBe(1_600);
    expect(DAILY_CHECKS).toBe(GOOGLE_DAILY_CHECKS * 0.8);
  });

  test("Google's day is Pacific time's, beginning when its allowance comes back", () => {
    expect(googleDay(Date.parse("2026-11-18T07:59:00Z"))).toBe("2026-11-17");
    expect(googleDay(Date.parse("2026-11-18T08:00:00Z"))).toBe("2026-11-18");
    expect(googleDayStart(Date.parse("2026-11-18T12:00:00Z"))).toBe(Date.parse("2026-11-18T08:00:00Z"));
    // Summer time: seven hours behind.
    expect(googleDayStart(Date.parse("2026-07-01T12:00:00Z"))).toBe(Date.parse("2026-07-01T07:00:00Z"));
  });

  test("the rest are done by about a day for each day's checks they need", () => {
    expect(restDoneBy("2026-11-18", 0)).toBe("2026-11-18");
    expect(restDoneBy("2026-11-18", 1)).toBe("2026-11-19");
    expect(restDoneBy("2026-11-18", 20_471)).toBe("2026-12-01");
  });

  test("a refusal means the allowance, the sign-in, Google failing, or a page Google won't answer for", () => {
    expect(refusalOf({ reason: "BUSY", status: 429, detail: "Quota exceeded" })).toBe("ALLOWANCE");
    expect(refusalOf({ reason: "BUSY", status: 403, detail: "User rate limit exceeded" })).toBe("ALLOWANCE");
    expect(refusalOf({ reason: "ACCESS", status: 403, detail: "User does not have sufficient permission" })).toBe("SIGN_IN");
    expect(refusalOf({ reason: "EXPIRED", status: 401, detail: "" })).toBe("SIGN_IN");
    expect(refusalOf({ reason: "BUSY", status: 500, detail: "Internal error encountered." })).toBe("GOOGLE_ERROR");
    expect(refusalOf({ reason: "REFUSED", status: 400, detail: "URL not in property" })).toBe("REFUSED");
  });

  test("only where switched on: every website, or the websites named", () => {
    expect(pageChecksOnFor("hold_1", "")).toBe(false);
    expect(pageChecksOnFor("hold_1", "on")).toBe(true);
    expect(pageChecksOnFor("hold_1", "hold_2, hold_1")).toBe(true);
    expect(pageChecksOnFor("hold_1", "hold_2")).toBe(false);
  });
});

describe("Google's answer, as kept", () => {
  test("its words, verdict, last visit, chosen page, sitemap and a link from the website's own pages", () => {
    expect(checkFrom({ inspectionResult: { indexStatusResult: {
      coverageState: "Page with redirect", verdict: "NEUTRAL", lastCrawlTime: "2026-11-12T07:34:07Z", googleCanonical: "https://www.acme-shop.test/",
      sitemap: ["https://www.acme-shop.test/sitemap.xml"], referringUrls: ["https://elsewhere.test/links", "http://acme-shop.test/about"],
    } } }, "www.acme-shop.test")).toEqual({
      reason: "Page with redirect", verdict: "NEUTRAL", indexed: false, crawled: "2026-11-12", googleCanonical: "https://www.acme-shop.test/", userCanonical: null, inSitemap: true, linkedOwn: true,
    });
    expect(checkFrom({ inspectionResult: { indexStatusResult: { coverageState: "URL is unknown to Google", verdict: "NEUTRAL" } } }, "acme-shop.test"))
      .toMatchObject({ reason: "URL is unknown to Google", indexed: false, crawled: null, inSitemap: false, linkedOwn: false });
    expect(checkFrom({}, "acme-shop.test")).toBeNull();
  });

  test("each reason's count moves with a page's answer, never below none", () => {
    const counts = { reasons: [{ reason: "Not found (404)", pages: 1 }], indexed: 3 };
    expect(countsMoved(counts, { reason: "Not found (404)", indexed: false }, { reason: "Submitted and indexed", indexed: true })).toEqual({ reasons: [], indexed: 4 });
    expect(countsMoved(counts, null, { reason: "Soft 404", indexed: false }).reasons).toEqual([{ reason: "Not found (404)", pages: 1 }, { reason: "Soft 404", pages: 1 }]);
    expect(countsMoved(counts, { reason: null, indexed: false, problem: "GOOGLE_ERROR" }, null)).toEqual(counts);
  });
});

describe("the address the website really uses", () => {
  test("the weekly money-page check asks it too: the www twin Google shows, a web-address property's own, else the website's", async () => {
    const { t, siteId, connectionId } = await setup([{ page: "/", clicks: 10, shown: true }]);
    const originOf = async () => (await t.query(internal.moneyPageChecks.checkTargets, { holdId: siteId }))?.origin;
    expect(await originOf()).toBe(ORIGIN);
    await t.run(async (ctx) => {
      for (const entry of await ctx.db.query("searchConsoleSeen").withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", siteId)).take(10)) await ctx.db.delete(entry._id);
    });
    expect(await originOf()).toBe("https://acme-shop.test");
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { property: "https://shop.acme-shop.test/" }));
    expect(await originOf()).toBe("https://shop.acme-shop.test");
  });
});

describe("a day of page checks", () => {
  test("off until switched on: nothing is asked of Google", async () => {
    vi.stubEnv("SEARCH_CONSOLE_PAGE_CHECKS", "");
    const { t, siteId } = await setup([{ page: "/", clicks: 10 }]);
    const asked = fakeGoogle();
    expect(await runChecks(t, siteId)).toBe("OFF");
    expect(asked).toEqual([]);
    vi.stubEnv("SEARCH_CONSOLE_PAGE_CHECKS", `${siteId}`);
    expect(await runChecks(t, siteId)).toBe("STARTED");
    expect(asked).toEqual([`${ORIGIN}/`]);
  });

  test("never checked first, most clicks first; then the pages Google never showed; then the check longest ago; a page checked today waits", async () => {
    const { t, siteId } = await setup([
      { page: "/a", clicks: 50 }, { page: "/b", clicks: 5 }, { page: "/c", shown: false, sitemap: true }, { page: "/d", clicks: 20 }, { page: "/e" }, { page: "/f", clicks: 30 },
    ]);
    await t.run(async (ctx) => {
      const old = { reason: "Submitted and indexed", verdict: "PASS", indexed: true, crawled: "2026-11-01", googleCanonical: null, userCanonical: null, inSitemap: false, linkedOwn: false };
      await ctx.db.insert("pageIndexChecks", { companyWebsiteId: siteId, page: "/d", address: `${ORIGIN}/d`, ...old, checkedAt: Date.parse("2026-11-10T12:00:00Z") });
      // Checked this morning, Google's time: not again today.
      await ctx.db.insert("pageIndexChecks", { companyWebsiteId: siteId, page: "/f", address: `${ORIGIN}/f`, ...old, checkedAt: Date.parse("2026-11-18T09:00:00Z") });
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: "2026-11-17", reasons: [], indexed: 2, known: 6, asked: 2, failed: 0, updatedAt: 1 });
    });
    const asked = fakeGoogle({ "/b": { coverageState: "Not found (404)", lastCrawlTime: "2026-10-09T09:15:50Z" }, "/c": { coverageState: "Crawled - currently not indexed", sitemap: ["x"] } });
    expect(await runChecks(t, siteId)).toBe("STARTED");
    expect(asked).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`, `${ORIGIN}/e`, `${ORIGIN}/c`, `${ORIGIN}/d`]);
    const checks = await checksOf(t, siteId);
    expect(checks.find((row) => row.page === "/b")).toMatchObject({ reason: "Not found (404)", indexed: false, crawled: "2026-10-09", address: `${ORIGIN}/b` });
    expect(checks.find((row) => row.page === "/c")).toMatchObject({ reason: "Crawled - currently not indexed", inSitemap: true });
    // The whole count, carried on each day's row.
    expect(await dayOf(t, siteId)).toMatchObject({
      asked: 5, failed: 0, indexed: 4, reasons: [{ reason: "Crawled - currently not indexed", pages: 1 }, { reason: "Not found (404)", pages: 1 }],
    });
    // Every page has an answer from today: a second start asks nothing.
    expect(await runChecks(t, siteId)).toBe("STARTED");
    expect(asked).toHaveLength(5);
  });

  test("the steps hand on, each its own action, until the day's pages are done", async () => {
    const { t, siteId, connectionId } = await setup([
      { page: "/1", clicks: 9 }, { page: "/2", clicks: 8 }, { page: "/3", clicks: 7 }, { page: "/4", shown: false }, { page: "/5", shown: false },
    ]);
    const asked = fakeGoogle();
    await runChecks(t, siteId);
    expect(new Set(asked).size).toBe(5);
    expect(asked).toHaveLength(5);
    const chain = await chainOf(t, connectionId);
    // The pages Google shows, the pages it never showed, then a last look for checks older than today: three steps.
    expect(chain?.booking).toBe(3);
    expect(chain?.closedAt).toBeDefined();
  });

  test("never more than 1,600 asks in Google's day", async () => {
    const { t, siteId } = await setup([{ page: "/1", clicks: 5 }, { page: "/2", clicks: 4 }, { page: "/3", clicks: 3 }, { page: "/4", clicks: 2 }]);
    await t.run(async (ctx) => {
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: DAY, reasons: [], indexed: 0, known: 4, asked: DAILY_CHECKS - 2, failed: 0, updatedAt: 1 });
    });
    const asked = fakeGoogle();
    await runChecks(t, siteId);
    expect(asked).toEqual([`${ORIGIN}/1`, `${ORIGIN}/2`]);
    expect((await dayOf(t, siteId))?.asked).toBe(DAILY_CHECKS);
    expect(await runChecks(t, siteId)).toBe("DONE_TODAY");
    expect(asked).toHaveLength(2);
  });

  test("Google's allowance used up stops the day, with no ask made again, and the next start waits for tomorrow", async () => {
    const { t, siteId, connectionId } = await setup([{ page: "/1", clicks: 6 }, { page: "/2", clicks: 5 }, { page: "/3", clicks: 4 }, { page: "/4", clicks: 3 }, { page: "/5", clicks: 2 }, { page: "/6", clicks: 1 }]);
    const asked = fakeGoogle({}, { ask: 3, status: 429, detail: "Quota exceeded for quota metric 'URL inspection requests per day'" });
    await runChecks(t, siteId);
    // One round of four: two answered, two refused; nothing asked after.
    expect(asked).toHaveLength(4);
    expect((await checksOf(t, siteId)).map((row) => row.page).sort()).toEqual(["/1", "/2"]);
    expect(await dayOf(t, siteId)).toMatchObject({ stopped: "ALLOWANCE", asked: 4, failed: 2, indexed: 2 });
    expect((await chainOf(t, connectionId))?.closedAt).toBeDefined();
    expect(await runChecks(t, siteId)).toBe("DONE_TODAY");
    expect(asked).toHaveLength(4);
  });

  test("a token running out mid-round is renewed once, and every page asked with the old one is asked again: the day goes on", async () => {
    // Pages are asked four at once: when the hour's token runs out they all hear so together. Until 21 November 2026 only
    // the first was asked again and the day stopped as a sign-in problem (More Handles, 19 and 20 November).
    const { t, siteId } = await setup([{ page: "/1", clicks: 6 }, { page: "/2", clicks: 5 }, { page: "/3", clicks: 4 }, { page: "/4", clicks: 3 }, { page: "/5", clicks: 2 }, { page: "/6", clicks: 1 }]);
    const asked: string[] = [];
    let renewals = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        renewals += 1;
        return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
      }
      const body = JSON.parse(String(init?.body)) as { inspectionUrl: string };
      asked.push(body.inspectionUrl);
      // Only the renewed token is still good.
      if (new Headers(init?.headers).get("Authorization") !== "Bearer ya29.renewed") return new Response("Request had invalid authentication credentials.", { status: 401 });
      return Response.json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" } } });
    }));
    await runChecks(t, siteId);
    expect((await checksOf(t, siteId)).map((row) => row.page).sort()).toEqual(["/1", "/2", "/3", "/4", "/5", "/6"]);
    expect(await dayOf(t, siteId)).toMatchObject({ indexed: 6, failed: 0 });
    expect((await dayOf(t, siteId))?.stopped).toBeUndefined();
    // One renewal for the round, and the four asked with the old token asked once more.
    expect(renewals).toBe(1);
    expect(asked).toHaveLength(10);
  });

  test("a page Google fails on waits its turn with its last answer; a whole round failing stops the day", async () => {
    const { t, siteId } = await setup([{ page: "/1", clicks: 9 }, { page: "/2", clicks: 8 }, { page: "/3", clicks: 7 }, { page: "/4", clicks: 6 }, { page: "/5", clicks: 5 }]);
    const asked = fakeGoogle({ "/2": { status: 500 } });
    await runChecks(t, siteId);
    const checks = await checksOf(t, siteId);
    expect(checks.find((row) => row.page === "/2")).toMatchObject({ reason: null, problem: "GOOGLE_ERROR" });
    expect(await dayOf(t, siteId)).toMatchObject({ asked: 5, failed: 1, indexed: 4 });
    expect(asked).toHaveLength(5);

    const busy = await setup([{ page: "/1", clicks: 9 }, { page: "/2", clicks: 8 }, { page: "/3", clicks: 7 }, { page: "/4", clicks: 6 }, { page: "/5", clicks: 5 }]);
    const failing = fakeGoogle({}, { ask: 1, status: 503, detail: "The service is currently unavailable." });
    await runChecks(busy.t, busy.siteId);
    expect(failing).toHaveLength(4);
    expect(await dayOf(busy.t, busy.siteId)).toMatchObject({ stopped: "BUSY", asked: 4, failed: 4 });
  });

  test("a page the website's list no longer holds goes, with its count", async () => {
    const { t, siteId } = await setup([{ page: "/kept", clicks: 3 }]);
    await t.run(async (ctx) => {
      const found = { reason: "Not found (404)", verdict: "NEUTRAL", indexed: false, crawled: null, googleCanonical: null, userCanonical: null, inSitemap: false, linkedOwn: false };
      await ctx.db.insert("pageIndexChecks", { companyWebsiteId: siteId, page: "/gone", address: `${ORIGIN}/gone`, ...found, checkedAt: Date.parse("2026-11-01T12:00:00Z") });
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: "2026-11-17", reasons: [{ reason: "Not found (404)", pages: 1 }], indexed: 0, known: 2, asked: 1, failed: 0, updatedAt: 1 });
    });
    fakeGoogle();
    await runChecks(t, siteId);
    expect((await checksOf(t, siteId)).map((row) => row.page)).toEqual(["/kept"]);
    expect(await dayOf(t, siteId)).toMatchObject({ reasons: [], indexed: 1 });
  });

  test("a website disconnected, a competitor's or one with no sign-in asks nothing", async () => {
    const { t, siteId, connectionId } = await setup([{ page: "/", clicks: 1 }]);
    const asked = fakeGoogle();
    await t.run(async (ctx) => await ctx.db.patch(connectionId, { status: "DISCONNECTED" }));
    expect(await runChecks(t, siteId)).toBe("NOT_CONNECTED");
    expect(asked).toEqual([]);
  });

  test("after a website's nightly run, its day of checks starts as steps of their own", async () => {
    const { t, siteId } = await setup([{ page: "/", clicks: 1 }]);
    const started = await t.run(async (ctx) => {
      const { startChecks } = await import("./searchConsolePageChecks");
      return await startChecks(ctx, siteId);
    });
    expect(started).toBe("STARTED");
    expect(await t.mutation(internal.searchConsolePageChecks.startPageChecks, { siteId })).toBe("GOING");
  });

  test("the rehearsal's pretend Google answers a page check as Google shapes it, the same each time", async () => {
    const { callGoogle } = await import("./googleApi");
    const { INSPECT_URL } = await import("./utils/pageIndexChecks");
    const { rehearsalToken, TEN_TIMES_KORDA } = await import("./utils/rehearsalGoogle");
    const ask = async (address: string) => await callGoogle(INSPECT_URL, rehearsalToken(TEN_TIMES_KORDA), { inspectionUrl: address, siteUrl: "sc-domain:rehearsal.hakken.test" });
    const answers = await Promise.all(Array.from({ length: 60 }, (_, at) => ask(`https://www.rehearsal.hakken.test/shop/item-${at}/`)));
    const found = answers.map((answer) => (answer.ok ? checkFrom(answer.json, "rehearsal.hakken.test") : null));
    expect(found.every((one) => one !== null && one.reason !== null)).toBe(true);
    expect(new Set(found.map((one) => one?.reason)).size).toBeGreaterThan(2);
    expect(await ask("https://www.rehearsal.hakken.test/shop/item-1/")).toEqual(answers[1]);
  });
});

describe("saved as they go (review fixes, 18 November 2026)", () => {
  /** Twenty pages Google shows, the most clicks first: one piece of the website's list. */
  const twenty = Array.from({ length: 20 }, (_, at) => ({ page: `/${at + 1}`, clicks: 100 - at }));

  test("a piece of the list is asked and saved eight at a time, each page once, a step handing on mid-piece where it left off", async () => {
    const { t, siteId } = await setup(twenty);
    // The day's asks as saved, seen as each ask is made.
    const seen: number[] = [];
    const asked = fakeGoogle({}, undefined, async () => {
      seen.push((await dayOf(t, siteId))?.asked ?? 0);
    });
    await runChecks(t, siteId);
    expect(asked).toEqual(twenty.map((page) => `${ORIGIN}${page.page}`));
    // Saved after each eight: a step that dies loses eight asks at most, never the whole piece of 100.
    expect(seen).toEqual([...Array(8).fill(0), ...Array(8).fill(8), ...Array(4).fill(16)]);
    expect(await dayOf(t, siteId)).toMatchObject({ asked: 20, failed: 0, indexed: 20 });
    expect(await checksOf(t, siteId)).toHaveLength(20);
  });

  test("the day's limit holds exactly inside a slice", async () => {
    const { t, siteId } = await setup(twenty);
    await t.run(async (ctx) => {
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: DAY, reasons: [], indexed: 0, known: 20, asked: DAILY_CHECKS - 5, failed: 0, updatedAt: 1 });
    });
    const asked = fakeGoogle();
    await runChecks(t, siteId);
    expect(asked).toEqual(twenty.slice(0, 5).map((page) => `${ORIGIN}${page.page}`));
    expect((await dayOf(t, siteId))?.asked).toBe(DAILY_CHECKS);
  });

  test("a refusal in a later slice stops the day there, the slices before it kept", async () => {
    const { t, siteId, connectionId } = await setup(twenty);
    const asked = fakeGoogle({}, { ask: 10, status: 429, detail: "Quota exceeded for quota metric 'URL inspection requests per day'" });
    await runChecks(t, siteId);
    // Eight saved; then a round of four, the ninth answered and three refused; nothing asked after.
    expect(asked).toHaveLength(12);
    expect(await checksOf(t, siteId)).toHaveLength(9);
    expect(await dayOf(t, siteId)).toMatchObject({ stopped: "ALLOWANCE", asked: 12, failed: 3 });
    expect((await chainOf(t, connectionId))?.closedAt).toBeDefined();
  });
});

describe("every ask of the inspection counted, whoever asked (review fixes, 18 November 2026)", () => {
  const inspected = (asked: number) => ({ day: DAY, asked, failed: 0 });

  test("the money-page checks' asks count on the day's row, and the checks stop at the limit with them", async () => {
    const { t, siteId } = await setup([{ page: "/1", clicks: 5 }, { page: "/2", clicks: 4 }, { page: "/3", clicks: 3 }, { page: "/4", clicks: 2 }]);
    await t.run(async (ctx) => {
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: "2026-11-17", reasons: [{ reason: "Soft 404", pages: 1 }], indexed: 3, known: 4, asked: 40, failed: 0, updatedAt: 1 });
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: DAY, reasons: [], indexed: 0, known: 4, asked: DAILY_CHECKS - 12, failed: 0, updatedAt: 1 });
    });
    // The weekly money-page checks asked about ten pages this Google day.
    await t.mutation(internal.moneyPageChecks.saveChecks, { holdId: siteId, rows: [], inspected: inspected(10) });
    expect((await dayOf(t, siteId))?.asked).toBe(DAILY_CHECKS - 2);
    const asked = fakeGoogle();
    await runChecks(t, siteId);
    expect(asked).toEqual([`${ORIGIN}/1`, `${ORIGIN}/2`]);
    expect((await dayOf(t, siteId))?.asked).toBe(DAILY_CHECKS);
  });

  test("a day with no row yet is made from the day before, counts carried; a website never checked gets no row", async () => {
    const { t, siteId } = await setup([{ page: "/", clicks: 1 }]);
    await t.mutation(internal.moneyPageChecks.saveChecks, { holdId: siteId, rows: [], inspected: inspected(3) });
    // No check has begun: no row of nothing, which Indexing would read as every page checked.
    expect(await t.run(async (ctx) => await ctx.db.query("pageIndexDays").withIndex("by_hold_day", (q) => q.eq("companyWebsiteId", siteId)).take(5))).toEqual([]);
    await t.run(async (ctx) => {
      await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: "2026-11-17", reasons: [{ reason: "Soft 404", pages: 1 }], indexed: 3, known: 4, asked: 40, failed: 0, updatedAt: 1 });
    });
    await t.mutation(internal.moneyPageChecks.saveChecks, { holdId: siteId, rows: [], inspected: { day: DAY, asked: 3, failed: 1 } });
    expect(await dayOf(t, siteId)).toMatchObject({ reasons: [{ reason: "Soft 404", pages: 1 }], indexed: 3, known: 4, asked: 3, failed: 1 });
  });

  test("the money-page checks count every ask they make of the inspection, on Google's day", () => {
    // Held in the source: the check's own asks are the ones counted, with the URL the collector asks.
    const source = readFileSync(join(__dirname, "moneyPageChecks.ts"), "utf8");
    expect(source).toMatch(/inspected\.asked \+= 1;\s*const answer = await callGoogle\(INSPECT_URL/);
    expect(source).toMatch(/googleDay\(Date\.now\(\)\)/);
  });
});

describe("in the sitemap, by Google's word or the website's own (18 November 2026)", () => {
  test("a page the website's sitemap lists is kept in the sitemap even when Google knows of none", async () => {
    const { t, siteId } = await setup([{ page: "/listed", clicks: 3, sitemap: true }, { page: "/told", clicks: 2 }, { page: "/neither", clicks: 1 }]);
    fakeGoogle({
      "/listed": { coverageState: "URL is unknown to Google" },
      "/told": { coverageState: "Crawled - currently not indexed", sitemap: ["https://www.acme-shop.test/sitemap.xml"] },
      "/neither": { coverageState: "Discovered - currently not indexed" },
    });
    await runChecks(t, siteId);
    const sitemapOf = new Map((await checksOf(t, siteId)).map((row) => [row.page, row.inSitemap]));
    expect(Object.fromEntries(sitemapOf)).toEqual({ "/listed": true, "/told": true, "/neither": false });
  });

  test("the checks saved before are brought in line once, a piece at a time, asking Google nothing", async () => {
    const { t, siteId } = await setup([{ page: "/listed", sitemap: true }, { page: "/other" }]);
    const asked = fakeGoogle();
    await t.run(async (ctx) => {
      const found = { reason: "URL is unknown to Google", verdict: "NEUTRAL", indexed: false, crawled: null, googleCanonical: null, userCanonical: null, inSitemap: false, linkedOwn: false };
      for (const page of ["/listed", "/other", "/gone"]) await ctx.db.insert("pageIndexChecks", { companyWebsiteId: siteId, page, address: `${ORIGIN}${page}`, ...found, checkedAt: 1 });
    });
    expect(await t.mutation(internal.searchConsolePageChecks.alignSitemapChecks, { siteId })).toEqual({ read: 3, changed: 1, cursor: null, done: true });
    expect(Object.fromEntries((await checksOf(t, siteId)).map((row) => [row.page, row.inSitemap]))).toEqual({ "/listed": true, "/other": false, "/gone": false });
    // Once is enough: a second run changes nothing.
    expect((await t.mutation(internal.searchConsolePageChecks.alignSitemapChecks, { siteId })).changed).toBe(0);
    expect(asked).toEqual([]);
  });
});
