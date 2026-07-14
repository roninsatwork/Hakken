import {
  buildMovementGameInstructorRuntimeFrame,
  type BuildMovementGameInstructorRuntimeFrameInput,
} from "./movementGameRuntimeFrame";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type BuildRecordedMovementMotionFrameInput = BuildMovementGameInstructorRuntimeFrameInput;

export function buildRecordedMovementMotionFrame(
  input: BuildRecordedMovementMotionFrameInput,
): MovementMotionFrame | null {
  return buildMovementGameInstructorRuntimeFrame(input);
}
