import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buildSpan } from "./clarity";
import { clarityErrors, clarityOverview, clarityPage, clarityPagesList } from "./clarityScreens";
import { emptyTotals, type ClarityTotalsRow } from "./utils/clarityRows";
import { packTotals } from "./utils/clarityPacks";
import { shiftDay } from "./utils/insightFacts";
import { useFixedDay } from "@/src/test/realTime";
import { metered, readBy } from "@/src/test/readMeter";
import { heldBy } from "@/src/test/heapMeter";

/**
 * Clarity at five times morehandles.co.uk (agents-and-clarity-plan.md, Part 0;
 * core-data-normalisation-plan.md, N1): 90 days, each the most Clarity sends —
 * 1,000 rows of a page on a device — over 15,000 pages, so a period holds
 * thousands. What the morning's 90-day build reads, and what a 90-day screen
 * reads and holds, against Convex's 16 MiB a read and 64 MB a query: under
 * half of each, as rule 4 asks of every screen.
 *
 * Kept as before Part 0 (three records a day, rows of objects, 300 pages), a
 * 90-day screen read 4.6 MB at morehandles.co.uk's size and added up 180
 * records each time it opened (measured 2026-10-16). Counted, not timed, so it
 * holds on any machine; seeded here and never on GitHub, as Search Console's is.
 *
 * Since "Finishing Parts 3 and 4" each day also keeps its sources and browsers,
 * each the most Clarity sends — 1,000 rows of a page on a device by a source
 * or a browser — in records of their own, so neither the morning's build of a
 * kind nor a screen reads another kind's rows.
 */

const ON_GITHUB = process.env.GITHUB_ACTIONS === "true";
const MiB = 1 << 20;
const HALF_READ = 8 * MiB;
const HALF_MEMORY = 32 * MiB;
const NEWEST = "2026-10-15";
const DAYS = 90;
const ROWS = 1_000;
const PAGES = 15_000;
const WORDS = ["door", "handles", "brass", "lever", "cupboard", "knobs", "sash", "window", "latch", "pull", "black", "chrome", "satin", "antique", "bathroom", "kitchen"];
const path = (index: number) => `/${WORDS[index % 16]}-${WORDS[(index >> 4) % 16]}/${WORDS[(index >> 8) % 16]}-${index}.html`;
const DEVICES = ["PC", "Mobile", "Tablet"];
const SOURCES = ["google", "Direct", "bing", "chatgpt.com", "linkedin.com", "duckduckgo", "facebook.com", "search.yahoo.com", "ecosia.org", "big-shop.test"];
const BROWSERS = ["Chrome", "Safari", "Edge", "Firefox", "Samsung"];

describe.skipIf(ON_GITHUB)("Clarity at five times morehandles.co.uk", () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  let holdId: Id<"companyWebsites">;
  let ownerId: string;

  // The day after Clarity's newest: This year holds all 90 days kept (calendar-periods-plan.md, phase 3).
  beforeEach(() => useFixedDay("2026-10-16"));
  afterEach(() => vi.useRealTimers());

  beforeAll(async () => {
    ({ holdId, ownerId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Big Shop", createdAt: 1 });
      const userId = await ctx.db.insert("users", { email: "owner@big-shop.test", role: "ADMIN", companyId });
      const websiteId = await ctx.db.insert("websites", { host: "big-shop.test", displayHost: "big-shop.test", firstSeenAt: 1 });
      const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
      await ctx.db.insert("clarityConnections", { companyId, companyWebsiteId: hold, status: "CONNECTED", tokenCiphertext: "x", newestDay: NEWEST, createdAt: 1, updatedAt: 1 });
      for (let back = 0; back < DAYS; back += 1) {
        const day = shiftDay(NEWEST, -back);
        // Each day the busiest pages and a share of the rest, so 90 days reach far more pages than one.
        const pages: ClarityTotalsRow[] = Array.from({ length: ROWS }, (_, at) => {
          const index = at < 400 ? at : 400 + ((at * 37 + back * 211) % (PAGES - 400));
          const visits = Math.max(1, 400 - at);
          return { ...emptyTotals(), page: path(index), device: DEVICES[at % 3], visits, bots: at % 7, scrollSum: visits * 320, activeSum: visits * 45, dead: at % 5, quickBack: at % 3, errors: at % 11 === 0 ? 1 : 0, users: visits };
        });
        const site = DEVICES.map((device, at) => ({ ...emptyTotals(), page: null, device, visits: 30_000 - at * 9_000, bots: 900, scrollSum: (30_000 - at * 9_000) * 300, activeSum: (30_000 - at * 9_000) * 50 }));
        await ctx.db.insert("clarityFigures", { companyWebsiteId: hold, span: "DAY", key: day, part: 0, from: day, to: day, days: 1, pages: packTotals(pages), site: packTotals(site), builtAt: 1 });
        for (const [kind, names] of [["SOURCES", SOURCES], ["BROWSERS", BROWSERS]] as const) {
          const split = (row: ClarityTotalsRow, at: number) => ({ ...row, split: names[(at * 7 + back) % names.length] });
          await ctx.db.insert("clarityFigures", {
            companyWebsiteId: hold, span: "DAY", kind, key: day, part: 0, from: day, to: day, days: 1,
            pages: packTotals(pages.map(split)),
            site: packTotals(DEVICES.flatMap((device, at) => names.map((name, place) => ({ ...site[at], device, split: name, visits: Math.round(site[at].visits / (place + 2)) })))),
            builtAt: 1,
          });
        }
      }
      return { holdId: hold, ownerId: userId as string };
    }));
  });

  test("the morning's This year of each kind, 90 days held, worked out within half of one read and of a query's memory", async () => {
    const handler = (buildSpan as unknown as { _handler: (ctx: object, args: object) => Promise<null> })._handler;
    for (const kind of [undefined, "SOURCES", "BROWSERS"] as const) {
      const read = await t.run(async (ctx) => {
        const meter = metered(ctx.db);
        const held = await heldBy(async () => await handler({ ...ctx, db: meter.db }, { holdId, span: "PERIOD", ...(kind ? { kind } : {}), key: "last12Months", from: "2026-01-01", to: NEWEST }));
        return { bytes: meter.bytes(), holds: held.bytes };
      });
      expect(read.bytes, kind ?? "own figures").toBeLessThan(HALF_READ);
      expect(read.holds, kind ?? "own figures").toBeLessThan(HALF_MEMORY);
    }
    const parts = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "PERIOD").eq("kind", undefined).eq("key", "last12Months")).collect());
    expect(parts.length).toBeGreaterThan(1);
  });

  test("This year's Pages screen, Overview, a page's own screen and Errors, 90 days held, each read within half of one read", async () => {
    for (const kind of [undefined, "SOURCES", "BROWSERS"] as const) {
      const built = await t.run(async (ctx) => await ctx.db.query("clarityFigures").withIndex("by_hold_span_kind_key", (q) => q.eq("companyWebsiteId", holdId).eq("span", "PERIOD").eq("kind", kind).eq("key", "last12Months")).first());
      if (!built) await t.mutation(internal.clarity.buildSpan, { holdId, span: "PERIOD", ...(kind ? { kind } : {}), key: "last12Months", from: "2026-01-01", to: NEWEST });
    }
    const pages = await readBy(t, ownerId, clarityPagesList as never, { siteId: holdId, period: "last12Months", page: 1, rows: 25 });
    const answer = pages.answer as { total: number; period: { now: { days: number } } };
    expect(answer.period.now.days).toBe(DAYS);
    expect(answer.total).toBeGreaterThan(ROWS);
    expect(pages.bytes).toBeLessThan(HALF_READ);
    for (const [name, query, args] of [
      ["Overview", clarityOverview, { siteId: holdId, period: "last12Months" }],
      ["a page", clarityPage, { siteId: holdId, period: "last12Months", page: path(0) }],
      ["Errors", clarityErrors, { siteId: holdId, period: "last12Months" }],
    ] as const) {
      const read = await readBy(t, ownerId, query as never, args);
      expect(read.bytes, name).toBeLessThan(HALF_READ);
    }
  });
});
