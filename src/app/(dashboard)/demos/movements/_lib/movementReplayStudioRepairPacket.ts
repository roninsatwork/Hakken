import type {
  MovementReplayAnalysis,
  MovementReplayFailure,
  MovementReplayFailureCode,
  MovementReplayStudioFrameFailure,
  MovementReplayStudioFrameVerdict,
  ReplayStudioFailureCode,
  ReplayStudioVerdictStatus,
} from "./movementReplayAnalyzer";

export type ReplayStudioRepairStage =
  | "source-capture"
  | "source-normalization"
  | "calibration"
  | "motion-decision"
  | "mirror-side-mapping"
  | "support-contact"
  | "retarget-solve"
  | "vrm-application"
  | "rendered-telemetry"
  | "proof-artifact"
  | "unknown";

export type ReplayStudioEvidenceStatus =
  | "proven"
  | "suspected"
  | "insufficient-evidence";

export type ReplayStudioAcceptanceStatus =
  | "accepted"
  | "blocked"
  | "review-only"
  | "not-supported";

export type ReplayStudioRepairRoute = {
  confidence: number;
  doNotPatch: string[];
  evidenceStatus: ReplayStudioEvidenceStatus;
  focusedTests: string[];
  likelyFiles: string[];
  nextFixArea: string;
  stage: ReplayStudioRepairStage;
};

export type ReplayStudioRepairPacketFailureCode = ReplayStudioFailureCode | "none";

export type ReplayStudioRepairPacketComparison = {
  after: {
    failureCode: ReplayStudioRepairPacketFailureCode;
    firstDivergentStage: ReplayStudioRepairStage;
    status: ReplayStudioAcceptanceStatus;
  };
  before: {
    failureCode: ReplayStudioRepairPacketFailureCode;
    firstDivergentStage: ReplayStudioRepairStage;
    status: ReplayStudioAcceptanceStatus;
  };
  metricDeltas: Record<string, number | null>;
  outcome: "improved" | "regressed" | "source-changed" | "unchanged";
  sameSourceHash: boolean;
  summary: string;
};

export type ReplayStudioRepairPacketArtifact = {
  checkedPaths: string[];
  fallbackReason?: string;
  freshness?: {
    artifactMotionPipelineFingerprints?: string[];
    currentMotionPipelineFingerprint?: string;
    reason: string;
    status: "current" | "not-required" | "recomputed" | "stale" | "unknown";
  };
  fixtureId?: string;
  kind:
    | "committed-fixture"
    | "configured-recording-source"
    | "default-analysis"
    | "default-analysis-committed-fixture-fallback"
    | "explicit-analysis"
    | "explicit-session"
    | "recording-id-committed-fixture-fallback";
  path: string | null;
  refreshCommand?: string;
  requestedRecordingId?: string | null;
  sourcePriority: string[];
  stalePath?: string;
};

export type ReplayStudioRepairPacket = {
  actual: {
    bones: Record<string, unknown>;
    contacts: Record<string, unknown>;
    owners: Record<string, string>;
    root: Record<string, unknown>;
  };
  code: {
    commit: string;
    motionPipelineFingerprint: string;
  };
  artifact?: ReplayStudioRepairPacketArtifact;
  comparison?: ReplayStudioRepairPacketComparison;
  commands: {
    acceptance: string;
    compareAfterChange: string;
    reproduce: string;
  };
  divergence: {
    explanation: string;
    firstDivergentStage: ReplayStudioRepairStage;
    metrics: Record<string, number | null>;
  };
  expected: {
    anatomicalMapping: "identity" | "opposite";
    avatarRole: "instructor" | "player";
    avatarSide: "left" | "right" | "both" | null;
    bones: Record<string, unknown>;
    owners: Record<string, string>;
  };
  generatedAt: string;
  recording: {
    fixtureId?: string;
    id: string;
    sourceHash: string;
    sourceHashBasis: "provided" | "source-session" | "analysis-report";
    title: string;
  };
  repair: {
    doNotPatch: string[];
    focusedTests: string[];
    likelyFiles: string[];
    owner: ReplayStudioRepairStage;
  };
  schemaVersion: 1;
  scope: {
    frameEnd: number;
    frameStart: number;
    silentSkipCount: number;
    totalFramesCompared: number;
    totalFramesExpected: number;
    totalFramesRendered: number;
  };
  source: {
    anatomicalSide: "left" | "right" | "both" | null;
    motion: string;
    quality: number;
    readiness: string;
    visibleBodyParts: string[];
  };
  verdict: {
    confidence: number;
    evidenceStatus: ReplayStudioEvidenceStatus;
    failureCode: ReplayStudioRepairPacketFailureCode;
    severity: "error" | "info" | "warning";
    status: ReplayStudioAcceptanceStatus;
  };
};

export type ReplayStudioRepairPacketMarkdownOptions = {
  includeJsonPointer?: boolean;
  jsonPath?: string;
};

const ACCEPTANCE_STATUS_RANK: Record<ReplayStudioAcceptanceStatus, number> = {
  accepted: 3,
  "review-only": 2,
  "not-supported": 1,
  blocked: 0,
};

export type ReplayStudioRepairPacketOptions = {
  anatomicalMapping?: "identity" | "opposite";
  artifact?: ReplayStudioRepairPacketArtifact;
  avatarRole?: "instructor" | "player";
  code?: Partial<ReplayStudioRepairPacket["code"]>;
  commands?: Partial<ReplayStudioRepairPacket["commands"]>;
  fixtureId?: string;
  frameIndex?: number | null;
  generatedAt?: string;
  recording?: Partial<ReplayStudioRepairPacket["recording"]>;
  sourceHashInput?: unknown;
  supplementalFailures?: MovementReplayFailure[];
};

type ReplayStudioStageOwnership = {
  doNotPatch: string[];
  focusedTests: string[];
  likelyFiles: string[];
  nextFixArea: string;
};

export const REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP: Record<
  ReplayStudioRepairStage,
  ReplayStudioStageOwnership
> = {
  calibration: {
    doNotPatch: [
      "Do not tune per-pose avatar bone values until neutral/floor calibration is proven.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRetargeting.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_hooks/useMovementTrackingCalibration.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts",
    ],
    nextFixArea: "tracking calibration / retarget source model",
  },
  "mirror-side-mapping": {
    doNotPatch: [
      "Do not add route-local side swaps; update the shared mirror contract and prove rendered parity.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorContract.test.ts",
      "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayThreePartyMirrorOracle.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementMirrorMapping.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodySourceOwnerDecision.ts",
      "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayThreePartyMirrorOracle.ts",
    ],
    nextFixArea: "mirror mapping / side ownership",
  },
  "motion-decision": {
    doNotPatch: [
      "Do not patch Game Studio separately from Replay; change the shared motion decision layer.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementMotionFrame.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarPipelineDecision.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.ts",
    ],
    nextFixArea: "shared motion decision / owner selection",
  },
  "proof-artifact": {
    doNotPatch: [
      "Do not accept a green UI screenshot when the proof artifact is missing, stale, or incomplete.",
    ],
    focusedTests: [
      "scripts/movement-debug/avatar-follow-gate.test.mjs",
      "scripts/movement-debug/analyze-replay-full-sequence.test.mjs",
      "scripts/movement-debug/compare-replay-analysis.test.mjs",
    ],
    likelyFiles: [
      "scripts/movement-debug/capture-replay-lab.mjs",
      "scripts/movement-debug/avatar-follow-gate.mjs",
      "scripts/movement-debug/analyze-replay-full-sequence.mjs",
      "src/app/(dashboard)/demos/movements/replay-lab/_hooks/useReplayLabCaptures.ts",
    ],
    nextFixArea: "Replay visual proof capture / avatar-follow gate",
  },
  "rendered-telemetry": {
    doNotPatch: [
      "Do not infer rendered avatar success from solver owners alone; capture post-application VRM telemetry.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameApplication.integration.test.ts",
      "scripts/movement-debug/avatar-follow-gate.test.mjs",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarVisualTelemetry.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarDebugTelemetry.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameApplication.ts",
    ],
    nextFixArea: "avatar visual telemetry / VRM bone application",
  },
  "retarget-solve": {
    doNotPatch: [
      "Do not drive body animation primarily from labels; prove source vectors and retarget outputs.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementRetargeting.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRootMotion.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplicationDecision.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRootMotion.ts",
    ],
    nextFixArea: "retarget solver / root motion response",
  },
  "source-capture": {
    doNotPatch: [
      "Do not tune avatar output until the raw source recording is trustworthy enough to judge.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementTruthSkeleton.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_hooks/useMediaPipeVision.ts",
      "src/app/(dashboard)/demos/movements/_hooks/useMovementCapture.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementTruthSkeleton.ts",
    ],
    nextFixArea: "source setup / visibility",
  },
  "source-normalization": {
    doNotPatch: [
      "Do not compensate in avatar code for source-frame side, confidence, or timing normalization bugs.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementSourceFrame.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementRecordedMotionFrame.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementLiveMotionFrame.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementDisplayLandmarks.ts",
    ],
    nextFixArea: "source normalization / live-recorded parity",
  },
  "support-contact": {
    doNotPatch: [
      "Do not add pose-specific seated or floor guards in the route; fix shared support/contact decisions.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementSupportContact.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementSupportConstraint.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementSupportContact.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementSupportConstraint.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportPresentationDecision.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.ts",
    ],
    nextFixArea: "support intent / seated presentation guard",
  },
  unknown: {
    doNotPatch: [
      "Do not guess ownership; add evidence until the first divergent stage is known.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts",
      "scripts/movement-debug/avatar-follow-gate.test.mjs",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.ts",
      "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
    ],
    nextFixArea: "unknown; collect source, expected, and rendered evidence",
  },
  "vrm-application": {
    doNotPatch: [
      "Do not add replay-only or game-only bone rules; keep VRM application shared and telemetry-backed.",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSegmentApplication.test.ts",
    ],
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFrameApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSegmentApplication.ts",
    ],
    nextFixArea: "VRM lower-body application / leg-retarget output",
  },
};

export const REPLAY_STUDIO_FAILURE_REPAIR_ROUTES: Record<ReplayStudioFailureCode, ReplayStudioRepairRoute> = {
  "calibration-unreliable": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP.calibration,
    confidence: 0.74,
    evidenceStatus: "suspected",
    nextFixArea: "tracking calibration / retarget source model",
    stage: "calibration",
  },
  "avatar-collapsed-to-squat": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["motion-decision"],
    confidence: 0.76,
    evidenceStatus: "proven",
    nextFixArea: "lower-body owner selection / squat-vs-leg classification",
    stage: "motion-decision",
  },
  "avatar-head-diverged": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["vrm-application"],
    confidence: 0.78,
    evidenceStatus: "proven",
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadTarget.ts",
      "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarHeadTarget.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts",
    ],
    nextFixArea: "head tracking application / head-spine coordination",
    stage: "vrm-application",
  },
  "avatar-not-following-leg": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["vrm-application"],
    confidence: 0.82,
    evidenceStatus: "proven",
    stage: "vrm-application",
  },
  "avatar-output-missing": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["rendered-telemetry"],
    confidence: 0.72,
    evidenceStatus: "insufficient-evidence",
    stage: "rendered-telemetry",
  },
  "avatar-planted-foot-diverged": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["support-contact"],
    confidence: 0.82,
    evidenceStatus: "proven",
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLock.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.ts",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarFootLock.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSupportContactApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarLowerBodyApplication.test.ts",
    ],
    nextFixArea: "foot lock / planted-foot support application",
    stage: "support-contact",
  },
  "avatar-seated-while-source-standing": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["support-contact"],
    confidence: 0.78,
    evidenceStatus: "proven",
    stage: "support-contact",
  },
  "avatar-upper-body-diverged": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["vrm-application"],
    confidence: 0.8,
    evidenceStatus: "proven",
    likelyFiles: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarArmApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplication.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarUpperBodyPlayerSpineDrive.ts",
      "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx",
    ],
    focusedTests: [
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarArmApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementAvatarSpineApplication.test.ts",
      "src/app/(dashboard)/demos/movements/_lib/movementReplayAnalyzer.test.ts",
    ],
    nextFixArea: "upper-body retarget / shoulder-scapula application",
    stage: "vrm-application",
  },
  "avatar-wrong-side": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["mirror-side-mapping"],
    confidence: 0.86,
    evidenceStatus: "proven",
    stage: "mirror-side-mapping",
  },
  "owner-flicker": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["motion-decision"],
    confidence: 0.7,
    evidenceStatus: "suspected",
    nextFixArea: "lower-body owner smoothing / hysteresis",
    stage: "motion-decision",
  },
  "replay-game-diverged": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["motion-decision"],
    confidence: 0.8,
    evidenceStatus: "proven",
    nextFixArea: "Replay/Game shared motion pipeline parity",
    stage: "motion-decision",
  },
  "root-motion-wrong": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["retarget-solve"],
    confidence: 0.76,
    evidenceStatus: "proven",
    nextFixArea: "root yaw / root travel solver",
    stage: "retarget-solve",
  },
  "source-not-trustworthy": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["source-capture"],
    confidence: 0.88,
    evidenceStatus: "insufficient-evidence",
    stage: "source-capture",
  },
  "source-normalization-mismatch": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["source-normalization"],
    confidence: 0.82,
    evidenceStatus: "suspected",
    nextFixArea: "source normalization / recorded readiness replay",
    stage: "source-normalization",
  },
  "visual-proof-missing": {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP["proof-artifact"],
    confidence: 0.9,
    evidenceStatus: "insufficient-evidence",
    stage: "proof-artifact",
  },
};

const ANALYZER_FAILURE_TO_REPLAY_STUDIO_FAILURE: Partial<Record<
  MovementReplayFailureCode,
  ReplayStudioFailureCode
>> = {
  avatar_arm_pose_diverged: "avatar-upper-body-diverged",
  avatar_head_alignment_diverged: "avatar-head-diverged",
  avatar_head_not_applied: "avatar-head-diverged",
  avatar_head_root_diverged: "avatar-head-diverged",
  avatar_head_spine_diverged: "avatar-head-diverged",
  avatar_output_diverged: "avatar-output-missing",
  avatar_planted_foot_diverged: "avatar-planted-foot-diverged",
  avatar_spine_angle_diverged: "avatar-upper-body-diverged",
  avatar_upper_body_diverged: "avatar-upper-body-diverged",
  false_knee_raise_candidate: "avatar-wrong-side",
  feet_neutral_while_leg_motion_present: "avatar-not-following-leg",
  heading_unavailable: "source-not-trustworthy",
  lower_body_owner_flicker: "owner-flicker",
  replay_game_path_diverged: "replay-game-diverged",
  replay_game_score_message_diverged: "replay-game-diverged",
  replay_game_wrapper_diverged: "replay-game-diverged",
  retarget_quality_drop: "calibration-unreliable",
  root_motion_missing: "root-motion-wrong",
  root_path_detected: "root-motion-wrong",
  root_turn_detected: "root-motion-wrong",
  source_feet_weak: "source-not-trustworthy",
  source_lower_body_out_of_frame: "source-not-trustworthy",
  spine_vertical_reference_missing: "calibration-unreliable",
  squat_not_detected: "avatar-collapsed-to-squat",
  stand_recovery_missing: "avatar-collapsed-to-squat",
  start_readiness_blocked_at_capture: "source-not-trustworthy",
  start_readiness_replay_mismatch: "source-normalization-mismatch",
  support_constraint_missing: "avatar-seated-while-source-standing",
  support_constraint_partial: "avatar-seated-while-source-standing",
  uncalibrated_arms_would_freeze: "calibration-unreliable",
  visual_match_low: "visual-proof-missing",
  world_landmarks_missing: "source-not-trustworthy",
};

export function replayStudioFailureCodeForAnalyzerFailure(
  code: MovementReplayFailureCode | undefined,
  semanticCode?: string,
): ReplayStudioFailureCode {
  if (code === "avatar_output_diverged") {
    if (semanticCode === "leg-lift-missing") return "avatar-not-following-leg";
    if (semanticCode === "movement-visible-but-unscored") return "avatar-seated-while-source-standing";
  }
  if (!code) return "visual-proof-missing";
  return ANALYZER_FAILURE_TO_REPLAY_STUDIO_FAILURE[code] ?? "visual-proof-missing";
}

export function replayStudioRepairRouteForFailureCode(
  code: ReplayStudioFailureCode,
): ReplayStudioRepairRoute {
  return REPLAY_STUDIO_FAILURE_REPAIR_ROUTES[code] ?? {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP.unknown,
    confidence: 0.25,
    evidenceStatus: "insufficient-evidence",
    stage: "unknown",
  };
}

function acceptedReplayStudioRepairRoute(): ReplayStudioRepairRoute {
  return {
    ...REPLAY_STUDIO_REPAIR_STAGE_OWNERSHIP.unknown,
    confidence: 1,
    doNotPatch: [
      "Do not make motion changes for an accepted fixture unless a new failure packet exists.",
    ],
    evidenceStatus: "proven",
    focusedTests: [
      "scripts/movement-debug/diagnose-replay-studio-golden.test.mjs",
    ],
    likelyFiles: [],
    nextFixArea: "no repair needed; keep the accepted fixture green",
    stage: "unknown",
  };
}

export function nextFixAreaForReplayStudioFailureCode(code: ReplayStudioFailureCode) {
  return replayStudioRepairRouteForFailureCode(code).nextFixArea;
}

export function replayStudioFrameFailureForMovementFailure(
  failure: MovementReplayFailure,
): MovementReplayStudioFrameFailure {
  const code = replayStudioFailureCodeForAnalyzerFailure(failure.code, failure.semanticCode);
  const route = replayStudioRepairRouteForFailureCode(code);
  return {
    analyzerCode: failure.code,
    code,
    detail: failure.detail,
    doNotPatch: [...route.doNotPatch],
    evidenceStatus: route.evidenceStatus,
    focusedTests: [...route.focusedTests],
    likelyFiles: [...route.likelyFiles],
    nextFixArea: route.nextFixArea,
    repairStage: route.stage,
    severity: failure.severity,
  };
}

export function replayStudioAcceptanceStatusForVerdict(
  status: ReplayStudioVerdictStatus | undefined,
): ReplayStudioAcceptanceStatus {
  if (status === "pass") return "accepted";
  if (status === "blocked") return "blocked";
  if (status === "review") return "review-only";
  return "not-supported";
}

export function replayStudioAvatarFollowStatusForAcceptance(
  status: ReplayStudioAcceptanceStatus | undefined,
): "blocked" | "review" | "pass" | "--" {
  if (status === "blocked") return "blocked";
  if (status === "review-only" || status === "not-supported") return "review";
  if (status === "accepted") return "pass";
  return "--";
}

export function replayStudioAvatarFollowAcceptanceLabel(
  status: ReplayStudioAcceptanceStatus | undefined,
): "accepted" | "blocked-for-acceptance" | "review-only" | "--" {
  if (status === "blocked") return "blocked-for-acceptance";
  if (status === "review-only" || status === "not-supported") return "review-only";
  if (status === "accepted") return "accepted";
  return "--";
}

export function stableReplayStudioSourceHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

type ReplayStudioRepairFailureCandidate = {
  failure: MovementReplayStudioFrameFailure;
  frame: MovementReplayStudioFrameVerdict | null;
  frameIndex: number | null;
  magnitude: number;
};

function frameFailureMagnitude(frame: MovementReplayStudioFrameVerdict | null) {
  if (!frame) return 0;
  return Math.max(
    Math.abs(frame.actual.lowerBodyDirectionError ?? 0),
    Math.abs(frame.actual.upperBodyDirectionError ?? 0),
  );
}

function failureRouteConfidence(failure: MovementReplayStudioFrameFailure) {
  return replayStudioRepairRouteForFailureCode(failure.code).confidence;
}

function repairCandidateRank(candidate: ReplayStudioRepairFailureCandidate) {
  return {
    confidence: failureRouteConfidence(candidate.failure),
    frameIndex: candidate.frameIndex ?? Number.MAX_SAFE_INTEGER,
    magnitude: candidate.magnitude,
    status: candidate.failure.severity === "error" || candidate.frame?.status === "blocked" ? 0 : 1,
  };
}

function compareRepairFailureCandidates(
  left: ReplayStudioRepairFailureCandidate,
  right: ReplayStudioRepairFailureCandidate,
) {
  const leftRank = repairCandidateRank(left);
  const rightRank = repairCandidateRank(right);
  return leftRank.status - rightRank.status ||
    rightRank.confidence - leftRank.confidence ||
    rightRank.magnitude - leftRank.magnitude ||
    leftRank.frameIndex - rightRank.frameIndex ||
    left.failure.code.localeCompare(right.failure.code);
}

function frameFailureCandidates(frame: MovementReplayStudioFrameVerdict): ReplayStudioRepairFailureCandidate[] {
  return frame.failures.map((failure) => ({
    failure,
    frame,
    frameIndex: frame.frameIndex,
    magnitude: frameFailureMagnitude(frame),
  }));
}

function supplementalFailureCandidates(
  analysis: MovementReplayAnalysis,
  failures: MovementReplayFailure[],
  frameIndex?: number | null,
): ReplayStudioRepairFailureCandidate[] {
  return failures.flatMap((failure) => {
    if (typeof frameIndex === "number" && typeof failure.frameIndex === "number" && failure.frameIndex !== frameIndex) {
      return [];
    }
    const frame = typeof failure.frameIndex === "number"
      ? analysis.replayStudio.frames.find((candidate) => candidate.frameIndex === failure.frameIndex) ?? null
      : null;
    const replayStudioFailure = replayStudioFrameFailureForMovementFailure(failure);
    return [{
      failure: replayStudioFailure,
      frame,
      frameIndex: failure.frameIndex ?? frame?.frameIndex ?? null,
      magnitude: frameFailureMagnitude(frame),
    }];
  });
}

function selectedRepairFailureCandidate(
  analysis: MovementReplayAnalysis,
  supplementalFailures: MovementReplayFailure[],
  frameIndex?: number | null,
) {
  const focusFrame = typeof frameIndex === "number" ? selectedRepairFrame(analysis, frameIndex) : null;
  const frameCandidates = focusFrame
    ? frameFailureCandidates(focusFrame)
    : analysis.replayStudio.frames.flatMap(frameFailureCandidates);
  const candidates = [
    ...frameCandidates,
    ...supplementalFailureCandidates(analysis, supplementalFailures, frameIndex),
  ];
  return candidates.sort(compareRepairFailureCandidates)[0] ?? null;
}

function selectedRepairFrame(
  analysis: MovementReplayAnalysis,
  frameIndex?: number | null,
): MovementReplayStudioFrameVerdict | null {
  if (typeof frameIndex === "number") {
    return analysis.replayStudio.frames.find((frame) => frame.frameIndex === frameIndex) ?? null;
  }

  return analysis.replayStudio.session.worstFrames[0] ??
    analysis.replayStudio.frames.find((frame) => frame.status !== "pass") ??
    analysis.replayStudio.frames[0] ??
    null;
}

function selectedAnalysisFailure(
  analysis: MovementReplayAnalysis,
  frame?: MovementReplayStudioFrameVerdict | null,
) {
  if (frame) {
    const frameFailure = analysis.failures.find((failure) => failure.frameIndex === frame.frameIndex);
    if (frameFailure) return frameFailure;
  }

  return analysis.failures.find((failure) => typeof failure.frameIndex !== "number") ??
    analysis.failures[0] ??
    null;
}

function acceptanceWithSupplementalFailures(
  base: ReplayStudioAcceptanceStatus,
  supplementalFailures: MovementReplayStudioFrameFailure[],
) {
  if (supplementalFailures.some((failure) => failure.severity === "error")) return "blocked";
  if (base === "accepted" && supplementalFailures.length > 0) return "review-only";
  return base;
}

function frameRange(frame: MovementReplayStudioFrameVerdict | null, totalFrames: number) {
  if (frame) return { frameEnd: frame.frameIndex, frameStart: frame.frameIndex };
  const finalFrame = Math.max(0, totalFrames - 1);
  return { frameEnd: finalFrame, frameStart: 0 };
}

function defaultCommands({
  frameIndex,
  recordingId,
}: {
  frameIndex: number | null;
  recordingId: string;
}): ReplayStudioRepairPacket["commands"] {
  const frameArg = typeof frameIndex === "number" ? ` --frame ${frameIndex}` : "";
  const recordingArg = recordingId ? ` --recording-id ${recordingId}` : "";
  return {
    acceptance: "npm run movement:replay-studio-verdict-gate",
    compareAfterChange: `npm run movement:diagnose --${recordingArg}${frameArg} --out tmp/movement-replay-lab/current-repair-packet.after.json`,
    reproduce: `npm run movement:diagnose --${recordingArg}${frameArg}`,
  };
}

function selectedGameFrame(
  analysis: MovementReplayAnalysis,
  frame?: MovementReplayStudioFrameVerdict | null,
) {
  if (!frame) return null;
  return analysis.gamePath.frames.find((gameFrame) => gameFrame.frameIndex === frame.frameIndex) ?? null;
}

export function buildReplayStudioRepairPacket(
  analysis: MovementReplayAnalysis,
  options: ReplayStudioRepairPacketOptions = {},
): ReplayStudioRepairPacket {
  const fixtureId = options.fixtureId ?? options.recording?.fixtureId;
  const totalFramesExpected = fixtureId
    ? analysis.summary.frameCount
    : analysis.summary.frameCount || analysis.replayStudio.frames.length;
  const totalFramesRendered = analysis.metrics.avatarVisualFrameCount;
  const totalFramesCompared = analysis.replayStudio.frames.length;
  const missingRenderedFrames = Math.max(0, totalFramesExpected - totalFramesRendered);
  const missingComparedFrames = Math.max(0, totalFramesExpected - totalFramesCompared);
  const coverageFailures: MovementReplayFailure[] = missingRenderedFrames > 0 || missingComparedFrames > 0
    ? [{
        code: "avatar_output_diverged",
        detail: `Rendered-avatar proof is incomplete: expected ${totalFramesExpected} frame(s), rendered ${totalFramesRendered}, and compared ${totalFramesCompared}. Acceptance requires complete rendered and compared coverage with zero silent skips.`,
        severity: "error",
      }]
    : [];
  const effectiveSupplementalFailures = [
    ...(options.supplementalFailures ?? []),
    ...coverageFailures,
  ];
  const primaryCandidate = selectedRepairFailureCandidate(
    analysis,
    options.supplementalFailures ?? [],
    options.frameIndex,
  );
  const selectedCandidate = primaryCandidate ?? selectedRepairFailureCandidate(
    analysis,
    coverageFailures,
    options.frameIndex,
  );
  const frame = selectedCandidate?.frame ?? selectedRepairFrame(analysis, options.frameIndex);
  const analysisFailure = selectedAnalysisFailure(analysis, frame);
  const supplementalFrameFailures = effectiveSupplementalFailures.map(replayStudioFrameFailureForMovementFailure);
  const selectedFailure = selectedCandidate?.failure ?? null;
  const failureCode = selectedFailure?.code ??
    replayStudioFailureCodeForAnalyzerFailure(analysisFailure?.code, analysisFailure?.semanticCode);
  const recordingId = options.recording?.id ?? analysis.replayStudio.session.recordingId ?? analysis.sessionId;
  const { frameEnd, frameStart } = frameRange(frame, totalFramesExpected);
  const frameIndex = frame?.frameIndex ?? null;
  const gameFrame = selectedGameFrame(analysis, frame);
  const acceptanceStatus = acceptanceWithSupplementalFailures(
    replayStudioAcceptanceStatusForVerdict(analysis.replayStudio.session.status),
    supplementalFrameFailures,
  );
  const acceptedWithoutFailure = acceptanceStatus === "accepted" && !selectedFailure;
  const route = acceptedWithoutFailure
    ? acceptedReplayStudioRepairRoute()
    : replayStudioRepairRouteForFailureCode(failureCode);
  const sourceHash = options.recording?.sourceHash ??
    stableReplayStudioSourceHash(options.sourceHashInput ?? analysis);
  const sourceHashBasis = options.recording?.sourceHashBasis ??
    (options.sourceHashInput ? "source-session" : "analysis-report");
  const commands = {
    ...defaultCommands({ frameIndex, recordingId }),
    ...options.commands,
  };

  return {
    actual: {
      bones: {
        comparedLowerBodySegments: frame?.actual.comparedLowerBodySegments ?? null,
        comparedUpperBodySegments: frame?.actual.comparedUpperBodySegments ?? null,
        lowerBodyDirectionError: frame?.actual.lowerBodyDirectionError ?? null,
        upperBodyDirectionError: frame?.actual.upperBodyDirectionError ?? null,
      },
      contacts: {
        feetOwner: frame?.actual.feetOwner ?? null,
        supportIntent: frame?.actual.supportIntent ?? null,
        supportPresentation: frame?.actual.supportPresentation ?? null,
      },
      owners: {
        feet: frame?.actual.feetOwner ?? "unknown",
        lower: frame?.actual.lowerOwner ?? "unknown",
        supportIntent: frame?.actual.supportIntent ?? "unknown",
        supportPresentation: frame?.actual.supportPresentation ?? "unknown",
      },
      root: {
        headingYaw: gameFrame?.rootHeadingYaw ?? null,
        intent: gameFrame?.rootMotionIntentKey ?? null,
        pathDistance: gameFrame?.rootPathDistance ?? null,
        travelDirection: gameFrame?.rootMotionTravelDirection ?? null,
      },
    },
    code: {
      commit: options.code?.commit ?? "unknown",
      motionPipelineFingerprint: options.code?.motionPipelineFingerprint ?? "unknown",
    },
    ...(options.artifact ? { artifact: options.artifact } : {}),
    commands,
    divergence: {
      explanation: selectedFailure?.detail ??
        analysisFailure?.detail ??
        (acceptanceStatus === "accepted" ? "Replay Studio currently has no blocking diagnosis." : "Replay Studio needs more evidence."),
      firstDivergentStage: route.stage,
      metrics: {
        frameLowerBodyDirectionError: frame?.actual.lowerBodyDirectionError ?? null,
        frameSourceQuality: frame?.source.sourceQuality ?? null,
        frameUpperBodyDirectionError: frame?.actual.upperBodyDirectionError ?? null,
        lowerBodyOwnerTransitionsPerSecond: analysis.replayStudio.session.summary.lowerBodyOwnerTransitionsPerSecond,
        visualMatchScore: analysis.replayStudio.session.summary.visualMatchScore,
      },
    },
    expected: {
      anatomicalMapping: options.anatomicalMapping ?? "opposite",
      avatarRole: options.avatarRole ?? "player",
      avatarSide: frame?.expected.side ?? null,
      bones: {
        motion: frame?.expected.motion ?? "unknown",
        owner: frame?.expected.owner ?? "unknown",
        side: frame?.expected.side ?? null,
      },
      owners: {
        lower: frame?.expected.owner ?? "unknown",
      },
    },
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    recording: {
      ...(fixtureId ? { fixtureId } : {}),
      id: recordingId,
      sourceHash,
      sourceHashBasis,
      title: options.recording?.title ?? recordingId,
    },
    repair: {
      doNotPatch: [...route.doNotPatch],
      focusedTests: [...route.focusedTests],
      likelyFiles: [...route.likelyFiles],
      owner: route.stage,
    },
    schemaVersion: 1,
    scope: {
      frameEnd,
      frameStart,
      silentSkipCount: Math.max(missingRenderedFrames, missingComparedFrames),
      totalFramesCompared,
      totalFramesExpected,
      totalFramesRendered,
    },
    source: {
      anatomicalSide: frame?.expected.side ?? null,
      motion: frame?.expected.motion ?? "unknown",
      quality: frame?.source.sourceQuality ?? 0,
      readiness: frame?.source.readiness ?? "unknown",
      visibleBodyParts: frame?.source.visibleBodyParts ?? [],
    },
    verdict: {
      confidence: route.confidence,
      evidenceStatus: selectedFailure?.evidenceStatus ?? route.evidenceStatus,
      failureCode: acceptedWithoutFailure ? "none" : failureCode,
      severity: selectedFailure?.severity ?? analysisFailure?.severity ?? (acceptanceStatus === "accepted" ? "info" : "warning"),
      status: acceptanceStatus,
    },
  };
}

function comparableMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricDelta(
  before: number | null | undefined,
  after: number | null | undefined,
) {
  const beforeValue = comparableMetric(before);
  const afterValue = comparableMetric(after);
  return beforeValue === null || afterValue === null
    ? null
    : Number((afterValue - beforeValue).toFixed(4));
}

function comparisonMetricScore(comparison: ReplayStudioRepairPacketComparison) {
  const metricWeights: Record<string, 1 | -1> = {
    frameLowerBodyDirectionError: -1,
    frameSourceQuality: 1,
    frameUpperBodyDirectionError: -1,
    lowerBodyOwnerTransitionsPerSecond: -1,
    silentSkipCount: -1,
    totalFramesRendered: 1,
    visualMatchScore: 1,
  };

  return Object.entries(comparison.metricDeltas).reduce((score, [metric, delta]) => {
    if (typeof delta !== "number" || delta === 0) return score;
    return score + (Math.sign(delta) * (metricWeights[metric] ?? 1));
  }, 0);
}

export function compareReplayStudioRepairPackets({
  after,
  before,
}: {
  after: ReplayStudioRepairPacket;
  before: ReplayStudioRepairPacket;
}): ReplayStudioRepairPacketComparison {
  const sameSourceHash = before.recording.sourceHash === after.recording.sourceHash;
  const comparison: ReplayStudioRepairPacketComparison = {
    after: {
      failureCode: after.verdict.failureCode,
      firstDivergentStage: after.divergence.firstDivergentStage,
      status: after.verdict.status,
    },
    before: {
      failureCode: before.verdict.failureCode,
      firstDivergentStage: before.divergence.firstDivergentStage,
      status: before.verdict.status,
    },
    metricDeltas: {
      frameLowerBodyDirectionError: metricDelta(
        before.divergence.metrics.frameLowerBodyDirectionError,
        after.divergence.metrics.frameLowerBodyDirectionError,
      ),
      frameSourceQuality: metricDelta(
        before.divergence.metrics.frameSourceQuality,
        after.divergence.metrics.frameSourceQuality,
      ),
      frameUpperBodyDirectionError: metricDelta(
        before.divergence.metrics.frameUpperBodyDirectionError,
        after.divergence.metrics.frameUpperBodyDirectionError,
      ),
      lowerBodyOwnerTransitionsPerSecond: metricDelta(
        before.divergence.metrics.lowerBodyOwnerTransitionsPerSecond,
        after.divergence.metrics.lowerBodyOwnerTransitionsPerSecond,
      ),
      silentSkipCount: metricDelta(before.scope.silentSkipCount, after.scope.silentSkipCount),
      totalFramesRendered: metricDelta(before.scope.totalFramesRendered, after.scope.totalFramesRendered),
      visualMatchScore: metricDelta(
        before.divergence.metrics.visualMatchScore,
        after.divergence.metrics.visualMatchScore,
      ),
    },
    outcome: "unchanged",
    sameSourceHash,
    summary: "",
  };

  if (!sameSourceHash) {
    return {
      ...comparison,
      outcome: "source-changed",
      summary: "Source hash changed; before/after motion results are not comparable.",
    };
  }

  const statusDelta = ACCEPTANCE_STATUS_RANK[after.verdict.status] -
    ACCEPTANCE_STATUS_RANK[before.verdict.status];
  const metricScore = comparisonMetricScore(comparison);
  const failureCleared = before.verdict.failureCode !== "none" && after.verdict.failureCode === "none";
  const failureIntroduced = before.verdict.failureCode === "none" && after.verdict.failureCode !== "none";
  const outcome = statusDelta > 0 || failureCleared || (statusDelta === 0 && metricScore > 0)
    ? "improved"
    : statusDelta < 0 || failureIntroduced || (statusDelta === 0 && metricScore < 0)
      ? "regressed"
      : "unchanged";

  return {
    ...comparison,
    outcome,
    summary: `${before.verdict.status}/${before.verdict.failureCode} -> ${after.verdict.status}/${after.verdict.failureCode}; metrics ${metricScore > 0 ? "improved" : metricScore < 0 ? "regressed" : "unchanged"}.`,
  };
}

function markdownList(values: string[]) {
  if (values.length === 0) return "- none";
  return values.map((value) => `- \`${value}\``).join("\n");
}

function markdownTextList(values: string[]) {
  if (values.length === 0) return "- none";
  return values.map((value) => `- ${value}`).join("\n");
}

function markdownMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(Number(value.toFixed(4))) : "null";
}

function markdownInline(value: unknown) {
  if (value === null || typeof value === "undefined") return "`null`";
  if (typeof value === "string") return `\`${value}\``;
  return `\`${JSON.stringify(value)}\``;
}

export function formatReplayStudioRepairPacketMarkdown(
  packet: ReplayStudioRepairPacket,
  options: ReplayStudioRepairPacketMarkdownOptions = {},
) {
  const lines = [
    "# Replay Studio Repair Packet",
    "",
    `Generated: ${packet.generatedAt}`,
    `Schema: ${packet.schemaVersion}`,
    "",
    "## Verdict",
    "",
    `- Status: \`${packet.verdict.status}\``,
    `- Failure: \`${packet.verdict.failureCode}\``,
    `- Severity: \`${packet.verdict.severity}\``,
    `- Evidence: \`${packet.verdict.evidenceStatus}\``,
    `- Confidence: ${markdownMetric(packet.verdict.confidence)}`,
    `- First divergent stage: \`${packet.divergence.firstDivergentStage}\``,
    `- Explanation: ${packet.divergence.explanation}`,
    "",
    "## Recording",
    "",
    `- ID: \`${packet.recording.id}\``,
    `- Title: ${packet.recording.title}`,
    `- Source hash: \`${packet.recording.sourceHash}\``,
    `- Source hash basis: \`${packet.recording.sourceHashBasis}\``,
    ...(packet.recording.fixtureId ? [`- Fixture: \`${packet.recording.fixtureId}\``] : []),
    "",
    ...(packet.artifact
      ? [
          "## Artifact Resolution",
          "",
          `- Kind: \`${packet.artifact.kind}\``,
          `- Path: ${markdownInline(packet.artifact.path)}`,
          ...(packet.artifact.fixtureId ? [`- Fixture: \`${packet.artifact.fixtureId}\``] : []),
          ...(packet.artifact.requestedRecordingId
            ? [`- Requested recording: \`${packet.artifact.requestedRecordingId}\``]
            : []),
          ...(packet.artifact.stalePath ? [`- Stale/default path: \`${packet.artifact.stalePath}\``] : []),
          ...(packet.artifact.fallbackReason ? [`- Fallback: ${packet.artifact.fallbackReason}`] : []),
          ...(packet.artifact.refreshCommand ? [`- Refresh command: \`${packet.artifact.refreshCommand}\``] : []),
          ...(packet.artifact.freshness
            ? [
                `- Freshness: \`${packet.artifact.freshness.status}\``,
                `- Freshness reason: ${packet.artifact.freshness.reason}`,
                ...(packet.artifact.freshness.currentMotionPipelineFingerprint
                  ? [`- Current fingerprint: \`${packet.artifact.freshness.currentMotionPipelineFingerprint}\``]
                  : []),
                ...(packet.artifact.freshness.artifactMotionPipelineFingerprints?.length
                  ? [`- Artifact fingerprint(s): ${packet.artifact.freshness.artifactMotionPipelineFingerprints.map((fingerprint) => `\`${fingerprint}\``).join(", ")}`]
                  : []),
              ]
            : []),
          `- Source priority: ${packet.artifact.sourcePriority.map((source) => `\`${source}\``).join(", ")}`,
          `- Checked paths: ${packet.artifact.checkedPaths.length > 0 ? packet.artifact.checkedPaths.map((path) => `\`${path}\``).join(", ") : "`none`"}`,
          "",
        ]
      : []),
    "## Scope",
    "",
    `- Frame range: \`${packet.scope.frameStart}-${packet.scope.frameEnd}\``,
    `- Expected frames: ${packet.scope.totalFramesExpected}`,
    `- Compared frames: ${packet.scope.totalFramesCompared}`,
    `- Rendered frames: ${packet.scope.totalFramesRendered}`,
    `- Silent skips: ${packet.scope.silentSkipCount}`,
    "",
    "## Source Expected Actual",
    "",
    `- Source readiness: \`${packet.source.readiness}\``,
    `- Source motion: \`${packet.source.motion}\``,
    `- Source side: ${markdownInline(packet.source.anatomicalSide)}`,
    `- Source quality: ${markdownMetric(packet.source.quality)}`,
    `- Visible body parts: ${packet.source.visibleBodyParts.length > 0 ? packet.source.visibleBodyParts.map((part) => `\`${part}\``).join(", ") : "`none`"}`,
    `- Expected role: \`${packet.expected.avatarRole}\``,
    `- Expected mapping: \`${packet.expected.anatomicalMapping}\``,
    `- Expected side: ${markdownInline(packet.expected.avatarSide)}`,
    `- Actual lower owner: \`${packet.actual.owners.lower ?? "unknown"}\``,
    `- Actual feet owner: \`${packet.actual.owners.feet ?? "unknown"}\``,
    `- Actual support: \`${packet.actual.owners.supportIntent ?? "unknown"}\` / \`${packet.actual.owners.supportPresentation ?? "unknown"}\``,
    "",
    "## Metrics",
    "",
    `- Frame lower-body direction error: ${markdownMetric(packet.divergence.metrics.frameLowerBodyDirectionError)}`,
    `- Frame upper-body direction error: ${markdownMetric(packet.divergence.metrics.frameUpperBodyDirectionError)}`,
    `- Frame source quality: ${markdownMetric(packet.divergence.metrics.frameSourceQuality)}`,
    `- Visual match score: ${markdownMetric(packet.divergence.metrics.visualMatchScore)}`,
    `- Owner transitions/sec: ${markdownMetric(packet.divergence.metrics.lowerBodyOwnerTransitionsPerSecond)}`,
    "",
    "## Repair Owner",
    "",
    `- Owner stage: \`${packet.repair.owner}\``,
    "",
    "Likely files:",
    "",
    markdownList(packet.repair.likelyFiles),
    "",
    "Focused tests:",
    "",
    markdownList(packet.repair.focusedTests),
    "",
    "Do not patch:",
    "",
    markdownTextList(packet.repair.doNotPatch),
    "",
    "## Commands",
    "",
    `- Reproduce: \`${packet.commands.reproduce}\``,
    `- Compare after change: \`${packet.commands.compareAfterChange}\``,
    `- Acceptance: \`${packet.commands.acceptance}\``,
    "",
    "## Code",
    "",
    `- Commit: \`${packet.code.commit}\``,
    `- Motion pipeline fingerprint: \`${packet.code.motionPipelineFingerprint}\``,
  ];

  if (packet.comparison) {
    lines.push(
      "",
      "## Before Comparison",
      "",
      `- Outcome: \`${packet.comparison.outcome}\``,
      `- Same source hash: \`${String(packet.comparison.sameSourceHash)}\``,
      `- Before: \`${packet.comparison.before.status}\` / \`${packet.comparison.before.failureCode}\` / \`${packet.comparison.before.firstDivergentStage}\``,
      `- After: \`${packet.comparison.after.status}\` / \`${packet.comparison.after.failureCode}\` / \`${packet.comparison.after.firstDivergentStage}\``,
      `- Summary: ${packet.comparison.summary}`,
      "",
      "Metric deltas:",
      "",
      ...Object.entries(packet.comparison.metricDeltas).map(([metric, delta]) => (
        `- ${metric}: ${markdownMetric(delta)}`
      )),
    );
  }

  if (options.includeJsonPointer && options.jsonPath) {
    lines.push("", `JSON packet: \`${options.jsonPath}\``);
  }

  return `${lines.join("\n").trim()}\n`;
}
