import { describe, expect, test } from "vitest";
import { getLegacyScheduleIntervalMs, parseScheduleConfig, shouldRunWorkflowSchedule } from "./workflowScheduleService";

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
});
