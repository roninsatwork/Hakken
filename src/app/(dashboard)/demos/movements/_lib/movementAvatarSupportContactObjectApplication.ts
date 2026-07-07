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
