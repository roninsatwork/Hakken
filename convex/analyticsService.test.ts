import { describe, expect, test } from "vitest";
import type { ModelBreakdown, ProviderBreakdown } from "./analyticsService";
import {
  buildModelCostContext,
  mergeSnapshotModelMetrics,
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

/**
 * The gap this closes: both analytics queries merged a stored day's models and
 * silently skipped its providers, so the provider breakdown only ever counted
 * today. It surfaced as a full thirty-day timeline sitting above an empty
 * Provider Usage panel.
 */
describe("merging a snapshot's model figures", () => {
  const context = () =>
    buildModelCostContext([
      {
        modelId: "alpha:fast",
        providerKey: "alpha",
        providerModelId: "fast",
        displayName: "Alpha Fast",
        friendlyName: "Alpha Fast v2",
        isDefault: true,
        isEnabled: true,
        standardInputCostBelow200k: 1,
        standardInputCostAbove200k: 2,
        outputResponseCost: 4,
      },
      {
        modelId: "alpha:lite",
        providerKey: "alpha",
        providerModelId: "lite",
        displayName: "Alpha Lite",
        isDefault: false,
        isEnabled: true,
        standardInputCostBelow200k: 1,
        standardInputCostAbove200k: 2,
        outputResponseCost: 4,
      },
      {
        modelId: "beta:standard",
        providerKey: "beta",
        providerModelId: "standard",
        displayName: "Beta Standard",
        isDefault: false,
        isEnabled: true,
        standardInputCostBelow200k: 1,
        standardInputCostAbove200k: 2,
        outputResponseCost: 4,
      },
    ]);

  test("still builds the model breakdown it always did", () => {
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics(
      [{ model: "alpha:fast", cost: 2, calls: 5 }],
      modelMap,
      models,
      providers,
    );

    expect(models["alpha:fast"]).toEqual({ name: "Alpha Fast v2", cost: 2, calls: 5 });
  });

  test("builds the provider breakdown the queries used to skip", () => {
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics(
      [{ model: "alpha:fast", cost: 2, calls: 5 }],
      modelMap,
      models,
      providers,
    );

    expect(providers).toEqual({ alpha: { providerKey: "alpha", cost: 2, calls: 5 } });
  });

  test("adds two models from one provider into a single row", () => {
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics(
      [
        { model: "alpha:fast", cost: 2, calls: 5 },
        { model: "alpha:lite", cost: 1, calls: 3 },
        { model: "beta:standard", cost: 4, calls: 1 },
      ],
      modelMap,
      models,
      providers,
    );

    expect(providers.alpha).toEqual({ providerKey: "alpha", cost: 3, calls: 8 });
    expect(providers.beta).toEqual({ providerKey: "beta", cost: 4, calls: 1 });
  });

  test("accumulates across the days of a window rather than replacing", () => {
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics([{ model: "beta:standard", cost: 1, calls: 1 }], modelMap, models, providers);
    mergeSnapshotModelMetrics([{ model: "beta:standard", cost: 2, calls: 3 }], modelMap, models, providers);

    expect(providers.beta).toEqual({ providerKey: "beta", cost: 3, calls: 4 });
  });

  test("shows a retired model's spend as unattributed rather than losing it", () => {
    // A model that has since left the catalogue still cost real money on the
    // day it ran. Dropping it would quietly understate the period's spend.
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics([{ model: "gone:old-model", cost: 7, calls: 2 }], modelMap, models, providers);

    expect(providers.unknown).toEqual({ providerKey: "unknown", cost: 7, calls: 2 });
    expect(models["gone:old-model"].name).toBe("gone:old-model");
  });

  test("does nothing for a day that stored no model figures", () => {
    const { modelMap } = context();
    const models: ModelBreakdown = {};
    const providers: ProviderBreakdown = {};

    mergeSnapshotModelMetrics(undefined, modelMap, models, providers);

    expect(models).toEqual({});
    expect(providers).toEqual({});
  });
});
