import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { finishScheduled } from "@/src/test/finishScheduled";
import { useFixedDay } from "@/src/test/realTime";
import { seedGoogleSignIn } from "@/src/test/googleGrant";
import { encryptConnectorToken } from "./connectorTokenCrypto";

/**
 * New and lost's register rebuilt from Google once (`searchConsoleRegisterRebuild.ts`,
 * search-console-new-and-lost-audit-2026-11-19.md), with Google faked at the network. The register held a search first
 * counted on the wrong day and a page shown only abroad; rebuilt from the country's own search-and-page lines, each day
 * the website holds, it holds what Google showed in the country, and its day counts match. Only the country's lines are
 * asked, one ask a day, always with the country's filter.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");
const NOW = Date.parse("2026-09-27T09:30:00Z");
const NEWEST = "2026-09-26";
const MIDDLE = "2026-09-23";
const OLDEST = "2026-09-20";
const PROPERTY = "sc-domain:acme-shop.test";
const HOME = "https://acme-shop.test/";
const DOORS = "https://acme-shop.test/doors/";
const ABROAD = "https://acme-shop.test/abroad/";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

type Ask = { startDate: string; endDate: string; type: string; dimensions: string[]; startRow: number; dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; expression: string }> }> };
const countryOf = (ask: Ask) => ask.dimensionFilterGroups?.flatMap((group) => group.filters).find((filter) => filter.dimension === "country")?.expression;

/** Google, faked: the United Kingdom's search-and-page lines for each day, as Google answers them with the country's filter. */
function fakeGoogle() {
  const asks: Ask[] = [];
  const lines: Record<string, Array<[string, string]>> = {
    [OLDEST]: [["fire strips", DOORS]],
    [MIDDLE]: [["fire strips", DOORS], ["door knobs", HOME]],
    [NEWEST]: [["door knobs", HOME]],
  };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "ya29.renewed", expires_in: 3599 });
    if (!/searchAnalytics\/query$/.test(url)) throw new Error(`Unexpected fetch in test: ${url}`);
    const ask = JSON.parse(String(init?.body)) as Ask;
    asks.push(ask);
    if (ask.startRow > 0 || countryOf(ask) !== "gbr" || ask.dimensions.join("+") !== "query+page") return Response.json({});
    const rows = (lines[ask.startDate] ?? []).map(([query, page]) => ({ keys: [query, page], clicks: 1, impressions: 10, ctr: 0.1, position: 4 }));
    return Response.json({ rows });
  }));
  return asks;
}

/** A connected website holding three web days, and a register as it went wrong: a search counted late, a page from abroad. */
async function setup() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: ["gbr"], createdAt: 1 });
    const connectionId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", mainCountry: "gbr",
      property: PROPERTY, permission: "siteOwner", dataProperty: PROPERTY, newestDay: NEWEST, oldestDay: OLDEST, createdAt: 1, updatedAt: 1,
    });
    await seedGoogleSignIn(ctx, encryptConnectorToken, { companyWebsiteId: siteId, connectionId });
    for (const day of [OLDEST, "2026-09-21", "2026-09-22", MIDDLE, "2026-09-24", "2026-09-25", NEWEST]) {
      await ctx.db.insert("searchConsoleDays", { companyWebsiteId: siteId, searchType: "web", day, clicks: 2, impressions: 20, ctr: 0.1, position: 4, fetchedAt: 1 });
    }
    // The register as it went wrong: "fire strips" counted new on the 23rd, though shown on the 20th; a page shown only abroad.
    for (const [kind, key, firstDay, lastDay] of [["query", "fire strips", MIDDLE, MIDDLE], ["query", "door knobs", MIDDLE, NEWEST], ["page", ABROAD, MIDDLE, NEWEST], ["page", HOME, MIDDLE, NEWEST]] as const) {
      await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind, key, firstDay, lastDay });
    }
    await ctx.db.insert("searchConsoleSeenDays", { companyWebsiteId: siteId, kind: "query", day: MIDDLE, first: 2, last: 1, builtAt: 1 });
    return { siteId, connectionId };
  });
  return { t, ...ids };
}

const register = (t: Harness, siteId: Id<"companyWebsites">) => t.run(async (ctx) => (await ctx.db.query("searchConsoleSeen")
  .withIndex("by_hold_country_type_kind_key", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", undefined))
  .collect()).map((entry) => `${entry.kind} ${entry.key} ${entry.firstDay} ${entry.lastDay}`).sort());

const dayCounts = (t: Harness, siteId: Id<"companyWebsites">, kind: "query" | "page") => t.run(async (ctx) => (await ctx.db.query("searchConsoleSeenDays")
  .withIndex("by_hold_country_type_kind_day", (q) => q.eq("companyWebsiteId", siteId).eq("country", undefined).eq("searchType", undefined).eq("kind", kind))
  .collect()).map((row) => `${row.day} ${row.first} ${row.last}`));

beforeEach(() => {
  useFixedDay();
  vi.setSystemTime(NOW);
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_ID", "sc-client.apps.googleusercontent.com");
  vi.stubEnv("SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET", "sc-secret");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("New and lost's register rebuilt from Google", () => {
  test("holds what Google showed in the country, each day the website holds, with its day counts", async () => {
    const { t, siteId } = await setup();
    const asks = fakeGoogle();
    await t.action(internal.searchConsoleRegisterRebuild.rebuildRegister, {});
    await finishScheduled(t);
    expect(await register(t, siteId)).toEqual([
      `page ${HOME} ${MIDDLE} ${NEWEST}`,
      `page ${DOORS} ${OLDEST} ${MIDDLE}`,
      `query door knobs ${MIDDLE} ${NEWEST}`,
      `query fire strips ${OLDEST} ${MIDDLE}`,
    ]);
    // Counted again whole: "fire strips" and the doors page first shown on the 20th, never the 23rd.
    expect(await dayCounts(t, siteId, "query")).toEqual([`${OLDEST} 1 0`, `${MIDDLE} 1 1`, `${NEWEST} 0 1`]);
    expect(await dayCounts(t, siteId, "page")).toEqual([`${OLDEST} 1 0`, `${MIDDLE} 1 1`, `${NEWEST} 0 1`]);
    // One ask a day held, each the country's own search-and-page lines.
    const lineAsks = asks.filter((ask) => ask.startRow === 0);
    expect(lineAsks.length).toBe(7);
    expect(lineAsks.every((ask) => countryOf(ask) === "gbr" && ask.dimensions.join("+") === "query+page" && ask.startDate === ask.endDate)).toBe(true);
  });

  test("a register bigger than one call is cleared over several, each well inside Convex's reads a call", async () => {
    const { t, siteId } = await setup();
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await ctx.db.insert("searchConsoleSeen", { companyWebsiteId: siteId, kind: "page", key: `${HOME}${index}`, firstDay: MIDDLE, lastDay: NEWEST });
        await ctx.db.insert("searchConsoleSeenDays", { companyWebsiteId: siteId, kind: "page", day: `2026-09-2${index}`, first: 1, last: 0, builtAt: 1 });
      }
    });
    // Four searches and pages from setup, one day count, and ten more: at most 3 read a call.
    const calls: boolean[] = [];
    for (let call = 0; call < 10 && !calls.at(-1); call += 1) {
      calls.push(await t.mutation(internal.searchConsoleRegisterRebuild.clearRegisterSome, { companyWebsiteId: siteId, most: 3 }));
    }
    expect(calls.at(-1)).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(await register(t, siteId)).toEqual([]);
    expect([...await dayCounts(t, siteId, "query"), ...await dayCounts(t, siteId, "page")]).toEqual([]);
  });
});
