import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { reasonAsked } from "./searchConsoleIndexing";
import { foldPages, mainPageOf, oneIn, reasonBoxes, reasonPages, type ProblemPage } from "./utils/indexingFigures";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";

/**
 * Indexing's reads (search-console-indexing-v1-plan-2026-11-18.md): the summary and a reason's own page from the page
 * checks, their clicks asked of Google when the dates' pages aren't kept, a reason's days from the days of pages kept,
 * Ask Hakken's read of both, and a company reading only its own. Google faked at the network.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const ORIGIN = "https://www.acme-shop.test";
const PROPERTY = "sc-domain:acme-shop.test";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Check = { page: string; reason: string; indexed?: boolean; crawled?: string | null; googleCanonical?: string | null; inSitemap?: boolean; linkedOwn?: boolean; title?: string };

async function setup(checks: Check[], days?: { indexed: number; known: number; reasons: Array<{ reason: string; pages: number }> }) {
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
    for (const check of checks) {
      await ctx.db.insert("pageIndexChecks", {
        companyWebsiteId: siteId, page: check.page, address: `${ORIGIN}${check.page}`, ...(check.title ? { title: check.title } : {}),
        reason: check.reason, verdict: check.indexed ? "PASS" : "NEUTRAL", indexed: check.indexed ?? false, crawled: check.crawled ?? null,
        googleCanonical: check.googleCanonical ?? null, userCanonical: null, inSitemap: check.inSitemap ?? false, linkedOwn: check.linkedOwn ?? false, checkedAt: 1,
      });
    }
    if (days) await ctx.db.insert("pageIndexDays", { companyWebsiteId: siteId, day: "2026-11-17", ...days, asked: checks.length, failed: 0, updatedAt: 1 });
    // Another company, holding the same website: none of the first's checks are its own.
    const otherCompany = await ctx.db.insert("companies", { name: "Rival", createdAt: 1 });
    const otherUser = await ctx.db.insert("users", { name: "Rival reader", email: "reader@rival.test", role: "USER", companyId: otherCompany, createdAt: 1 });
    return { companyId, userId, siteId, otherUser };
  });
  return { t, ...ids, reader: t.withIdentity({ subject: ids.userId }), rival: t.withIdentity({ subject: ids.otherUser }) };
}

/** Google's Search Analytics, faked: the pages it showed in the dates, as links with codes on the end and the bare twin. */
function fakeGoogle(rows: Array<[string, number, number]>) {
  const asks: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Record<string, unknown>;
    asks.push(ask);
    if ((ask.startRow as number) > 0) return Response.json({});
    return Response.json({ rows: rows.map(([key, clicks, impressions]) => ({ keys: [key], clicks, impressions, ctr: clicks / impressions, position: 8 })) });
  }));
  return asks;
}

const CHECKS: Check[] = [
  { page: "/", reason: "Submitted and indexed", indexed: true, crawled: "2026-11-16" },
  { page: "/old-handle.html", reason: "Not found (404)", crawled: "2026-10-09", inSitemap: true, title: "Old handle | Acme" },
  { page: "/gone.html", reason: "Not found (404)", crawled: "2026-11-02" },
  { page: "/sale", reason: "Page with redirect", crawled: "2026-11-12", googleCanonical: `${ORIGIN}/`, linkedOwn: true },
  { page: "/print", reason: "Page with redirect", crawled: "2026-11-12", googleCanonical: `${ORIGIN}/elsewhere` },
  { page: "/handles.html", reason: "URL is unknown to Google" },
  { page: "/knobs.html", reason: "URL is unknown to Google" },
  { page: "/latches.html", reason: "URL is unknown to Google" },
];
const DAYS = { indexed: 1, known: 20, reasons: [{ reason: "URL is unknown to Google", pages: 3 }, { reason: "Not found (404)", pages: 2 }, { reason: "Page with redirect", pages: 2 }] };
const ASK = { from: "2026-10-01", to: "2026-10-31", period: "lastMonth" as const };

beforeEach(() => {
  useFixedDay("2026-11-18");
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Indexing's summary", () => {
  test("only the problems: each reason the most pages first, how far the checks have got, the chart's days, and Google's own report", async () => {
    const { reader, siteId } = await setup(CHECKS, DAYS);
    const answer = await reader.query(api.searchConsoleIndexing.searchConsoleIndexing, { siteId, ...ASK });
    expect(answer?.reasons).toEqual([
      { reason: "URL is unknown to Google", pages: 3, inSitemap: 0, crawled: null },
      { reason: "Not found (404)", pages: 2, inSitemap: 1, crawled: "2026-11-02" },
      { reason: "Page with redirect", pages: 2, inSitemap: 0, crawled: "2026-11-12" },
    ]);
    expect(answer?.checks).toEqual({ day: "2026-11-17", checked: 8, indexed: 1, notIndexed: 7, known: 20 });
    // The chart is the table over time: each day kept, with each reason's pages that day.
    expect(answer?.days).toEqual([{ day: "2026-11-17", reasons: DAYS.reasons }]);
    // The home country's pages for these dates aren't kept yet: the screen asks Google for them.
    expect(answer).toMatchObject({ figures: null, live: true, on: false, report: "https://search.google.com/search-console/index?resource_id=sc-domain%3Aacme-shop.test" });
  });

  test("before any check: no counts, no reasons, nothing to ask Google", async () => {
    const { reader, siteId } = await setup([]);
    expect(await reader.query(api.searchConsoleIndexing.searchConsoleIndexing, { siteId, ...ASK })).toMatchObject({ checks: null, reasons: [], days: [], figures: null, live: false });
    vi.stubEnv("SEARCH_CONSOLE_PAGE_CHECKS", `${siteId}`);
    expect((await reader.query(api.searchConsoleIndexing.searchConsoleIndexing, { siteId, ...ASK }))?.on).toBe(true);
  });

  test("the clicks asked of Google, one ask, each link folded to its page as the website's list folds it", async () => {
    const { reader, siteId } = await setup(CHECKS, DAYS);
    const asks = fakeGoogle([
      [`${ORIGIN}/`, 300, 9000], [`${ORIGIN}/old-handle.html`, 4, 200], [`${ORIGIN}/handles.html?idp=12`, 3, 90], [`${ORIGIN}/handles.html`, 2, 40], [`http://acme-shop.test/sale`, 1, 10],
    ]);
    const live = await reader.action(api.searchConsoleIndexing.searchConsoleLiveIndexing, { siteId, ...ASK });
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ startDate: "2026-10-01", endDate: "2026-10-31", dimensions: ["page"] });
    expect(live).toMatchObject({
      ok: true,
      figures: {
        clicks: 310, impressions: 9340,
        byReason: [{ reason: "URL is unknown to Google", clicks: 5, impressions: 130 }, { reason: "Not found (404)", clicks: 4, impressions: 200 }, { reason: "Page with redirect", clicks: 1, impressions: 10 }],
        clickedPages: [
          { page: "/handles.html", clicks: 5, reason: "URL is unknown to Google" }, { page: "/old-handle.html", clicks: 4, title: "Old handle | Acme" }, { page: "/sale", clicks: 1 },
        ],
      },
      byPage: [],
    });
    const reason = await reader.action(api.searchConsoleIndexing.searchConsoleLiveIndexing, { siteId, ...ASK, reason: "Not found (404)" });
    expect(reason).toMatchObject({ ok: true, byPage: [{ page: "/old-handle.html", clicks: 4, impressions: 200 }] });
  });

  test("another company holding the same website reads none of it", async () => {
    const { rival, siteId } = await setup(CHECKS, DAYS);
    await expect(rival.query(api.searchConsoleIndexing.searchConsoleIndexing, { siteId, ...ASK })).rejects.toThrow();
    await expect(rival.query(api.searchConsoleIndexing.searchConsoleIndexingReason, { siteId, ...ASK, reason: "Not found (404)" })).rejects.toThrow();
    await expect(rival.action(api.searchConsoleIndexing.searchConsoleIndexingDays, { siteId, reason: "Not found (404)" })).resolves.toEqual({ ok: false, problem: "NOT_CONNECTED" });
  });
});

describe("a reason's own page", () => {
  test("its pages, and whether the page Google shows in each one's place is in Google", async () => {
    const { reader, siteId } = await setup(CHECKS, DAYS);
    const answer = await reader.query(api.searchConsoleIndexing.searchConsoleIndexingReason, { siteId, ...ASK, reason: "Page with redirect" });
    expect(answer?.pages.map((page) => [page.page, page.mainIndexed]).sort()).toEqual([["/print", false], ["/sale", true]]);
    expect(answer?.live).toBe(true);
    const none = await reader.query(api.searchConsoleIndexing.searchConsoleIndexingReason, { siteId, ...ASK, reason: "Crawled - currently not indexed" });
    expect(none).toMatchObject({ pages: [], live: false, checks: { checked: 8 } });
  });

  test("its days from the days of pages kept: each day's clicks and impressions, and each page's last day shown", async () => {
    const { t, reader, siteId } = await setup(CHECKS, DAYS);
    await t.run(async (ctx) => {
      const day = (start: string, rows: Array<[string, number, number]>) => ctx.db.insert("searchConsoleLists", {
        companyWebsiteId: siteId, searchType: "web", list: "page", grain: "DAY", start, part: 0,
        keys: rows.map(([key]) => key), clicks: rows.map(([, clicks]) => clicks), impressions: rows.map(([, , shown]) => shown), positionSums: rows.map(([, , shown]) => shown * 5), fetchedAt: 1,
      });
      await day("2026-11-14", [[`${ORIGIN}/handles.html?idp=1`, 1, 30], [`${ORIGIN}/`, 40, 900]]);
      await day("2026-11-15", [[`${ORIGIN}/knobs.html`, 0, 12], [`${ORIGIN}/handles.html`, 0, 5]]);
      await day("2026-11-16", [[`${ORIGIN}/`, 50, 1000]]);
    });
    const days = await reader.action(api.searchConsoleIndexing.searchConsoleIndexingDays, { siteId, reason: "URL is unknown to Google" });
    expect(days).toEqual({
      ok: true, from: "2026-11-14", to: "2026-11-16", kept: 3,
      days: [{ day: "2026-11-14", clicks: 1, impressions: 30 }, { day: "2026-11-15", clicks: 0, impressions: 17 }, { day: "2026-11-16", clicks: 0, impressions: 0 }],
      pages: [
        { page: "/handles.html", lastShown: "2026-11-15", days: 2 }, { page: "/knobs.html", lastShown: "2026-11-15", days: 1 }, { page: "/latches.html", lastShown: null, days: 0 },
      ],
    });
  });
});

describe("the boxes for each kind of reason", () => {
  const page = (over: Partial<ProblemPage>): ProblemPage => ({ page: "/a", address: `${ORIGIN}/a`, title: null, reason: "x", crawled: null, googleCanonical: null, inSitemap: false, linkedOwn: false, ...over });
  const folded = foldPages([{ key: `${ORIGIN}/a`, clicks: 6, impressions: 60 }, { key: `${ORIGIN}/b`, clicks: 2, impressions: 80 }, { key: `${ORIGIN}/c`, clicks: 992, impressions: 9000 }]);
  const pages = reasonPages([
    page({ page: "/a", address: `${ORIGIN}/a?ref=1`, crawled: "2026-10-01", inSitemap: true, googleCanonical: `${ORIGIN}/c` }),
    page({ page: "/b", address: `${ORIGIN}/b`, crawled: "2026-11-02", linkedOwn: true, googleCanonical: `${ORIGIN}/b` }),
  ], folded, (main) => main === "/c");
  const shown = new Map([["/a", { lastShown: "2026-11-03", days: 4 }], ["/b", { lastShown: "2026-10-20", days: 2 }]]);
  const context = { checked: 50, allClicks: 1000, month: "2026-11-01", shown };

  test("the most impressions first, with the page Google shows in each one's place", () => {
    expect(pages.map((one) => [one.page, one.impressions, one.main, one.mainIndexed])).toEqual([["/b", 80, null, false], ["/a", 60, `${ORIGIN}/c`, true]]);
    expect(mainPageOf({ address: "http://acme-shop.test/", googleCanonical: `${ORIGIN}/` })).toBe(`${ORIGIN}/`);
  });

  test("errors: Pages, Last shown, Clicks they still got, In your sitemap", () => {
    expect(reasonBoxes("error", pages, context)).toEqual([
      { key: "pages", value: 2, checked: 50 }, { key: "lastShown", day: "2026-11-03", loading: false }, { key: "stillClicked", value: 8 }, { key: "sitemap", value: 1, still: true },
    ]);
    expect(reasonBoxes("error", pages, { ...context, shown: null })[1]).toEqual({ key: "lastShown", day: null, loading: true });
  });

  test("kept out: Pages, In your sitemap, Clicks, Last visited", () => {
    expect(reasonBoxes("keptOut", pages, context)).toEqual([
      { key: "pages", value: 2, checked: 50 }, { key: "sitemap", value: 1, still: false }, { key: "clicks", value: 8, all: 1000 }, { key: "lastVisited", day: "2026-11-02" },
    ]);
  });

  test("duplicates and redirects: Pages, Google picked another page, Go to a page in Google, Clicks", () => {
    expect(reasonBoxes("duplicate", pages, context)).toEqual([
      { key: "pages", value: 2, checked: 50 }, { key: "picked", value: 1 }, { key: "inGoogle", value: 1, rest: 1 }, { key: "clicks", value: 8, all: 1000 },
    ]);
  });

  test("Google chose not to: Pages, In your sitemap, Linked from your pages, Last visited", () => {
    expect(reasonBoxes("notChosen", pages, context)).toEqual([
      { key: "pages", value: 2, checked: 50 }, { key: "sitemap", value: 1, still: false }, { key: "linked", value: 1 }, { key: "lastVisited", day: "2026-11-02" },
    ]);
  });

  // "In your sitemap" in place of "Codes on the end", which could only ever say 0 (Anthony, 18 November 2026).
  test("unknown to Google: Pages, Still shown this month, Clicks, In your sitemap", () => {
    expect(reasonBoxes("unknown", pages, context)).toEqual([
      { key: "pages", value: 2, checked: 50 }, { key: "stillShown", value: 1, rest: 1, month: "2026-11-01" }, { key: "clicks", value: 8, all: 1000 }, { key: "sitemap", value: 1, still: false },
    ]);
  });

  test("about 1 in so many, rounded to read easily", () => {
    expect(oneIn(16_838, 43)).toBe(390);
    expect(oneIn(100, 20)).toBe(5);
    expect(oneIn(100, 90)).toBe(1);
    expect(oneIn(100, 0)).toBeNull();
    expect(oneIn(1_000_000, 300)).toBe(3300);
  });
});

describe("Ask Hakken's read of Indexing", () => {
  const read = (t: Harness, companyId: Id<"companies">, key?: string) => t.query(internal.assistantSearchConsoleReads.searchConsoleScreenInternal, {
    companyId, website: "acme-shop.test", screen: "indexing", period: "lastMonth", ...(key ? { key } : {}),
  });

  test("the summary: how far the checks have got, the biggest reason first with what it means, and its own page's link", async () => {
    const { t, companyId, siteId } = await setup(CHECKS, DAYS);
    const answer = await read(t, companyId) as Record<string, unknown> & { reasons: Array<Record<string, unknown>> };
    expect(answer).toMatchObject({ ok: true, screen: "indexing", checks: { checked: 8, indexed: 1, notIndexed: 7, known: 20 }, link: `/app/search-console/${siteId}/indexing?period=lastMonth` });
    expect(answer.reasons[0]).toEqual({
      reason: "URL is unknown to Google", means: "Google has no record of these pages.", source: "Google systems", kind: "unknown", link: "indexing/unknown-to-google",
      pages: 3, pagesInSitemap: 0, lastVisitedByGoogle: null, clicks: null, timesShown: null,
    });
    expect(answer.note).toMatch(/open the screen/);
    expect(String(answer.rule)).toMatch(/Google's own words/);
  });

  test("a reason's own page by its words or its address: its boxes for its kind and its pages", async () => {
    const { t, companyId, siteId } = await setup(CHECKS, DAYS);
    const answer = await read(t, companyId, "404") as Record<string, unknown> & { pages: Array<Record<string, unknown>> };
    expect(answer).toMatchObject({ reason: "Not found (404)", kind: "error", pagesOfTheReason: 2, link: `/app/search-console/${siteId}/indexing/not-found-404?period=lastMonth` });
    expect(answer.boxes).toEqual([{ key: "pages", value: 2, checked: 8 }, { key: "stillClicked", value: 0 }, { key: "sitemap", value: 1, still: true }]);
    expect(answer.pages.map((page) => page.page)).toEqual([`${ORIGIN}/gone.html`, `${ORIGIN}/old-handle.html`]);
    expect(await read(t, companyId, "page-with-redirect")).toMatchObject({ reason: "Page with redirect", pagesOfTheReason: 2 });
    // A reason none of the pages has: what it means, and none of its pages.
    expect(await read(t, companyId, "soft 404")).toMatchObject({ reason: "Soft 404", means: "These pages are there, but Google thinks they look empty.", pagesOfTheReason: 0 });
    expect(await read(t, companyId, "a rule nobody has")).toMatchObject({ found: null, reasonsGiven: ["URL is unknown to Google", "Not found (404)", "Page with redirect"] });
  });

  test("before any check, it says so", async () => {
    const { t, companyId } = await setup([]);
    expect(await read(t, companyId)).toMatchObject({ ok: true, checks: null, reasons: [], note: expect.stringMatching(/checked with Google yet/) });
  });

  test("the reason a question names: its address, Google's words or words in them, among the website's", () => {
    expect(reasonAsked("not-found-404", [])).toBe("Not found (404)");
    expect(reasonAsked("Crawled - currently not indexed", [])).toBe("Crawled - currently not indexed");
    expect(reasonAsked("unknown", ["URL is unknown to Google"])).toBe("URL is unknown to Google");
    expect(reasonAsked("redirect", ["Page with redirect"])).toBe("Page with redirect");
    expect(reasonAsked("nothing like it", ["Page with redirect"])).toBeNull();
  });
});
