import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarLowerBodyVisualDecision,
  MovementAvatarLowerBodyVisualState,
} from "./movementAvatarPipeline";

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function smoothLowerBodyValue(current: number, target: number, rise: number, fall: number) {
  const factor = target > current ? rise : fall;
  const next = lerp(current, target, factor);
  return target <= 0.001 && next < 0.025 ? 0 : next;
}

const INSTRUCTOR_SQUAT_ENTRY_MIN_VISIBLE_DEPTH = 0.18;

function smoothInstructorSquatDepth(current: number, sourceDepth: number) {
  const enterThreshold = current > 0.08 ? 0.08 : 0.2;
  const target = sourceDepth >= enterThreshold ? sourceDepth : 0;
  const next = smoothLowerBodyValue(current, target, 0.2, 0.1);
  return target > 0 && current <= 0.08
    ? Math.max(next, Math.min(target, INSTRUCTOR_SQUAT_ENTRY_MIN_VISIBLE_DEPTH))
    : next;
}

export function resolveMovementAvatarLowerBodyVisualDecision({
  avatarRole,
  lowerBodyDrive,
  previousState,
  recordedSquatPresentationDepth,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  previousState: MovementAvatarLowerBodyVisualState;
  recordedSquatPresentationDepth: number;
}): MovementAvatarLowerBodyVisualDecision {
  if (avatarRole === "player") {
    const state = {
      squatPresentationDepth: smoothLowerBodyValue(
        previousState.squatPresentationDepth,
        lowerBodyDrive.playerSquatPresentationDepth,
        lowerBodyDrive.shouldDrivePlayerSquat ? 0.22 : 0.12,
        0.2,
      ),
      visualRootDrop: smoothLowerBodyValue(
        previousState.visualRootDrop,
        lowerBodyDrive.visualRootDrop,
        0.2,
        0.22,
      ),
    };

    return {
      instructorSquatPresentationDepth: recordedSquatPresentationDepth,
      playerSquatPresentationDepth: state.squatPresentationDepth,
      state,
      visualRootDrop: state.visualRootDrop,
    };
  }

  const squatPresentationDepth = smoothInstructorSquatDepth(
    previousState.squatPresentationDepth,
    recordedSquatPresentationDepth,
  );
  const visualRootDrop = smoothLowerBodyValue(
    previousState.visualRootDrop,
    squatPresentationDepth * 0.56,
    0.18,
    0.12,
  );
  const state = {
    squatPresentationDepth,
    visualRootDrop,
  };

  return {
    instructorSquatPresentationDepth: squatPresentationDepth,
    playerSquatPresentationDepth: squatPresentationDepth,
    state,
    visualRootDrop,
  };
}
