import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_TIME, DEFAULT_TASK_TIME_ZONE, clockOf, nextRunOf, nextTaskRun, taskTimeOfDay, taskTimeZone, weekdayIn } from "./hakkenTaskTiming";

describe("when a Hakken task next runs", () => {
  it("runs at its owner's time today when that time is still to come", () => {
    // 07:00 in London on 7 October 2026 is 06:00 UTC (summer time).
    const now = Date.UTC(2026, 9, 7, 6, 0);
    expect(new Date(nextTaskRun("09:00", "Europe/London", now)).toISOString()).toBe("2026-10-07T08:00:00.000Z");
  });

  it("runs tomorrow once today's time has passed", () => {
    const now = Date.UTC(2026, 9, 7, 8, 30);
    expect(new Date(nextTaskRun("09:00", "Europe/London", now)).toISOString()).toBe("2026-10-08T08:00:00.000Z");
  });

  it("keeps the owner's wall clock across the clocks going back", () => {
    // London leaves summer time on 25 October 2026: 9am is 08:00 UTC before, 09:00 UTC after.
    const now = Date.UTC(2026, 9, 24, 10, 0);
    expect(new Date(nextTaskRun("09:00", "Europe/London", now)).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("reads each owner's own zone", () => {
    const now = Date.UTC(2026, 9, 7, 0, 0);
    expect(new Date(nextTaskRun("08:30", "America/New_York", now)).toISOString()).toBe("2026-10-07T12:30:00.000Z");
  });

  it("falls back to 9am in London for a time or zone it cannot read", () => {
    expect(taskTimeZone("Not/AZone")).toBe(DEFAULT_TASK_TIME_ZONE);
    expect(taskTimeZone(undefined)).toBe(DEFAULT_TASK_TIME_ZONE);
    expect(taskTimeOfDay("25:00")).toBe(DEFAULT_TASK_TIME);
    expect(taskTimeOfDay("nine")).toBe(DEFAULT_TASK_TIME);
    expect(taskTimeOfDay("8:30")).toBe("08:30");
  });

  it("says a time as people do", () => {
    expect(clockOf("09:00")).toBe("9am");
    expect(clockOf("08:30")).toBe("8:30am");
    expect(clockOf("13:00")).toBe("1pm");
    expect(clockOf("00:15")).toBe("12:15am");
  });

  it("runs a weekly report at its owner's time on its weekday", () => {
    // Wednesday 7 October 2026, 10:00 in London; a Monday report at 9am runs on Monday 12 October.
    const now = Date.UTC(2026, 9, 7, 9, 0);
    const monday = nextRunOf({ timeOfDay: "09:00", timeZone: "Europe/London", report: { every: "week", weekday: 1 } }, now);
    expect(new Date(monday).toISOString()).toBe("2026-10-12T08:00:00.000Z");
    expect(weekdayIn(monday, "Europe/London")).toBe(1);
    // A daily alert runs tomorrow.
    expect(new Date(nextRunOf({ timeOfDay: "09:00", timeZone: "Europe/London" }, now)).toISOString()).toBe("2026-10-08T08:00:00.000Z");
  });
});
