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

  const allAnchorsAreFloorContacts = samples.every(
    (sample) => sample.anchor.surface === "floor",
  );
  const weightedFloorCorrections = corrections.filter(
    (_correction, sampleIndex) => (samples[sampleIndex]?.anchor.weight ?? 0) > 0,
  );
  const minimumFloorCorrection = Math.min(...weightedFloorCorrections);
  const maximumFloorCorrection = Math.max(...weightedFloorCorrections);
  const floorCorrectionRange = maximumFloorCorrection - minimumFloorCorrection;
  const rootCorrection = clamp(
    allAnchorsAreFloorContacts
      // Exact planted-foot IK can solve both endpoints after moving the shared
      // root. A gap larger than one IK pass must use the exact root placement;
      // this also keeps instructor/player startup convergence deterministic.
      // For normal contact reacquisition, keep most of the correction in the
      // root so the returning leg retains its source-driven bend, while
      // distributing enough across both leg chains to avoid a one-leg snap.
      // Approximate contact modes retain the conservative lowest-foot root
      // rule because their endpoints are not guaranteed to be solved later.
      ? contactLocks.boneCorrectionScale >= 1 &&
        contactLocks.maxBoneCorrection > 0 &&
        contactLocks.slerp >= 1
        ? floorCorrectionRange > contactLocks.maxBoneCorrection
          ? minimumFloorCorrection
          : (
              minimumFloorCorrection * 0.7 +
              (weightedCorrection / totalWeight) * 0.3
            )
        : maximumFloorCorrection
      : weightedCorrection / totalWeight,
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
