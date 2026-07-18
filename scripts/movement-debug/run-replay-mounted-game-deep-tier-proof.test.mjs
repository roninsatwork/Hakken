import { describe, expect, it } from "vitest";
import {
  buildDeepCaptureTierProofPlan,
  parseDeepCaptureTierProofArgs,
  selectDeepCaptureTierRecordings,
} from "./run-replay-mounted-game-deep-tier-proof.mjs";

const manifest = {
  recordings: [
    { id: "motion", session: "motion.json", title: "Full Motion Exercises" },
    { id: "flow", session: "flow.json", title: "Full Spinal Flow" },
    { id: "spins", session: "spins.json", title: "Spins" },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `other-${index}`,
      session: `other-${index}.json`,
      title: `Other ${index}`,
    })),
  ],
  schemaVersion: 1,
};

describe("Deep Capture Replay/mounted Game tier proof", () => {
  it("requires explicit ids for targeted proof", () => {
    expect(() => selectDeepCaptureTierRecordings({ manifest, tier: "targeted" })).toThrow(
      "requires --recording-ids",
    );
    expect(selectDeepCaptureTierRecordings({
      manifest,
      recordingIds: ["motion"],
      tier: "targeted",
    })).toHaveLength(1);
  });

  it("selects the fixed representative set and exactly nine for final proof", () => {
    expect(selectDeepCaptureTierRecordings({ manifest, tier: "representative" })
      .map((recording) => recording.id)).toEqual(["motion", "flow", "spins"]);
    expect(selectDeepCaptureTierRecordings({ manifest, tier: "all-nine" })).toHaveLength(9);
    expect(() => selectDeepCaptureTierRecordings({
      manifest: { recordings: manifest.recordings.slice(0, 8) },
      tier: "all-nine",
    })).toThrow("exactly nine");
  });

  it("builds isolated schema-v3 tier artifacts without legacy acceptance flags", () => {
    const args = parseDeepCaptureTierProofArgs([
      "--tier", "targeted",
      "--manifest", "manifest.json",
      "--recording-ids", "motion",
      "--out", "tmp/deep-targeted",
    ]);
    const plan = buildDeepCaptureTierProofPlan(args, manifest, 0);

    expect(plan.proofProfile).toBe("deep-capture-v1");
    expect(plan.selectedManifest).toMatchObject({
      proofProfile: "deep-capture-v1",
      proofTier: "targeted",
      requiredRecordingIds: ["motion"],
    });
    expect(JSON.stringify(plan)).not.toContain("allowLegacy");
  });
});
