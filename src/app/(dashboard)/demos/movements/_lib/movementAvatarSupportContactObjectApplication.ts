import * as THREE from "three";
import type {
  MovementAvatarSupportContactAnchor,
  MovementAvatarSupportContactLockDecision,
} from "./movementAvatarPipeline";
import {
  applyMovementAvatarSupportContactBoneCorrectionLocalApplications,
  applyMovementAvatarSupportContactRootCorrection,
  resolveMovementAvatarSupportContactCorrectionApplication,
} from "./movementAvatarSupportContactCorrectionApplication";
import { applyMovementAvatarPlantedFootEndpointIk } from "./movementAvatarPlantedFootEndpointIk";

export type MovementAvatarSupportContactObjectApplicationResult = {
  applied: boolean;
  appliedAnchors: number;
  appliedBoneCorrection: number;
  appliedRootCorrection: number;
  supportContactCorrection: number;
};

export function applyMovementAvatarSupportContactLocksToObjects({
  avatarRoot,
  contactLocks,
  floorY,
  lookupBone,
  scene,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  contactLocks: MovementAvatarSupportContactLockDecision;
  floorY: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
}): MovementAvatarSupportContactObjectApplicationResult {
  if (!avatarRoot || !contactLocks.shouldApply) {
    return {
      applied: false,
      appliedAnchors: 0,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      supportContactCorrection: 0,
    };
  }

  scene?.updateMatrixWorld(true);
  avatarRoot.updateMatrixWorld(true);

  const anchorSamples: Array<{
    anchor: MovementAvatarSupportContactAnchor;
    bone: THREE.Object3D;
    canApplyBoneCorrection: boolean;
    worldY: number;
  }> = [];

  contactLocks.anchors.forEach((anchor) => {
    const bone = lookupBone(anchor.bone);
    if (!bone) return;

    bone.updateMatrixWorld(true);
    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);
    anchorSamples.push({
      anchor,
      bone,
      canApplyBoneCorrection: Boolean(bone.parent),
      worldY: worldPosition.y,
    });
  });

  const contactCorrection = resolveMovementAvatarSupportContactCorrectionApplication({
    contactLocks,
    floorY,
    samples: anchorSamples.map(({ anchor, canApplyBoneCorrection, worldY }) => ({
      anchor,
      canApplyBoneCorrection,
      worldY,
    })),
  });

  const rootCorrectionApplication = applyMovementAvatarSupportContactRootCorrection({
    application: contactCorrection,
    apply: (appliedRootCorrection) => {
      avatarRoot.position.y += appliedRootCorrection;
      return true;
    },
  });
  if (!rootCorrectionApplication.applied) {
    return {
      applied: false,
      appliedAnchors: contactCorrection.appliedAnchors,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      supportContactCorrection: 0,
    };
  }

  avatarRoot.updateMatrixWorld(true);

  let appliedBoneCorrection = 0;
  if (contactCorrection.boneCorrections.length > 0) {
    scene?.updateMatrixWorld(true);
    avatarRoot.updateMatrixWorld(true);

    const boneCorrectionApplication = applyMovementAvatarSupportContactBoneCorrectionLocalApplications({
      apply: (application) => {
        const sample = anchorSamples[application.sampleIndex];
        const bone = sample?.bone;
        if (!bone?.parent) return false;

        const side = sample.anchor.bone === "leftFoot"
          ? "left"
          : sample.anchor.bone === "rightFoot"
            ? "right"
            : null;
        if (side) {
          const upperLeg = lookupBone(`${side}UpperLeg`);
          const lowerLeg = lookupBone(`${side}LowerLeg`);
          scene?.updateMatrixWorld(true);
          const currentWorldY = bone.getWorldPosition(new THREE.Vector3()).y;
          if (!upperLeg || !lowerLeg) return false;
          return applyMovementAvatarPlantedFootEndpointIk({
            foot: bone,
            lowerLeg,
            scene,
            targetWorldY: currentWorldY + application.weightedCorrection,
            upperLeg,
          });
        }

        bone.position.lerp(application.targetLocalPosition, contactLocks.slerp);
        return true;
      },
      corrections: contactCorrection.boneCorrections,
      toLocalPosition: (correction) => {
        const sample = anchorSamples[correction.sampleIndex];
        const bone = sample?.bone;
        if (!bone?.parent) return null;

        bone.updateMatrixWorld(true);
        bone.parent.updateMatrixWorld(true);
        const boneWorldPosition = new THREE.Vector3();
        bone.getWorldPosition(boneWorldPosition);
        const targetWorldPosition = boneWorldPosition.clone();
        targetWorldPosition.y += correction.weightedCorrection;
        return bone.parent.worldToLocal(targetWorldPosition);
      },
    });
    appliedBoneCorrection = boneCorrectionApplication.appliedBoneCorrection;
  }

  // A released foot may legitimately rise above the support plane, but it
  // must never pass through it. If retarget depth and root support disagree,
  // lift the endpoint back to the floor through the same translation-free leg
  // IK used for planted contacts. This prevents a later contact reacquisition
  // from snapping an already-penetrating foot across a large distance.
  (["left", "right"] as const).forEach((side) => {
    scene?.updateMatrixWorld(true);
    avatarRoot.updateMatrixWorld(true);
    const foot = lookupBone(`${side}Foot`);
    const upperLeg = lookupBone(`${side}UpperLeg`);
    const lowerLeg = lookupBone(`${side}LowerLeg`);
    if (!foot || !upperLeg || !lowerLeg) return;
    const currentWorldY = foot.getWorldPosition(new THREE.Vector3()).y;
    const penetration = floorY - currentWorldY;
    if (penetration <= 0.0001) return;
    if (!applyMovementAvatarPlantedFootEndpointIk({
      foot,
      lowerLeg,
      scene,
      targetWorldY: floorY,
      upperLeg,
    })) return;
    appliedBoneCorrection = Math.max(appliedBoneCorrection, penetration);
  });

  if (appliedBoneCorrection > 0) {
    avatarRoot.updateMatrixWorld(true);
  }

  return {
    applied: true,
    appliedAnchors: contactCorrection.appliedAnchors,
    appliedBoneCorrection,
    appliedRootCorrection: rootCorrectionApplication.appliedRootCorrection,
    supportContactCorrection: Math.max(
      Math.abs(rootCorrectionApplication.appliedRootCorrection),
      appliedBoneCorrection,
    ),
  };
}
