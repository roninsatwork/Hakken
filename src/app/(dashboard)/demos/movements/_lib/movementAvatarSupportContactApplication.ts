import * as THREE from "three";
import type {
  MovementAvatarSupportContactAnchor,
  MovementAvatarSupportContactLockDecision,
} from "./movementAvatarPipeline";

export type MovementAvatarSupportContactAnchorSample = {
  anchor: MovementAvatarSupportContactAnchor;
  canApplyBoneCorrection?: boolean;
  worldY: number;
};

export type MovementAvatarSupportContactBoneCorrection = {
  correction: number;
  residualCorrection: number;
  sampleIndex: number;
  weightedCorrection: number;
};

export type MovementAvatarSupportContactVector3 = {
  x: number;
  y: number;
  z: number;
};

export type MovementAvatarSupportContactBoneCorrectionLocalApplication =
  MovementAvatarSupportContactBoneCorrection & {
    targetLocalPosition: MovementAvatarSupportContactVector3;
  };

export type MovementAvatarSupportContactCorrectionApplication = {
  appliedAnchors: number;
  appliedBoneCorrection: number;
  appliedRootCorrection: number;
  boneCorrections: MovementAvatarSupportContactBoneCorrection[];
  rootCorrection: number;
  supportContactCorrection: number;
};

export type MovementAvatarSupportContactBoneCorrectionApplicationResult = {
  applied: number;
  appliedBoneCorrection: number;
};

export type MovementAvatarSupportContactRootCorrectionApplicationResult = {
  applied: boolean;
  appliedRootCorrection: number;
};

export type MovementAvatarSupportContactObjectApplicationResult = {
  applied: boolean;
  appliedAnchors: number;
  appliedBoneCorrection: number;
  appliedRootCorrection: number;
  supportContactCorrection: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function resolveMovementAvatarSupportContactCorrectionApplication({
  contactLocks,
  floorY,
  samples,
}: {
  contactLocks: MovementAvatarSupportContactLockDecision;
  floorY: number;
  samples: MovementAvatarSupportContactAnchorSample[];
}): MovementAvatarSupportContactCorrectionApplication {
  let weightedCorrection = 0;
  let totalWeight = 0;

  const corrections = samples.map((sample) => {
    const targetY = floorY + sample.anchor.targetOffsetFromFloor;
    const correction = clamp(
      targetY - sample.worldY,
      -contactLocks.maxCorrection,
      contactLocks.maxCorrection,
    );

    weightedCorrection += correction * sample.anchor.weight;
    totalWeight += sample.anchor.weight;

    return correction;
  });

  if (totalWeight <= 0 || samples.length === 0) {
    return {
      appliedAnchors: 0,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      boneCorrections: [],
      rootCorrection: 0,
      supportContactCorrection: 0,
    };
  }

  const rootCorrection = clamp(
    weightedCorrection / totalWeight,
    -contactLocks.maxCorrection,
    contactLocks.maxCorrection,
  );
  const appliedRootCorrection = rootCorrection * contactLocks.slerp * contactLocks.rootCorrectionScale;

  const boneCorrections = contactLocks.boneCorrectionScale > 0 && contactLocks.maxBoneCorrection > 0
    ? corrections.flatMap((correction, sampleIndex) => {
        const sample = samples[sampleIndex];
        if (!sample || sample.canApplyBoneCorrection === false) return [];

        const residualCorrection = clamp(
          correction - appliedRootCorrection,
          -contactLocks.maxBoneCorrection,
          contactLocks.maxBoneCorrection,
        );
        const weightedBoneCorrection =
          residualCorrection *
          contactLocks.boneCorrectionScale *
          clamp(sample.anchor.weight, 0, 1);

        if (Math.abs(weightedBoneCorrection) < 0.0001) return [];

        return [{
          correction,
          residualCorrection,
          sampleIndex,
          weightedCorrection: weightedBoneCorrection,
        }];
      })
    : [];

  const appliedBoneCorrection = boneCorrections.reduce(
    (maxCorrection, correction) => Math.max(maxCorrection, Math.abs(correction.weightedCorrection)),
    0,
  );

  return {
    appliedAnchors: samples.length,
    appliedBoneCorrection,
    appliedRootCorrection,
    boneCorrections,
    rootCorrection,
    supportContactCorrection: Math.max(Math.abs(appliedRootCorrection), appliedBoneCorrection),
  };
}

export function applyMovementAvatarSupportContactRootCorrection({
  application,
  apply,
}: {
  application: MovementAvatarSupportContactCorrectionApplication;
  apply: (appliedRootCorrection: number) => boolean;
}): MovementAvatarSupportContactRootCorrectionApplicationResult {
  if (application.appliedAnchors === 0) {
    return {
      applied: false,
      appliedRootCorrection: 0,
    };
  }

  return {
    applied: apply(application.appliedRootCorrection),
    appliedRootCorrection: application.appliedRootCorrection,
  };
}

export function applyMovementAvatarSupportContactBoneCorrections({
  apply,
  corrections,
}: {
  apply: (correction: MovementAvatarSupportContactBoneCorrection) => boolean;
  corrections: MovementAvatarSupportContactBoneCorrection[];
}): MovementAvatarSupportContactBoneCorrectionApplicationResult {
  let applied = 0;
  let appliedBoneCorrection = 0;

  corrections.forEach((correction) => {
    if (!apply(correction)) return;

    applied += 1;
    appliedBoneCorrection = Math.max(appliedBoneCorrection, Math.abs(correction.weightedCorrection));
  });

  return {
    applied,
    appliedBoneCorrection,
  };
}

export function applyMovementAvatarSupportContactBoneCorrectionLocalApplications({
  apply,
  corrections,
  toLocalPosition,
}: {
  apply: (application: MovementAvatarSupportContactBoneCorrectionLocalApplication) => boolean;
  corrections: MovementAvatarSupportContactBoneCorrection[];
  toLocalPosition: (
    correction: MovementAvatarSupportContactBoneCorrection,
  ) => MovementAvatarSupportContactVector3 | null;
}): MovementAvatarSupportContactBoneCorrectionApplicationResult {
  let applied = 0;
  let appliedBoneCorrection = 0;

  corrections.forEach((correction) => {
    const targetLocalPosition = toLocalPosition(correction);
    if (!targetLocalPosition) return;
    if (!apply({
      ...correction,
      targetLocalPosition,
    })) return;

    applied += 1;
    appliedBoneCorrection = Math.max(appliedBoneCorrection, Math.abs(correction.weightedCorrection));
  });

  return {
    applied,
    appliedBoneCorrection,
  };
}

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
