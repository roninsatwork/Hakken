import { movementBoundaryChecksum } from "./movementBoundaryChecksum";
import type {
  MovementDeepCaptureBodyEvidence,
  MovementDeepCaptureFrameEvidence,
  MovementDeepCaptureObservationOrigin,
} from "./movementDeepCaptureContract";

export const MOVEMENT_DENSE_CAPTURE_PROOF_PROFILE = {
  id: "movement-dense-capture-proof-v1",
} as const;

type MovementDenseCaptureProofSnapshot = {
  anchorCount: number;
  anchorIdentityChecksum: string;
  contactCandidates: NonNullable<MovementDeepCaptureBodyEvidence["fusion"]>["contactCandidates"];
  fusionProfileId: string;
  model: {
    adapterProfileId: string | null;
    hash: string;
    id: string;
    inputHeight: number | null;
    inputWidth: number | null;
    runtime: string | null;
  };
  observationCounts: Record<MovementDeepCaptureObservationOrigin | "occluded", number>;
  profileId: typeof MOVEMENT_DENSE_CAPTURE_PROOF_PROFILE.id;
  regionCoverage: NonNullable<MovementDeepCaptureBodyEvidence["fusion"]>["regionCoverage"];
  skeleton: NonNullable<MovementDeepCaptureBodyEvidence["fusion"]>["skeleton"];
  torsoTwist: NonNullable<MovementDeepCaptureBodyEvidence["fusion"]>["torsoTwist"];
};

export function buildMovementDenseCaptureProofSnapshot(
  deepCapture: MovementDeepCaptureFrameEvidence | null | undefined,
): MovementDenseCaptureProofSnapshot | null {
  const denseBody = deepCapture?.denseBody;
  const fusion = denseBody?.fusion;
  if (!denseBody || !fusion) return null;

  const anchorIdentity = denseBody.anchors
    .map((anchor) => ({
      anatomicalSide: anchor.anatomicalSide,
      id: anchor.id,
      region: anchor.region,
      surface: anchor.surface,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const observationCounts: MovementDenseCaptureProofSnapshot["observationCounts"] = {
    derived: 0,
    "model-estimated": 0,
    observed: 0,
    occluded: 0,
    "temporally-tracked": 0,
  };
  denseBody.anchors.forEach((anchor) => {
    observationCounts[anchor.provenance.origin] += 1;
    if (anchor.occluded) observationCounts.occluded += 1;
  });

  return {
    anchorCount: denseBody.anchors.length,
    anchorIdentityChecksum: movementBoundaryChecksum(anchorIdentity),
    contactCandidates: structuredClone(fusion.contactCandidates),
    fusionProfileId: fusion.profileId,
    model: {
      adapterProfileId: denseBody.adapter?.profileId ?? null,
      hash: denseBody.modelHash,
      id: denseBody.modelId,
      inputHeight: denseBody.adapter?.inputHeight ?? null,
      inputWidth: denseBody.adapter?.inputWidth ?? null,
      runtime: denseBody.adapter?.runtime ?? null,
    },
    observationCounts,
    profileId: MOVEMENT_DENSE_CAPTURE_PROOF_PROFILE.id,
    regionCoverage: structuredClone(fusion.regionCoverage),
    skeleton: structuredClone(fusion.skeleton),
    torsoTwist: structuredClone(fusion.torsoTwist),
  };
}
