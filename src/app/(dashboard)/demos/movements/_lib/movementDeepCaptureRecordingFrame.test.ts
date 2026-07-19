import { describe, expect, it } from "vitest";
import { createCompleteDeepCaptureFrame } from "./movementDeepCaptureTestFixture";
import {
  hasCompleteMovementDenseCaptureEvidence,
  prepareMovementDeepCaptureRecordingFrame,
} from "./movementDeepCaptureRecordingFrame";
import type { MovementAcquisitionFrame } from "./movementPlayerInputContract";

function completeFrame() {
  return createCompleteDeepCaptureFrame(0) as MovementAcquisitionFrame;
}

describe("Deep Capture recording-frame claims", () => {
  it("stamps schema-v3 acquisition and preserves complete measured evidence", () => {
    const frame = completeFrame();
    frame.acquisitionProfileId = "movement-player-input-v1";

    const recorded = prepareMovementDeepCaptureRecordingFrame(frame);

    expect(recorded.acquisitionProfileId).toBe("movement-deep-capture-v1");
    expect(recorded.hands?.left?.landmarks).toHaveLength(21);
    expect(recorded.hands?.left?.worldLandmarks).toHaveLength(21);
    expect(recorded.faceLandmarks).toHaveLength(478);
    expect(recorded.deepCapture?.denseBody?.anchors).toHaveLength(200);
    expect(hasCompleteMovementDenseCaptureEvidence(recorded.deepCapture?.denseBody)).toBe(true);
  });

  it("turns placeholders and incomplete detector claims into honest missing evidence", () => {
    const frame = completeFrame();
    frame.deepCapture!.denseBody = {
      anchors: [],
      modelHash: "unverified:mediapipe-pose-landmarker",
      modelId: "mediapipe-pose-segmentation-v1",
      segmentation: frame.deepCapture!.denseBody!.segmentation,
    };
    frame.hands!.left!.worldLandmarks = null;
    frame.deepCapture!.face!.facialTransformationMatrix = null;

    const recorded = prepareMovementDeepCaptureRecordingFrame(frame);

    expect(recorded.deepCapture?.denseBody).toBeUndefined();
    expect(recorded.hands?.left).toBeUndefined();
    expect(recorded.deepCapture?.hands?.left).toBeUndefined();
    expect(recorded.faceLandmarks).toBeUndefined();
    expect(recorded.blendshapes).toBeUndefined();
    expect(recorded.deepCapture?.face).toBeUndefined();
  });
});
