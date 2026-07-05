import {
  appendMovementRootMotionHistoryFrame,
  type MovementRootMotionFrame,
  type MovementRootMotionInputFrame,
} from "./movementRootMotion";

export function resolveMovementAvatarRootMotionRuntimeFrame({
  history,
  livePose,
  liveWorldPose,
  recordedRootMotionFrame,
}: {
  history: MovementRootMotionInputFrame[];
  livePose: MovementRootMotionInputFrame["pose"];
  liveWorldPose?: MovementRootMotionInputFrame["worldPose"];
  recordedRootMotionFrame: MovementRootMotionFrame | null;
}): MovementRootMotionFrame | null {
  if (recordedRootMotionFrame) return recordedRootMotionFrame;

  return appendMovementRootMotionHistoryFrame({
    history,
    pose: livePose,
    worldPose: liveWorldPose,
  });
}
