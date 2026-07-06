import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type {
  MovementAvatarLowerBodyBoneName,
  MovementAvatarSpineBoneName,
  MovementAvatarSupportPresentationArmBoneName,
} from "./movementAvatarPipeline";
import type { MovementSupportConstraintDecision } from "./movementSupportConstraint";
import type { MovementContactPoint } from "./movementSupportContact";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";

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

export function resolveMovementAvatarSupportContactLocks({
  exercisePose,
  supportConstraint,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  supportConstraint: MovementSupportConstraintDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementAvatarSupportContactLockDecision {
  const inactive = (owner = "support-contact-locks-none"): MovementAvatarSupportContactLockDecision => ({
    anchors: [],
    boneCorrectionScale: 0,
    maxCorrection: 0,
    maxBoneCorrection: 0,
    owner,
    rootCorrectionScale: 0,
    shouldApply: false,
    slerp: 0,
    status: "inactive",
  });
  const anchor = (
    bone: MovementAvatarSupportContactBoneName,
    label: string,
    surface: MovementAvatarSupportContactAnchor["surface"],
    targetOffsetFromFloor: number,
    weight = 1,
  ): MovementAvatarSupportContactAnchor => ({
    bone,
    label,
    surface,
    targetOffsetFromFloor,
    weight,
  });
  const anchorsForPoints = (
    points: MovementContactPoint[],
    fallback: MovementAvatarSupportContactAnchor[],
  ) => {
    const anchors: MovementAvatarSupportContactAnchor[] = [];
    const usedBones = new Set<MovementAvatarSupportContactBoneName>();
    const add = (item: MovementAvatarSupportContactAnchor | null) => {
      if (!item || usedBones.has(item.bone)) return;
      usedBones.add(item.bone);
      anchors.push(item);
    };
    const anchorForPoint = (point: MovementContactPoint): MovementAvatarSupportContactAnchor | null => {
      if (point === "leftFoot") return anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.85);
      if (point === "rightFoot") return anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.85);
      if (point === "leftHand") return anchor("leftHand", "left hand to floor", "floor", 0.03, 0.75);
      if (point === "rightHand") return anchor("rightHand", "right hand to floor", "floor", 0.03, 0.75);
      if (point === "leftKnee") return anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 0.9);
      if (point === "rightKnee") return anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 0.9);
      if (point === "leftHip" || point === "rightHip") return anchor("hips", "hips to floor", "floor", 0.08, 0.9);
      if (point === "leftShoulder" || point === "rightShoulder") return anchor("chest", "shoulders to floor", "floor", 0.12, 0.75);
      if (point === "leftElbow") return anchor("leftLowerArm", "left elbow to floor", "floor", 0.07, 0.42);
      if (point === "rightElbow") return anchor("rightLowerArm", "right elbow to floor", "floor", 0.07, 0.42);
      if (point === "seat") return anchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2);
      if (point === "back") return anchor("spine", "back to floor", "floor", 0.1, 0.95);
      if (point === "belly") return anchor("spine", "belly to floor", "floor", 0.1, 0.72);
      if (point === "chest") return anchor("chest", "chest to floor", "floor", 0.08, 1);
      if (point === "sideBody") return anchor("hips", "side body to floor", "floor", 0.08, 1);
      return null;
    };

    points.forEach((point) => add(anchorForPoint(point)));
    if (anchors.length > 0) return anchors;
    fallback.forEach(add);
    return anchors;
  };
  const partial = ({
    anchors,
    boneCorrectionScale = 0,
    maxCorrection = 0.16,
    maxBoneCorrection = 0,
    owner,
    rootCorrectionScale = 1,
    slerp = 0.12,
  }: {
    anchors: MovementAvatarSupportContactAnchor[];
    boneCorrectionScale?: number;
    maxCorrection?: number;
    maxBoneCorrection?: number;
    owner: string;
    rootCorrectionScale?: number;
    slerp?: number;
  }): MovementAvatarSupportContactLockDecision => ({
    anchors,
    boneCorrectionScale,
    maxCorrection,
    maxBoneCorrection,
    owner,
    rootCorrectionScale,
    shouldApply: anchors.length > 0,
    slerp,
    status: "partial",
  });

  if (supportConstraint.status === "active" || supportIntent.key === "feet-floor") {
    return inactive("support-contact-locks-standing-foot-lock");
  }

  if (!supportConstraint.activeLayers.includes("support-anchor-correction")) {
    return inactive("support-contact-locks-unavailable");
  }

  if (supportIntent.key === "seat-chair") {
    return partial({
      anchors: [
        anchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.45),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.45),
      ],
      boneCorrectionScale: 0.035,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.025,
      owner: "support-contact-seat-chair",
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "knees-floor") {
    return partial({
      anchors: [
        anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.4),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.4),
      ],
      boneCorrectionScale: 0.04,
      maxBoneCorrection: 0.03,
      owner: "support-contact-knees-floor",
    });
  }

  if (supportIntent.key === "hands-knees-floor") {
    return partial({
      anchors: [
        anchor("rightHand", "right hand to floor", "floor", 0.03, 0.85),
        anchor("leftHand", "left hand to floor", "floor", 0.03, 0.85),
        anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-knees-floor",
      rootCorrectionScale: 0.94,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "hands-feet-floor") {
    return partial({
      anchors: [
        anchor("rightHand", "right hand to floor", "floor", 0.03, 0.9),
        anchor("leftHand", "left hand to floor", "floor", 0.03, 0.9),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 1),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-feet-floor",
      rootCorrectionScale: 0.92,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "back-floor") {
    if (exercisePose.poseKey === "pilates-bridge-prep") {
      return partial({
        anchors: [
          anchor("spine", "upper back to floor", "floor", 0.1, 1),
          anchor("chest", "shoulders to floor", "floor", 0.12, 0.85),
          anchor("leftFoot", "left bridge foot to floor", "floor", 0.02, 1),
          anchor("rightFoot", "right bridge foot to floor", "floor", 0.02, 1),
        ],
        boneCorrectionScale: 0.08,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.055,
        owner: "support-contact-bridge-floor",
        rootCorrectionScale: 0.82,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      anchor("hips", "hips/back to floor", "floor", 0.08, 1),
      anchor("spine", "spine to floor", "floor", 0.1, 0.8),
      anchor("chest", "upper back to floor", "floor", 0.12, 0.7),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-back-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "chest-floor") {
    if (exercisePose.poseKey === "prone-back-extension-prep") {
      return partial({
        anchors: [
          anchor("spine", "belly to floor", "floor", 0.1, 0.85),
          anchor("hips", "front hips to floor", "floor", 0.08, 0.9),
          anchor("leftHand", "left cobra hand to floor", "floor", 0.03, 0.85),
          anchor("rightHand", "right cobra hand to floor", "floor", 0.03, 0.85),
          anchor("leftFoot", "left prone foot to floor", "floor", 0.02, 0.5),
          anchor("rightFoot", "right prone foot to floor", "floor", 0.02, 0.5),
        ],
        boneCorrectionScale: 0.075,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.05,
        owner: "support-contact-prone-extension-floor",
        rootCorrectionScale: 0.84,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      anchor("chest", "chest to floor", "floor", 0.08, 1),
      anchor("hips", "front hips to floor", "floor", 0.08, 0.85),
      anchor("spine", "belly to floor", "floor", 0.1, 0.65),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-chest-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "side-body-floor") {
    const fallbackAnchors = [
      anchor("hips", "side hip to floor", "floor", 0.08, 1),
      anchor("chest", "side ribs to floor", "floor", 0.1, 0.75),
      anchor("leftUpperArm", "lower arm side support", "floor", 0.08, 0.45),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.075,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.05,
      owner: "support-contact-side-body-floor",
      rootCorrectionScale: 0.86,
      slerp: 0.1,
    });
  }

  return inactive("support-contact-locks-unknown");
}
