import { describe, expect, test } from "vitest";
import {
  getLegacyScheduleIntervalMs,
  getNextWorkflowScheduleRunAt,
  parseScheduleConfig,
  shouldRunWorkflowSchedule,
} from "./workflowScheduleService";

describe("workflow schedule service", () => {
  test("supports legacy interval strings", () => {
    expect(getLegacyScheduleIntervalMs("15 minutes")).toBe(15 * 60 * 1000);
    expect(getLegacyScheduleIntervalMs("hourly")).toBe(60 * 60 * 1000);
    expect(getLegacyScheduleIntervalMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("rejects malformed JSON schedule configs", () => {
    expect(parseScheduleConfig(JSON.stringify({ mode: "fortnightly" }))).toBeNull();
    expect(parseScheduleConfig(JSON.stringify({ mode: "interval", intervalVal: "15" }))).toBeNull();
    expect(parseScheduleConfig(JSON.stringify(["interval"]))).toBeNull();
    expect(parseScheduleConfig(JSON.stringify({ version: 2, kind: "targetedTimes", timezone: "Europe/London", timesLocal: [] }))).toBeNull();
    expect(parseScheduleConfig(JSON.stringify({ version: 2, kind: "recurring", cadence: "hourly", everyHours: 25, startTimeLocal: "09:00", timezone: "Europe/London" }))).toBeNull();
  });

  test("runs interval schedules after the configured delay", () => {
    const now = new Date("2026-05-31T12:00:00.000Z");

    expect(
      shouldRunWorkflowSchedule({
        intervalStr: JSON.stringify({ mode: "interval", intervalUnit: "minutes", intervalVal: 15 }),
        lastRunTs: now.getTime() - 16 * 60 * 1000,
        now,
      })
    ).toBe(true);

    expect(
      shouldRunWorkflowSchedule({
        intervalStr: JSON.stringify({ mode: "interval", intervalUnit: "minutes", intervalVal: 15 }),
        lastRunTs: now.getTime() - 5 * 60 * 1000,
        now,
      })
    ).toBe(false);
  });

  test("runs calendar schedules once for the target window", () => {
    const now = new Date("2026-05-31T12:00:00.000Z");
    const intervalStr = JSON.stringify({ mode: "weekly", time: "10:00", dayOfWeek: 0 });

    expect(shouldRunWorkflowSchedule({ intervalStr, lastRunTs: 0, now })).toBe(true);
    expect(shouldRunWorkflowSchedule({ intervalStr, lastRunTs: now.getTime(), now })).toBe(false);
  });

  test("computes next interval and calendar run times", () => {
    const now = new Date("2026-05-31T12:00:00.000Z");

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({ mode: "interval", intervalUnit: "minutes", intervalVal: 15 }),
        now,
      })
    ).toBe(new Date("2026-05-31T12:15:00.000Z").getTime());

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({ mode: "daily", time: "09:30" }),
        now,
      })
    ).toBe(new Date("2026-06-01T09:30:00.000Z").getTime());

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({ mode: "weekly", time: "10:00", dayOfWeek: 1 }),
        now,
      })
    ).toBe(new Date("2026-06-01T10:00:00.000Z").getTime());
  });

  test("computes timezone-aware recurring v2 schedule runs", () => {
    const beforeDaily = new Date("2026-06-09T07:30:00.000Z");
    const afterDaily = new Date("2026-06-09T08:30:00.000Z");

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "daily",
          timeLocal: "09:00",
          timezone: "Europe/London",
        }),
        now: beforeDaily,
      })
    ).toBe(new Date("2026-06-09T08:00:00.000Z").getTime());

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "daily",
          timeLocal: "09:00",
          timezone: "Europe/London",
        }),
        now: afterDaily,
      })
    ).toBe(new Date("2026-06-10T08:00:00.000Z").getTime());

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "weekly",
          dayOfWeek: 1,
          timeLocal: "09:00",
          timezone: "Europe/London",
        }),
        now: afterDaily,
      })
    ).toBe(new Date("2026-06-15T08:00:00.000Z").getTime());

    expect(
      getNextWorkflowScheduleRunAt({
        intervalStr: JSON.stringify({
          version: 2,
          kind: "recurring",
          cadence: "monthly",
          dayOfMonth: 1,
          timeLocal: "09:00",
          timezone: "Europe/London",
        }),
        now: afterDaily,
      })
    ).toBe(new Date("2026-07-01T08:00:00.000Z").getTime());
  });

  test("supports hourly and targeted-times v2 schedules", () => {
    const now = new Date("2026-06-09T08:31:00.000Z");
    const hourlyConfig = JSON.stringify({
      version: 2,
      kind: "recurring",
      cadence: "hourly",
      everyHours: 4,
      startTimeLocal: "09:00",
      timezone: "Europe/London",
    });
    const targetedConfig = JSON.stringify({
      version: 2,
      kind: "targetedTimes",
      timesLocal: ["23:30", "04:30", "09:30"],
      timezone: "Europe/London",
    });

    expect(getNextWorkflowScheduleRunAt({ intervalStr: hourlyConfig, now })).toBe(new Date("2026-06-09T12:00:00.000Z").getTime());
    expect(getNextWorkflowScheduleRunAt({ intervalStr: targetedConfig, now: new Date("2026-06-09T07:00:00.000Z") })).toBe(new Date("2026-06-09T08:30:00.000Z").getTime());

    expect(shouldRunWorkflowSchedule({
      intervalStr: targetedConfig,
      lastRunTs: new Date("2026-06-09T08:29:00.000Z").getTime(),
      now,
    })).toBe(true);
    expect(shouldRunWorkflowSchedule({
      intervalStr: targetedConfig,
      lastRunTs: new Date("2026-06-09T08:30:00.000Z").getTime(),
      now,
    })).toBe(false);
  });
});
