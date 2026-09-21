import { describe, expect, test } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from "./dates";

describe("date helpers", () => {
  test("formats valid dates with caller-provided locale and options", () => {
    const date = "2026-05-31T16:37:52.000Z";

    expect(formatDate(date, { locale: "en-GB", options: { day: "numeric", month: "short", year: "numeric" } })).toBe(
      "31 May 2026"
    );
    expect(formatTime(date, { locale: "en-GB", options: { hour: "2-digit", minute: "2-digit", timeZone: "UTC" } })).toBe(
      "16:37"
    );
  });

  test("falls back for missing or invalid values", () => {
    expect(formatDate(undefined)).toBe("N/A");
    expect(formatDateTime("not a date", { fallback: "Missing" })).toBe("Missing");
  });
});

describe("datetime-local round trip", () => {
  test("a timestamp comes back as the same moment", () => {
    // The round trip is what matters: the string is in the reader's timezone,
    // so asserting its literal text would only pass in one place on earth.
    const moment = Date.parse("2026-09-21T02:00:00Z");
    const value = toDateTimeLocalValue(moment);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDateTimeLocalValue(value)).toBe(moment);
  });

  test("it renders local time, not UTC", () => {
    const moment = Date.parse("2026-09-21T02:00:00Z");
    const local = new Date(moment);
    const value = toDateTimeLocalValue(moment);
    expect(Number(value.slice(11, 13))).toBe(local.getHours());
  });

  test("nothing in, nothing out", () => {
    expect(toDateTimeLocalValue(null)).toBe("");
    expect(toDateTimeLocalValue(undefined)).toBe("");
    expect(toDateTimeLocalValue("not a date")).toBe("");
  });

  test("an empty or unreadable value is null rather than a guess", () => {
    // Null lets a caller tell "no time set" from a time, which is the
    // difference between inheriting and overriding.
    expect(fromDateTimeLocalValue("")).toBeNull();
    expect(fromDateTimeLocalValue("nonsense")).toBeNull();
  });
});
