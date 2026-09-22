import { describe, expect, test } from "vitest";

import { calculateModelCostUsd } from "@/convex/aiCostService";
import { formatTokenCost } from "./modelAdminUtils";

/**
 * The rate the screen prints and the rate the runtime charges are the same
 * number, and this file exists to keep them that way.
 *
 * `formatTokenCost` used to multiply the stored rate by a million, so a model
 * priced at 0.075 per million tokens was advertised to admins as £75,000.00 —
 * while `calculateModelCostUsd` quietly charged 0.075. Nothing caught it because
 * the two lived in different halves of the repo and neither was tested against
 * the other.
 */
describe("formatTokenCost", () => {
  test("prints the stored rate as-is, because it is already per million", () => {
    expect(formatTokenCost(0.075)).toBe("$0.075");
    expect(formatTokenCost(0.3)).toBe("$0.30");
    expect(formatTokenCost(3)).toBe("$3.00");
    expect(formatTokenCost(15)).toBe("$15.00");
  });

  test("agrees with what the runtime actually charges for a million tokens", () => {
    const rates = { standardInputCostBelow200k: 0.075, outputResponseCost: 0.3 };

    // Charged in a 100k slice and scaled up, because the rate the catalogue
    // shows is the below-200k one — a literal million-token call would be
    // charged at the large-context rate instead.
    const SLICE = 100_000;
    const SLICES_PER_MILLION = 1_000_000 / SLICE;

    const inputChargePerMillion = calculateModelCostUsd({
      inputTokens: SLICE,
      outputTokens: 0,
      rates,
    }) * SLICES_PER_MILLION;

    const outputChargePerMillion = calculateModelCostUsd({
      inputTokens: 0,
      outputTokens: SLICE,
      rates,
    }) * SLICES_PER_MILLION;

    expect(inputChargePerMillion).toBeCloseTo(rates.standardInputCostBelow200k, 10);
    expect(outputChargePerMillion).toBeCloseTo(rates.outputResponseCost, 10);

    expect(formatTokenCost(rates.standardInputCostBelow200k)).toBe(formatTokenCost(inputChargePerMillion));
    expect(formatTokenCost(rates.outputResponseCost)).toBe(formatTokenCost(outputChargePerMillion));
  });

  test("says nothing rather than zero when a model has no price", () => {
    expect(formatTokenCost(undefined)).toBe("—");
    expect(formatTokenCost(0)).toBe("—");
  });
});
