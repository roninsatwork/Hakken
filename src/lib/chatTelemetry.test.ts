import { describe, expect, test } from "vitest";
import {
  estimateMessageCostUsd,
  formatEstimatedChatCostUsd,
  getChatTokenTotal,
  getMessageTokenTotal,
} from "./chatTelemetry";

describe("chat telemetry helpers", () => {
  test("totals message tokens defensively", () => {
    expect(getMessageTokenTotal({ inputTokens: 100, outputTokens: 25 })).toBe(125);
    expect(getMessageTokenTotal({ inputTokens: Number.NaN, outputTokens: 25 })).toBe(25);
    expect(getChatTokenTotal([
      { inputTokens: 100, outputTokens: 25 },
      { inputTokens: 50, outputTokens: 10 },
    ])).toBe(185);
  });

  test("estimates standard model message cost in USD", () => {
    expect(estimateMessageCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      modelUsed: "model-flash",
    })).toBeCloseTo(0.375);
  });

  test("estimates pro model message cost in USD", () => {
    expect(estimateMessageCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      modelUsed: "model-pro",
    })).toBeCloseTo(14);
  });

  test("formats chat estimates for display", () => {
    expect(formatEstimatedChatCostUsd([
      { inputTokens: 1000, outputTokens: 500, modelUsed: "flash" },
    ])).toBe("0.00022");
  });
});
