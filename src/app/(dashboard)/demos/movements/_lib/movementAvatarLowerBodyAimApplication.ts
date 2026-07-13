import type { MovementAvatarBoneRotationSpec } from "./movementAvatarPipeline";
import {
  resolveMovementAvatarPlantedFootOwner,
} from "./movementAvatarPipeline";
import type {
  MovementAvatarInstructorFootPlantBone,
  MovementAvatarInstructorFootPlantContacts,
  MovementAvatarInstructorFootPlantPoseResult,
  MovementAvatarInstructorFootPlantSide,
} from "./movementAvatarLowerBodyApplicationTypes";

export function applyMovementAvatarInstructorFootPlantRequests({
  apply,
  contacts,
  sides,
}: {
  apply: (side: MovementAvatarInstructorFootPlantSide) => boolean;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  sides: MovementAvatarInstructorFootPlantSide[];
}) {
  let applied = 0;

  sides.forEach((side) => {
    if (contacts && !contacts[side === "left" ? "leftFoot" : "rightFoot"]) return;
    if (apply(side)) {
      applied += 1;
    }
  });

  return {
    applied,
  };
}

export function applyMovementAvatarInstructorFootPlantPose({
  applyRotation,
  currentFeetOwner,
  isPlayer,
  side,
  slerp = 0.62,
}: {
  applyRotation: (spec: {
    bone: MovementAvatarInstructorFootPlantBone;
    rotation: MovementAvatarBoneRotationSpec["rotation"];
    slerp: number;
  }) => boolean | void;
  currentFeetOwner: string;
  isPlayer: boolean;
  side: MovementAvatarInstructorFootPlantSide;
  slerp?: number;
}): MovementAvatarInstructorFootPlantPoseResult {
  // Foot planting is deliberately role-neutral. Keep the compatibility field
  // explicit so callers cannot accidentally infer player-specific behavior.
  void isPlayer;
  const rotation = { x: 0, y: 0, z: 0 };
  const specs = [
    { bone: `${side}Foot` as const, rotation, slerp },
    { bone: `${side}Toes` as const, rotation, slerp },
  ];
  let appliedRotations = 0;
  specs.forEach((spec) => {
    if (applyRotation(spec) !== false) {
      appliedRotations += 1;
    }
  });

  return {
    applied: true,
    appliedRotations,
    feetOwner: resolveMovementAvatarPlantedFootOwner(currentFeetOwner),
  };
}


