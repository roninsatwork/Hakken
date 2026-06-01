import { describe, expect, test } from "vitest";
import {
  formatCostAxisTick,
  formatGbpAmount,
  formatSmallGbpAmount,
  formatTokenAxisTick,
  getAgentMessageCount,
} from "./costFormatters";

describe("cost formatters", () => {
  test("formats standard GBP values with locale separators", () => {
    expect(formatGbpAmount(1234.5, 4)).toBe("£1,234.5000");
  });

  test("preserves tiny non-zero values with an explicit threshold label", () => {
    expect(formatSmallGbpAmount(0.000001)).toBe("£< 0.00001");
    expect(formatSmallGbpAmount(0)).toBe("£0.00000");
  });

  test("formats chart axis values consistently", () => {
    expect(formatCostAxisTick("0.25")).toBe("£0.2500");
    expect(formatTokenAxisTick(999)).toBe("999");
    expect(formatTokenAxisTick(1200)).toBe("1k");
  });

  test("prefers interaction count over message count for agent rows", () => {
    expect(getAgentMessageCount(12, 4)).toBe(12);
    expect(getAgentMessageCount(undefined, 4)).toBe(4);
    expect(getAgentMessageCount()).toBe(0);
  });
});
