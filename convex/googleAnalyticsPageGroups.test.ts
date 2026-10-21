import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useFixedDay } from "../src/test/realTime";
import { CompactRows, channelKey, emptyRow, packList, type ListRow } from "./googleAnalyticsLists";

/**
 * A big website's page lists asked a group of pages at a time
 * (`GROUP_PAGES`; Anthony, 2026-10-16: "yes" to groups of 2,000 pages): the
 * lists written are the very ones one ask of every page writes, part for
 * part, and the rows gathered between groups are held small and packed as a
 * whole list is. Google is the rehearsal's pretend one, a small website.
 */

/** Each address's page number, the same every time, as the website's page list keeps it. */
const numbers = new Map<string, string>();
const numberOf = (address: string) => {
  let number = numbers.get(address);
  if (number === undefined) {
    number = `n${[...address].reduce((hash, letter) => Math.imul(hash ^ letter.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261).toString(36)}`;
    numbers.set(address, number);
  }
  return number;
};
vi.mock("./holdPageRefs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./holdPageRefs")>()),
  addressesOf: async () => ({ numbers }),
  encodePagesFromAction: async (_ctx: unknown, _hold: unknown, pages: readonly string[]) => pages.map(numberOf),
}));

import { PAGE_LIST_PARTS, collectPageLists, type PageListPart } from "./googleAnalyticsPageLists";
import { REHEARSAL_HOST, rehearsalToken } from "./utils/rehearsalGoogle";

/** A small generator, the same every run. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("the rows gathered between groups", () => {
  test("packed into exactly the parts the same rows make whole, in whatever order the groups came", () => {
    const next = random(7);
    const events = ["generate_lead", "click_tel"];
    const rows: ListRow[] = Array.from({ length: 5_000 }, (_, at) => {
      const row = emptyRow(channelKey(`n${Math.floor(next() * 900)}`, `source ${at}`));
      row.visits = Math.floor(next() * 50);
      row.views = Math.floor(next() * 90);
      row.people = Math.floor(next() * 30);
      row.length = Math.floor(next() * 400);
      // Only some rows carry times, as an event's rows do beside others' that never had any.
      if (at % 3 === 0) row.times = Math.floor(next() * 9);
      row.counts.set("generate_lead", Math.floor(next() * 3));
      // An event the list gives no column is never packed.
      row.counts.set("scroll", 4);
      row.values.set("click_tel", Math.floor(next() * 2));
      return row;
    });
    const gathered = new CompactRows(events);
    gathered.add(rows.slice(3_000));
    gathered.add(rows.slice(0, 1_000));
    gathered.add(rows.slice(1_000, 3_000));
    expect(gathered.size).toBe(5_000);
    expect(gathered.toParts()).toEqual(packList("landingSource", rows, events));
    expect(new CompactRows([]).toParts()).toEqual(packList("landingSource", [], []));
  });
});

describe("a page's other rows are never a page", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test("a list cut while read keeps its other row as each one's other row, and never numbers it as the website's page", async () => {
    // Before 2026-10-16 the "(other)" a big website's list was cut into was numbered as a page: kordatackle.com's
    // numbering held "https://kordatackle.com/(other)", standing among a landing page's top pages as one.
    const big = { pages: 13_000, consoleRowsADay: 1_000, breadth: 2, days: 800 };
    const written = new Map<string, Array<{ keys: string[] }>>();
    const ctx = {
      runQuery: async () => ({}),
      runMutation: async (reference: unknown, args: { key?: string; parts?: Array<{ keys: string[] }> }) => {
        if (getFunctionName(reference as never).endsWith("putPeriodParts")) written.set(args.key!, [...(written.get(args.key!) ?? []), ...(args.parts ?? [])]);
        return true;
      },
    };
    const session = { ctx, connectionId: "connection", accessToken: rehearsalToken(big), requests: 0, stopped: null, quota: null };
    // Careful: half as much held, so the 26,000 rows of each event by page are cut while read, past an event's 100th page.
    const result = await collectPageLists(ctx as never, session as never, "connection" as never, target as never, { pages: true, period: "thisMonth", device: "", part: "eventsNow" }, TOP, { careful: true, groupPages: Number.POSITIVE_INFINITY });
    expect(result.ok).toBe(true);
    const keys = (written.get("eventPage|thisMonth|NOW|") ?? []).flatMap((part) => part.keys);
    expect(keys.filter((key) => key.endsWith("\u001f(other)")).length).toBeGreaterThan(0);
    expect([...numbers.keys()].filter((address) => address.includes("(other)"))).toEqual([]);
  });
});

/** A small website for the pretend Google: 120 pages, two of everything else. */
const SMALL = { pages: 120, consoleRowsADay: 1_000, breadth: 2, days: 800 };
const TOP = "2026-09-28";
const target = {
  status: "CONNECTED", clearing: false, owned: true, companyWebsiteId: "hold", property: "properties/rehearsal",
  addresses: [`www.${REHEARSAL_HOST}`, REHEARSAL_HOST], origin: `https://www.${REHEARSAL_HOST}`, timeZone: "Europe/London",
  events: ["generate_lead", "click_tel"], counted: ["generate_lead"], perVisit: [], alsoConverting: [], salesElsewhere: false, newestDay: TOP, oldestDay: "2025-01-01",
  pagesHeld: true, weeklyPeriodsAt: undefined, country: "GB", others: [], countryHistory: [],
};

/** One part of the 30 days' page lists collected, every part written kept by its list and the asks counted; `groupPages` to ask in groups. */
async function collected(part: PageListPart, groupPages?: number) {
  const written = new Map<string, unknown[]>();
  const ctx = {
    runQuery: async (reference: unknown) => (getFunctionName(reference as never).endsWith("slotsOf") ? {} : null),
    runMutation: async (reference: unknown, args: { key?: string; parts?: unknown[] }) => {
      if (!getFunctionName(reference as never).endsWith("putPeriodParts")) return null;
      written.set(args.key!, [...(written.get(args.key!) ?? []), ...(args.parts ?? [])]);
      return true;
    },
  };
  const session = { ctx, connectionId: "connection", accessToken: rehearsalToken(SMALL), requests: 0, stopped: null, quota: null };
  const result = await collectPageLists(ctx as never, session as never, "connection" as never, target as never, { pages: true, period: "thisMonth", device: "", part }, TOP, { groupPages, groups: new Map() });
  return { written, result, requests: session.requests };
}

describe("a big website's pages asked in groups", () => {
  beforeEach(() => useFixedDay());
  afterEach(() => vi.useRealTimers());

  test.each([...PAGE_LIST_PARTS])("%s: the same lists, part for part, as one ask of every page", async (part) => {
    // Every page numbered first, as a website's page list holds them by the time its page lists are asked.
    await collected(part);
    const whole = await collected(part);
    const grouped = await collected(part, 40);
    expect(whole.result.ok && grouped.result.ok).toBe(true);
    expect(whole.written.size).toBeGreaterThan(0);
    expect(grouped.written).toEqual(whole.written);
    // An event's lists are keyed by the event, never asked in groups of pages.
    if (part === "eventsNow" || part === "eventsBefore") expect(grouped.requests).toBe(whole.requests);
    else expect(grouped.requests).toBeGreaterThan(whole.requests);
  });

  test("a website of no more pages than a group is asked in one ask, with no ask for its pages", async () => {
    await collected("sources");
    const whole = await collected("sources");
    expect((await collected("sources", 5_000)).requests).toBe(whole.requests);
  });
});
