import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { noteRegister } from "./searchConsoleSeenDays";

/**
 * New and lost's day counts kept up as the first- and last-seen register is
 * written (core-data-normalisation-plan.md, step 3): each entry noted moves the
 * counts of the days it leaves and reaches, so they always equal counting the
 * whole register again — which happens only when none is held, or a month on.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const DAY_MS = 24 * 60 * 60 * 1000;

async function hold(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    return await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
  });
}

/** The counts held, and the counts the register gives when counted whole. */
const counts = (t: ReturnType<typeof harness>, holdId: Id<"companyWebsites">) => t.run(async (ctx) => {
  const held = Object.fromEntries((await ctx.db.query("searchConsoleSeenDays").collect())
    .filter((row) => row.kind === "query" && (row.first !== 0 || row.last !== 0))
    .map((row) => [row.day, [row.first, row.last]]));
  const whole: Record<string, [number, number]> = {};
  for (const entry of (await ctx.db.query("searchConsoleSeen").collect()).filter((one) => one.companyWebsiteId === holdId && one.kind === "query")) {
    whole[entry.firstDay] = [(whole[entry.firstDay]?.[0] ?? 0) + 1, whole[entry.firstDay]?.[1] ?? 0];
    whole[entry.lastDay] = [whole[entry.lastDay]?.[0] ?? 0, (whole[entry.lastDay]?.[1] ?? 0) + 1];
  }
  return { held, whole };
});

describe("New and lost's counts, kept up as the register is written", () => {
  test("each entry noted moves its days' counts, so they equal the register counted whole", async () => {
    const t = harness();
    const holdId = await hold(t);
    const scope = { companyWebsiteId: holdId, country: undefined, searchType: "web" as const };
    await t.run(async (ctx) => {
      await noteRegister(ctx, scope, "query", [{ key: "door handles", first: "2026-09-01", last: "2026-09-20" }]);
    });
    // Not counted yet: the first whole count counts it, nothing is kept up before.
    expect((await counts(t, holdId)).held).toEqual({});

    await t.mutation(internal.searchConsoleSeenDays.writeSeenDays, {
      companyWebsiteId: holdId, searchType: "web", kind: "query", builtAt: 1,
      days: [{ day: "2026-09-01", first: 1, last: 0 }, { day: "2026-09-20", first: 0, last: 1 }],
    });
    await t.run(async (ctx) => {
      await noteRegister(ctx, scope, "query", [
        // Shown again later, and found earlier: both its days move.
        { key: "door handles", first: "2026-08-30", last: "2026-09-25" },
        // New.
        { key: "brass knobs", first: "2026-09-22", last: "2026-09-22" },
        // Nothing new about it: nothing moves.
        { key: "door handles", first: "2026-09-02", last: "2026-09-21" },
      ]);
    });
    const { held, whole } = await counts(t, holdId);
    expect(held).toEqual(whole);
    expect(held).toEqual({ "2026-08-30": [1, 0], "2026-09-22": [1, 1], "2026-09-25": [0, 1] });
  });

  test("the whole register is counted again only when no count is held, or the last whole count is a month old", async () => {
    const t = harness();
    const holdId = await hold(t);
    const due = (now: number) => t.query(internal.searchConsoleSeenDays.recountDue, { companyWebsiteId: holdId, searchType: "web", now });
    expect(await due(10 * DAY_MS)).toBe(true);
    for (const kind of ["query", "page"] as const) {
      await t.mutation(internal.searchConsoleSeenDays.writeSeenDays, {
        companyWebsiteId: holdId, searchType: "web", kind, builtAt: 10 * DAY_MS, days: [{ day: "2026-09-01", first: 1, last: 1 }],
      });
    }
    expect(await due(20 * DAY_MS)).toBe(false);
    expect(await due(41 * DAY_MS)).toBe(true);
  });
});
