import type { MovementAcquisitionFrame } from "./movementPlayerInputContract";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import type { MovementStartReadiness } from "./movementSourceFrame";
import {
  MOVEMENT_DEEP_CAPTURE_PROFILE,
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
} from "./movementDeepCaptureContract";
import { validateMovementDenseCaptureFusion } from "./movementDenseCaptureFusion";
import { MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES } from "./movementDenseCaptureQuality";

export type MovementCapturePreflightStatus = "missing" | "partial" | "planned" | "ready";

export type MovementCapturePreflightChannel = {
  id:
    | "pose"
    | "worldPose"
    | "leftHand"
    | "rightHand"
    | "palmWrist"
    | "face"
    | "eyesGaze"
    | "blendshapes"
    | "camera"
    | "denseBody"
    | "setupPrefix"
    | "readiness";
  label: string;
  message: string;
  observedCount?: number;
  targetCount?: number;
  status: MovementCapturePreflightStatus;
};

export type MovementCapturePreflight = {
  channels: MovementCapturePreflightChannel[];
  currentRecordingReady: boolean;
  denseCaptureOperational: boolean;
  deepCaptureBlockers: string[];
  deepCaptureReady: boolean;
  readyChannelCount: number;
  totalChannelCount: number;
};

function observedNormalizedLandmarkCount(
  landmarks: Array<{ visibility?: number; x: number; y: number }> | null | undefined,
) {
  return (landmarks ?? []).filter((landmark) => (
    (landmark.visibility ?? 1) >= 0.2 &&
    landmark.x >= 0 &&
    landmark.x <= 1 &&
    landmark.y >= 0 &&
    landmark.y <= 1
  )).length;
}

function finiteLandmarkCoordinateCount(
  landmarks: Array<{ x: number; y: number; z?: number }> | null | undefined,
) {
  return (landmarks ?? []).filter((landmark) => (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    (landmark.z === undefined || Number.isFinite(landmark.z))
  )).length;
}

function observedFaceLandmarkCount(
  landmarks: Array<{ x: number; y: number }> | null | undefined,
) {
  // MediaPipe Face Landmarker coordinates are valid face evidence, but its
  // normalized landmarks do not provide the body-style visibility confidence
  // used by Pose Landmarker. Treating a zero visibility value as "missing"
  // made the UI contradict the rendered face mesh, gaze and blendshapes.
  return (landmarks ?? []).filter((landmark) => (
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    landmark.x >= 0 &&
    landmark.x <= 1 &&
    landmark.y >= 0 &&
    landmark.y <= 1
  )).length;
}

function countedChannel({
  id,
  label,
  observedCount,
  targetCount,
}: {
  id: MovementCapturePreflightChannel["id"];
  label: string;
  observedCount: number;
  targetCount: number;
}): MovementCapturePreflightChannel {
  const status = observedCount >= targetCount
    ? "ready"
    : observedCount > 0
      ? "partial"
      : "missing";

  return {
    id,
    label,
    message: `${observedCount}/${targetCount} available`,
    observedCount,
    status,
    targetCount,
  };
}

function availabilityChannel({
  count,
  id,
  label,
  noun,
}: {
  count: number;
  id: MovementCapturePreflightChannel["id"];
  label: string;
  noun: string;
}): MovementCapturePreflightChannel {
  return {
    id,
    label,
    message: count > 0 ? `${count} ${noun} available` : `No ${noun} available`,
    observedCount: count,
    status: count > 0 ? "ready" : "missing",
  };
}

function plannedChannel(
  id: MovementCapturePreflightChannel["id"],
  label: string,
  message: string,
): MovementCapturePreflightChannel {
  return { id, label, message, status: "planned" };
}

// Long region lists made the debug panel resize every frame; keep the first
// few names and fold the rest into a count so the card height stays stable.
function summarizeMovementPreflightList(items: string[], maxShown = 3) {
  if (items.length <= maxShown) return items.join(", ");
  return `${items.slice(0, maxShown).join(", ")} +${items.length - maxShown} more`;
}

function trackingMessage(
  tracking: { occluded: boolean; state: string } | null | undefined,
) {
  if (!tracking || tracking.state === "observed") return "";
  if (tracking.state === "reacquired") return " · reacquired after occlusion";
  return tracking.occluded
    ? " · temporarily carried through occlusion"
    : " · temporarily carried between refinement passes";
}

export function buildMovementCapturePreflight({
  frame,
  readiness,
  retainedFrameCount,
}: {
  frame: MovementAcquisitionFrame | null;
  readiness: MovementStartReadiness | null;
  retainedFrameCount: number;
}): MovementCapturePreflight {
  const poseCoordinateCount = finiteLandmarkCoordinateCount(frame?.landmarks);
  const poseVisibilityQualifiedCount = observedNormalizedLandmarkCount(frame?.landmarks);
  const worldPoseCount = finiteLandmarkCoordinateCount(frame?.worldLandmarks);
  const leftHandCount = observedNormalizedLandmarkCount(frame?.hands?.left?.landmarks);
  const rightHandCount = observedNormalizedLandmarkCount(frame?.hands?.right?.landmarks);
  const leftHandWorldCount = finiteLandmarkCoordinateCount(frame?.hands?.left?.worldLandmarks);
  const rightHandWorldCount = finiteLandmarkCoordinateCount(frame?.hands?.right?.worldLandmarks);
  const faceCount = observedFaceLandmarkCount(frame?.faceLandmarks);
  const blendshapeCount = frame?.blendshapes?.length ?? 0;
  const handEvidence = frame?.deepCapture?.hands;
  const leftHandRefined = handEvidence?.left?.refinement?.profileId ===
    "movement-deep-capture-refinement-v1";
  const rightHandRefined = handEvidence?.right?.refinement?.profileId ===
    "movement-deep-capture-refinement-v1";
  const refinedHandCount = Number(leftHandRefined) + Number(rightHandRefined);
  const orientedHandCount = [handEvidence?.left, handEvidence?.right].filter((hand) => (
    hand?.refinement?.profileId === "movement-deep-capture-refinement-v1" &&
    Boolean(hand?.orientation?.palmNormal) &&
    Boolean(hand?.orientation?.wristRotation) &&
    hand?.orientation?.facing !== "unknown"
  )).length;
  const faceEvidence = frame?.deepCapture?.face;
  const faceRefined = faceEvidence?.refinement?.profileId ===
    "movement-deep-capture-refinement-v1";
  const gazeCount = faceRefined
    ? [faceEvidence?.gaze.left, faceEvidence?.gaze.right].filter(Boolean).length
    : 0;
  const denseBody = frame?.deepCapture?.denseBody;
  const denseAnchorCount = denseBody?.anchors.length ?? 0;
  const denseMissingRegions = MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.filter(
    (region) => denseBody?.fusion?.regionCoverage[region]?.state === "missing",
  );
  const denseVisibleRegionCount = MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length -
    denseMissingRegions.length;
  const denseQualityProfile = denseBody?.adapter
    ? MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[denseBody.adapter.qualityTier]
    : null;
  const denseAdapterReady = Boolean(
    denseBody?.adapter?.profileId === "movement-dense-capture-adapter-v1" &&
    denseQualityProfile &&
    ["webgl", "webgpu", "wasm"].includes(denseBody.adapter.runtime) &&
    denseBody.adapter.inputWidth === denseQualityProfile.inputWidth &&
    denseBody.adapter.inputHeight === denseQualityProfile.inputHeight &&
    denseBody.adapter.targetIntervalMs === denseQualityProfile.targetIntervalMs &&
    /^sha256:[a-f0-9]{64}$/.test(denseBody.modelHash) &&
    validateMovementDenseCaptureFusion(denseBody.fusion).passed,
  );
  const cameraReady = Boolean(
    frame?.camera.frameHeight &&
    frame.camera.frameWidth,
  );
  const prefixTarget = MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount;

  const channels: MovementCapturePreflightChannel[] = [
    {
      id: "pose",
      label: "Body pose",
      message: `${poseCoordinateCount}/33 coordinates captured · ${poseVisibilityQualifiedCount}/33 visibility-qualified`,
      observedCount: poseVisibilityQualifiedCount,
      status: poseVisibilityQualifiedCount >= 33
        ? "ready"
        : poseCoordinateCount > 0
          ? "partial"
          : "missing",
      targetCount: 33,
    },
    countedChannel({
      id: "worldPose",
      label: "World body pose",
      observedCount: worldPoseCount,
      targetCount: 33,
    }),
    leftHandCount >= 21 && !leftHandRefined
      ? {
          id: "leftHand",
          label: "Left hand",
          message: "21/21 coarse landmarks; waiting for native-crop second pass",
          observedCount: leftHandCount,
          status: "partial",
          targetCount: 21,
        }
      : leftHandRefined &&
          (leftHandCount > 0 || leftHandWorldCount > 0) &&
          (leftHandCount < 21 || leftHandWorldCount < 21)
        ? {
            id: "leftHand",
            label: "Left hand",
            message: `${leftHandCount}/21 image landmarks · ${leftHandWorldCount}/21 world landmarks; incomplete refinement evidence`,
            observedCount: Math.min(leftHandCount, leftHandWorldCount),
            status: "partial",
            targetCount: 21,
          }
      : countedChannel({
          id: "leftHand",
          label: "Left hand",
          observedCount: Math.min(leftHandCount, leftHandWorldCount),
          targetCount: 21,
        }),
    rightHandCount >= 21 && !rightHandRefined
      ? {
          id: "rightHand",
          label: "Right hand",
          message: "21/21 coarse landmarks; waiting for native-crop second pass",
          observedCount: rightHandCount,
          status: "partial",
          targetCount: 21,
        }
      : rightHandRefined &&
          (rightHandCount > 0 || rightHandWorldCount > 0) &&
          (rightHandCount < 21 || rightHandWorldCount < 21)
        ? {
            id: "rightHand",
            label: "Right hand",
            message: `${rightHandCount}/21 image landmarks · ${rightHandWorldCount}/21 world landmarks; incomplete refinement evidence`,
            observedCount: Math.min(rightHandCount, rightHandWorldCount),
            status: "partial",
            targetCount: 21,
          }
      : countedChannel({
          id: "rightHand",
          label: "Right hand",
          observedCount: Math.min(rightHandCount, rightHandWorldCount),
          targetCount: 21,
        }),
    countedChannel({
      id: "palmWrist",
      label: "Palm and wrist rotation",
      observedCount: Math.min(orientedHandCount, refinedHandCount),
      targetCount: 2,
    }),
    faceCount >= 478 && !faceRefined
      ? {
          id: "face",
          label: "Face",
          message: "478 coarse landmarks; waiting for native-crop second pass",
          observedCount: faceCount,
          status: "partial",
        }
      : availabilityChannel({ count: faceCount, id: "face", label: "Face", noun: "face landmarks" }),
    countedChannel({
      id: "eyesGaze",
      label: "Eyes and gaze",
      observedCount: gazeCount,
      targetCount: 2,
    }),
    availabilityChannel({
      count: blendshapeCount,
      id: "blendshapes",
      label: "Expressions",
      noun: "blendshapes",
    }),
    {
      id: "camera",
      label: "Camera metadata",
      message: cameraReady
        ? `${frame?.camera.frameWidth}×${frame?.camera.frameHeight} user-facing frame`
        : "Camera dimensions are unavailable",
      status: cameraReady ? "ready" : "missing",
    },
    denseAnchorCount >= MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum &&
    denseAdapterReady &&
    denseMissingRegions.length === 0
      ? {
          id: "denseBody",
          label: "Dense body surface",
          message: `${denseAnchorCount}/${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum} persistent anchors · ${denseVisibleRegionCount}/${MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length} regions current/tracked/occluded${denseMissingRegions.length > 0 ? ` · missing now: ${summarizeMovementPreflightList(denseMissingRegions)}` : ""} · ${denseBody?.modelId} · ${denseBody?.adapter?.runtime}/${denseBody?.adapter?.qualityTier} · ${Math.round(denseBody?.adapter?.inferenceDurationMs ?? 0)}ms`,
          observedCount: denseAnchorCount,
          status: "ready",
          targetCount: MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum,
        }
      : denseAnchorCount >= MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum &&
          denseAdapterReady &&
          denseMissingRegions.length > 0
        ? {
            id: "denseBody",
            label: "Dense body surface",
            message: `${denseAnchorCount}/${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum} persistent anchors · ${denseVisibleRegionCount}/${MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.length} regions current/tracked/occluded · missing now: ${summarizeMovementPreflightList(denseMissingRegions)}`,
            observedCount: denseAnchorCount,
            status: "partial",
            targetCount: MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum,
          }
      : denseAnchorCount >= MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum
        ? {
            id: "denseBody",
            label: "Dense body surface",
            message: `${denseAnchorCount} anchors present, but adapter identity or model SHA-256 is invalid, or skeleton-fusion evidence is incomplete`,
            observedCount: denseAnchorCount,
            status: "partial",
            targetCount: MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum,
          }
      : denseBody?.segmentation
        ? {
            id: "denseBody",
            label: "Dense body surface",
            message: `Segmentation ready (${Math.round(denseBody.segmentation.coverage * 100)}% mask coverage); ${denseAnchorCount}/${MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum} persistent anchors`,
            observedCount: denseAnchorCount,
            status: "partial",
            targetCount: MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum,
          }
          : plannedChannel(
              "denseBody",
              "Dense body surface",
              "Planned: segmentation and persistent body-surface anchors are not captured yet",
            ),
    {
      id: "setupPrefix",
      label: "Setup prefix",
      message: retainedFrameCount >= prefixTarget
        ? `${retainedFrameCount}/${prefixTarget} setup frames retained`
        : `${retainedFrameCount}/${prefixTarget} retained; collection starts with recording`,
      observedCount: retainedFrameCount,
      status: retainedFrameCount >= prefixTarget
        ? "ready"
        : retainedFrameCount > 0
          ? "partial"
          : "missing",
      targetCount: prefixTarget,
    },
    {
      id: "readiness",
      label: "Recording readiness",
      message: readiness?.canStartRecording
        ? readiness.canStartGame
          ? "Whole-body start gate is ready"
          : "Recording can start from complete image/world pose and trustworthy head/torso; peripheral confidence and final Deep Capture coverage remain separate"
        : readiness?.blockedReasons.join(", ") || "Waiting for trustworthy body evidence",
      status: readiness?.canStartRecording ? "ready" : "missing",
    },
  ];

  for (const channel of channels) {
    if (channel.id === "leftHand") channel.message += trackingMessage(handEvidence?.left?.tracking);
    if (channel.id === "rightHand") channel.message += trackingMessage(handEvidence?.right?.tracking);
    if (channel.id === "palmWrist") {
      const statuses = [handEvidence?.left?.tracking, handEvidence?.right?.tracking];
      if (statuses.some((tracking) => tracking?.state === "reacquired")) {
        channel.message += " · hand orientation reacquired after occlusion";
      } else if (statuses.some((tracking) => tracking?.occluded)) {
        channel.message += " · orientation temporarily carried through occlusion";
      }
    }
    if (channel.id === "face" || channel.id === "eyesGaze") {
      channel.message += trackingMessage(faceEvidence?.tracking);
    }
  }

  const deepCaptureBlockers = channels
    .filter((channel) => channel.status !== "ready" && channel.id !== "setupPrefix")
    .map((channel) => `${channel.label}: ${channel.message}`);

  return {
    channels,
    currentRecordingReady: Boolean(readiness?.canStartRecording),
    denseCaptureOperational: denseAnchorCount >= MOVEMENT_DEEP_CAPTURE_PROFILE.anchorTarget.minimum &&
      denseAdapterReady,
    deepCaptureBlockers,
    deepCaptureReady: deepCaptureBlockers.length === 0 && retainedFrameCount >= prefixTarget,
    readyChannelCount: channels.filter((channel) => channel.status === "ready").length,
    totalChannelCount: channels.length,
  };
}
