import type {
  MovementAvatarSpineApplyOptionsDecision,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSpineSolverSourceName,
  MovementAvatarSpineSolverSpec,
} from "./movementAvatarPipeline";
import {
  resolveMovementAvatarActiveSpinePose,
  resolveMovementAvatarSpineNeutralPose,
  resolveMovementAvatarSpineSolverPose,
} from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";

export type MovementAvatarSpineRotation = {
  rotationOrder?: string;
  x: number;
  y: number;
  z: number;
};

export type MovementAvatarSpineSolverSources = Partial<
  Record<MovementAvatarSpineSolverSourceName, MovementAvatarSpineRotation | null | undefined>
>;

export type MovementAvatarSpineSolverRotationRequest = Omit<
  MovementAvatarSpineSolverSpec,
  "mirrorZ"
> & {
  rotation: MovementAvatarSpineRotation | undefined;
  wasMirrored: boolean;
};

export type MovementAvatarSpineApplicationMode = "active" | "solver" | "neutral";

export type MovementAvatarSpineRuntimeDebugTelemetry = Pick<
  MovementAvatarPlayerSpineDrive,
  "confidence" | "forwardLean" | "owner" | "sideBend" | "twist"
> & {
  targetRotations: MovementAvatarPlayerSpineDrive["rotations"];
};

export function buildMovementAvatarSpineRuntimeDebugTelemetry(
  spineDrive: MovementAvatarPlayerSpineDrive,
): MovementAvatarSpineRuntimeDebugTelemetry {
  return {
    confidence: spineDrive.confidence,
    forwardLean: spineDrive.forwardLean,
    owner: spineDrive.owner,
    sideBend: spineDrive.sideBend,
    targetRotations: spineDrive.rotations,
    twist: spineDrive.twist,
  };
}

export function mirrorMovementAvatarSpineSolverRotation(
  rotation: MovementAvatarSpineRotation | null | undefined,
): MovementAvatarSpineRotation | undefined {
  if (!rotation) return undefined;

  return {
    ...rotation,
    z: -rotation.z,
  };
}

export function applyMovementAvatarSpineRotationSpecs({
  apply,
  specs,
}: {
  apply: (spec: MovementAvatarSpineBoneRotationSpec) => void;
  specs: MovementAvatarSpineBoneRotationSpec[];
}) {
  specs.forEach((spec) => {
    apply(spec);
  });

  return {
    applied: specs.length,
  };
}

export function applyMovementAvatarSpineSolverSpecs({
  apply,
  sources,
  specs,
}: {
  apply: (request: MovementAvatarSpineSolverRotationRequest) => void;
  sources: MovementAvatarSpineSolverSources;
  specs: MovementAvatarSpineSolverSpec[];
}) {
  specs.forEach((spec) => {
    const sourceRotation = sources[spec.source];
    const rotation = spec.mirrorZ
      ? mirrorMovementAvatarSpineSolverRotation(sourceRotation)
      : sourceRotation ?? undefined;

    apply({
      bone: spec.bone,
      limits: spec.limits,
      rotation,
      scale: spec.scale,
      slerp: spec.slerp,
      source: spec.source,
      wasMirrored: spec.mirrorZ && Boolean(sourceRotation),
    });
  });

  return {
    applied: specs.length,
  };
}

export function applyMovementAvatarActiveSpinePoseApplication({
  applyRotation,
  spineApplyOptions,
  spineDrive,
}: {
  applyRotation: (spec: MovementAvatarSpineBoneRotationSpec) => void;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  spineDrive: MovementAvatarPlayerSpineDrive;
}) {
  return applyMovementAvatarSpineRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarActiveSpinePose({
      spineApplyOptions,
      spineDrive,
    }),
  });
}

export function applyMovementAvatarSpineSolverPoseApplication({
  applyRotation,
  avatarRole,
  sources,
  spineApplyOptions,
}: {
  applyRotation: (request: MovementAvatarSpineSolverRotationRequest) => void;
  avatarRole: "instructor" | "player";
  sources: MovementAvatarSpineSolverSources;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
}) {
  return applyMovementAvatarSpineSolverSpecs({
    apply: applyRotation,
    sources,
    specs: resolveMovementAvatarSpineSolverPose({
      avatarRole,
      spineApplyOptions,
    }),
  });
}

export function applyMovementAvatarSpineNeutralPoseApplication({
  applyRotation,
}: {
  applyRotation: (spec: MovementAvatarSpineBoneRotationSpec) => void;
}) {
  return applyMovementAvatarSpineRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarSpineNeutralPose(),
  });
}
