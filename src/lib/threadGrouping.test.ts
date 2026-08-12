import { describe, expect, test } from "vitest";
import {
  formatThreadStamp,
  getThreadDayBucket,
  groupThreadsByDay,
} from "./threadGrouping";

/**
 * The boundaries are calendar days in the viewer's timezone, not rolling
 * 24-hour windows — a conversation from 23:50 last night belongs under
 * "Yesterday" even though it is twenty minutes old.
 */
describe("thread day buckets", () => {
  const now = new Date(2026, 7, 12, 9, 30).getTime();

  test("anything from today's calendar day is today, however early", () => {
    expect(getThreadDayBucket(new Date(2026, 7, 12, 0, 1).getTime(), now)).toBe("today");
    expect(getThreadDayBucket(new Date(2026, 7, 12, 9, 29).getTime(), now)).toBe("today");
  });

  test("late last night is yesterday, not today", () => {
    expect(getThreadDayBucket(new Date(2026, 7, 11, 23, 50).getTime(), now)).toBe("yesterday");
  });

  test("the day before yesterday falls through to earlier", () => {
    expect(getThreadDayBucket(new Date(2026, 7, 10, 23, 59).getTime(), now)).toBe("earlier");
  });
});

describe("grouping the list", () => {
  const now = new Date(2026, 7, 12, 21, 0).getTime();
  const rows = [
    { _id: "a", _creationTime: 0, updatedAt: new Date(2026, 7, 12, 20, 0).getTime() },
    { _id: "b", _creationTime: 0, updatedAt: new Date(2026, 7, 12, 9, 0).getTime() },
    { _id: "c", _creationTime: 0, updatedAt: new Date(2026, 7, 11, 17, 0).getTime() },
    { _id: "d", _creationTime: 0, updatedAt: new Date(2026, 7, 3, 11, 0).getTime() },
  ];

  test("keeps the order it was given and labels each group", () => {
    const grouped = groupThreadsByDay(rows, now);
    expect(grouped.map((g) => g.bucket)).toEqual(["today", "yesterday", "earlier"]);
    expect(grouped[0].threads.map((t) => t._id)).toEqual(["a", "b"]);
    expect(grouped[1].threads.map((t) => t._id)).toEqual(["c"]);
    expect(grouped[2].threads.map((t) => t._id)).toEqual(["d"]);
  });

  test("a bucket with nothing in it is not rendered as an empty heading", () => {
    const grouped = groupThreadsByDay([rows[0], rows[3]], now);
    expect(grouped.map((g) => g.bucket)).toEqual(["today", "earlier"]);
  });

  test("falls back to creation time when a thread has never been updated", () => {
    const grouped = groupThreadsByDay(
      [{ _id: "x", _creationTime: new Date(2026, 7, 12, 8, 0).getTime() }],
      now,
    );
    expect(grouped[0].bucket).toBe("today");
  });

  test("an empty list produces no groups at all", () => {
    expect(groupThreadsByDay([], now)).toEqual([]);
  });
});

describe("the stamp on each row", () => {
  test("recent conversations show a time, older ones show a date", () => {
    const at = new Date(2026, 7, 12, 14, 5).getTime();
    expect(formatThreadStamp({ updatedAt: at, bucket: "today", locale: "en-GB" })).toBe("14:05");
    expect(formatThreadStamp({ updatedAt: at, bucket: "yesterday", locale: "en-GB" })).toBe("14:05");
    // The time stops being the useful part once it is not this week.
    expect(formatThreadStamp({ updatedAt: at, bucket: "earlier", locale: "en-GB" })).toMatch(/12/);
    expect(formatThreadStamp({ updatedAt: at, bucket: "earlier", locale: "en-GB" })).toMatch(/Aug/);
  });
});
