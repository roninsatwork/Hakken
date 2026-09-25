import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import schema from "./schema";
import { collectionTimetable, nextCollection, type CollectionTimetable } from "./seoScheduleService";

/**
 * When a company's work is next sent to DataForSEO.
 *
 * Since 2026-09-25 a company's own schedule wakes nothing: it says when the
 * company falls due, the Planner's next run queues its work, and the
 * Collector's run after that sends it. The Manage Companies table and each
 * company's Collection runs screen both show this time, so both read it here.
 */

const at = (iso: string) => Date.parse(iso);
const daily = (time: string) => JSON.stringify({ version: 2, kind: "recurring", cadence: "daily", timeLocal: time, timezone: "UTC" });
const MONTHLY = JSON.stringify({ version: 2, kind: "recurring", cadence: "monthly", dayOfMonth: 1, timeLocal: "02:10", timezone: "UTC" });

// Friday 25 September 2026, mid-afternoon.
const NOW = new Date("2026-09-25T15:00:00Z");

/** The Planner at 03:00 and the Collector at 04:00 each day, as set up on 2026-09-25. */
const timetable = (overrides: Partial<CollectionTimetable> = {}): CollectionTimetable => ({
  plannerLive: true,
  planner: [{ intervalStr: daily("03:00"), nextRunAt: at("2026-09-26T03:00:00Z") }],
  collector: [{ intervalStr: daily("04:00"), nextRunAt: at("2026-09-26T04:00:00Z") }],
  ...overrides,
});

describe("when a company's work is next sent", () => {
  test("a company due now is sent after the Planner's next run, by the Collector's run after it", () => {
    // Daily at 01:00, last collected two days ago: due since this morning.
    const next = nextCollection(timetable(), { intervalStr: daily("01:00"), isActive: true }, at("2026-09-23T12:58:00Z"), NOW);

    expect(next).toEqual({ at: at("2026-09-26T04:00:00Z") });
  });

  test("a company not yet due waits for its own time, then the Planner, then the Collector", () => {
    // Monthly on the 1st at 02:10, collected today: due on 1 October.
    const next = nextCollection(timetable(), { intervalStr: MONTHLY, isActive: true }, at("2026-09-25T12:28:00Z"), NOW);

    expect(next).toEqual({ at: at("2026-10-01T04:00:00Z") });
  });

  test("a Collector run in the same minute as the Planner's is too early, so the one after it counts", () => {
    const sameMinute = timetable({ collector: [{ intervalStr: daily("03:00"), nextRunAt: at("2026-09-26T03:00:00Z") }] });

    const next = nextCollection(sameMinute, { intervalStr: daily("01:00"), isActive: true }, undefined, NOW);

    expect(next).toEqual({ at: at("2026-09-27T03:00:00Z") });
  });

  test("in Test mode the Planner queues everything on every run, whatever the company's schedule says", () => {
    const next = nextCollection(timetable({ plannerLive: false }), { intervalStr: MONTHLY, isActive: true }, at("2026-09-25T12:28:00Z"), NOW);

    expect(next).toEqual({ at: at("2026-09-26T04:00:00Z") });
  });

  test("nothing is due while collection is off, and nothing is sent while either agent has no schedule", () => {
    const on = { intervalStr: daily("01:00"), isActive: true };

    expect(nextCollection(timetable(), { ...on, isActive: false }, undefined, NOW)).toEqual({ at: null, why: "OFF" });
    expect(nextCollection(timetable(), null, undefined, NOW)).toEqual({ at: null, why: "OFF" });
    expect(nextCollection(timetable({ planner: [] }), on, undefined, NOW)).toEqual({ at: null, why: "NOT_SCHEDULED" });
    expect(nextCollection(timetable({ collector: [] }), on, undefined, NOW)).toEqual({ at: null, why: "NOT_SCHEDULED" });
  });
});

describe("the two agents' timetable", () => {
  test("is read from their own schedules: switched-on rows only, never a company's setting, none for an agent that is off", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const read = await t.run(async (ctx) => {
      const agent = (systemKey: string, isActive: boolean, plannerMode?: "LIVE" | "TEST") => ctx.db.insert("agents", {
        name: systemKey, modelId: "none", thinkingMode: false, isActive, systemKey,
        ...(plannerMode ? { plannerMode } : {}), createdAt: Date.now(), updatedAt: Date.now(),
      });
      const planner = await agent("DATAFORSEO_PLANNER", true, "LIVE");
      const collector = await agent("DATAFORSEO_COLLECTOR", false);
      const companyId = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
      const schedule = (fields: Record<string, unknown>) => ctx.db.insert("schedules", {
        name: "Schedule", intervalStr: daily("03:00"), isActive: true, createdAt: Date.now(), ...fields,
      } as never);
      await schedule({ agentId: planner, nextRunAt: 1 });
      await schedule({ agentId: planner, isActive: false });
      // A company's setting left over naming the Planner is not the Planner's schedule.
      await schedule({ agentId: planner, companyId });
      await schedule({ agentId: collector });
      return await collectionTimetable(ctx);
    });

    expect(read.plannerLive).toBe(true);
    expect(read.planner).toHaveLength(1);
    expect(read.planner[0]).toMatchObject({ nextRunAt: 1 });
    // The Collector is switched off, so the dispatcher runs none of its schedules.
    expect(read.collector).toEqual([]);
  });
});
