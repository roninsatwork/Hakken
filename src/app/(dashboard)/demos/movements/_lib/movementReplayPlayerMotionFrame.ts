import type { MovementMotionFrame } from "./movementMotionFrame";
import {
  buildMovementGamePlayerRuntimeFrame,
} from "./movementGameRuntimeFrame";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementSourceFrameRequirements } from "./movementSourceFrame";
import type { MovementCalibration } from "./movementTrackingCalibration";
import type { VrmMotionRef } from "./vrmRigging";

export type BuildReplayPlayerMovementMotionFrameInput = {
  calibration: MovementCalibration | null;
  capturedAt: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  previousMotionFrame?: MovementMotionFrame | null;
  requirements?: MovementSourceFrameRequirements;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function buildReplayPlayerMovementMotionFrame({
  calibration,
  capturedAt,
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  requirements,
  retargetSourceModel,
}: BuildReplayPlayerMovementMotionFrameInput): MovementMotionFrame | null {
  return buildMovementGamePlayerRuntimeFrame({
    calibration,
    capturedAt,
    isPlaying,
    motionRef,
    previousMotionFrame,
    requirements,
    retargetSourceModel,
    source: "recorded-replay",
  });
}
