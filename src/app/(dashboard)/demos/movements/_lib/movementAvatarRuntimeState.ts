import type {
  MovementAvatarLowerBodyVisualState,
  MovementAvatarLowerBodyVisualDecision,
  MovementAvatarPlayerLegRaiseHoldState,
  MovementAvatarPlayerLegRaiseHoldDecision,
} from "./movementAvatarPipeline";
import {
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlayerLegRaiseHold,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";

type MovementAvatarRuntimeRole = "instructor" | "player";

export type MovementAvatarLowerBodyRuntimeStateDecision = {
  legRaiseHoldDecision: MovementAvatarPlayerLegRaiseHoldDecision;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyVisualDecision: MovementAvatarLowerBodyVisualDecision;
  nextInstructorLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
  nextPlayerLegRaiseHoldState: MovementAvatarPlayerLegRaiseHoldState;
  nextPlayerLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
};

export function createMovementAvatarPlayerLegRaiseHoldState(): MovementAvatarPlayerLegRaiseHoldState {
  return {
    depth: 0,
    expiresAt: 0,
    side: null,
  };
}

export function createMovementAvatarLowerBodyVisualState(): MovementAvatarLowerBodyVisualState {
  return {
    squatPresentationDepth: 0,
    visualRootDrop: 0,
  };
}

export function resolveMovementAvatarLowerBodyRuntimeState({
  avatarRole,
  instructorLowerBodyVisualState,
  lowerBodyDrive,
  now,
  playerLegRaiseHoldState,
  playerLowerBodyVisualState,
  recordedSquatPresentationDepth,
}: {
  avatarRole: MovementAvatarRuntimeRole;
  instructorLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  now: number;
  playerLegRaiseHoldState: MovementAvatarPlayerLegRaiseHoldState;
  playerLowerBodyVisualState: MovementAvatarLowerBodyVisualState;
  recordedSquatPresentationDepth: number;
}): MovementAvatarLowerBodyRuntimeStateDecision {
  const legRaiseHoldDecision = resolveMovementAvatarPlayerLegRaiseHold({
    avatarRole,
    lowerBodyDrive,
    now,
    previousState: playerLegRaiseHoldState,
  });
  const resolvedLowerBodyDrive = legRaiseHoldDecision.lowerBodyDrive;
  const lowerBodyVisualDecision = resolveMovementAvatarLowerBodyVisualDecision({
    avatarRole,
    lowerBodyDrive: resolvedLowerBodyDrive,
    previousState: avatarRole === "player"
      ? playerLowerBodyVisualState
      : instructorLowerBodyVisualState,
    recordedSquatPresentationDepth,
  });

  return {
    legRaiseHoldDecision,
    lowerBodyDrive: resolvedLowerBodyDrive,
    lowerBodyVisualDecision,
    nextInstructorLowerBodyVisualState: avatarRole === "player"
      ? instructorLowerBodyVisualState
      : lowerBodyVisualDecision.state,
    nextPlayerLegRaiseHoldState: legRaiseHoldDecision.state,
    nextPlayerLowerBodyVisualState: avatarRole === "player"
      ? lowerBodyVisualDecision.state
      : playerLowerBodyVisualState,
  };
}
