import { describe, expect, test } from "vitest";
import { calculateModelCostUsd } from "./aiCostService";

const rates = {
  standardInputCostBelow200k: 10,
  standardInputCostAbove200k: 20,
  cachedInputCostBelow200k: 1,
  cachedInputCostAbove200k: 2,
  outputResponseCost: 40,
};

describe("model cost", () => {
  // Token counts here stay under the 200k tier boundary, so the below-200k
  // rates apply. The tier itself is covered separately below.
  test("charges input and output at their configured rates", () => {
    // 100k input at 10 gives 1.00; 50k output at 40 gives 2.00.
    expect(calculateModelCostUsd({
      inputTokens: 100_000,
      outputTokens: 50_000,
      rates,
    })).toBeCloseTo(3, 6);
  });

  test("charges cached input at the cached rate", () => {
    // Half served from cache: 50k at 10 gives 0.50, 50k at 1 gives 0.05.
    const cost = calculateModelCostUsd({
      inputTokens: 100_000,
      outputTokens: 0,
      cachedInputTokens: 50_000,
      rates,
    });
    expect(cost).toBeCloseTo(0.55, 6);
  });

  test("cached tokens are part of the input total, not extra", () => {
    // Providers report the cached count as a share of the prompt tokens. Adding
    // rather than subtracting would bill the same tokens twice.
    const allCached = calculateModelCostUsd({
      inputTokens: 100_000,
      outputTokens: 0,
      cachedInputTokens: 100_000,
      rates,
    });
    expect(allCached).toBeCloseTo(0.1, 6);
  });

  test("caching makes a call cheaper, never dearer", () => {
    const uncached = calculateModelCostUsd({ inputTokens: 500_000, outputTokens: 0, rates });
    const cached = calculateModelCostUsd({
      inputTokens: 500_000,
      outputTokens: 0,
      cachedInputTokens: 400_000,
      rates,
    });
    expect(cached).toBeLessThan(uncached);
  });

  test("falls back to the standard rate when no cached rate is configured", () => {
    // Under-stating spend would let a run sail past a cost ceiling it had
    // actually exceeded. Over-stating slightly is the safe direction.
    const cost = calculateModelCostUsd({
      inputTokens: 100_000,
      outputTokens: 0,
      cachedInputTokens: 100_000,
      rates: { standardInputCostBelow200k: 10 },
    });
    expect(cost).toBeCloseTo(1, 6);
  });

  test("uses the large-context tier above the threshold", () => {
    const cost = calculateModelCostUsd({
      inputTokens: 400_000,
      outputTokens: 0,
      cachedInputTokens: 400_000,
      rates,
    });
    // 400k cached at the above-200k cached rate of 2.
    expect(cost).toBeCloseTo(0.8, 6);
  });

  test("a missing large-context rate charges the standard rate, not nothing", () => {
    // Provider sync leaves the above-200k rate at zero for models it has no
    // tiered price for — the rates below are a real catalogue row — and zero was
    // read as free rather than as unknown. Every token past two hundred thousand
    // cost nothing, so a long run's spend stopped climbing at exactly the point
    // the spend ceiling becomes the only bound still holding it.
    const cost = calculateModelCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 0,
      rates: { standardInputCostBelow200k: 1.5, standardInputCostAbove200k: 0 },
    });
    expect(cost).toBeCloseTo(1.5, 6);

    // An explicitly dearer large-context rate is still respected.
    expect(calculateModelCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 0,
      rates: { standardInputCostBelow200k: 1.5, standardInputCostAbove200k: 3 },
    })).toBeCloseTo(3, 6);
  });

  test("reports zero when the model has no pricing at all", () => {
    // This is the case P3.1 had to work around: most enabled models carry no
    // rates, so the cost ceiling cannot fire and tighter step budgets apply.
    expect(calculateModelCostUsd({ inputTokens: 9_000, outputTokens: 9_000 })).toBe(0);
    expect(calculateModelCostUsd({ inputTokens: 9_000, outputTokens: 9_000, rates: {} })).toBe(0);
  });

  test("ignores impossible token counts rather than producing a negative bill", () => {
    const cost = calculateModelCostUsd({
      inputTokens: 1_000,
      outputTokens: -5,
      cachedInputTokens: 999_999,
      rates,
    });
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
