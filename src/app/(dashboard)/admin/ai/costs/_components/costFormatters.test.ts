import { describe, expect, test } from "vitest";
import {
  foldSmallSlices,
  formatCostAxisTick,
  formatUsdAmount,
  formatSmallUsdAmount,
  formatTokenAxisTick,
  getAgentMessageCount,
} from "./costFormatters";

describe("cost formatters", () => {
  test("formats standard USD values with locale separators", () => {
    expect(formatUsdAmount(1234.5, 4)).toBe("$1,234.5000");
  });

  test("preserves tiny non-zero values with an explicit threshold label", () => {
    expect(formatSmallUsdAmount(0.000001)).toBe("$< 0.00001");
    expect(formatSmallUsdAmount(0)).toBe("$0.00000");
  });

  test("formats chart axis values consistently", () => {
    expect(formatCostAxisTick("0.25")).toBe("$0.2500");
    expect(formatTokenAxisTick(999)).toBe("999");
    expect(formatTokenAxisTick(1200)).toBe("1k");
  });

  test("prefers interaction count over message count for agent rows", () => {
    expect(getAgentMessageCount(12, 4)).toBe(12);
    expect(getAgentMessageCount(undefined, 4)).toBe(4);
    expect(getAgentMessageCount()).toBe(0);
  });
});

describe("foldSmallSlices", () => {
  const row = (name: string, calls: number, cost: number) => ({ name, calls, cost });

  test("leaves a short list alone", () => {
    const rows = [row("a", 3, 1), row("b", 2, 1)];
    expect(foldSmallSlices(rows, 6, (n) => `${n} more`)).toEqual(rows);
  });

  test("keeps the biggest and folds the rest into one slice, added up", () => {
    const rows = [row("a", 1, 0.1), row("b", 9, 0.9), row("c", 5, 0.5), row("d", 2, 0.2), row("e", 7, 0.7), row("f", 3, 0.3), row("g", 4, 0.4), row("h", 6, 0.6)];
    expect(foldSmallSlices(rows, 6, (n) => `${n} more`)).toEqual([
      row("b", 9, 0.9), row("e", 7, 0.7), row("h", 6, 0.6), row("c", 5, 0.5), row("g", 4, 0.4),
      { name: "3 more", calls: 6, cost: 0.6 },
    ]);
  });
});
