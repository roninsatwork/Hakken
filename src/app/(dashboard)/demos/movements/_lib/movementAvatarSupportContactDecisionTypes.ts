import type {
  MovementAvatarLowerBodyBoneName,
  MovementAvatarSpineBoneName,
  MovementAvatarSupportPresentationArmBoneName,
} from "./movementAvatarPipeline";

export type MovementAvatarSupportContactBoneName =
  | MovementAvatarLowerBodyBoneName
  | MovementAvatarSpineBoneName
  | MovementAvatarSupportPresentationArmBoneName;

export type MovementAvatarSupportContactAnchor = {
  bone: MovementAvatarSupportContactBoneName;
  label: string;
  surface: "chair" | "floor";
  targetOffsetFromFloor: number;
  weight: number;
};

export type MovementAvatarSupportContactLockDecision = {
  anchors: MovementAvatarSupportContactAnchor[];
  boneCorrectionScale: number;
  maxCorrection: number;
  maxBoneCorrection: number;
  owner: string;
  rootCorrectionScale: number;
  shouldApply: boolean;
  slerp: number;
  status: "active" | "inactive" | "partial";
};
