import { describe, expect, test } from "vitest";
import {
  LOGIN_WINDOW_DAYS,
  activityBound,
  loginWindowStart,
  planLoginCountUpdates,
  tallyLoginsByUser,
} from "./userActivityService";

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_START = loginWindowStart(NOW);

function login(userId: string, daysAgo: number, status: "SUCCESS" | "FAILED" = "SUCCESS") {
  return { userId, status, timestamp: NOW - daysAgo * DAY };
}

describe("tallyLoginsByUser", () => {
  test("counts only what falls inside the window", () => {
    const tally = tallyLoginsByUser(
      [login("u1", 5), login("u1", 20), login("u1", 40)],
      WINDOW_START
    );

    expect(tally.get("u1")).toBe(2);
  });

  test("excludes failed attempts, which are the opposite of usage", () => {
    const tally = tallyLoginsByUser(
      [login("u1", 1), login("u1", 2, "FAILED"), login("u1", 3, "FAILED")],
      WINDOW_START
    );

    expect(tally.get("u1")).toBe(1);
  });

  test("keeps users separate", () => {
    const tally = tallyLoginsByUser(
      [login("u1", 1), login("u2", 1), login("u2", 2)],
      WINDOW_START
    );

    expect(tally.get("u1")).toBe(1);
    expect(tally.get("u2")).toBe(2);
  });

  test("a user with nothing in the window is simply absent", () => {
    const tally = tallyLoginsByUser([login("u1", 40)], WINDOW_START);

    expect(tally.has("u1")).toBe(false);
  });

  test("the window is exactly the documented length", () => {
    expect(Math.round((NOW - loginWindowStart(NOW)) / DAY)).toBe(LOGIN_WINDOW_DAYS);
  });
});

describe("planLoginCountUpdates", () => {
  test("resets a user who has dropped out of the window", () => {
    // The trap this whole module exists for. A job that only writes users it
    // finds in the tally leaves this one showing 7 logins for ever.
    const updates = planLoginCountUpdates([{ _id: "u1", loginCount30d: 7 }], new Map());

    expect(updates).toEqual([{ id: "u1", loginCount30d: 0 }]);
  });

  test("writes a user whose count changed", () => {
    const updates = planLoginCountUpdates(
      [{ _id: "u1", loginCount30d: 3 }],
      new Map([["u1", 5]])
    );

    expect(updates).toEqual([{ id: "u1", loginCount30d: 5 }]);
  });

  test("writes nothing when the stored count is already right", () => {
    const updates = planLoginCountUpdates(
      [{ _id: "u1", loginCount30d: 5 }],
      new Map([["u1", 5]])
    );

    expect(updates).toEqual([]);
  });

  test("treats an unset count as zero rather than writing a redundant zero", () => {
    const updates = planLoginCountUpdates([{ _id: "u1" }], new Map());

    expect(updates).toEqual([]);
  });

  test("sets a first count on a user who has never had one", () => {
    const updates = planLoginCountUpdates([{ _id: "u1" }], new Map([["u1", 2]]));

    expect(updates).toEqual([{ id: "u1", loginCount30d: 2 }]);
  });

  test("handles a mixed population in one pass", () => {
    const updates = planLoginCountUpdates(
      [
        { _id: "unchanged", loginCount30d: 4 },
        { _id: "decayed", loginCount30d: 9 },
        { _id: "grown", loginCount30d: 1 },
        { _id: "new" },
      ],
      new Map([
        ["unchanged", 4],
        ["grown", 6],
        ["new", 3],
      ])
    );

    expect(updates).toEqual([
      { id: "decayed", loginCount30d: 0 },
      { id: "grown", loginCount30d: 6 },
      { id: "new", loginCount30d: 3 },
    ]);
  });
});

describe("activityBound", () => {
  test("active windows become a lower bound the index can range on", () => {
    expect(activityBound("active7", NOW)).toEqual({ kind: "since", from: NOW - 7 * DAY });
    expect(activityBound("active30", NOW)).toEqual({ kind: "since", from: NOW - 30 * DAY });
  });

  test("dormant becomes an upper bound", () => {
    expect(activityBound("dormant", NOW)).toEqual({ kind: "before", before: NOW - 30 * DAY });
  });

  test("never is its own state, not an very old date", () => {
    // Sorting "never signed in" as an ancient timestamp would read as "signed
    // in long ago" — a different and more flattering claim than the truth.
    expect(activityBound("never", NOW)).toEqual({ kind: "never" });
  });

  test("any places no bound at all", () => {
    expect(activityBound("any", NOW)).toEqual({ kind: "any" });
  });
});
