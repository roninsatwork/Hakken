import { describe, expect, test } from "vitest";
import { MOVE_VIEWS, moveCounts, moveOf } from "./pageMoves";

describe("All pages' filters (all-pages-rethink-plan.md AP5)", () => {
  test("a gain or a drop is 3 views or more; fewer is static; none viewed is no visits, however many before", () => {
    expect(MOVE_VIEWS).toBe(3);
    expect(moveOf(259, 228)).toBe("gains");
    expect(moveOf(24, 0)).toBe("gains");
    expect(moveOf(177, 279)).toBe("dropped");
    expect(moveOf(25, 23)).toBe("static");
    expect(moveOf(2, 0)).toBe("static");
    expect(moveOf(0, 0)).toBe("none");
    expect(moveOf(0, 12)).toBe("none");
    // Without a span before, nothing moved.
    expect(moveOf(40, null)).toBe("static");
    expect(moveOf(0, null)).toBe("none");
  });

  test("each filter's count, adding up to every page", () => {
    const counts = moveCounts([
      { views: 259, viewsBefore: 228 }, { views: 177, viewsBefore: 279 }, { views: 25, viewsBefore: 23 }, { views: 0, viewsBefore: 12 }, { views: 0, viewsBefore: 0 },
    ]);
    expect(counts).toEqual({ all: 5, gains: 1, dropped: 1, static: 1, none: 2 });
    expect(counts.gains + counts.dropped + counts.static + counts.none).toBe(counts.all);
  });
});
