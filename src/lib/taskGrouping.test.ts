import { describe, expect, test } from "vitest";
import { formatTaskDue, getTaskGroup, groupTasks } from "./taskGrouping";

/**
 * The only question anyone asks a to-do list is "what needs me today", so the
 * boundaries between overdue, today and the rest are the thing worth pinning.
 */
const NOW = new Date(2026, 7, 12, 9, 0).getTime();
const open = (dueAt?: number) => ({ status: "OPEN" as const, dueAt });

describe("which group a task falls into", () => {
  test("yesterday is overdue, however recently", () => {
    expect(getTaskGroup(open(new Date(2026, 7, 11, 23, 59).getTime()), NOW)).toBe("overdue");
  });

  test("anything due today is today, including later tonight", () => {
    expect(getTaskGroup(open(new Date(2026, 7, 12, 0, 1).getTime()), NOW)).toBe("today");
    expect(getTaskGroup(open(new Date(2026, 7, 12, 23, 50).getTime()), NOW)).toBe("today");
  });

  test("the next six days are this week, the seventh is later", () => {
    expect(getTaskGroup(open(new Date(2026, 7, 13, 9, 0).getTime()), NOW)).toBe("week");
    expect(getTaskGroup(open(new Date(2026, 7, 18, 23, 0).getTime()), NOW)).toBe("week");
    expect(getTaskGroup(open(new Date(2026, 7, 19, 9, 0).getTime()), NOW)).toBe("later");
  });

  test("a task with no date waits rather than being invented into today", () => {
    // Undated work is not urgent and can never be late.
    expect(getTaskGroup(open(undefined), NOW)).toBe("later");
  });

  test("finished and dropped work leaves the queue regardless of its date", () => {
    const overdueDate = new Date(2026, 7, 1).getTime();
    expect(getTaskGroup({ status: "DONE", dueAt: overdueDate }, NOW)).toBe("done");
    expect(getTaskGroup({ status: "CANCELLED", dueAt: overdueDate }, NOW)).toBe("cancelled");
  });
});

describe("grouping the list", () => {
  test("orders the groups by urgency and drops the empty ones", () => {
    const grouped = groupTasks(
      [
        open(new Date(2026, 7, 20).getTime()),
        open(new Date(2026, 7, 10).getTime()),
        open(new Date(2026, 7, 12, 14, 0).getTime()),
      ],
      NOW,
    );

    expect(grouped.map((entry) => entry.group)).toEqual(["overdue", "today", "later"]);
    // Nothing due this week, so no empty heading for it.
    expect(grouped.some((entry) => entry.group === "week")).toBe(false);
  });

  test("keeps the order it was given inside a group", () => {
    const first = { status: "OPEN" as const, dueAt: new Date(2026, 7, 12, 9, 0).getTime(), id: "first" };
    const second = { status: "OPEN" as const, dueAt: new Date(2026, 7, 12, 17, 0).getTime(), id: "second" };

    const grouped = groupTasks([first, second], NOW);
    expect(grouped[0].tasks.map((task) => task.id)).toEqual(["first", "second"]);
  });

  test("an empty list produces no groups at all", () => {
    expect(groupTasks([], NOW)).toEqual([]);
  });
});

describe("the date on a row", () => {
  test("shows a short date, or nothing when undated", () => {
    expect(formatTaskDue(new Date(2026, 7, 12).getTime(), "en-GB")).toMatch(/12/);
    expect(formatTaskDue(new Date(2026, 7, 12).getTime(), "en-GB")).toMatch(/Aug/);
    expect(formatTaskDue(undefined, "en-GB")).toBeNull();
  });
});
