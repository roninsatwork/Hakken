import { describe, expect, test } from "vitest";
import { calculateNextPurgeRun } from "./purgeScheduleService";

describe("purge schedule service", () => {
  test("rounds hourly schedules to the next UTC hour", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Hourly", 2, undefined, undefined, now)).toBe(
      Date.parse("2026-05-31T17:00:00.000Z")
    );
  });

  test("schedules daily runs today or tomorrow depending on the UTC hour", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Daily", 20, undefined, undefined, now)).toBe(
      Date.parse("2026-05-31T20:00:00.000Z")
    );
    expect(calculateNextPurgeRun("Daily", 2, undefined, undefined, now)).toBe(
      Date.parse("2026-06-01T02:00:00.000Z")
    );
  });

  test("schedules weekly runs for the next matching UTC weekday", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Weekly", 2, 0, undefined, now)).toBe(
      Date.parse("2026-06-07T02:00:00.000Z")
    );
  });

  test("schedules monthly runs for the next matching UTC day", () => {
    const now = new Date("2026-05-31T16:37:52.000Z");

    expect(calculateNextPurgeRun("Monthly", 2, undefined, 15, now)).toBe(
      Date.parse("2026-06-15T02:00:00.000Z")
    );
  });
});
