import {
  buildMovementGamePlayerRuntimeFrame,
  type BuildMovementGameInstructorRuntimeFrameInput,
} from "./movementGameRuntimeFrame";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type BuildRecordedMovementMotionFrameInput = BuildMovementGameInstructorRuntimeFrameInput;

// A recorded avatar (the Game instructor, the Replay student) runs the SAME
// runtime as a live player fed recorded frames. This single lane is what the
// approved Replay Studio avatar uses; the old bespoke instructor lane rendered
// recognisably differently (mangled arms) and could never be compared against
// the approved rendering by any proof, because every proof compared the
// instructor lane with a copy of itself.
export function buildRecordedMovementMotionFrame({
  calibration = null,
  capturedAt,
  isPlaying,
  motionRef,
  previousMotionFrame = null,
  retargetSourceModel,
}: BuildRecordedMovementMotionFrameInput): MovementMotionFrame | null {
  return buildMovementGamePlayerRuntimeFrame({
    calibration,
    capturedAt,
    isPlaying,
    motionRef,
    previousMotionFrame,
    retargetSourceModel,
    source: "recorded-replay",
  });
}
