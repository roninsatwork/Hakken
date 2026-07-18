import { describe, expect, it } from "vitest";
import { buildMovementDeepCaptureProfile } from "./movementFrameCodec";
import { evaluateMovementCaptureReuse } from "./movementCaptureReusePolicy";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";

const cameraFingerprint = "fnv1a32:1234abcd";
const denseModel = { modelHash: `sha256:${"a".repeat(64)}`, modelId: "dense-a@1" };

function packet() {
  return {
    deepCaptureProfile: buildMovementDeepCaptureProfile(),
    inputContract: structuredClone(MOVEMENT_PLAYER_INPUT_CONTRACT),
    motionPipelineFingerprint: "renderer-version-a",
    samples: [0, 1].map(() => ({
      camera: { deviceFingerprint: cameraFingerprint },
      tracking: { deepCapture: { denseBody: denseModel } },
    })),
    schemaVersion: 3,
  };
}

describe("movement capture reuse policy", () => {
  it("reuses immutable packets for solver, renderer, runtime, and harness repairs", () => {
    const input = packet();
    input.motionPipelineFingerprint = "renderer-version-b";

    expect(evaluateMovementCaptureReuse({
      currentCameraFingerprint: cameraFingerprint,
      currentDenseModel: denseModel,
      packet: input,
    })).toMatchObject({
      captureInvalidators: [],
      decision: "reuse-recording",
      reusable: true,
    });
  });

  it("requires a new capture for camera, acquisition, refinement, or dense-model drift", () => {
    const input = packet();
    (input.inputContract.filters.pose as { beta: number }).beta = 99;
    input.deepCaptureProfile.refinement.staleAfterMs = 999;

    const report = evaluateMovementCaptureReuse({
      currentCameraFingerprint: "fnv1a32:different",
      currentDenseModel: { ...denseModel, modelHash: `sha256:${"b".repeat(64)}` },
      packet: input,
    });

    expect(report.decision).toBe("new-live-capture-required");
    expect(report.captureInvalidators).toEqual(expect.arrayContaining([
      expect.stringContaining("acquisition filters"),
      expect.stringContaining("refinement"),
      "physical camera changed",
      "selected dense-body model changed",
    ]));
  });

  it("does not guess when current camera or dense selection identity is unavailable", () => {
    expect(evaluateMovementCaptureReuse({ packet: packet() })).toMatchObject({
      decision: "cannot-determine",
      missingCurrentIdentity: [
        "current physical-camera fingerprint",
        "current selected dense-model id and SHA-256",
      ],
      reusable: false,
    });
  });
});
