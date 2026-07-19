import type { MovementPlayerMotionPayload } from "../_hooks/useMovementPlayerTracking";
import {
  parseMovementDebugReplaySession,
  type MovementDebugReplaySession,
} from "./movementDebugReplay";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "./movementPlayerInputContract";
import { buildOppositePlayerImitationOracle } from "./movementThreePartyMirrorOracle";
import type { VrmMotionPayload } from "./vrmRigging";

export type MovementGameProofPacket = {
  contractStatus: "matched" | "legacy-missing";
  instructorFrames: VrmMotionPayload[];
  playerFrames: MovementPlayerMotionPayload[];
  session: MovementDebugReplaySession;
  setupFrameCount: number;
};

function toInstructorFrame(
  sample: MovementDebugReplaySession["samples"][number],
  frameId: string,
): VrmMotionPayload {
  return {
    blendshapes: sample.tracking.blendshapes,
    capturedAt: sample.capturedAt,
    deepCapture: sample.tracking.deepCapture,
    frameId,
    faceLandmarks: sample.tracking.face,
    hands: sample.tracking.hands,
    landmarks: sample.tracking.pose,
    pose: sample.tracking.pose,
    worldLandmarks: sample.tracking.worldPose,
  };
}

export function buildMovementGameProofPlayerFrame(
  frame: VrmMotionPayload,
  session: MovementDebugReplaySession,
  frameIndex: number,
): MovementPlayerMotionPayload {
  const opposite = buildOppositePlayerImitationOracle(frame);
  const camera = session.samples[frameIndex]?.camera;
  const withRequiredDepth = <T extends { visibility?: number; z?: number }>(landmarks: T[] | null | undefined) => (
    landmarks?.map((landmark) => ({
      ...landmark,
      visibility: landmark.visibility ?? 1,
      z: landmark.z ?? 0,
    }))
  );
  const hands = opposite.hands
    ? Object.fromEntries((["left", "right"] as const).map((side) => {
        const hand = opposite.hands?.[side];
        return [side, hand
          ? {
              ...hand,
              landmarks: withRequiredDepth(hand.landmarks) ?? [],
              worldLandmarks: withRequiredDepth(hand.worldLandmarks),
            }
          : hand];
      }))
    : undefined;
  const landmarks = withRequiredDepth(opposite.landmarks) ?? [];
  return {
    ...opposite,
    acquisitionProfileId: session.inputContract?.id === MOVEMENT_PLAYER_INPUT_CONTRACT.id
      ? MOVEMENT_PLAYER_INPUT_CONTRACT.id
      : undefined,
    camera: camera
      ? {
          deviceFingerprint: camera.deviceFingerprint,
          facingMode: "user",
          frameHeight: camera.trackHeight ?? camera.videoHeight ?? 0,
          frameWidth: camera.trackWidth ?? camera.videoWidth ?? 0,
        }
      : undefined,
    blendshapes: opposite.blendshapes?.map(({ categoryName, score }, index) => ({
      categoryName,
      displayName: categoryName,
      index,
      score,
    })),
    faceLandmarks: withRequiredDepth(opposite.faceLandmarks),
    hands,
    landmarks,
    sourceTimestampMs: frame.capturedAt,
    worldLandmarks: withRequiredDepth(opposite.worldLandmarks),
  };
}

export function buildMovementOwnersRootSupportProofSnapshot(
  debug: {
    avatarRoot?: Record<string, unknown> | null;
    bodySupport?: unknown;
    fallbacks?: unknown;
    retarget?: unknown;
    supportConstraint?: unknown;
    supportIntent?: unknown;
  } | null | undefined,
  stageOffsetX: number,
) {
  const avatarRoot = debug?.avatarRoot ? structuredClone(debug.avatarRoot) : debug?.avatarRoot;
  if (avatarRoot) {
    for (const key of ["appliedX", "targetX"] as const) {
      const value = avatarRoot[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        avatarRoot[key] = value - stageOffsetX;
      }
    }
  }
  return structuredClone({
    avatarRoot,
    bodySupport: debug?.bodySupport,
    fallbacks: debug?.fallbacks,
    retarget: debug?.retarget,
    supportConstraint: debug?.supportConstraint,
    supportIntent: debug?.supportIntent,
  });
}

export function buildMovementGameProofPacket(value: unknown): MovementGameProofPacket {
  const session = parseMovementDebugReplaySession(value);
  if (session.samples.length === 0) {
    throw new Error("The Game proof packet does not contain any recorded frames.");
  }
  if (
    session.inputContract &&
    session.inputContract.id !== MOVEMENT_PLAYER_INPUT_CONTRACT.id
  ) {
    throw new Error(
      `Game proof input contract ${session.inputContract.id} does not match ${MOVEMENT_PLAYER_INPUT_CONTRACT.id}.`,
    );
  }

  const instructorFrames = session.samples.map((sample, frameIndex) => (
    toInstructorFrame(sample, `${session.id}:${frameIndex}`)
  ));
  const requestedSetupFrameCount = session.inputContract?.setup.prefixFrameCount
    ?? session.setupPrefix?.requiredFrameCount
    ?? MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount;
  const setupFrameCount = Math.min(
    Math.max(1, requestedSetupFrameCount),
    instructorFrames.length,
  );

  return {
    contractStatus: session.inputContract ? "matched" : "legacy-missing",
    instructorFrames,
    playerFrames: instructorFrames.map((frame, frameIndex) => (
      buildMovementGameProofPlayerFrame(frame, session, frameIndex)
    )),
    session,
    setupFrameCount,
  };
}
