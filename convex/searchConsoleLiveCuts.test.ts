import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";

/**
 * Every list asked of Google that reached Google's most an ask says so (review fixes, 18 November 2026): a live list of
 * pages, countries or devices (`listCut`, beside the pairs' own `pairsCut`), Demand by Classification's pages and
 * Indexing's. Google gives 50,000 rows an ask (`GOOGLE_MOST_ROWS`); here four, so a few rows reach it. Google faked at
 * the network.
 */
vi.mock("./searchConsoleApi", async (importOriginal) => ({ ...(await importOriginal<typeof import("./searchConsoleApi")>()), GOOGLE_MOST_ROWS: 4 }));

const KEY = Buffer.from(new Uint8Array(32).fill(4)).toString("base64");
const PROPERTY = "sc-domain:acme-shop.test";
const ASK = { searchType: "web" as const, from: "2026-10-01", to: "2026-10-31", period: "lastMonth" as const };

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

type Ask = { dimensions: string[]; startRow: number };

/** Google, faked: `rows` of each list asked, named by the list's own dimension. */
function fakeGoogle(rows: number) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    if (ask.startRow > 0) return Response.json({});
    const keyOf = (at: number) => ask.dimensions.map((dimension) => (dimension === "page" ? `https://acme-shop.test/p${at}/` : dimension === "country" ? `c${at}` : `k${at}`));
    return Response.json({ rows: Array.from({ length: rows }, (_, at) => ({ keys: keyOf(at), clicks: 10 - at, impressions: 100, ctr: 0.1, position: 4 })) });
  }));
}

async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const userId = await ctx.db.insert("users", { name: "Reader", email: "reader@acme-shop.test", role: "USER", companyId, createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY,
      newestDay: "2026-11-16", oldestDay: "2025-08-18", mainCountry: "gbr", createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    return { userId, siteId };
  });
  return { reader: t.withIdentity({ subject: ids.userId }), siteId: ids.siteId };
}

beforeEach(() => {
  useFixedDay("2026-11-18");
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a list Google cut at its most says so", () => {
  test("a live list of pages, or of countries or devices, carries its own cut; one short of the most carries none", async () => {
    const { reader, siteId } = await setup();
    fakeGoogle(4);
    const pages = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...ASK, siteId, dimension: "page", inCountry: true, keywordsApart: true });
    expect(pages).toMatchObject({ ok: true, listCut: 4 });
    expect(pages).not.toHaveProperty("pairsCut");
    for (const dimension of ["country", "device"] as const) {
      expect(await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...ASK, siteId, dimension })).toMatchObject({ ok: true, listCut: 4 });
    }
    fakeGoogle(3);
    const whole = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...ASK, siteId, dimension: "page", inCountry: true, keywordsApart: true });
    expect(whole).toMatchObject({ ok: true });
    expect(whole).not.toHaveProperty("listCut");
  });

  test("a list of keywords is Google's own list of them: its cut, and its pairs' beside it", async () => {
    // Each search alone, as Google counts it (fix 1, 21 November 2026): the list is Google's own, and its pairs give each
    // search's pages. Either cut at Google's most says so.
    const { reader, siteId } = await setup();
    fakeGoogle(4);
    const keywords = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...ASK, siteId, dimension: "query" });
    expect(keywords).toMatchObject({ ok: true, pairsCut: 4, listCut: 4 });
    fakeGoogle(3);
    const whole = await reader.action(api.searchConsoleLists.searchConsoleLiveList, { ...ASK, siteId, dimension: "query" });
    expect(whole).not.toHaveProperty("listCut");
    expect(whole).not.toHaveProperty("pairsCut");
  });

  test("Demand by Classification's and Indexing's pages asked of Google say their cut too", async () => {
    const { reader, siteId } = await setup();
    const dates = { siteId, from: ASK.from, to: ASK.to, period: ASK.period };
    fakeGoogle(4);
    expect(await reader.action(api.searchConsoleDemand.searchConsoleLiveDemand, dates)).toMatchObject({ ok: true, cut: 4 });
    expect(await reader.action(api.searchConsoleIndexing.searchConsoleLiveIndexing, dates)).toMatchObject({ ok: true, cut: 4 });
    fakeGoogle(3);
    expect(await reader.action(api.searchConsoleDemand.searchConsoleLiveDemand, dates)).not.toHaveProperty("cut");
    expect(await reader.action(api.searchConsoleIndexing.searchConsoleLiveIndexing, dates)).not.toHaveProperty("cut");
  });
});
