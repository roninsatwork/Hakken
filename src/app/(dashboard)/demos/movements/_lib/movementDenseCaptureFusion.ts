import {
  MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS,
  type MovementDeepCaptureBodyEvidence,
  type MovementDeepCaptureBodyFusion,
  type MovementDeepCaptureBodyRegion,
  type MovementDeepCaptureRegionFusion,
  type MovementDeepCaptureSurfaceAnchor,
} from "./movementDeepCaptureContract";
import type { MovementLandmark } from "./movementTypes";

export const MOVEMENT_DENSE_CAPTURE_FUSION_PROFILE = {
  id: "movement-dense-capture-fusion-v1",
} as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function emptyRegionFusion(): MovementDeepCaptureRegionFusion {
  return {
    anchorCount: 0,
    confidence: 0,
    currentCount: 0,
    derivedCount: 0,
    modelEstimatedCount: 0,
    observedCount: 0,
    occludedCount: 0,
    state: "missing",
    surfaceCounts: { back: 0, front: 0, side: 0, unknown: 0 },
    temporallyTrackedCount: 0,
  };
}

function regionFusion(anchors: MovementDeepCaptureSurfaceAnchor[]): MovementDeepCaptureRegionFusion {
  if (anchors.length === 0) return emptyRegionFusion();
  const observedCount = anchors.filter((anchor) => anchor.provenance.origin === "observed").length;
  const modelEstimatedCount = anchors.filter(
    (anchor) => anchor.provenance.origin === "model-estimated",
  ).length;
  const temporallyTrackedCount = anchors.filter(
    (anchor) => anchor.provenance.origin === "temporally-tracked",
  ).length;
  const derivedCount = anchors.filter((anchor) => anchor.provenance.origin === "derived").length;
  const occludedCount = anchors.filter((anchor) => anchor.occluded).length;
  const currentCount = observedCount + modelEstimatedCount + derivedCount;
  const surfaceCounts = { back: 0, front: 0, side: 0, unknown: 0 };
  anchors.forEach((anchor) => {
    surfaceCounts[anchor.surface] += 1;
  });
  const confidence = anchors.reduce(
    (sum, anchor) => sum + clamp01(anchor.provenance.confidence),
    0,
  ) / anchors.length;
  const state = currentCount > 0 && occludedCount < anchors.length
    ? "current"
    : temporallyTrackedCount > 0 && occludedCount < anchors.length
      ? "tracked"
      : occludedCount === anchors.length
        ? "occluded"
        : "missing";

  return {
    anchorCount: anchors.length,
    confidence,
    currentCount,
    derivedCount,
    modelEstimatedCount,
    observedCount,
    occludedCount,
    state,
    surfaceCounts,
    temporallyTrackedCount,
  };
}

function currentAverageNormal(
  anchors: MovementDeepCaptureSurfaceAnchor[],
  regions: MovementDeepCaptureBodyRegion[],
) {
  const selected = anchors.filter((anchor) => (
    regions.includes(anchor.region) &&
    !anchor.occluded &&
    anchor.provenance.origin !== "temporally-tracked" &&
    anchor.normal
  ));
  if (selected.length === 0) return null;
  const vector = selected.reduce(
    (sum, anchor) => ({
      x: sum.x + (anchor.normal?.x ?? 0),
      y: sum.y + (anchor.normal?.y ?? 0),
      z: sum.z + (anchor.normal?.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 },
  );
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(magnitude) || magnitude < 1e-6) return null;
  return {
    confidence: selected.reduce(
      (sum, anchor) => sum + clamp01(anchor.provenance.confidence),
      0,
    ) / selected.length,
    normal: { x: vector.x / magnitude, y: vector.y / magnitude, z: vector.z / magnitude },
  };
}

function normalizeRadians(value: number) {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function torsoTwist(anchors: MovementDeepCaptureSurfaceAnchor[]) {
  const shoulders = currentAverageNormal(anchors, ["leftShoulder", "rightShoulder", "chest"]);
  const pelvis = currentAverageNormal(anchors, ["pelvis", "abdomen"]);
  if (!shoulders || !pelvis) {
    return {
      confidence: 0,
      radians: null,
      reason: "insufficient-current-surface-normals" as const,
    };
  }
  const shoulderYaw = Math.atan2(shoulders.normal.x, shoulders.normal.z);
  const pelvisYaw = Math.atan2(pelvis.normal.x, pelvis.normal.z);
  return {
    confidence: Math.min(shoulders.confidence, pelvis.confidence),
    radians: normalizeRadians(shoulderYaw - pelvisYaw),
    reason: "derived-from-current-surface-normals" as const,
  };
}

function contactCandidate(
  anchors: MovementDeepCaptureSurfaceAnchor[],
  region: "leftFoot" | "rightFoot",
) {
  const candidates = anchors.filter((anchor) => anchor.region === region);
  if (candidates.length === 0) {
    return { anchorIds: [], confidence: 0, imageBottom: null, state: "missing" as const };
  }
  const current = candidates.filter((anchor) => (
    !anchor.occluded && anchor.provenance.origin !== "temporally-tracked"
  ));
  if (current.length === 0) {
    return {
      anchorIds: candidates.map((anchor) => anchor.id),
      confidence: 0,
      imageBottom: Math.max(...candidates.map((anchor) => anchor.image.y)),
      state: "occluded" as const,
    };
  }
  return {
    anchorIds: current.map((anchor) => anchor.id),
    confidence: current.reduce(
      (sum, anchor) => sum + clamp01(anchor.provenance.confidence),
      0,
    ) / current.length,
    imageBottom: Math.max(...current.map((anchor) => anchor.image.y)),
    // This is deliberately an eligibility signal, not a contact verdict. A
    // calibrated ground plane and temporal support decision remain required.
    state: "eligible" as const,
  };
}

export function buildMovementDenseCaptureFusion({
  anchors,
  poseLandmarks,
  worldPoseLandmarks,
}: {
  anchors: MovementDeepCaptureSurfaceAnchor[];
  poseLandmarks: MovementLandmark[];
  worldPoseLandmarks?: MovementLandmark[] | null;
}): MovementDeepCaptureBodyFusion {
  const regionCoverage = Object.fromEntries(
    MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.map((region) => [
      region,
      regionFusion(anchors.filter((anchor) => anchor.region === region)),
    ]),
  ) as Record<MovementDeepCaptureBodyRegion, MovementDeepCaptureRegionFusion>;

  return {
    contactCandidates: {
      leftFoot: contactCandidate(anchors, "leftFoot"),
      rightFoot: contactCandidate(anchors, "rightFoot"),
    },
    profileId: MOVEMENT_DENSE_CAPTURE_FUSION_PROFILE.id,
    regionCoverage,
    skeleton: {
      poseLandmarkCount: poseLandmarks.length,
      worldPoseLandmarkCount: worldPoseLandmarks?.length ?? 0,
    },
    torsoTwist: torsoTwist(anchors),
  };
}

export function fuseMovementDenseCaptureEvidence({
  evidence,
  poseLandmarks,
  worldPoseLandmarks,
}: {
  evidence: MovementDeepCaptureBodyEvidence;
  poseLandmarks: MovementLandmark[];
  worldPoseLandmarks?: MovementLandmark[] | null;
}): MovementDeepCaptureBodyEvidence {
  return {
    ...evidence,
    fusion: buildMovementDenseCaptureFusion({
      anchors: evidence.anchors,
      poseLandmarks,
      worldPoseLandmarks,
    }),
  };
}

export function validateMovementDenseCaptureFusion(
  fusion: MovementDeepCaptureBodyFusion | null | undefined,
) {
  const failures: string[] = [];
  if (fusion?.profileId !== MOVEMENT_DENSE_CAPTURE_FUSION_PROFILE.id) {
    failures.push("Dense-body fusion profile is missing or invalid.");
  }
  if (fusion?.skeleton.poseLandmarkCount !== 33 || fusion.skeleton.worldPoseLandmarkCount !== 33) {
    failures.push("Dense-body fusion must retain all 33 image and world pose landmarks.");
  }
  const invalidCoverageRegions = MOVEMENT_DEEP_CAPTURE_REQUIRED_BODY_REGIONS.filter((region) => {
    const coverage = fusion?.regionCoverage[region];
    if (!coverage || !["current", "tracked", "occluded", "missing"].includes(coverage.state)) {
      return true;
    }
    if (!Number.isFinite(coverage.anchorCount) || coverage.anchorCount < 0) return true;
    return coverage.anchorCount === 0
      ? coverage.state !== "missing"
      : coverage.state === "missing";
  });
  if (invalidCoverageRegions.length > 0) {
    failures.push(
      `Dense-body fusion has invalid or absent region states: ${invalidCoverageRegions.join(", ")}.`,
    );
  }
  return { failures, passed: failures.length === 0 };
}
