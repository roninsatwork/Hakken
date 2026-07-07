import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  MOVEMENT_COVERAGE_REGISTRY,
  type MovementCoverageFamily,
} from "./movementCoverageRegistry";
import {
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  makeMovementAvatarProofRootBaselinePayload,
  type MovementAvatarProofMotionPayload,
  type MovementAvatarProofMode,
} from "./movementAvatarProofFixtures";
import {
  buildMovementGamePathSimulation,
} from "./movementGamePathSimulation";
import type {
  MovementDebugReplayFrame,
  MovementDebugReplaySession,
} from "./movementDebugReplay";
import {
  resolveMovementRootMotionStepResponse,
} from "./movementRootMotion";
import {
  resolveMovementAvatarSupportPresentationPose,
} from "./movementAvatarSupportPresentationDecision";
import { resolveMovementExercisePose } from "./movementExercisePose";
import { resolveMovementSupportConstraint } from "./movementSupportConstraint";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import { resolveMovementSupportIntent } from "./movementSupportIntent";

export type MovementExpansionPreviewFamily =
  | "facing-occlusion"
  | "jump-hop"
  | "kneeling"
  | "lunges"
  | "lying-floor-work"
  | "pilates"
  | "pivot-weight-transfer"
  | "props-contact"
  | "quadruped"
  | "rolling-crawling"
  | "sitting"
  | "walking"
  | "yoga";

export type MovementExpansionPreviewAuditCase = {
  expectedFamily: MovementExpansionPreviewFamily;
  mode: MovementAvatarProofMode;
};

export type MovementExpansionPreviewAuditRow = {
  constraintOwner: string;
  constraintStatus: string;
  expectedFamily: MovementExpansionPreviewFamily;
  mode: MovementAvatarProofMode;
  ok: boolean;
  poseKey: string;
  presentationOwner: string;
  registryDemoReady: boolean;
  registryStatus: string;
  supportIntent: string;
};

export type MovementExpansionPreviewAuditSummary = {
  ok: boolean;
  previewFamilyCount: number;
  previewFamilies: MovementExpansionPreviewFamily[];
  rows: MovementExpansionPreviewAuditRow[];
};

export const MOVEMENT_EXPANSION_PREVIEW_FAMILIES: MovementExpansionPreviewFamily[] = [
  "facing-occlusion",
  "jump-hop",
  "kneeling",
  "lunges",
  "lying-floor-work",
  "pilates",
  "pivot-weight-transfer",
  "props-contact",
  "quadruped",
  "rolling-crawling",
  "sitting",
  "walking",
  "yoga",
];

export const MOVEMENT_EXPANSION_PREVIEW_AUDIT_CASES: MovementExpansionPreviewAuditCase[] = [
  { expectedFamily: "facing-occlusion", mode: "root-turn-left" },
  { expectedFamily: "jump-hop", mode: "jumping-jack" },
  { expectedFamily: "kneeling", mode: "kneeling" },
  { expectedFamily: "lunges", mode: "forward-lunge" },
  { expectedFamily: "lying-floor-work", mode: "supine" },
  { expectedFamily: "pilates", mode: "pilates-hundred" },
  { expectedFamily: "pivot-weight-transfer", mode: "side-lunge" },
  { expectedFamily: "props-contact", mode: "seated" },
  { expectedFamily: "quadruped", mode: "quadruped" },
  { expectedFamily: "rolling-crawling", mode: "bear-crawl" },
  { expectedFamily: "sitting", mode: "seated-twist" },
  { expectedFamily: "walking", mode: "root-travel-forward" },
  { expectedFamily: "yoga", mode: "yoga-warrior-two" },
];

function clonePayloadWithWorldOffset({
  footLiftSide,
  offset,
  payload,
}: {
  footLiftSide?: "left" | "right";
  offset: { x?: number; z?: number };
  payload: MovementAvatarProofMotionPayload;
}): MovementAvatarProofMotionPayload {
  const sourceWorldLandmarks = payload.worldLandmarks ?? payload.landmarks;
  const liftIndices = footLiftSide === "left"
    ? [27, 29, 31]
    : footLiftSide === "right" ? [28, 30, 32] : [];

  const worldLandmarks = sourceWorldLandmarks.map((landmark, index) => ({
    ...landmark,
    x: landmark.x + (offset.x ?? 0),
    y: liftIndices.includes(index) ? landmark.y + 0.28 : landmark.y,
    z: (landmark.z ?? 0) + (offset.z ?? 0),
  }));

  return {
    ...payload,
    worldLandmarks,
  };
}

function replayFrameFromPayload(
  payload: MovementAvatarProofMotionPayload,
  frameIndex: number,
): MovementDebugReplayFrame {
  return {
    bodyConfidence: {},
    capturedAt: frameIndex * 100,
    fallbacks: {},
    tracking: {
      pose: payload.landmarks,
      worldPose: payload.worldLandmarks ?? payload.landmarks,
    },
  };
}

function syntheticWalkingPreviewSession(): MovementDebugReplaySession {
  const baseline = makeMovementAvatarProofRootBaselinePayload();
  const walkingPayload = makeMovementAvatarProofMotionPayload("root-travel-forward");
  const frames = [
    clonePayloadWithWorldOffset({ payload: baseline, offset: { z: 0 } }),
    clonePayloadWithWorldOffset({ payload: walkingPayload, offset: { z: 0.24 }, footLiftSide: "left" }),
    clonePayloadWithWorldOffset({ payload: walkingPayload, offset: { z: 0.24 } }),
    clonePayloadWithWorldOffset({ payload: walkingPayload, offset: { z: 0.5 }, footLiftSide: "right" }),
    clonePayloadWithWorldOffset({ payload: walkingPayload, offset: { z: 0.5 } }),
  ].map(replayFrameFromPayload);

  return {
    baselineSummary: "synthetic walking preview baseline",
    durationMs: frames.length * 100,
    endedAt: frames.length * 100,
    id: "synthetic-walking-preview",
    movementId: "walking-preview",
    sampleCount: frames.length,
    samples: frames,
    startedAt: 0,
    trigger: "synthetic-preview",
    warningSummary: "",
  };
}

function syntheticFacingOcclusionDiagnosticSession(): MovementDebugReplaySession {
  const baseline = makeMovementAvatarProofRootBaselinePayload();
  const awayBody = makeMovementAvatarProofMotionPayload("root-turn-left");
  const frames = [
    baseline,
    awayBody,
  ].map(replayFrameFromPayload);

  return {
    baselineSummary: "synthetic facing/occlusion diagnostic baseline",
    durationMs: frames.length * 100,
    endedAt: frames.length * 100,
    id: "synthetic-facing-occlusion-diagnostic",
    movementId: "facing-occlusion-preview",
    sampleCount: frames.length,
    samples: frames,
    startedAt: 0,
    trigger: "synthetic-preview",
    warningSummary: "",
  };
}

function auditFacingOcclusionDiagnosticRow(): MovementExpansionPreviewAuditRow {
  const registryEntry = MOVEMENT_COVERAGE_REGISTRY["facing-occlusion"];
  const simulation = buildMovementGamePathSimulation(syntheticFacingOcclusionDiagnosticSession());
  const awayBodyFrame = simulation.rootMotion.frames.find((frame) => (
    Math.abs(frame.headingYaw) >= 2.4 &&
    frame.headingConfidence >= 0.45
  ));
  const hasFacingDiagnosticProof = Boolean(awayBodyFrame) &&
    simulation.rootMotion.summary.sourceLimitedFrameCount === 0;

  return {
    constraintOwner: "root-heading-diagnostic",
    constraintStatus: hasFacingDiagnosticProof ? "active" : "inactive",
    expectedFamily: "facing-occlusion",
    mode: "root-turn-left",
    ok: registryEntry.demoReady &&
      registryEntry.status === "diagnostic-only" &&
      registryEntry.proofLevel === "diagnostic" &&
      hasFacingDiagnosticProof,
    poseKey: awayBodyFrame ? "facing-away-root-heading" : "unknown",
    presentationOwner: awayBodyFrame ? "root-heading-away-body-diagnostic" : "none",
    registryDemoReady: registryEntry.demoReady,
    registryStatus: registryEntry.status,
    supportIntent: "facing-away-diagnostic",
  };
}

function auditWalkingPreviewRow(): MovementExpansionPreviewAuditRow {
  const registryEntry = MOVEMENT_COVERAGE_REGISTRY.walking;
  const simulation = buildMovementGamePathSimulation(syntheticWalkingPreviewSession());
  const intents = simulation.decisions
    .map((decision) => decision?.rootMotion.intent.key)
    .filter((key): key is NonNullable<typeof key> => Boolean(key));
  const stepResponses = simulation.decisions
    .map((decision) => decision ? resolveMovementRootMotionStepResponse(decision.rootMotion.intent).owner : null)
    .filter((owner): owner is string => Boolean(owner));
  const hasWalkingRootProof = (
    intents.includes("left-foot-release") &&
    intents.includes("left-foot-landing") &&
    intents.includes("right-foot-release") &&
    intents.includes("right-foot-landing") &&
    stepResponses.includes("step-response-left-release") &&
    stepResponses.includes("step-response-left-landing") &&
    stepResponses.includes("step-response-right-release") &&
    stepResponses.includes("step-response-right-landing") &&
    simulation.rootMotion.summary.sourceLimitedFrameCount === 0
  );

  return {
    constraintOwner: "root-motion-step-response",
    constraintStatus: hasWalkingRootProof ? "active" : "inactive",
    expectedFamily: "walking",
    mode: "root-travel-forward",
    ok: registryEntry.demoReady &&
      registryEntry.status === "approximate" &&
      hasWalkingRootProof,
    poseKey: intents.join("+") || "unknown",
    presentationOwner: stepResponses.filter((owner) => owner !== "step-response-none").join("+") || "none",
    registryDemoReady: registryEntry.demoReady,
    registryStatus: registryEntry.status,
    supportIntent: "root-travel-step-sequence",
  };
}

function hasPreviewSupportPresentation({
  expectedFamily,
  presentationOwner,
  supportIntent,
}: {
  expectedFamily: MovementCoverageFamily;
  presentationOwner: string;
  supportIntent: string;
}) {
  if (
    expectedFamily === "jump-hop" ||
    expectedFamily === "lunges" ||
    expectedFamily === "pivot-weight-transfer" ||
    expectedFamily === "yoga"
  ) {
    return supportIntent === "feet-floor";
  }

  return presentationOwner !== "none" && presentationOwner !== "support-presentation-unknown";
}

export function auditMovementExpansionPreviewSupport({
  cases = MOVEMENT_EXPANSION_PREVIEW_AUDIT_CASES,
}: {
  cases?: MovementExpansionPreviewAuditCase[];
} = {}): MovementExpansionPreviewAuditSummary {
  const rows = cases.map(({ expectedFamily, mode }) => {
    if (expectedFamily === "facing-occlusion") {
      return auditFacingOcclusionDiagnosticRow();
    }

    if (expectedFamily === "walking") {
      return auditWalkingPreviewRow();
    }

    const poseLandmarks = makeMovementAvatarProofPose(mode);
    const bodyOrientation = classifyMovementBodyOrientation(poseLandmarks);
    const bodySupport = resolveMovementSupportContacts({
      bodyOrientation,
      poseLandmarks,
    });
    const exercisePose = resolveMovementExercisePose({
      bodyOrientation,
      bodySupport,
      poseLandmarks,
    });
    const supportIntent = resolveMovementSupportIntent({
      bodySupport,
      exercisePose,
    });
    const supportConstraint = resolveMovementSupportConstraint({
      exercisePose,
      supportIntent,
    });
    const supportPresentation = resolveMovementAvatarSupportPresentationPose({
      exercisePose,
      poseLandmarks,
      supportConstraint,
      supportIntent,
    });
    const registryEntry = MOVEMENT_COVERAGE_REGISTRY[expectedFamily];
    const ok = (
      registryEntry.demoReady &&
      registryEntry.status === "approximate" &&
      exercisePose.coverageFamilies.includes(expectedFamily) &&
      hasPreviewSupportPresentation({
        expectedFamily,
        presentationOwner: supportPresentation.owner,
        supportIntent: supportIntent.key,
      })
    );

    return {
      constraintOwner: supportConstraint.owner,
      constraintStatus: supportConstraint.status,
      expectedFamily,
      mode,
      ok,
      poseKey: exercisePose.poseKey,
      presentationOwner: supportPresentation.owner,
      registryDemoReady: registryEntry.demoReady,
      registryStatus: registryEntry.status,
      supportIntent: supportIntent.key,
    };
  });

  return {
    ok: rows.every((row) => row.ok),
    previewFamilyCount: MOVEMENT_EXPANSION_PREVIEW_FAMILIES.length,
    previewFamilies: MOVEMENT_EXPANSION_PREVIEW_FAMILIES,
    rows,
  };
}
