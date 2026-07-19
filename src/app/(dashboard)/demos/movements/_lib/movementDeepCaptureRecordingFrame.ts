import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  type MovementDeepCaptureBodyEvidence,
  type MovementDeepCaptureFaceEvidence,
  type MovementDeepCaptureFrameEvidence,
  type MovementDeepCaptureHandEvidence,
} from "./movementDeepCaptureContract";
import {
  validateMovementDenseCaptureMeasurement,
} from "./movementDenseCapture";
import { validateMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";
import type { MovementAcquisitionFrame } from "./movementPlayerInputContract";
import type { MovementHandCapture, MovementHandSide } from "./movementTypes";

function hasCompleteHandEvidence(
  hand: MovementHandCapture | null | undefined,
  evidence: MovementDeepCaptureHandEvidence | null | undefined,
) {
  return Boolean(
    hand?.landmarks.length === 21 &&
    hand.worldLandmarks?.length === 21 &&
    evidence &&
    evidence.detectorHandedness.label !== "Unknown" &&
    evidence.detectorHandedness.score > 0 &&
    evidence.refinement?.profileId === "movement-deep-capture-refinement-v1" &&
    Object.keys(evidence.fingerJointAngles ?? {}).length >= 15 &&
    evidence.orientation?.provenance.origin === "derived" &&
    ["observed", "temporally-carried", "reacquired"].includes(evidence.tracking.state) &&
    !(evidence.tracking.state === "observed" && evidence.tracking.occluded),
  );
}

function hasCompleteFaceEvidence(
  frame: MovementAcquisitionFrame,
  evidence: MovementDeepCaptureFaceEvidence | null | undefined,
) {
  return Boolean(
    frame.faceLandmarks?.length === 478 &&
    frame.blendshapes?.length &&
    evidence?.refinement?.profileId === "movement-deep-capture-refinement-v1" &&
    evidence.facialTransformationMatrix?.length === 16 &&
    evidence.irisLandmarkCount >= 10 &&
    evidence.gaze.left &&
    evidence.gaze.right &&
    evidence.gaze.fused &&
    evidence.gaze.provenance.origin === "derived" &&
    evidence.eyeVisibility.left === "visible" &&
    evidence.eyeVisibility.right === "visible" &&
    evidence.eyeVisibility.eyewear === "unknown" &&
    ["observed", "temporally-carried", "reacquired"].includes(evidence.tracking.state) &&
    !(evidence.tracking.state === "observed" && evidence.tracking.occluded),
  );
}

export function hasCompleteMovementDenseCaptureEvidence(
  denseBody: MovementDeepCaptureBodyEvidence | null | undefined,
) {
  return validateCompleteMovementDenseCaptureEvidence(denseBody).passed;
}

export function validateCompleteMovementDenseCaptureEvidence(
  denseBody: MovementDeepCaptureBodyEvidence | null | undefined,
) {
  const failures: string[] = [];
  if (!denseBody?.adapter) failures.push("Dense-body adapter metadata is missing.");
  if (!denseBody?.segmentation) failures.push("Dense-body segmentation evidence is missing.");
  if (!denseBody?.adapter) return { failures, passed: false };
  failures.push(...validateMovementDenseCaptureMeasurement({
    adapter: denseBody.adapter,
    anchors: denseBody.anchors,
    modelHash: denseBody.modelHash,
    modelId: denseBody.modelId,
  }).failures);
  failures.push(...validateMovementDenseCaptureFusion(denseBody.fusion).failures);
  return { failures: Array.from(new Set(failures)), passed: failures.length === 0 };
}

/**
 * Persist only evidence that satisfies the schema-v3 claim it represents.
 * Coarse/partial detector results remain available to the live preflight UI,
 * but become honest missing evidence in the immutable recording packet.
 */
export function prepareMovementDeepCaptureRecordingFrame(
  frame: MovementAcquisitionFrame,
): MovementAcquisitionFrame {
  const deepHands = { ...frame.deepCapture?.hands };
  const deepCapture: MovementDeepCaptureFrameEvidence = {
    ...frame.deepCapture,
    profileId: MOVEMENT_DEEP_CAPTURE_PROFILE.id,
    hands: deepHands,
  };
  const hands = { ...frame.hands };

  for (const side of ["left", "right"] as const satisfies readonly MovementHandSide[]) {
    if (hasCompleteHandEvidence(hands[side], deepHands[side])) continue;
    delete hands[side];
    delete deepHands[side];
  }
  if (Object.keys(deepHands).length === 0) delete deepCapture.hands;

  const completeFace = hasCompleteFaceEvidence(frame, deepCapture.face);
  if (!completeFace) delete deepCapture.face;
  if (!hasCompleteMovementDenseCaptureEvidence(deepCapture.denseBody)) {
    delete deepCapture.denseBody;
  }

  return {
    ...frame,
    acquisitionProfileId: MOVEMENT_DEEP_CAPTURE_PROFILE.id,
    blendshapes: completeFace ? frame.blendshapes : undefined,
    deepCapture,
    faceLandmarks: completeFace ? frame.faceLandmarks : undefined,
    hands: Object.keys(hands).length > 0 ? hands : undefined,
  };
}
