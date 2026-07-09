import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type {
  MovementAvatarSpineApplyOptionsDecision,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSpineSolverSpec,
} from "./movementAvatarPipeline";

export function resolveMovementAvatarSpineApplyOptions({
  avatarRole,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  shouldApplySpine: boolean;
}): MovementAvatarSpineApplyOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    activeDrive: {
      chest: isPlayer ? 0.76 : 0.78,
      hips: isPlayer ? 0.34 : 0.36,
      spine: isPlayer ? 0.78 : 0.82,
      upperChest: isPlayer ? 0.68 : 0.72,
    },
    shouldCountRecordedSpineRetarget: !isPlayer && shouldApplySpine,
    solver: {
      chest: isPlayer ? 0.36 : 0.24,
      hips: isPlayer ? 0.34 : 0.26,
      spine: isPlayer ? 0.42 : 0.28,
      upperChest: isPlayer ? 0.32 : 0.22,
    },
  };
}

export function resolveMovementAvatarActiveSpinePose({
  spineApplyOptions,
  spineDrive,
}: {
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  spineDrive: MovementAvatarPlayerSpineDrive;
}): MovementAvatarSpineBoneRotationSpec[] {
  return [
    {
      bone: "hips",
      rotation: spineDrive.rotations.hips,
      slerp: spineApplyOptions.activeDrive.hips,
    },
    {
      bone: "spine",
      rotation: spineDrive.rotations.spine,
      slerp: spineApplyOptions.activeDrive.spine,
    },
    {
      bone: "chest",
      rotation: spineDrive.rotations.chest,
      slerp: spineApplyOptions.activeDrive.chest,
    },
    {
      bone: "upperChest",
      rotation: spineDrive.rotations.upperChest,
      slerp: spineApplyOptions.activeDrive.upperChest,
    },
  ];
}

export function resolveMovementAvatarSpineSolverPose({
  avatarRole,
  spineApplyOptions,
}: {
  avatarRole: "instructor" | "player";
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
}): MovementAvatarSpineSolverSpec[] {
  const mirrorZ = avatarRole === "instructor";

  return [
    {
      bone: "hips",
      limits: { x: 0.35, y: 0.75, z: 0.45 },
      mirrorZ,
      scale: 1,
      slerp: spineApplyOptions.solver.hips,
      source: "hips",
    },
    {
      bone: "spine",
      limits: { x: 0.45, y: 0.65, z: 0.45 },
      mirrorZ,
      scale: 0.65,
      slerp: spineApplyOptions.solver.spine,
      source: "spine",
    },
    {
      bone: "chest",
      limits: { x: 0.35, y: 0.5, z: 0.35 },
      mirrorZ,
      scale: 0.35,
      slerp: spineApplyOptions.solver.chest,
      source: "spine",
    },
    {
      bone: "upperChest",
      limits: { x: 0.25, y: 0.35, z: 0.25 },
      mirrorZ,
      scale: 0.2,
      slerp: spineApplyOptions.solver.upperChest,
      source: "spine",
    },
  ];
}

export function resolveMovementAvatarSpineNeutralPose(): MovementAvatarSpineBoneRotationSpec[] {
  return [
    { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "spine", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "chest", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "upperChest", rotation: { x: 0.01, y: 0, z: 0 }, slerp: 0.14 },
  ];
}
