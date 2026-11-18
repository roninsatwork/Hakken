import { describe, expect, test } from "vitest";
import { tickedUpdateOf, trackedPageData } from "./_components/trackedSees";

/**
 * What Tracked keywords and Tracked pages hand their eye (search-console-tracked-way-1-plan-2026-11-18.md): the ticked
 * rows' clicks in the 14 days before the newest finished Google update began, against the 14 days after it finished.
 */

const days = (from: string, count: number, clicks: number) => Array.from({ length: count }, (_, at) => {
  const day = new Date(Date.parse(`${from}T00:00:00Z`) + at * 86_400_000).toISOString().slice(0, 10);
  return { day, clicks };
});
const SPAM = { title: "September 2026 spam update", startedOn: "2026-09-24", finishedOn: "2026-10-08" };
const CORE = { title: "November 2026 core update", startedOn: "2026-11-10", finishedOn: null };
const AUGUST = { title: "August 2026 spam update", startedOn: "2026-08-18", finishedOn: "2026-08-21" };

describe("the ticked rows either side of Google's newest finished update", () => {
  // 1 click a day from 4 August to 23 September, 2 a day after: the 14 days before the spam update hold 14, the 14 after 28.
  const ticked = [{ key: "door handles", days: [...days("2026-08-17", 38, 1), ...days("2026-09-24", 54, 2)], daysBefore: days("2026-08-04", 13, 1), failed: false }];

  test("reads the newest that finished, its days after inside the dates; one still rolling out is passed over", () => {
    expect(tickedUpdateOf(ticked, [AUGUST, SPAM, CORE], "2026-11-16", 14, (key) => key)).toEqual({
      title: SPAM.title, startedOn: SPAM.startedOn, finishedOn: SPAM.finishedOn, rows: [{ name: "door handles", before: 14, after: 28 }],
    });
  });

  test("an update whose 14 days after run past the dates isn't read yet", () => {
    expect(tickedUpdateOf(ticked, [SPAM], "2026-10-15", 14, (key) => key)).toBeNull();
  });

  test("names each row as the chart does, and leaves out a row Google didn't answer for or hasn't yet", () => {
    const waiting = { key: "door knobs", days: null, daysBefore: [], failed: false };
    const failed = { key: "cupboard handles", days: [], daysBefore: [], failed: true };
    expect(tickedUpdateOf([...ticked, waiting, failed], [SPAM], "2026-11-16", 14, (key) => key.toUpperCase())?.rows).toEqual([{ name: "DOOR HANDLES", before: 14, after: 28 }]);
    expect(tickedUpdateOf([waiting], [SPAM], "2026-11-16", 14, (key) => key)).toBeNull();
  });

  test("the eye's figures: the list's, the country's clicks, the ticked rows with figures, the update where there is one", () => {
    const data = trackedPageData({
      page: { summary: { rows: 2 } },
      countryClicks: 7124,
      ticked: [{ name: "door handles", clicks: 118, previousClicks: 12 }, { name: "door knobs", clicks: null, previousClicks: null }],
      update: null,
      names: { allTracked: "Your tracked keywords" },
    });
    expect(data).toEqual({ summary: { rows: 2 }, website: { clicks: 7124 }, ticked: [{ name: "door handles", clicks: 118, previousClicks: 12 }], names: { allTracked: "Your tracked keywords" } });
  });

  test("an update the ticked rows had no clicks either side of isn't handed over: two noughts read as news", () => {
    const quiet = { title: SPAM.title, startedOn: SPAM.startedOn, finishedOn: SPAM.finishedOn, rows: [{ name: "Black Door Handles", before: 0, after: 0 }] };
    const base = { page: {}, countryClicks: null, ticked: [], names: {} };
    expect(trackedPageData({ ...base, update: quiet })).not.toHaveProperty("update");
    expect(trackedPageData({ ...base, update: { ...quiet, rows: [{ name: "Door Handles", before: 21, after: 26 }] } })).toHaveProperty("update.rows.0.after", 26);
  });
});
