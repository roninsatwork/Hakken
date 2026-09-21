import { describe, expect, test } from "vitest";

import { getNextWorkflowScheduleRunAt, shouldRunWorkflowSchedule } from "./workflowScheduleService";

/**
 * Every other Monday, and the same Monday after anything goes wrong.
 *
 * Fortnightly was the one cadence the shared schedule format could not express.
 * The tempting shortcut — "every 14 days" — counts from the last run, so a
 * pause, a failed run or a backfill silently moves every future run onto the
 * wrong week. Anchoring to a date the user picked is what these tests are
 * really checking.
 */

const fortnightly = (anchorDate: string, dayOfWeek = 1, timeLocal = "02:00") =>
  JSON.stringify({
    version: 2,
    kind: "recurring",
    cadence: "fortnightly",
    dayOfWeek,
    anchorDate,
    timeLocal,
    timezone: "UTC",
  });

// 21 Sep 2026 is a Monday.
const ANCHOR = "2026-09-21";

describe("fortnightly runs every other week", () => {
  test("the anchor week itself is an on week", () => {
    const next = getNextWorkflowScheduleRunAt({
      intervalStr: fortnightly(ANCHOR),
      now: new Date("2026-09-21T00:00:00Z"),
    });
    expect(new Date(next!).toISOString()).toBe("2026-09-21T02:00:00.000Z");
  });

  test("the week after the anchor is skipped", () => {
    const next = getNextWorkflowScheduleRunAt({
      intervalStr: fortnightly(ANCHOR),
      now: new Date("2026-09-22T00:00:00Z"),
    });
    // Not 28 Sep — that is the off week.
    expect(new Date(next!).toISOString()).toBe("2026-10-05T02:00:00.000Z");
  });

  test("it keeps alternating months later", () => {
    const next = getNextWorkflowScheduleRunAt({
      intervalStr: fortnightly(ANCHOR),
      now: new Date("2026-12-01T00:00:00Z"),
    });
    const landed = new Date(next!);
    expect(landed.getUTCDay()).toBe(1);
    const weeks = Math.round(
      (landed.getTime() - Date.parse(`${ANCHOR}T02:00:00Z`)) / (7 * 24 * 60 * 60 * 1000),
    );
    expect(weeks % 2).toBe(0);
  });

  test("it stays on the chosen weekday, not the anchor's", () => {
    // Anchored on a Monday but asked for Thursdays.
    const next = getNextWorkflowScheduleRunAt({
      intervalStr: fortnightly(ANCHOR, 4),
      now: new Date("2026-09-21T00:00:00Z"),
    });
    expect(new Date(next!).getUTCDay()).toBe(4);
  });
});

describe("a pause does not move the fortnight", () => {
  test("a schedule that missed three weeks resumes on its own week", () => {
    // The failure "every 14 days" would produce: counting from the last run
    // would put the next one 14 days after the resume, on the wrong week.
    const next = getNextWorkflowScheduleRunAt({
      intervalStr: fortnightly(ANCHOR),
      lastRunTs: Date.parse("2026-09-21T02:00:00Z"),
      now: new Date("2026-10-14T09:00:00Z"),
    });
    const landed = new Date(next!);
    const weeks = Math.round(
      (landed.getTime() - Date.parse(`${ANCHOR}T02:00:00Z`)) / (7 * 24 * 60 * 60 * 1000),
    );
    expect(weeks % 2).toBe(0);
    expect(landed.getUTCDay()).toBe(1);
  });
});

describe("whether it is due", () => {
  test("due on an on week once the time has passed", () => {
    expect(shouldRunWorkflowSchedule({
      intervalStr: fortnightly(ANCHOR),
      lastRunTs: 0,
      now: new Date("2026-09-21T03:00:00Z"),
    })).toBe(true);
  });

  test("not due on an off week, once the on week has run", () => {
    expect(shouldRunWorkflowSchedule({
      intervalStr: fortnightly(ANCHOR),
      lastRunTs: Date.parse("2026-09-21T02:00:00Z"),
      now: new Date("2026-09-28T03:00:00Z"),
    })).toBe(false);
  });

  test("an on week that was missed is still caught up later", () => {
    // Deliberate, and the reason the test above pins `lastRunTs`: if the
    // dispatcher was down on Monday, running on Tuesday is right. A schedule
    // that silently skipped a fortnight because nobody was listening would be
    // worse than one that runs a day late.
    expect(shouldRunWorkflowSchedule({
      intervalStr: fortnightly(ANCHOR),
      lastRunTs: 0,
      now: new Date("2026-09-23T03:00:00Z"),
    })).toBe(true);
  });

  test("not due twice in the same week", () => {
    expect(shouldRunWorkflowSchedule({
      intervalStr: fortnightly(ANCHOR),
      lastRunTs: Date.parse("2026-09-21T02:00:00Z"),
      now: new Date("2026-09-21T09:00:00Z"),
    })).toBe(false);
  });

  test("a nonsense anchor never runs rather than running every week", () => {
    // Failing closed: a broken schedule that fires weekly would double the bill.
    expect(shouldRunWorkflowSchedule({
      intervalStr: fortnightly("not-a-date"),
      lastRunTs: 0,
      now: new Date("2026-09-21T03:00:00Z"),
    })).toBe(false);
  });
});
