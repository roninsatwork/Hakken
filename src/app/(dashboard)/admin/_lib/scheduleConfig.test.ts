import { describe, expect, test, vi } from "vitest";
import {
  addTargetedTime,
  buildScheduleConfig,
  createDefaultScheduleDraft,
  hydrateScheduleDraft,
  removeTargetedTime,
  serializeScheduleDraft,
  validateScheduleDraft,
} from "./scheduleConfig";

describe("schedule config helpers", () => {
  test("serializes recurring hourly schedules as v2 configs", () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      cadence: "hourly" as const,
      everyHours: 4,
      startTimeLocal: "09:00",
      timezone: "Europe/London",
    };

    expect(JSON.parse(serializeScheduleDraft(draft))).toEqual({
      version: 2,
      kind: "recurring",
      cadence: "hourly",
      everyHours: 4,
      startTimeLocal: "09:00",
      timezone: "Europe/London",
    });
  });

  test("hydrates v2 targeted times and keeps them sorted", () => {
    const draft = hydrateScheduleDraft(JSON.stringify({
      version: 2,
      kind: "targetedTimes",
      timesLocal: ["23:30", "04:30", "09:30", "09:30"],
      timezone: "Europe/London",
    }));

    expect(draft).toMatchObject({
      mode: "targetedTimes",
      timesLocal: ["04:30", "09:30", "23:30"],
      timezone: "Europe/London",
    });
    expect(validateScheduleDraft(draft)).toBeNull();
  });

  test("adds, deduplicates, removes, and validates targeted times", () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      mode: "targetedTimes" as const,
      timesLocal: [],
    };

    expect(validateScheduleDraft(draft)).toBe("missingTargetedTime");
    const withTimes = addTargetedTime(addTargetedTime(draft, "09:00"), "09:00");
    expect(withTimes.timesLocal).toEqual(["09:00"]);
    expect(removeTargetedTime(withTimes, "09:00").timesLocal).toEqual([]);
  });

  test("falls back safely when browser timezone is unavailable", () => {
    const resolvedOptions = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ locale: "en-GB", calendar: "gregory", numberingSystem: "latn", timeZone: "" });

    expect(buildScheduleConfig(createDefaultScheduleDraft())).toMatchObject({ timezone: "UTC" });
    resolvedOptions.mockRestore();
  });
});
