import type { MovementContactPoint } from "./movementSupportContact";
import type {
  MovementAvatarSupportContactAnchor,
  MovementAvatarSupportContactBoneName,
  MovementAvatarSupportContactLockDecision,
} from "./movementAvatarSupportContactDecisionTypes";

export function inactiveSupportContactLocks(
  owner = "support-contact-locks-none",
): MovementAvatarSupportContactLockDecision {
  return {
    anchors: [],
    boneCorrectionScale: 0,
    maxCorrection: 0,
    maxBoneCorrection: 0,
    owner,
    rootCorrectionScale: 0,
    shouldApply: false,
    slerp: 0,
    status: "inactive",
  };
}

export function supportContactAnchor(
  bone: MovementAvatarSupportContactBoneName,
  label: string,
  surface: MovementAvatarSupportContactAnchor["surface"],
  targetOffsetFromFloor: number,
  weight = 1,
): MovementAvatarSupportContactAnchor {
  return {
    bone,
    label,
    surface,
    targetOffsetFromFloor,
    weight,
  };
}

export function partialSupportContactLocks({
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
}): MovementAvatarSupportContactLockDecision {
  return {
    anchors,
    boneCorrectionScale,
    maxCorrection,
    maxBoneCorrection,
    owner,
    rootCorrectionScale,
    shouldApply: anchors.length > 0,
    slerp,
    status: "partial",
  };
}

function anchorForContactPoint(point: MovementContactPoint): MovementAvatarSupportContactAnchor | null {
  if (point === "leftFoot") return supportContactAnchor("leftFoot", "left foot to floor", "floor", 0.02, 0.85);
  if (point === "rightFoot") return supportContactAnchor("rightFoot", "right foot to floor", "floor", 0.02, 0.85);
  if (point === "leftHand") return supportContactAnchor("leftHand", "left hand to floor", "floor", 0.03, 0.75);
  if (point === "rightHand") return supportContactAnchor("rightHand", "right hand to floor", "floor", 0.03, 0.75);
  if (point === "leftKnee") return supportContactAnchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 0.9);
  if (point === "rightKnee") return supportContactAnchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 0.9);
  if (point === "leftHip" || point === "rightHip") return supportContactAnchor("hips", "hips to floor", "floor", 0.08, 0.9);
  if (point === "leftShoulder" || point === "rightShoulder") {
    return supportContactAnchor("chest", "shoulders to floor", "floor", 0.12, 0.75);
  }
  if (point === "leftElbow") return supportContactAnchor("leftLowerArm", "left elbow to floor", "floor", 0.07, 0.42);
  if (point === "rightElbow") return supportContactAnchor("rightLowerArm", "right elbow to floor", "floor", 0.07, 0.42);
  if (point === "seat") return supportContactAnchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2);
  if (point === "back") return supportContactAnchor("spine", "back to floor", "floor", 0.1, 0.95);
  if (point === "belly") return supportContactAnchor("spine", "belly to floor", "floor", 0.1, 0.72);
  if (point === "chest") return supportContactAnchor("chest", "chest to floor", "floor", 0.08, 1);
  if (point === "sideBody") return supportContactAnchor("hips", "side body to floor", "floor", 0.08, 1);
  return null;
}

export function supportContactAnchorsForPoints(
  points: MovementContactPoint[],
  fallback: MovementAvatarSupportContactAnchor[],
): MovementAvatarSupportContactAnchor[] {
  const anchors: MovementAvatarSupportContactAnchor[] = [];
  const usedBones = new Set<MovementAvatarSupportContactBoneName>();
  const add = (item: MovementAvatarSupportContactAnchor | null) => {
    if (!item || usedBones.has(item.bone)) return;
    usedBones.add(item.bone);
    anchors.push(item);
  };

  points.forEach((point) => add(anchorForContactPoint(point)));
  if (anchors.length > 0) return anchors;
  fallback.forEach(add);
  return anchors;
}
