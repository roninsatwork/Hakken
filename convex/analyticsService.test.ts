import { describe, expect, test } from "vitest";
import {
  buildModelCostContext,
  computeCostFromMap,
  createTimelineMap,
  formatAnalyticsDateGroup,
  getAggregationType,
  roundMetric,
} from "./analyticsService";

describe("analytics service helpers", () => {
  test("selects daily, weekly, and monthly aggregation windows", () => {
    const day = 24 * 60 * 60 * 1000;

    expect(getAggregationType(0, 30 * day)).toBe("day");
    expect(getAggregationType(0, 90 * day)).toBe("week");
    expect(getAggregationType(0, 365 * day)).toBe("month");
  });

  test("formats week groups with optional year suffix", () => {
    const date = new Date("2026-05-31T12:00:00.000Z");

    expect(formatAnalyticsDateGroup(date, "week")).toMatch(/^Wk \d+$/);
    expect(formatAnalyticsDateGroup(date, "week", { includeWeekYear: true })).toMatch(/^Wk \d+, 2026$/);
  });

  test("preseeds timeline maps across a date window", () => {
    const timeline = createTimelineMap(
      new Date("2026-05-01T00:00:00.000Z"),
      new Date("2026-05-03T00:00:00.000Z"),
      "day",
      () => ({ cost: 0 })
    );

    expect(Object.keys(timeline)).toEqual(["1 May", "2 May", "3 May"]);
  });

  test("builds model cost context and computes model-specific cost", () => {
    const { modelMap, defaultModelId } = buildModelCostContext([
      {
        modelId: "openai:default-model",
        providerKey: "openai",
        providerModelId: "default-model",
        displayName: "Default Model",
        isDefault: true,
        isEnabled: true,
        standardInputCostBelow200k: 1,
        standardInputCostAbove200k: 2,
        outputResponseCost: 4,
      },
      {
        modelId: "disabled-default",
        displayName: "Disabled Default",
        isDefault: true,
        isEnabled: false,
        standardInputCostBelow200k: 100,
        standardInputCostAbove200k: 100,
        outputResponseCost: 100,
      },
    ]);

    expect(defaultModelId).toBe("openai:default-model");
    expect(computeCostFromMap("openai:default-model", 100000, 500000, modelMap)).toBe(2.1);
    expect(computeCostFromMap("default-model", 300000, 500000, modelMap)).toBe(2.6);
    expect(computeCostFromMap("openai:default-model", 300000, 500000, modelMap)).toBe(2.6);
    expect(computeCostFromMap("missing-model", 300000, 500000, modelMap)).toBe(0);
  });

  test("rounds analytics metrics without converting currency", () => {
    // Spend is reported in the provider's own currency. There is no exchange
    // rate to apply, and the hardcoded 0.78 that used to live here was a guess
    // printed under a pound sign.
    expect(roundMetric(1.23456, 2)).toBe(1.23);
  });
});
