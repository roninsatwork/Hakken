import { describe, expect, it } from "vitest";
import { dayMet, judgeDays, pathOf, taskTitle, trialOf, usualOf } from "./hakkenTaskRules";

const below10 = { op: "below" as const, value: 10, days: 1 };
const halfFor3 = { op: "dropBy" as const, value: 50, days: 3 };

describe("how a Hakken alert is judged", () => {
  it("counts a day under, over, or down or up by a share of its usual", () => {
    expect(dayMet(7, below10, null)).toBe(true);
    expect(dayMet(10, below10, null)).toBe(false);
    expect(dayMet(200, halfFor3, 412)).toBe(true);
    expect(dayMet(250, halfFor3, 412)).toBe(false);
    // With no usual day there is nothing to drop from.
    expect(dayMet(0, halfFor3, null)).toBe(false);
  });

  it("tells every day its rule is met for the days asked, until it is stopped, and starts counting again when it is not", () => {
    const days = [
      { day: "2026-10-01", value: 405 },
      { day: "2026-10-02", value: 199 },
      { day: "2026-10-03", value: 201 },
      { day: "2026-10-04", value: 388 },
      { day: "2026-10-05", value: 190 },
      { day: "2026-10-06", value: 180 },
      { day: "2026-10-07", value: 170 },
      { day: "2026-10-08", value: 160 },
    ];
    const judged = judgeDays(days, halfFor3, 412);
    expect(judged.map((day) => day.streak)).toEqual([0, 1, 2, 0, 1, 2, 3, 4]);
    expect(judged.filter((day) => day.tells).map((day) => day.day)).toEqual(["2026-10-07", "2026-10-08"]);
  });

  it("carries the days in a row from the last day judged", () => {
    expect(judgeDays([{ day: "2026-10-05", value: 190 }], halfFor3, 412, 2)[0]).toMatchObject({ streak: 3, tells: true });
  });

  it("reads days in date order, whatever order they come in", () => {
    const judged = judgeDays([{ day: "2026-10-02", value: 5 }, { day: "2026-10-01", value: 50 }], below10, null);
    expect(judged.map((day) => day.day)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("tries a rule on the days read: how often it would have told its owner", () => {
    const days = [9, 22, 25, 8, 21, 23, 7].map((value, index) => ({ day: `2026-09-0${index + 1}`, value }));
    expect(trialOf(days, below10, usualOf(days.map((day) => day.value)))).toEqual({ tells: 3, of: 7 });
  });

  it("knows a figure's usual day", () => {
    expect(usualOf([20, 22, 27])).toBe(23);
    expect(usualOf([])).toBeNull();
  });
});

describe("a task in its owner's words", () => {
  it("says what it watches, on which page, and when it tells them", () => {
    expect(taskTitle({ website: "ronins.co.uk", page: "https://ronins.co.uk/web-design-london/", measure: "visitors", condition: below10 }))
      .toBe("Tell me if /web-design-london/ gets fewer than 10 visitors a day");
    expect(taskTitle({ website: "ronins.co.uk", measure: "visitors", condition: { op: "above", value: 1000, days: 1 } }))
      .toBe("Tell me if ronins.co.uk gets more than 1,000 visitors a day");
    expect(taskTitle({ website: "ronins.co.uk", page: "https://ronins.co.uk/web-design-surrey/", measure: "impressions", condition: halfFor3 }))
      .toBe("Tell me if /web-design-surrey/ shows up in Google half as often as usual for 3 days in a row");
    expect(taskTitle({ website: "ronins.co.uk", measure: "visitors", condition: { op: "dropBy", value: 30, days: 1 } }))
      .toBe("Tell me if ronins.co.uk gets 30% fewer visitors than usual in a day");
  });

  it("reads a page's path from its full address", () => {
    expect(pathOf("https://ronins.co.uk/web-design-london/")).toBe("/web-design-london/");
    expect(pathOf("/already-a-path/")).toBe("/already-a-path/");
  });
});
