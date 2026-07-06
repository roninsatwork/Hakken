import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";

export type MovementAvatarPlayerLegRaiseHoldState = {
  depth: number;
  expiresAt: number;
  side: "left" | "right" | null;
};

export type MovementAvatarPlayerLegRaiseHoldDecision = {
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  state: MovementAvatarPlayerLegRaiseHoldState;
  wasHeld: boolean;
};

const PLAYER_LEG_RAISE_HOLD_MS = 1400;
const PLAYER_LEG_RAISE_RISE_SMOOTHING = 0.48;
const PLAYER_LEG_RAISE_FALL_SMOOTHING = 0.18;

function smoothPlayerLegRaiseDepth({
  currentDepth,
  previousState,
  side,
}: {
  currentDepth: number;
  previousState: MovementAvatarPlayerLegRaiseHoldState;
  side: "left" | "right";
}) {
  const clampedCurrentDepth = Math.max(currentDepth, 0.3);
  if (previousState.side !== side || previousState.depth <= 0) {
    return clampedCurrentDepth;
  }

  const smoothing = clampedCurrentDepth >= previousState.depth
    ? PLAYER_LEG_RAISE_RISE_SMOOTHING
    : PLAYER_LEG_RAISE_FALL_SMOOTHING;
  return previousState.depth + (clampedCurrentDepth - previousState.depth) * smoothing;
}

export function resolveMovementAvatarPlayerLegRaiseHold({
  avatarRole,
  holdMs = PLAYER_LEG_RAISE_HOLD_MS,
  lowerBodyDrive,
  now,
  previousState,
}: {
  avatarRole: "instructor" | "player";
  holdMs?: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  now: number;
  previousState: MovementAvatarPlayerLegRaiseHoldState;
}): MovementAvatarPlayerLegRaiseHoldDecision {
  const emptyState = {
    depth: 0,
    expiresAt: 0,
    side: null,
  };

  if (avatarRole !== "player") {
    return {
      lowerBodyDrive,
      state: emptyState,
      wasHeld: false,
    };
  }

  if (lowerBodyDrive.shouldDrivePlayerLegRaise && lowerBodyDrive.playerLegRaiseSide) {
    const smoothedDepth = smoothPlayerLegRaiseDepth({
      currentDepth: lowerBodyDrive.playerLegRaiseDepth,
      previousState,
      side: lowerBodyDrive.playerLegRaiseSide,
    });

    return {
      lowerBodyDrive: {
        ...lowerBodyDrive,
        playerLegRaiseDepth: smoothedDepth,
      },
      state: {
        depth: smoothedDepth,
        expiresAt: now + holdMs,
        side: lowerBodyDrive.playerLegRaiseSide,
      },
      wasHeld: false,
    };
  }

  if (
    !lowerBodyDrive.shouldDrivePlayerSquat &&
    previousState.side &&
    previousState.expiresAt > now
  ) {
    const heldSide = previousState.side;
    return {
      lowerBodyDrive: {
        ...lowerBodyDrive,
        playerLegRaiseDepth: Math.max(previousState.depth, 0.3),
        playerLegRaiseSide: heldSide,
        playerLowerBodyState: heldSide === "left" ? "left-leg-raise" : "right-leg-raise",
        playerSquatPresentationDepth: 0,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
        shouldDrivePlayerSquat: false,
        visualRootDrop: 0,
      },
      state: previousState,
      wasHeld: true,
    };
  }

  return {
    lowerBodyDrive,
    state: emptyState,
    wasHeld: false,
  };
}
