import { describe, expect, it } from "vitest";
import { summarizeMovementCommissioningFailures } from "./movementCommissioningFailurePresentation";

describe("commissioning failure presentation", () => {
  it("groups thousands of internal frame failures into actionable channel summaries", () => {
    const failures = [0, 1, 2].flatMap((frame) => [
      `Frame ${frame} has the wrong Deep Capture acquisition profile.`,
      `Frame ${frame} dense-body adapter evidence is invalid: zero anchors.`,
      `Frame ${frame} must contain 200-500 dense-body anchors.`,
    ]).concat([
      "denseBody Deep Capture evidence is incomplete.",
      "Frame 1 left hand evidence is incomplete or ambiguous.",
    ]);

    expect(summarizeMovementCommissioningFailures(failures, 3)).toEqual([
      "Internal capture-profile stamping affected 3/3 moments. This is a software fault, not a movement or positioning mistake.",
      "Dense body tracking affected 3/3 moments. The browser model did not provide a valid measured anchor set.",
      "Left hand evidence affected 1/3 moments. Those moments must be retained honestly as missing evidence.",
    ]);
  });
});
