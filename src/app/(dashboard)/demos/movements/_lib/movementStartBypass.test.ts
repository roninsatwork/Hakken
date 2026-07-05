import { describe, expect, it } from "vitest";
import { resolveMovementStartReadinessBypassReason } from "./movementStartBypass";

describe("resolveMovementStartReadinessBypassReason", () => {
  it("does not bypass start readiness for normal gameplay", () => {
    expect(resolveMovementStartReadinessBypassReason({})).toBeNull();
  });

  it.each([
    ["debug auto baseline", { isDebugAutoBaselineRoute: true }, "debug-auto-baseline"],
    ["debug player pose", { isDebugPlayerPoseRoute: true }, "debug-player-pose"],
    ["guided preview", { isGuidedPreviewRoute: true }, "guided-preview"],
    ["manual preview skip", { isManualPreviewSkip: true }, "manual-preview-skip"],
  ] as const)("allows the %s test/demo bypass", (_label, input, expected) => {
    expect(resolveMovementStartReadinessBypassReason(input)).toBe(expected);
  });

  it("keeps debug auto baseline as the most explicit bypass reason", () => {
    expect(resolveMovementStartReadinessBypassReason({
      isDebugAutoBaselineRoute: true,
      isDebugPlayerPoseRoute: true,
      isGuidedPreviewRoute: true,
      isManualPreviewSkip: true,
    })).toBe("debug-auto-baseline");
  });
});
