import { describe, expect, test } from "vitest";
import { formatDate, formatDateTime, formatTime } from "./dates";

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
