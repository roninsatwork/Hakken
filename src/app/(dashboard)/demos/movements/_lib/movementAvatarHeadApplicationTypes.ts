import type * as THREE from "three";
import type { MovementAvatarHeadApplicationPoseDecision } from "./movementAvatarPipeline";

export type { MovementAvatarHeadApplicationPoseDecision };

export type MovementAvatarHeadQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion | null;
  targetWorldQuaternion: THREE.Quaternion;
};

export type MovementAvatarHeadPositionOffsetNodeApplicationResult =
  | { applied: false }
  | {
    applied: true;
    basePosition: THREE.Vector3;
    targetLocalPosition: THREE.Vector3;
  };

export type MovementAvatarHeadApplicationResult = {
  appliedHead: boolean;
  appliedHeadPositionOffset: boolean;
  appliedNeck: boolean;
  appliedUpperChestCompensation: boolean;
  baseHeadPosition: THREE.Vector3 | null;
};
