import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import type { MovementAvatarLowerBodyVisualState, MovementAvatarPlayerLegRaiseHoldState } from "./movementAvatarPipeline";
import type {
  MovementAvatarRetargetRestMap,
  MovementAvatarRigMeasurements,
} from "./movementAvatarRestPose";
import {
  buildMovementAvatarRetargetRestMap,
  measureMovementAvatarRig,
} from "./movementAvatarRestPose";
import type { MovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import { createMovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import type { MovementAvatarFootLockState } from "./movementAvatarFootLock";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import type { MovementAvatarSetupState } from "./movementAvatarSetup";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRootMotionInputFrame } from "./movementRootMotion";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarRuntimeState";

export type MovementAvatarRuntimeRef<T> = {
  current: T;
};

export type MovementAvatarRuntimeResetRefs = {
  baseBonePositionRef: MovementAvatarRuntimeRef<Record<string, THREE.Vector3>>;
  baseHipsPositionRef: MovementAvatarRuntimeRef<THREE.Vector3 | null>;
  exerciseTransitionStateRef: MovementAvatarRuntimeRef<MovementAvatarExerciseTransitionState>;
  instructorLowerBodyStabilityRef: MovementAvatarRuntimeRef<MovementAvatarLowerBodyVisualState>;
  lastGoodQuatRef: MovementAvatarRuntimeRef<Record<string, THREE.Quaternion>>;
  liveRootMotionHistoryRef: MovementAvatarRuntimeRef<MovementRootMotionInputFrame[]>;
  plantedFootLockRef: MovementAvatarRuntimeRef<MovementAvatarFootLockState>;
  playerLegRaiseHoldRef: MovementAvatarRuntimeRef<MovementAvatarPlayerLegRaiseHoldState>;
  playerLowerBodyStabilityRef: MovementAvatarRuntimeRef<MovementAvatarLowerBodyVisualState>;
  retargetAvatarRestRef: MovementAvatarRuntimeRef<MovementAvatarRetargetRestMap>;
  retargetSourceModelRef: MovementAvatarRuntimeRef<MovementRetargetSourceModel | null>;
  rigMeasurementsRef: MovementAvatarRuntimeRef<MovementAvatarRigMeasurements | null>;
  setupStateRef: MovementAvatarRuntimeRef<MovementAvatarSetupState>;
};

export function resetMovementAvatarRuntimeRefs({
  refs,
  vrm,
}: {
  refs: MovementAvatarRuntimeResetRefs;
  vrm: VRM;
}) {
  refs.baseHipsPositionRef.current = null;
  refs.baseBonePositionRef.current = {};
  refs.setupStateRef.current = createMovementAvatarSetupState();
  refs.retargetAvatarRestRef.current = buildMovementAvatarRetargetRestMap(vrm);
  refs.retargetSourceModelRef.current = null;
  refs.rigMeasurementsRef.current = measureMovementAvatarRig(vrm);
  refs.liveRootMotionHistoryRef.current = [];
  refs.exerciseTransitionStateRef.current = createMovementAvatarExerciseTransitionState();
  refs.playerLegRaiseHoldRef.current = createMovementAvatarPlayerLegRaiseHoldState();
  refs.plantedFootLockRef.current = createMovementAvatarFootLockState();
  refs.playerLowerBodyStabilityRef.current = createMovementAvatarLowerBodyVisualState();
  refs.instructorLowerBodyStabilityRef.current = createMovementAvatarLowerBodyVisualState();
  refs.lastGoodQuatRef.current = {};
}
