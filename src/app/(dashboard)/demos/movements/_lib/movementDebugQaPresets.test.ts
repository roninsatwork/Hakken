import { describe, expect, it } from "vitest";
import { getMovementDebugQaPresets } from "./movementDebugQaPresets";

const CURRENT_GAME_VISUAL_PROOF_RECORDING_IDS = [
  "px71h2bsqg9xv8pxyffv5xgaed89wbx3",
  "px72q2e5m8pw9gctaj11yh36a989wjt7",
  "px736zs97w9axrn39je7pfahc989q8jv",
  "px74tzfb514yq5zpm2mpt3fdkx89xr2z",
  "px75fgt11wbg0jvr17j6fc2dvd89trpm",
  "px7b0y1rcfbe1e1zanknsgefp986f1qs",
  "px7ebpmfazdrtbad9bpefxnmp589xwj6",
  "px7fafa0wypmmc5rfz1nzmdvas88n6m0",
  "px7fmzw2v4yzex6yx3n9dchj0h89x7e3",
];

describe("movement debug QA presets", () => {
  it("covers each recording in the current Game visual proof plan", () => {
    for (const recordingId of CURRENT_GAME_VISUAL_PROOF_RECORDING_IDS) {
      expect(getMovementDebugQaPresets(recordingId, 4000), recordingId).not.toHaveLength(0);
    }
  });

  it("filters jump presets past the available frame count but keeps blocker chips visible", () => {
    const presets = getMovementDebugQaPresets("px71h2bsqg9xv8pxyffv5xgaed89wbx3", 12);

    expect(presets.map((preset) => preset.id)).toEqual([
      "baseline",
      "squat",
      "root-travel-blocked",
    ]);
  });

  it("exposes focused broad upper-body and long-form proof frames", () => {
    const upperBodyPresets = getMovementDebugQaPresets("px75fgt11wbg0jvr17j6fc2dvd89trpm", 3026);
    const longFormPresets = getMovementDebugQaPresets("px7fafa0wypmmc5rfz1nzmdvas88n6m0", 2169);

    expect(upperBodyPresets.map((preset) => preset.id)).toContain("upper-reach");
    expect(upperBodyPresets.map((preset) => preset.id)).toContain("upper-twist");
    expect(longFormPresets.map((preset) => preset.id)).toContain("source-display");
    expect(longFormPresets.map((preset) => preset.id)).toContain("root-turn");
  });
});
