import type { TrackingLandmark } from "./movementTrackingCalibration";

export type MovementAvatarFrameWorldRuntime = {
  hasWorldLandmarks: boolean;
  lowerBodyZScale: number;
  visualTelemetryZScale: number;
  worldPoseForLocomotion: TrackingLandmark[] | null;
  worldPoseForSetup: TrackingLandmark[] | undefined;
};

export function resolveMovementAvatarFrameWorldRuntime({
  worldLandmarks,
}: {
  worldLandmarks?: TrackingLandmark[] | null;
}): MovementAvatarFrameWorldRuntime {
  const hasWorldLandmarks = Boolean(worldLandmarks);

  return {
    hasWorldLandmarks,
    lowerBodyZScale: hasWorldLandmarks ? 1 : 0.1,
    visualTelemetryZScale: hasWorldLandmarks ? 1 : 0.18,
    worldPoseForLocomotion: worldLandmarks ?? null,
    worldPoseForSetup: worldLandmarks ?? undefined,
  };
}
