import type { MovementReplayAnalysis } from "./movementReplayAnalyzer";

export type MovementRecordedProofStatus =
  | "covered-by-other-recording"
  | "failed"
  | "manual-review"
  | "missing-proof"
  | "passed"
  | "product-scope-limitation"
  | "source-data-limitation";

export type MovementRecordedAutomatedProofStatus =
  | "covered-by-other-recording"
  | "failed"
  | "missing-proof"
  | "passed"
  | "product-scope-limitation"
  | "source-data-limitation";

export type MovementRecordedManualReviewResult =
  | "needs-stronger-automated-assertion"
  | "readable-fail"
  | "readable-pass"
  | "source-data-limitation";

export type MovementRecordedSourceLimitationResult =
  | "accepted-product-limitation"
  | "needs-better-recording";

export type MovementRecordedProofLayer =
  | "recorded replay analyzer proof"
  | "recorded replay visual capture"
  | "Game Studio parity proof"
  | "scoring/message proof";

export type MovementRecordedProofCase =
  | "standing"
  | "side-bend"
  | "head-direction"
  | "standing-arm-raise"
  | "standing-twist"
  | "standing-reach"
  | "shoulder-scapula-control"
  | "squat"
  | "far-squat"
  | "left-leg-raise"
  | "right-leg-raise"
  | "weak-feet"
  | "lower-body-out-of-frame"
  | "facing-occlusion-recovery"
  | "side-swap-recovery"
  | "self-occlusion-recovery"
  | "root-turn"
  | "root-travel"
  | "seated-neutral"
  | "seated-twist"
  | "seated-forward-fold"
  | "seated-leg-lift"
  | "chair-contact"
  | "mirror-side-ownership"
  | "scoring-message-events";

export type MovementRecordedProofManifestRow = {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  automatedStatusReason: string;
  avatarSide: "avatar-left" | "avatar-right" | "both" | "n/a" | "unknown";
  bodyPartMotion: string;
  candidateAmplitude: number | null;
  candidateRejectionCode: string | null;
  candidateRejectionReason: string | null;
  directionSign: "negative" | "neutral" | "positive" | "unknown";
  evidenceFrameCount: number;
  expectedFrameWindow: {
    endFrame: number | null;
    startFrame: number | null;
  };
  expectedMinimumAmplitude: number | null;
  failureCodes: string[];
  acceptedProductLimitation: boolean;
  manualReview?: MovementRecordedManualReviewDecision;
  missingLayers: MovementRecordedProofLayer[];
  nextAction: string;
  observedAmplitude: number | null;
  proofBlockerCode: string | null;
  proofCase: MovementRecordedProofCase;
  recordingId: string;
  requiredLayers: MovementRecordedProofLayer[];
  scoringOrMessageEvent: string | null;
  sourceSide: "both" | "left" | "n/a" | "right" | "unknown";
  status: MovementRecordedProofStatus;
  statusReason: string;
  visualCaptureDiagnostics: MovementRecordedVisualCaptureDiagnosticsSummary;
  visualCaptureFrameCount: number;
  visualCaptureFrames: number[];
  sourceLimitationDecision?: MovementRecordedSourceLimitationDecision;
};

export type MovementRecordedVisualCaptureErrorSummary = {
  average: number | null;
  count: number;
  max: number | null;
};

export type MovementRecordedVisualCaptureDiagnosticsSummary = {
  avatarLowerError: MovementRecordedVisualCaptureErrorSummary;
  avatarPlantedFootClearance: MovementRecordedVisualCaptureErrorSummary;
  avatarUpperError: MovementRecordedVisualCaptureErrorSummary;
};

export type MovementRecordedProofDecisionReviewContext = {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  blockerCode: string | null;
  candidateAmplitude: number | null;
  candidateRejectionCode: string | null;
  candidateRejectionReason: string | null;
  directionSign: MovementRecordedProofManifestRow["directionSign"];
  evidenceFrameCount: number;
  expectedFrameWindow: MovementRecordedProofManifestRow["expectedFrameWindow"];
  expectedMinimumAmplitude: number | null;
  missingLayers: MovementRecordedProofLayer[];
  nextAction: string;
  observedAmplitude: number | null;
  sourceSide: MovementRecordedProofManifestRow["sourceSide"];
  status: MovementRecordedProofStatus;
  statusReason: string;
  visualCaptureDiagnostics: MovementRecordedVisualCaptureDiagnosticsSummary;
  visualCaptureFrameCount: number;
  visualCaptureFrames: number[];
};

export type MovementRecordedVisualCaptureFrame = {
  avatarLowerError: number | null;
  avatarPath: string | null;
  avatarPlantedFootClearance?: number | null;
  avatarUpperError: number | null;
  frameIndex: number;
  recordingId: string;
  sourcePath: string | null;
};

export type MovementRecordedManualReviewDecision = {
  notes?: string;
  proofCase: MovementRecordedProofCase;
  recordingId: string;
  result: MovementRecordedManualReviewResult;
  reviewContext?: MovementRecordedProofDecisionReviewContext;
  reviewedAt?: string;
  reviewer?: string;
};

export type MovementRecordedSourceLimitationDecision = {
  notes?: string;
  proofCase: MovementRecordedProofCase;
  recordingId: string;
  result: MovementRecordedSourceLimitationResult;
  reviewContext?: MovementRecordedProofDecisionReviewContext;
  reviewedAt?: string;
  reviewer?: string;
};

export type MovementRecordedProofManifestOptions = {
  includeProductScopeProofCases?: MovementRecordedProofCase[];
  manualReviewDecisions?: MovementRecordedManualReviewDecision[];
  sourceLimitationDecisions?: MovementRecordedSourceLimitationDecision[];
  visualCaptures?: MovementRecordedVisualCaptureFrame[];
};

export type MovementRecordedProofManifest = {
  generatedBy: "movement-replay-analyzer";
  recordingCount: number;
  rows: MovementRecordedProofManifestRow[];
  summary: {
    coveredByOtherRecordingCount: number;
    failedCount: number;
    manualReviewCount: number;
    appliedManualReviewDecisionCount: number;
    missingProofCount: number;
    passedCount: number;
    productScopeLimitationCount: number;
    sourceDataLimitationCount: number;
    acceptedProductLimitationCount: number;
    appliedSourceLimitationDecisionCount: number;
    automatedCoveredByOtherRecordingCount: number;
    automatedFailedCount: number;
    automatedMissingProofCount: number;
    automatedPassedCount: number;
    automatedProductScopeLimitationCount: number;
    automatedSourceDataLimitationCount: number;
    blockingRowCount: number;
    blockingRowsByProofBlockerCode: Partial<Record<string, number>>;
    blockingRowsByCandidateRejectionCode: Partial<Record<string, number>>;
    blockingRowsByCandidateRejectionReason: Partial<Record<string, number>>;
    blockingRowsByMissingLayer: Partial<Record<MovementRecordedProofLayer, number>>;
    blockingRowsByProofCase: Partial<Record<MovementRecordedProofCase, number>>;
    blockingRowsByStatus: Partial<Record<MovementRecordedProofStatus, number>>;
    coverageProductTruth: {
      internalDemoOnlyCount: number;
      internalDemoOnlyFamilies: string[];
      missingProofCount: number;
      userFacingCount: number;
      userFacingFamilies: string[];
    };
    totalRows: number;
    visualCaptureFrameCount: number;
    visualCaptureRowCount: number;
    visualCaptureMissingRowCount: number;
  };
  version: 1;
};

export type MovementRecordedProofGateStatus = "blocked" | "passed";

export type MovementRecordedProofGateSummary = {
  blockingRowsByProofBlockerCode: Partial<Record<string, number>>;
  blockingRowsByCandidateRejectionCode: Partial<Record<string, number>>;
  blockingRowsByCandidateRejectionReason: Partial<Record<string, number>>;
  blockingRowsByMissingLayer: Partial<Record<MovementRecordedProofLayer, number>>;
  blockingRowsByProofCase: Partial<Record<MovementRecordedProofCase, number>>;
  blockingRows: MovementRecordedProofManifestRow[];
  blockingRowsByStatus: Partial<Record<MovementRecordedProofStatus, number>>;
  status: MovementRecordedProofGateStatus;
  summary: string;
};

type ProofCaseDefinition = {
  avatarSide: MovementRecordedProofManifestRow["avatarSide"];
  bodyPartMotion: string;
  directionSign: MovementRecordedProofManifestRow["directionSign"];
  expectedMinimumAmplitude: number | null;
  proofCase: MovementRecordedProofCase;
  sourceSide: MovementRecordedProofManifestRow["sourceSide"];
};

function getBlockingRows(rows: MovementRecordedProofManifestRow[]) {
  return rows.filter((row) => (
    row.status !== "passed" &&
    row.status !== "covered-by-other-recording" &&
    !row.acceptedProductLimitation
  ));
}

function countRowsByStatus(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<MovementRecordedProofStatus, number>>>((counts, row) => ({
    ...counts,
    [row.status]: (counts[row.status] ?? 0) + 1,
  }), {});
}

function countRowsByProofCase(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<MovementRecordedProofCase, number>>>((counts, row) => ({
    ...counts,
    [row.proofCase]: (counts[row.proofCase] ?? 0) + 1,
  }), {});
}

function countRowsByMissingLayer(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<MovementRecordedProofLayer, number>>>((counts, row) => {
    row.missingLayers.forEach((layer) => {
      counts[layer] = (counts[layer] ?? 0) + 1;
    });
    return counts;
  }, {});
}

function countRowsByCandidateRejectionReason(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<string, number>>>((counts, row) => {
    if (!row.candidateRejectionReason) return counts;
    counts[row.candidateRejectionReason] = (counts[row.candidateRejectionReason] ?? 0) + 1;
    return counts;
  }, {});
}

function countRowsByCandidateRejectionCode(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<string, number>>>((counts, row) => {
    if (!row.candidateRejectionCode) return counts;
    counts[row.candidateRejectionCode] = (counts[row.candidateRejectionCode] ?? 0) + 1;
    return counts;
  }, {});
}

function countRowsByProofBlockerCode(rows: MovementRecordedProofManifestRow[]) {
  return rows.reduce<Partial<Record<string, number>>>((counts, row) => {
    if (!row.proofBlockerCode) return counts;
    counts[row.proofBlockerCode] = (counts[row.proofBlockerCode] ?? 0) + 1;
    return counts;
  }, {});
}

function manualReviewDecisionKey(recordingId: string, proofCase: MovementRecordedProofCase) {
  return `${recordingId}:${proofCase}`;
}

function manualReviewDecisionMap(decisions: MovementRecordedManualReviewDecision[]) {
  return new Map(decisions.map((decision) => [
    manualReviewDecisionKey(decision.recordingId, decision.proofCase),
    decision,
  ]));
}

function sourceLimitationDecisionMap(decisions: MovementRecordedSourceLimitationDecision[]) {
  return new Map(decisions.map((decision) => [
    manualReviewDecisionKey(decision.recordingId, decision.proofCase),
    decision,
  ]));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function movementRecordedProofDecisionReviewContextForRow(
  row: Pick<
    MovementRecordedProofManifestRow,
    | "automatedStatus"
    | "candidateAmplitude"
    | "candidateRejectionCode"
    | "candidateRejectionReason"
    | "directionSign"
    | "evidenceFrameCount"
    | "expectedFrameWindow"
    | "expectedMinimumAmplitude"
    | "missingLayers"
    | "nextAction"
    | "observedAmplitude"
    | "proofBlockerCode"
    | "sourceSide"
    | "status"
    | "statusReason"
    | "visualCaptureDiagnostics"
    | "visualCaptureFrameCount"
    | "visualCaptureFrames"
  >,
): MovementRecordedProofDecisionReviewContext {
  return {
    automatedStatus: row.automatedStatus,
    blockerCode: row.proofBlockerCode,
    candidateAmplitude: row.candidateAmplitude,
    candidateRejectionCode: row.candidateRejectionCode,
    candidateRejectionReason: row.candidateRejectionReason,
    directionSign: row.directionSign,
    evidenceFrameCount: row.evidenceFrameCount,
    expectedFrameWindow: row.expectedFrameWindow,
    expectedMinimumAmplitude: row.expectedMinimumAmplitude,
    missingLayers: row.missingLayers,
    nextAction: row.nextAction,
    observedAmplitude: row.observedAmplitude,
    sourceSide: row.sourceSide,
    status: row.status,
    statusReason: row.statusReason,
    visualCaptureDiagnostics: row.visualCaptureDiagnostics,
    visualCaptureFrameCount: row.visualCaptureFrameCount,
    visualCaptureFrames: row.visualCaptureFrames,
  };
}

function decisionReviewContextMatches(
  decision: { reviewContext?: MovementRecordedProofDecisionReviewContext } | undefined,
  expectedContext: MovementRecordedProofDecisionReviewContext,
) {
  return Boolean(
    decision?.reviewContext &&
    stableStringify(decision.reviewContext) === stableStringify(expectedContext),
  );
}

const PROOF_CASES: ProofCaseDefinition[] = [
  {
    avatarSide: "both",
    bodyPartMotion: "neutral full-body standing posture",
    directionSign: "neutral",
    expectedMinimumAmplitude: null,
    proofCase: "standing",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "torso lateral bend",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.12,
    proofCase: "side-bend",
    sourceSide: "unknown",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "head yaw or pitch",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.25,
    proofCase: "head-direction",
    sourceSide: "n/a",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "standing overhead arm raise",
    directionSign: "positive",
    expectedMinimumAmplitude: 1,
    proofCase: "standing-arm-raise",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "standing shoulder-to-hip twist",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.08,
    proofCase: "standing-twist",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "standing arm reach presentation",
    directionSign: "positive",
    expectedMinimumAmplitude: 1,
    proofCase: "standing-reach",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "shoulder/scapula proxy: coordinated arm and upper-spine presentation",
    directionSign: "unknown",
    expectedMinimumAmplitude: 5,
    proofCase: "shoulder-scapula-control",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "hip/root drop with bilateral leg bend",
    directionSign: "positive",
    expectedMinimumAmplitude: 0.22,
    proofCase: "squat",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "far-camera hip/root drop",
    directionSign: "positive",
    expectedMinimumAmplitude: 0.18,
    proofCase: "far-squat",
    sourceSide: "both",
  },
  {
    avatarSide: "avatar-right",
    bodyPartMotion: "left anatomical knee lift mirrored to avatar right",
    directionSign: "positive",
    expectedMinimumAmplitude: 0.18,
    proofCase: "left-leg-raise",
    sourceSide: "left",
  },
  {
    avatarSide: "avatar-left",
    bodyPartMotion: "right anatomical knee lift mirrored to avatar left",
    directionSign: "positive",
    expectedMinimumAmplitude: 0.18,
    proofCase: "right-leg-raise",
    sourceSide: "right",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "standing/upper-body motion with weak feet",
    directionSign: "unknown",
    expectedMinimumAmplitude: null,
    proofCase: "weak-feet",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "explicit lower-body out-of-frame uncertainty",
    directionSign: "unknown",
    expectedMinimumAmplitude: null,
    proofCase: "lower-body-out-of-frame",
    sourceSide: "both",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "root yaw turn",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.65,
    proofCase: "root-turn",
    sourceSide: "both",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "root X/Z travel",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.16,
    proofCase: "root-travel",
    sourceSide: "both",
  },
  {
    avatarSide: "unknown",
    bodyPartMotion: "source anatomical side maps to expected avatar display side",
    directionSign: "unknown",
    expectedMinimumAmplitude: null,
    proofCase: "mirror-side-ownership",
    sourceSide: "unknown",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "shared gameplay score/message event",
    directionSign: "unknown",
    expectedMinimumAmplitude: null,
    proofCase: "scoring-message-events",
    sourceSide: "n/a",
  },
];

const OPTIONAL_SEATED_PROOF_CASES: ProofCaseDefinition[] = [
  {
    avatarSide: "both",
    bodyPartMotion: "neutral seated posture with visible chair/contact support",
    directionSign: "neutral",
    expectedMinimumAmplitude: null,
    proofCase: "seated-neutral",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "seated torso twist while hips remain seated",
    directionSign: "unknown",
    expectedMinimumAmplitude: 1,
    proofCase: "seated-twist",
    sourceSide: "both",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "seated forward fold",
    directionSign: "positive",
    expectedMinimumAmplitude: 1,
    proofCase: "seated-forward-fold",
    sourceSide: "both",
  },
  {
    avatarSide: "unknown",
    bodyPartMotion: "seated single-leg lift",
    directionSign: "positive",
    expectedMinimumAmplitude: 1,
    proofCase: "seated-leg-lift",
    sourceSide: "unknown",
  },
  {
    avatarSide: "both",
    bodyPartMotion: "chair/contact seated support presentation",
    directionSign: "neutral",
    expectedMinimumAmplitude: 1,
    proofCase: "chair-contact",
    sourceSide: "both",
  },
];

const OPTIONAL_FACING_OCCLUSION_PROOF_CASES: ProofCaseDefinition[] = [
  {
    avatarSide: "n/a",
    bodyPartMotion: "facing fallback and root-heading recovery",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.45,
    proofCase: "facing-occlusion-recovery",
    sourceSide: "both",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "left/right side-swap recovery",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.45,
    proofCase: "side-swap-recovery",
    sourceSide: "both",
  },
  {
    avatarSide: "n/a",
    bodyPartMotion: "brief self-occlusion with recovered tracking",
    directionSign: "unknown",
    expectedMinimumAmplitude: 0.35,
    proofCase: "self-occlusion-recovery",
    sourceSide: "both",
  },
];

const ERROR_BY_PROOF_CASE: Partial<Record<MovementRecordedProofCase, string[]>> = {
  "head-direction": ["head-direction-reversed", "head-motion-missing"],
  "left-leg-raise": ["leg-lift-missing", "leg-lift-wrong-side", "leg-lift-collapsed-to-squat"],
  "mirror-side-ownership": ["mirror-side-mismatch", "leg-lift-wrong-side"],
  "right-leg-raise": ["leg-lift-missing", "leg-lift-wrong-side", "leg-lift-collapsed-to-squat"],
  "root-travel": ["root-travel-reversed"],
  "root-turn": ["root-turn-reversed"],
  "scoring-message-events": ["movement-visible-but-unscored", "score-positive-but-avatar-wrong"],
  "side-bend": ["side-bend-missing", "side-bend-wrong-direction"],
  squat: ["squat-missing", "squat-collapsed-to-leg-lift", "hip-drop-missing"],
};

function frameWindowFromIndexes(indexes: number[]) {
  if (indexes.length === 0) {
    return {
      endFrame: null,
      startFrame: null,
    };
  }

  return {
    endFrame: Math.max(...indexes),
    startFrame: Math.min(...indexes),
  };
}

function proofFrameSet(indexes: number[]) {
  return new Set(indexes);
}

function signFromValue(value: number): MovementRecordedProofManifestRow["directionSign"] {
  if (value > 0.001) return "positive";
  if (value < -0.001) return "negative";
  return "neutral";
}

function averageSignedValue(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function directionSignForCase({
  analysis,
  definition,
  indexes,
}: {
  analysis: MovementReplayAnalysis;
  definition: ProofCaseDefinition;
  indexes: number[];
}): MovementRecordedProofManifestRow["directionSign"] {
  if (indexes.length === 0) return definition.directionSign;

  const frames = proofFrameSet(indexes);
  switch (definition.proofCase) {
    case "head-direction":
      return signFromValue(averageSignedValue(
        analysis.head.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rawYaw),
      ));
    case "side-bend":
      return signFromValue(averageSignedValue(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.spineSideBend),
      ));
    case "standing-twist":
      return signFromValue(averageSignedValue(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.spineTwist),
      ));
    case "root-turn":
      return signFromValue(averageSignedValue(
        analysis.rootMotion.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.headingYaw),
      ));
    case "root-travel":
      return signFromValue(averageSignedValue(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rootMotionTravelDistance),
      ));
    default:
      return definition.directionSign;
  }
}

function maxAbs(values: number[]) {
  if (values.length === 0) return null;
  return Math.max(...values.map((value) => Math.abs(value)));
}

function mirrorSideOwnershipIndexes(analysis: MovementReplayAnalysis) {
  return analysis.gamePath.frames
    .filter((frame) => {
      const leftRaised = frame.leftKneeLift >= 0.18;
      const rightRaised = frame.rightKneeLift >= 0.18;
      return isStandingLegProofFrame(frame) && leftRaised !== rightRaised;
    })
    .map((frame) => frame.frameIndex);
}

function isStandingLegProofFrame(frame: MovementReplayAnalysis["gamePath"]["frames"][number]) {
  return frame.supportIntentKey === "feet-floor" &&
    !frame.supportPresentationOwner.includes("seated") &&
    !frame.exercisePoseKey.includes("seated") &&
    !frame.exercisePoseKey.includes("chair") &&
    (
      frame.lowerLabel.includes("knee-raise") ||
      frame.lowerOwner.includes("leg-raise")
    ) &&
    frame.sourceQuality >= 0.75;
}

function shoulderScapulaProxyScore(frame: MovementReplayAnalysis["gamePath"]["frames"][number]) {
  const isBroadUpperBodyPresentation = (
    frame.supportPresentationOwner === "support-presentation-standing-arm-raise" ||
    frame.supportPresentationOwner === "support-presentation-standing-twist"
  );
  if (!isBroadUpperBodyPresentation) return 0;
  return frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount;
}

function seatedPresentationScore(frame: MovementReplayAnalysis["gamePath"]["frames"][number]) {
  if (!frame.supportPresentationOwner.startsWith("support-presentation-seated")) return 0;
  return 1 + frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount;
}

function selfOcclusionRecoveryScore(frame: MovementReplayAnalysis["gamePath"]["frames"][number]) {
  if (!frame.lowerBodyTrackingReady) return 0;
  if (frame.sourceQuality <= 0 || frame.sourceQuality >= 0.75) return 0;
  return 1 - frame.sourceQuality;
}

function observedAmplitudeForCase({
  analysis,
  definition,
  indexes,
}: {
  analysis: MovementReplayAnalysis;
  definition: ProofCaseDefinition;
  indexes: number[];
}): number | null {
  if (indexes.length === 0) return null;

  const frames = proofFrameSet(indexes);
  switch (definition.proofCase) {
    case "head-direction":
      return maxAbs(
        analysis.head.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rawYaw),
      );
    case "side-bend":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.spineSideBend),
      );
    case "standing-arm-raise":
    case "standing-reach":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.supportPresentationArmSpecCount),
      );
    case "standing-twist":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.spineTwist),
      );
    case "shoulder-scapula-control":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map(shoulderScapulaProxyScore),
      );
    case "seated-neutral":
    case "chair-contact":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map(seatedPresentationScore),
      );
    case "seated-twist":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount),
      );
    case "seated-forward-fold":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.seatedForwardFoldCandidateScore ?? 0),
      );
    case "seated-leg-lift":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount),
      );
    case "squat":
    case "far-squat":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => Math.max(frame.squatDepth, frame.visualRootDrop, frame.hipDrop)),
      );
    case "left-leg-raise":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.leftKneeLift),
      );
    case "right-leg-raise":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rightKneeLift),
      );
    case "mirror-side-ownership":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => Math.max(frame.leftKneeLift, frame.rightKneeLift)),
      );
    case "root-turn":
    case "facing-occlusion-recovery":
      return maxAbs(
        analysis.rootMotion.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.headingYaw),
      );
    case "root-travel":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rootPathDistance),
      );
    case "side-swap-recovery":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map((frame) => frame.rootMotionHeadingDelta),
      );
    case "self-occlusion-recovery":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frames.has(frame.frameIndex))
          .map(selfOcclusionRecoveryScore),
      );
    default:
      return null;
  }
}

function candidateAmplitudeForCase({
  analysis,
  definition,
}: {
  analysis: MovementReplayAnalysis;
  definition: ProofCaseDefinition;
}): number | null {
  switch (definition.proofCase) {
    case "head-direction":
      return maxAbs(analysis.head.frames.map((frame) => frame.rawYaw));
    case "side-bend":
      return maxAbs(analysis.gamePath.frames.map((frame) => frame.spineSideBend));
    case "standing-arm-raise":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frame.supportPresentationOwner === "support-presentation-standing-arm-raise")
          .map((frame) => frame.supportPresentationArmSpecCount),
      );
    case "standing-twist":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frame.supportPresentationOwner === "support-presentation-standing-twist")
          .map((frame) => frame.spineTwist),
      );
    case "standing-reach":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => (
            frame.supportPresentationOwner === "support-presentation-standing-arm-raise" ||
            frame.supportPresentationOwner === "support-presentation-standing-twist"
          ))
          .map((frame) => frame.supportPresentationArmSpecCount),
      );
    case "shoulder-scapula-control":
      return maxAbs(analysis.gamePath.frames.map(shoulderScapulaProxyScore));
    case "seated-neutral":
    case "chair-contact":
      return maxAbs(analysis.gamePath.frames.map(seatedPresentationScore));
    case "seated-twist":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frame.supportPresentationOwner === "support-presentation-seated-twist")
          .map((frame) => frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount),
      );
    case "seated-forward-fold":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frame.supportPresentationOwner.startsWith("support-presentation-seated"))
          .map((frame) => frame.seatedForwardFoldCandidateScore)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      );
    case "seated-leg-lift":
      return maxAbs(
        analysis.gamePath.frames
          .filter((frame) => frame.supportPresentationOwner === "support-presentation-seated-leg-lift")
          .map((frame) => frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount),
      );
    case "squat":
    case "far-squat":
      return maxAbs(
        analysis.gamePath.frames.map((frame) => Math.max(frame.squatDepth, frame.visualRootDrop, frame.hipDrop)),
      );
    case "left-leg-raise":
      return maxAbs(analysis.gamePath.frames.map((frame) => frame.leftKneeLift));
    case "right-leg-raise":
      return maxAbs(analysis.gamePath.frames.map((frame) => frame.rightKneeLift));
    case "mirror-side-ownership":
      return maxAbs(analysis.gamePath.frames.map((frame) => Math.max(frame.leftKneeLift, frame.rightKneeLift)));
    case "root-turn":
    case "facing-occlusion-recovery":
      return maxAbs(analysis.rootMotion.frames.map((frame) => frame.headingYaw));
    case "root-travel":
      return maxAbs(analysis.gamePath.frames.map((frame) => frame.rootPathDistance));
    case "side-swap-recovery":
      return maxAbs(analysis.gamePath.frames.map((frame) => frame.rootMotionHeadingDelta));
    case "self-occlusion-recovery":
      return maxAbs(analysis.gamePath.frames.map(selfOcclusionRecoveryScore));
    default:
      return null;
  }
}

function formatProofAmplitude(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(3);
}

function candidateAmplitudeGapText({
  candidateAmplitude,
  expectedMinimumAmplitude,
}: {
  candidateAmplitude: number | null;
  expectedMinimumAmplitude: number | null;
}) {
  if (typeof expectedMinimumAmplitude !== "number" || !Number.isFinite(expectedMinimumAmplitude)) {
    return null;
  }
  if (typeof candidateAmplitude !== "number" || !Number.isFinite(candidateAmplitude)) {
    return `No candidate amplitude was observed; required ${formatProofAmplitude(expectedMinimumAmplitude)}.`;
  }
  if (candidateAmplitude < expectedMinimumAmplitude) {
    return `Best candidate amplitude ${formatProofAmplitude(candidateAmplitude)} is below required ${formatProofAmplitude(expectedMinimumAmplitude)}.`;
  }
  return `Best candidate amplitude ${formatProofAmplitude(candidateAmplitude)} meets required ${formatProofAmplitude(expectedMinimumAmplitude)}, but no proof window passed.`;
}

function bestGamePathCandidate(
  analysis: MovementReplayAnalysis,
  amplitudeForFrame: (frame: MovementReplayAnalysis["gamePath"]["frames"][number]) => number,
) {
  return analysis.gamePath.frames.reduce<{
    amplitude: number;
    frame: MovementReplayAnalysis["gamePath"]["frames"][number];
  } | null>((best, frame) => {
    const amplitude = amplitudeForFrame(frame);
    if (!Number.isFinite(amplitude)) return best;
    if (!best || Math.abs(amplitude) > Math.abs(best.amplitude)) {
      return { amplitude, frame };
    }
    return best;
  }, null);
}

function candidateRejectionReasonForCase({
  analysis,
  candidateAmplitude,
  definition,
  evidenceFrameCount,
}: {
  analysis: MovementReplayAnalysis;
  candidateAmplitude: number | null;
  definition: ProofCaseDefinition;
  evidenceFrameCount: number;
}) {
  if (evidenceFrameCount > 0) return null;

  switch (definition.proofCase) {
    case "far-squat": {
      const expectedMinimumAmplitude = definition.expectedMinimumAmplitude;
      if (
        typeof candidateAmplitude !== "number" ||
        !Number.isFinite(candidateAmplitude) ||
        typeof expectedMinimumAmplitude !== "number" ||
        !Number.isFinite(expectedMinimumAmplitude) ||
        candidateAmplitude < expectedMinimumAmplitude
      ) {
        return null;
      }

      const best = bestGamePathCandidate(
        analysis,
        (frame) => Math.max(frame.squatDepth, frame.visualRootDrop, frame.hipDrop),
      );
      if (!best) return null;
      if (best.frame.sourceQuality >= 0.65) {
        return `Best candidate frame ${best.frame.frameIndex} met squat amplitude but source quality ${formatProofAmplitude(best.frame.sourceQuality)} did not satisfy far-camera threshold <0.650.`;
      }
      return `Best candidate frame ${best.frame.frameIndex} met amplitude and far-camera quality, but no analyzer proof window was selected.`;
    }
    case "mirror-side-ownership": {
      const best = bestGamePathCandidate(
        analysis,
        (frame) => Math.max(frame.leftKneeLift, frame.rightKneeLift),
      );
      if (!best) return null;
      const leftRaised = best.frame.leftKneeLift >= 0.18;
      const rightRaised = best.frame.rightKneeLift >= 0.18;
      if (leftRaised === rightRaised) {
        return `Best candidate frame ${best.frame.frameIndex} did not isolate one side: left knee lift ${formatProofAmplitude(best.frame.leftKneeLift)}, right knee lift ${formatProofAmplitude(best.frame.rightKneeLift)}; exactly one side must be >=0.180.`;
      }
      return `Best candidate frame ${best.frame.frameIndex} isolated one side, but no mirror-side proof window was selected.`;
    }
    default:
      return null;
  }
}

function candidateRejectionCodeForReason(reason: string | null) {
  if (!reason) return null;
  if (reason.includes("far-camera threshold")) return "far-camera-source-quality";
  if (reason.includes("did not isolate one side")) return "mirror-side-not-isolated";
  return "proof-window-not-selected";
}

function proofBlockerCodeForCase({
  acceptedProductLimitation,
  candidateAmplitude,
  candidateRejectionCode,
  expectedMinimumAmplitude,
  failureCodes,
  manualReviewDecision,
  missingLayers,
  status,
}: {
  acceptedProductLimitation: boolean;
  candidateAmplitude: number | null;
  candidateRejectionCode: string | null;
  expectedMinimumAmplitude: number | null;
  failureCodes: string[];
  manualReviewDecision?: MovementRecordedManualReviewDecision;
  missingLayers: MovementRecordedProofLayer[];
  status: MovementRecordedProofStatus;
}) {
  if (status === "passed") return null;
  if (acceptedProductLimitation) return null;
  if (status === "failed") return failureCodes.length > 0 ? "analyzer-failure" : "manual-review-failed";
  if (status === "source-data-limitation") return "source-data-limitation";
  if (status === "manual-review") {
    return manualReviewDecision?.result === "needs-stronger-automated-assertion"
      ? "needs-stronger-automated-assertion"
      : "manual-review-pending";
  }

  if (candidateRejectionCode) return candidateRejectionCode;
  if (missingLayers.includes("recorded replay analyzer proof")) {
    if (typeof expectedMinimumAmplitude === "number" && Number.isFinite(expectedMinimumAmplitude)) {
      if (typeof candidateAmplitude !== "number" || !Number.isFinite(candidateAmplitude)) {
        return "no-candidate-amplitude";
      }
      return candidateAmplitude < expectedMinimumAmplitude
        ? "candidate-below-threshold"
        : "proof-window-not-selected";
    }
    return "missing-analyzer-proof";
  }
  if (missingLayers.includes("recorded replay visual capture")) return "missing-visual-capture";
  if (missingLayers.includes("Game Studio parity proof")) return "missing-game-parity-proof";
  if (missingLayers.includes("scoring/message proof")) return "missing-scoring-message-proof";
  return "missing-proof-layer";
}

function failureCodesForCase(
  analysis: MovementReplayAnalysis,
  proofCase: MovementRecordedProofCase,
) {
  const expected = ERROR_BY_PROOF_CASE[proofCase] ?? [];
  return analysis.failures
    .filter((failure) => (
      expected.includes(failure.semanticCode ?? "") ||
      expected.includes(failure.code)
    ))
    .map((failure) => failure.semanticCode ?? failure.code);
}

function indexesForCase(
  analysis: MovementReplayAnalysis,
  proofCase: MovementRecordedProofCase,
) {
  switch (proofCase) {
    case "standing":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.squatDepth < 0.08 &&
          frame.leftKneeLift < 0.08 &&
          frame.rightKneeLift < 0.08 &&
          frame.sourceQuality >= 0.45
        ))
        .map((frame) => frame.frameIndex);
    case "head-direction":
      return analysis.head.frames
        .filter((frame) => frame.rawConfidence >= 0.45 && Math.abs(frame.rawYaw) >= 0.25)
        .map((frame) => frame.frameIndex);
    case "squat":
      return analysis.gamePath.frames
        .filter((frame) => Math.max(frame.squatDepth, frame.visualRootDrop, frame.hipDrop) >= 0.22)
        .map((frame) => frame.frameIndex);
    case "far-squat":
      return analysis.gamePath.frames
        .filter((frame) => (
          Math.max(frame.squatDepth, frame.visualRootDrop, frame.hipDrop) >= 0.18 &&
          frame.sourceQuality < 0.65
        ))
        .map((frame) => frame.frameIndex);
    case "left-leg-raise":
      return analysis.gamePath.frames
        .filter((frame) => isStandingLegProofFrame(frame) && frame.leftKneeLift >= 0.18)
        .map((frame) => frame.frameIndex);
    case "right-leg-raise":
      return analysis.gamePath.frames
        .filter((frame) => isStandingLegProofFrame(frame) && frame.rightKneeLift >= 0.18)
        .map((frame) => frame.frameIndex);
    case "mirror-side-ownership":
      return mirrorSideOwnershipIndexes(analysis);
    case "weak-feet":
      return analysis.gamePath.sourceFrames
        .filter((frame) => frame.cameraReasons.includes("feet-weak"))
        .map((frame) => frame.frameIndex);
    case "lower-body-out-of-frame":
      return analysis.gamePath.sourceFrames
        .filter((frame) => (
          frame.blockedReasons.some((reason) => (
            reason.includes("Foot") ||
            reason.includes("Leg") ||
            reason.includes("foot") ||
            reason.includes("leg")
          )) ||
          frame.cameraReasons.includes("feet-weak")
        ))
        .map((frame) => frame.frameIndex);
    case "root-turn":
      return analysis.rootMotion.frames
        .filter((frame) => Math.abs(frame.headingYaw) >= 0.65)
        .map((frame) => frame.frameIndex);
    case "facing-occlusion-recovery":
      return analysis.rootMotion.frames
        .filter((frame) => Math.abs(frame.headingYaw) >= 0.45)
        .map((frame) => frame.frameIndex);
    case "side-swap-recovery":
      return analysis.gamePath.frames
        .filter((frame) => Math.abs(frame.rootMotionHeadingDelta) >= 0.45)
        .map((frame) => frame.frameIndex);
    case "self-occlusion-recovery":
      return analysis.gamePath.frames
        .filter((frame) => selfOcclusionRecoveryScore(frame) >= 0.35)
        .map((frame) => frame.frameIndex);
    case "root-travel":
      return analysis.gamePath.frames
        .filter((frame) => frame.rootPathDistance >= 0.16)
        .map((frame) => frame.frameIndex);
    case "scoring-message-events":
      return analysis.gamePath.gameplayEvents
        .flatMap((frame, index) => (
          frame && frame.events.length > 0 ? [index] : []
        ));
    case "side-bend": {
      const magnitudes = analysis.gamePath.frames.map((frame) => Math.abs(frame.spineSideBend));
      const quietestSideBend = magnitudes.length > 0 ? Math.min(...magnitudes) : 0;
      return analysis.gamePath.frames
        .filter((frame) => (
          Math.abs(frame.spineSideBend) >= 0.18 &&
          Math.abs(frame.spineSideBend) - quietestSideBend >= 0.12
        ))
        .map((frame) => frame.frameIndex);
    }
    case "standing-arm-raise":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.exercisePoseKey === "standing-arm-raise" &&
          frame.supportPresentationOwner === "support-presentation-standing-arm-raise" &&
          frame.supportPresentationArmSpecCount >= 1
        ))
        .map((frame) => frame.frameIndex);
    case "standing-twist":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.exercisePoseKey === "standing-twist" &&
          frame.supportPresentationOwner === "support-presentation-standing-twist" &&
          Math.abs(frame.spineTwist) >= 0.08
        ))
        .map((frame) => frame.frameIndex);
    case "standing-reach":
      return analysis.gamePath.frames
        .filter((frame) => (
          (
            frame.supportPresentationOwner === "support-presentation-standing-arm-raise" ||
            frame.supportPresentationOwner === "support-presentation-standing-twist"
          ) &&
          frame.supportPresentationArmSpecCount >= 1
        ))
        .map((frame) => frame.frameIndex);
    case "shoulder-scapula-control":
      return analysis.gamePath.frames
        .filter((frame) => shoulderScapulaProxyScore(frame) >= 5)
        .map((frame) => frame.frameIndex);
    case "seated-neutral":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.exercisePoseKey === "chair-seated" &&
          frame.supportPresentationOwner === "support-presentation-seated" &&
          seatedPresentationScore(frame) >= 1
        ))
        .map((frame) => frame.frameIndex);
    case "seated-twist":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.exercisePoseKey === "seated-twist" &&
          frame.supportPresentationOwner === "support-presentation-seated-twist" &&
          frame.supportPresentationSpineSpecCount >= 1
        ))
        .map((frame) => frame.frameIndex);
    case "seated-forward-fold":
      return analysis.gamePath.frames
        .filter((frame) => (
          (frame.seatedForwardFoldCandidateScore ?? 0) >= 1 &&
          frame.supportPresentationOwner.startsWith("support-presentation-seated")
        ))
        .map((frame) => frame.frameIndex);
    case "seated-leg-lift":
      return analysis.gamePath.frames
        .filter((frame) => (
          frame.exercisePoseKey === "seated-leg-lift" &&
          frame.supportPresentationOwner === "support-presentation-seated-leg-lift" &&
          frame.supportPresentationArmSpecCount + frame.supportPresentationSpineSpecCount >= 1
        ))
        .map((frame) => frame.frameIndex);
    case "chair-contact":
      return analysis.gamePath.frames
        .filter((frame) => seatedPresentationScore(frame) >= 1)
        .map((frame) => frame.frameIndex);
  }
}

function missingLayersForCase(
  analysis: MovementReplayAnalysis,
  proofCase: MovementRecordedProofCase,
  evidenceFrameCount: number,
  visualCaptureFrameCount: number,
): MovementRecordedProofLayer[] {
  const missingLayers: MovementRecordedProofLayer[] = [];

  if (evidenceFrameCount === 0) {
    missingLayers.push("recorded replay analyzer proof");
  }
  if (analysis.metrics.avatarVisualFrameCount === 0 && visualCaptureFrameCount === 0) {
    missingLayers.push("recorded replay visual capture");
  }
  if (analysis.metrics.replayGameWrapperFrameCount === 0) {
    missingLayers.push("Game Studio parity proof");
  }
  if (
    proofCase === "scoring-message-events" &&
    (
      analysis.metrics.replayGameScoreMessageFrameCount === 0 ||
      (
        analysis.metrics.gameplayClearMovementEventCount === 0 &&
        analysis.metrics.gameplayTrackingUncertaintyEventCount === 0 &&
        analysis.metrics.gameplayScoreDeltaTotal === 0
      )
    )
  ) {
    missingLayers.push("scoring/message proof");
  }

  return Array.from(new Set(missingLayers));
}

function requiredLayersForCase(
  proofCase: MovementRecordedProofCase,
): MovementRecordedProofLayer[] {
  const layers: MovementRecordedProofLayer[] = [
    "recorded replay analyzer proof",
    "recorded replay visual capture",
    "Game Studio parity proof",
  ];

  if (proofCase === "scoring-message-events") {
    layers.push("scoring/message proof");
  }

  return layers;
}

function visualCapturesForCase({
  analysis,
  evidenceIndexes,
  visualCaptures,
}: {
  analysis: MovementReplayAnalysis;
  evidenceIndexes: number[];
  visualCaptures: MovementRecordedVisualCaptureFrame[];
}) {
  if (evidenceIndexes.length === 0) return [];

  const evidence = new Set(evidenceIndexes);
  return visualCaptures
    .filter((capture) => capture.recordingId === analysis.sessionId && evidence.has(capture.frameIndex))
    .sort((left, right) => left.frameIndex - right.frameIndex);
}

function summarizeVisualCaptureErrors(
  captures: MovementRecordedVisualCaptureFrame[],
  key: "avatarLowerError" | "avatarPlantedFootClearance" | "avatarUpperError",
): MovementRecordedVisualCaptureErrorSummary {
  const values = captures
    .map((capture) => capture[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return {
      average: null,
      count: 0,
      max: null,
    };
  }

  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
    max: Math.max(...values),
  };
}

function visualCaptureDiagnosticsForCaptures(
  captures: MovementRecordedVisualCaptureFrame[],
): MovementRecordedVisualCaptureDiagnosticsSummary {
  return {
    avatarLowerError: summarizeVisualCaptureErrors(captures, "avatarLowerError"),
    avatarPlantedFootClearance: summarizeVisualCaptureErrors(captures, "avatarPlantedFootClearance"),
    avatarUpperError: summarizeVisualCaptureErrors(captures, "avatarUpperError"),
  };
}

function statusForCase({
  automatedStatus,
  analysis,
  evidenceFrameCount,
  failureCodes,
  missingLayers,
  proofCase,
}: {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  analysis: MovementReplayAnalysis;
  evidenceFrameCount: number;
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
  proofCase: MovementRecordedProofCase;
}): MovementRecordedProofStatus {
  if (failureCodes.length > 0) return "failed";
  if (
    proofCase === "weak-feet" ||
    proofCase === "lower-body-out-of-frame"
  ) {
    return evidenceFrameCount > 0 ? "source-data-limitation" : "missing-proof";
  }
  if (
    proofCase === "mirror-side-ownership" ||
    proofCase === "side-bend" ||
    proofCase === "facing-occlusion-recovery" ||
    proofCase === "side-swap-recovery" ||
    proofCase === "self-occlusion-recovery"
  ) {
    return evidenceFrameCount > 0 ? "manual-review" : "missing-proof";
  }
  if (automatedStatus === "missing-proof") return "missing-proof";
  if (missingLayers.length > 0 || analysis.metrics.visualMatchScore < 0.85) return "manual-review";
  return "passed";
}

function statusWithManualReviewDecision({
  decision,
  status,
}: {
  decision?: MovementRecordedManualReviewDecision;
  status: MovementRecordedProofStatus;
}): MovementRecordedProofStatus {
  if (!decision || status !== "manual-review") return status;

  switch (decision.result) {
    case "readable-pass":
      return "passed";
    case "readable-fail":
      return "failed";
    case "source-data-limitation":
      return "source-data-limitation";
    case "needs-stronger-automated-assertion":
      return "manual-review";
  }
}

function automatedProofLayersMissing(missingLayers: MovementRecordedProofLayer[]) {
  return missingLayers.filter((layer) => layer !== "recorded replay visual capture");
}

function automatedStatusForCase({
  evidenceFrameCount,
  failureCodes,
  missingLayers,
  proofCase,
}: {
  evidenceFrameCount: number;
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
  proofCase: MovementRecordedProofCase;
}): MovementRecordedAutomatedProofStatus {
  if (failureCodes.length > 0) return "failed";
  if (
    proofCase === "weak-feet" ||
    proofCase === "lower-body-out-of-frame"
  ) {
    return evidenceFrameCount > 0 ? "source-data-limitation" : "missing-proof";
  }
  if (
    proofCase === "mirror-side-ownership" ||
    proofCase === "side-bend" ||
    proofCase === "facing-occlusion-recovery" ||
    proofCase === "side-swap-recovery" ||
    proofCase === "self-occlusion-recovery"
  ) {
    return evidenceFrameCount > 0 ? "passed" : "missing-proof";
  }
  if (automatedProofLayersMissing(missingLayers).length > 0) return "missing-proof";
  return "passed";
}

function automatedStatusReasonForCase({
  automatedStatus,
  evidenceFrameCount,
  failureCodes,
  missingLayers,
}: {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  evidenceFrameCount: number;
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
}) {
  if (failureCodes.length > 0) {
    return `Automated analyzer reported ${failureCodes.join(", ")}.`;
  }
  if (automatedStatus === "source-data-limitation") {
    return `Automated analyzer found ${evidenceFrameCount} source-limited frame(s).`;
  }

  const missingAutomatedLayers = automatedProofLayersMissing(missingLayers);
  if (missingAutomatedLayers.length > 0) {
    return `Missing automated ${missingAutomatedLayers.join(", ")}.`;
  }

  return `Automated analyzer/Game proof found ${evidenceFrameCount} frame(s).`;
}

function statusReasonForCase({
  acceptedProductLimitation,
  automatedStatus,
  candidateAmplitude,
  candidateRejectionReason,
  evidenceFrameCount,
  expectedMinimumAmplitude,
  failureCodes,
  manualReviewDecision,
  missingLayers,
  sourceLimitationDecision,
  status,
}: {
  acceptedProductLimitation: boolean;
  automatedStatus: MovementRecordedAutomatedProofStatus;
  candidateAmplitude: number | null;
  candidateRejectionReason: string | null;
  evidenceFrameCount: number;
  expectedMinimumAmplitude: number | null;
  failureCodes: string[];
  manualReviewDecision?: MovementRecordedManualReviewDecision;
  missingLayers: MovementRecordedProofLayer[];
  sourceLimitationDecision?: MovementRecordedSourceLimitationDecision;
  status: MovementRecordedProofStatus;
}) {
  if (manualReviewDecision) {
    const suffix = manualReviewDecision.notes ? ` Notes: ${manualReviewDecision.notes}` : "";
    switch (manualReviewDecision.result) {
      case "readable-pass":
        return `Manual visual review accepted recorded avatar readability.${suffix}`;
      case "readable-fail":
        return `Manual visual review rejected recorded avatar readability.${suffix}`;
      case "source-data-limitation":
        return `Manual visual review marked this as a source-data limitation.${suffix}`;
      case "needs-stronger-automated-assertion":
        return `Manual visual review needs a stronger automated assertion before this proof can pass.${suffix}`;
    }
  }
  if (failureCodes.length > 0) {
    return `Analyzer reported ${failureCodes.join(", ")}.`;
  }
  if (acceptedProductLimitation) {
    const suffix = sourceLimitationDecision?.notes ? ` Notes: ${sourceLimitationDecision.notes}` : "";
    return `Source-data limitation was accepted as an explicit product limitation.${suffix}`;
  }
  if (status === "source-data-limitation") {
    return `Recording contains ${evidenceFrameCount} source-limited frame(s); not a child failure.`;
  }
  if (missingLayers.length > 0) {
    if (
      automatedStatus === "passed" &&
      missingLayers.every((layer) => layer === "recorded replay visual capture")
    ) {
      return "Automated analyzer/Game proof passed; missing recorded replay visual capture.";
    }
    if (missingLayers.includes("recorded replay analyzer proof")) {
      const amplitudeGap = candidateAmplitudeGapText({
        candidateAmplitude,
        expectedMinimumAmplitude,
      });
      const detail = [amplitudeGap, candidateRejectionReason].filter(Boolean).join(" ");
      if (detail) {
        return `Missing ${missingLayers.join(", ")}. ${detail}`;
      }
    }
    return `Missing ${missingLayers.join(", ")}.`;
  }
  if (status === "manual-review") {
    return "Analyzer evidence exists, but this proof still needs visual or semantic review.";
  }
  return `Analyzer evidence found in ${evidenceFrameCount} frame(s).`;
}

function nextActionForCase({
  acceptedProductLimitation,
  candidateAmplitude,
  candidateRejectionReason,
  expectedMinimumAmplitude,
  failureCodes,
  manualReviewDecision,
  missingLayers,
  proofCase,
  sourceLimitationDecision,
  status,
}: {
  acceptedProductLimitation: boolean;
  candidateAmplitude: number | null;
  candidateRejectionReason: string | null;
  expectedMinimumAmplitude: number | null;
  failureCodes: string[];
  manualReviewDecision?: MovementRecordedManualReviewDecision;
  missingLayers: MovementRecordedProofLayer[];
  proofCase: MovementRecordedProofCase;
  sourceLimitationDecision?: MovementRecordedSourceLimitationDecision;
  status: MovementRecordedProofStatus;
}) {
  if (status === "passed") return "No action.";
  if (acceptedProductLimitation) return "No action; source limitation is explicitly accepted.";
  if (sourceLimitationDecision?.result === "needs-better-recording") {
    return `Record a better ${proofCase} sample before accepting this source limitation.`;
  }
  if (manualReviewDecision?.result === "needs-stronger-automated-assertion") {
    return `Add a stronger automated assertion for ${proofCase} before accepting this proof.`;
  }
  if (failureCodes.length > 0) {
    return `Fix ${proofCase} failure before accepting this proof: ${failureCodes.join(", ")}.`;
  }
  if (status === "source-data-limitation") {
    return `Record a better ${proofCase} sample if this case must be supported, or document the source-data limitation.`;
  }
  if (missingLayers.includes("recorded replay analyzer proof")) {
    const amplitudeGap = candidateAmplitudeGapText({
      candidateAmplitude,
      expectedMinimumAmplitude,
    });
    if (amplitudeGap) {
      const suffix = candidateRejectionReason ? ` ${candidateRejectionReason}` : "";
      if (
        typeof candidateAmplitude === "number" &&
        Number.isFinite(candidateAmplitude) &&
        typeof expectedMinimumAmplitude === "number" &&
        Number.isFinite(expectedMinimumAmplitude) &&
        candidateAmplitude >= expectedMinimumAmplitude
      ) {
        return `Record or tag a ${proofCase} sample that satisfies the full analyzer proof window. ${amplitudeGap}${suffix}`;
      }
      return `Record or tag a stronger ${proofCase} sample. ${amplitudeGap}${suffix}`;
    }
    if (candidateRejectionReason) {
      return `Record or tag a ${proofCase} sample that satisfies the full analyzer proof window. ${candidateRejectionReason}`;
    }
    return `Add or tag a saved recording with analyzer evidence for ${proofCase}.`;
  }
  if (missingLayers.includes("Game Studio parity proof")) {
    return `Add Game Studio parity proof for ${proofCase}.`;
  }
  if (missingLayers.includes("scoring/message proof")) {
    return `Add shared scoring/message proof for ${proofCase}.`;
  }
  if (missingLayers.includes("recorded replay visual capture")) {
    return `Run movement:replay:proof-set or movement:replay:capture and review visual proof for ${proofCase}.`;
  }
  if (status === "manual-review") {
    return `Manually review recorded avatar readability and semantic direction for ${proofCase}.`;
  }
  return `Review ${proofCase} proof row.`;
}

function coveredByOtherRecordingRow(
  row: MovementRecordedProofManifestRow,
): MovementRecordedProofManifestRow {
  return {
    ...row,
    automatedStatus: "covered-by-other-recording",
    automatedStatusReason: "Another recording already provides accepted analyzer, visual, and parity proof for this proof case.",
    missingLayers: [],
    nextAction: "No action; this proof case is already covered by another recording.",
    proofBlockerCode: null,
    status: "covered-by-other-recording",
    statusReason: "This recording has no proof window for the case, but the proof case is covered elsewhere in the manifest.",
    visualCaptureFrameCount: 0,
    visualCaptureFrames: [],
  };
}

const PRODUCT_SCOPE_LIMITED_PROOF_CASES = new Set<MovementRecordedProofCase>([
  "root-travel",
]);

function activeProofCases({
  includeProductScopeProofCases = [],
}: {
  includeProductScopeProofCases?: MovementRecordedProofCase[];
} = {}) {
  const included = new Set(includeProductScopeProofCases);
  const optionalCases = OPTIONAL_SEATED_PROOF_CASES.filter((definition) => included.has(definition.proofCase));
  const optionalFacingOcclusionCases = OPTIONAL_FACING_OCCLUSION_PROOF_CASES.filter((definition) => (
    included.has(definition.proofCase)
  ));

  return [
    ...PROOF_CASES,
    ...optionalCases,
    ...optionalFacingOcclusionCases,
  ];
}

function productScopeLimitationRow(
  row: MovementRecordedProofManifestRow,
): MovementRecordedProofManifestRow {
  return {
    ...row,
    acceptedProductLimitation: true,
    automatedStatus: "product-scope-limitation",
    automatedStatusReason: "This proof case is outside the current user-facing recorded proof gate.",
    missingLayers: [],
    nextAction: "No action; this proof case is outside the current user-facing recorded proof gate.",
    proofBlockerCode: null,
    status: "product-scope-limitation",
    statusReason: "Current product scope keeps this proof case internal/demo-only until dedicated recorded proof exists.",
    visualCaptureFrameCount: 0,
    visualCaptureFrames: [],
  };
}

function normalizeCoveredMissingRows(
  rows: MovementRecordedProofManifestRow[],
  includeProductScopeProofCases: MovementRecordedProofCase[] = [],
): MovementRecordedProofManifestRow[] {
  const coveredProofCases = new Set(
    rows
      .filter((row) => row.status === "passed")
      .map((row) => row.proofCase),
  );
  const includedProductScopeProofCases = new Set(includeProductScopeProofCases);

  return rows.map((row) => (
    PRODUCT_SCOPE_LIMITED_PROOF_CASES.has(row.proofCase) &&
      !includedProductScopeProofCases.has(row.proofCase)
      ? productScopeLimitationRow(row)
      : (
        row.status === "missing-proof" ||
        (row.status === "manual-review" && !row.manualReview)
      ) && coveredProofCases.has(row.proofCase)
      ? coveredByOtherRecordingRow(row)
      : row
  ));
}

export function buildMovementRecordedProofManifest(
  analyses: MovementReplayAnalysis[],
  options: MovementRecordedProofManifestOptions = {},
): MovementRecordedProofManifest {
  const manualReviewDecisions = manualReviewDecisionMap(options.manualReviewDecisions ?? []);
  const sourceLimitationDecisions = sourceLimitationDecisionMap(options.sourceLimitationDecisions ?? []);
  const visualCaptures = options.visualCaptures ?? [];
  const coverageSummary = analyses[0]?.coverage.summary;
  const proofCaseDefinitions = activeProofCases({
    includeProductScopeProofCases: options.includeProductScopeProofCases,
  });
  const proofRows = analyses.flatMap((analysis) => (
    proofCaseDefinitions.map((definition): MovementRecordedProofManifestRow => {
      const indexes = indexesForCase(analysis, definition.proofCase);
      const failureCodes = Array.from(new Set(failureCodesForCase(analysis, definition.proofCase)));
      const rowVisualCaptures = visualCapturesForCase({
        analysis,
        evidenceIndexes: indexes,
        visualCaptures,
      });
      const visualCaptureFrames = Array.from(new Set(rowVisualCaptures.map((capture) => capture.frameIndex)));
      const visualCaptureDiagnostics = visualCaptureDiagnosticsForCaptures(rowVisualCaptures);
      const missingLayers = missingLayersForCase(
        analysis,
        definition.proofCase,
        indexes.length,
        visualCaptureFrames.length,
      );
      const observedAmplitude = observedAmplitudeForCase({
        analysis,
        definition,
        indexes,
      });
      const candidateAmplitude = candidateAmplitudeForCase({
        analysis,
        definition,
      });
      const candidateRejectionReason = candidateRejectionReasonForCase({
        analysis,
        candidateAmplitude,
        definition,
        evidenceFrameCount: indexes.length,
      });
      const candidateRejectionCode = candidateRejectionCodeForReason(candidateRejectionReason);
      const automatedStatus = automatedStatusForCase({
        evidenceFrameCount: indexes.length,
        failureCodes,
        missingLayers,
        proofCase: definition.proofCase,
      });
      const directionSign = directionSignForCase({
        analysis,
        definition,
        indexes,
      });
      const expectedFrameWindow = frameWindowFromIndexes(indexes);
      const baseStatus = statusForCase({
        automatedStatus,
        analysis,
        evidenceFrameCount: indexes.length,
        failureCodes,
        missingLayers,
        proofCase: definition.proofCase,
      });
      const baseProofBlockerCode = proofBlockerCodeForCase({
        acceptedProductLimitation: false,
        candidateAmplitude,
        candidateRejectionCode,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        missingLayers,
        status: baseStatus,
      });
      const baseNextAction = nextActionForCase({
        acceptedProductLimitation: false,
        candidateAmplitude,
        candidateRejectionReason,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        missingLayers,
        proofCase: definition.proofCase,
        status: baseStatus,
      });
      const baseStatusReason = statusReasonForCase({
        acceptedProductLimitation: false,
        automatedStatus,
        candidateAmplitude,
        candidateRejectionReason,
        evidenceFrameCount: indexes.length,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        missingLayers,
        status: baseStatus,
      });
      const baseReviewContext = movementRecordedProofDecisionReviewContextForRow({
        automatedStatus,
        candidateAmplitude,
        candidateRejectionCode,
        candidateRejectionReason,
        directionSign,
        evidenceFrameCount: indexes.length,
        expectedFrameWindow,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        missingLayers,
        nextAction: baseNextAction,
        observedAmplitude,
        proofBlockerCode: baseProofBlockerCode,
        sourceSide: definition.sourceSide,
        status: baseStatus,
        statusReason: baseStatusReason,
        visualCaptureDiagnostics,
        visualCaptureFrameCount: visualCaptureFrames.length,
        visualCaptureFrames,
      });
      const rawManualReviewDecision = baseStatus === "manual-review"
        ? manualReviewDecisions.get(manualReviewDecisionKey(analysis.sessionId, definition.proofCase))
        : undefined;
      const manualReviewDecision = decisionReviewContextMatches(rawManualReviewDecision, baseReviewContext)
        ? rawManualReviewDecision
        : undefined;
      const status = statusWithManualReviewDecision({
        decision: manualReviewDecision,
        status: baseStatus,
      });
      const sourceLimitationBaseProofBlockerCode = proofBlockerCodeForCase({
        acceptedProductLimitation: false,
        candidateAmplitude,
        candidateRejectionCode,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        manualReviewDecision,
        missingLayers,
        status,
      });
      const sourceLimitationBaseNextAction = nextActionForCase({
        acceptedProductLimitation: false,
        candidateAmplitude,
        candidateRejectionReason,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        manualReviewDecision,
        missingLayers,
        proofCase: definition.proofCase,
        status,
      });
      const sourceLimitationBaseStatusReason = statusReasonForCase({
        acceptedProductLimitation: false,
        automatedStatus,
        candidateAmplitude,
        candidateRejectionReason,
        evidenceFrameCount: indexes.length,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        manualReviewDecision,
        missingLayers,
        status,
      });
      const sourceLimitationReviewContext = movementRecordedProofDecisionReviewContextForRow({
        automatedStatus,
        candidateAmplitude,
        candidateRejectionCode,
        candidateRejectionReason,
        directionSign,
        evidenceFrameCount: indexes.length,
        expectedFrameWindow,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        missingLayers,
        nextAction: sourceLimitationBaseNextAction,
        observedAmplitude,
        proofBlockerCode: sourceLimitationBaseProofBlockerCode,
        sourceSide: definition.sourceSide,
        status,
        statusReason: sourceLimitationBaseStatusReason,
        visualCaptureDiagnostics,
        visualCaptureFrameCount: visualCaptureFrames.length,
        visualCaptureFrames,
      });
      const rawSourceLimitationDecision = status === "source-data-limitation"
        ? sourceLimitationDecisions.get(manualReviewDecisionKey(analysis.sessionId, definition.proofCase))
        : undefined;
      const sourceLimitationDecision = decisionReviewContextMatches(
        rawSourceLimitationDecision,
        sourceLimitationReviewContext,
      )
        ? rawSourceLimitationDecision
        : undefined;
      const acceptedProductLimitation = sourceLimitationDecision?.result === "accepted-product-limitation";
      const proofBlockerCode = proofBlockerCodeForCase({
        acceptedProductLimitation,
        candidateAmplitude,
        candidateRejectionCode,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        manualReviewDecision,
        missingLayers,
        status,
      });

      return {
        automatedStatus,
        automatedStatusReason: automatedStatusReasonForCase({
          automatedStatus,
          evidenceFrameCount: indexes.length,
          failureCodes,
          missingLayers,
        }),
        acceptedProductLimitation,
        avatarSide: definition.avatarSide,
        bodyPartMotion: definition.bodyPartMotion,
        candidateAmplitude,
        candidateRejectionCode,
        candidateRejectionReason,
        directionSign,
        evidenceFrameCount: indexes.length,
        expectedFrameWindow,
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        ...(manualReviewDecision ? { manualReview: manualReviewDecision } : {}),
        missingLayers,
        nextAction: nextActionForCase({
          candidateAmplitude,
          candidateRejectionReason,
          acceptedProductLimitation,
          expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
          failureCodes,
          manualReviewDecision,
          missingLayers,
          proofCase: definition.proofCase,
          sourceLimitationDecision,
          status,
        }),
        observedAmplitude,
        proofBlockerCode,
        proofCase: definition.proofCase,
        recordingId: analysis.sessionId,
        requiredLayers: requiredLayersForCase(definition.proofCase),
        scoringOrMessageEvent: definition.proofCase === "scoring-message-events"
          ? "clear-movement-match | tracking/help | score-delta"
          : null,
        sourceSide: definition.sourceSide,
        status,
        statusReason: statusReasonForCase({
          acceptedProductLimitation,
          automatedStatus,
          candidateAmplitude,
          candidateRejectionReason,
          evidenceFrameCount: indexes.length,
          expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
          failureCodes,
          manualReviewDecision,
          missingLayers,
          sourceLimitationDecision,
          status,
        }),
        visualCaptureDiagnostics,
        visualCaptureFrameCount: visualCaptureFrames.length,
        visualCaptureFrames,
        ...(sourceLimitationDecision ? { sourceLimitationDecision } : {}),
      };
    })
  ));
  const rows = normalizeCoveredMissingRows(proofRows, options.includeProductScopeProofCases);
  const blockingRows = getBlockingRows(rows);

  return {
    generatedBy: "movement-replay-analyzer",
    recordingCount: analyses.length,
    rows,
    summary: {
      coveredByOtherRecordingCount: rows.filter((row) => row.status === "covered-by-other-recording").length,
      failedCount: rows.filter((row) => row.status === "failed").length,
      manualReviewCount: rows.filter((row) => row.status === "manual-review").length,
      appliedManualReviewDecisionCount: rows.filter((row) => row.manualReview).length,
      missingProofCount: rows.filter((row) => row.status === "missing-proof").length,
      passedCount: rows.filter((row) => row.status === "passed").length,
      productScopeLimitationCount: rows.filter((row) => row.status === "product-scope-limitation").length,
      sourceDataLimitationCount: rows.filter((row) => row.status === "source-data-limitation").length,
      acceptedProductLimitationCount: rows.filter((row) => row.acceptedProductLimitation).length,
      appliedSourceLimitationDecisionCount: rows.filter((row) => row.sourceLimitationDecision).length,
      automatedCoveredByOtherRecordingCount: rows.filter((row) => row.automatedStatus === "covered-by-other-recording").length,
      automatedFailedCount: rows.filter((row) => row.automatedStatus === "failed").length,
      automatedMissingProofCount: rows.filter((row) => row.automatedStatus === "missing-proof").length,
      automatedPassedCount: rows.filter((row) => row.automatedStatus === "passed").length,
      automatedProductScopeLimitationCount:
        rows.filter((row) => row.automatedStatus === "product-scope-limitation").length,
      automatedSourceDataLimitationCount: rows.filter((row) => row.automatedStatus === "source-data-limitation").length,
      blockingRowCount: blockingRows.length,
      blockingRowsByProofBlockerCode: countRowsByProofBlockerCode(blockingRows),
      blockingRowsByCandidateRejectionCode: countRowsByCandidateRejectionCode(blockingRows),
      blockingRowsByCandidateRejectionReason: countRowsByCandidateRejectionReason(blockingRows),
      blockingRowsByMissingLayer: countRowsByMissingLayer(blockingRows),
      blockingRowsByProofCase: countRowsByProofCase(blockingRows),
      blockingRowsByStatus: countRowsByStatus(blockingRows),
      coverageProductTruth: {
        internalDemoOnlyCount: coverageSummary?.internalDemoOnlyCount ?? 0,
        internalDemoOnlyFamilies: coverageSummary?.internalDemoOnlyFamilies ?? [],
        missingProofCount: coverageSummary?.missingProofCount ?? 0,
        userFacingCount: coverageSummary?.userFacingCount ?? 0,
        userFacingFamilies: coverageSummary?.userFacingFamilies ?? [],
      },
      totalRows: rows.length,
      visualCaptureFrameCount: rows.reduce((sum, row) => sum + row.visualCaptureFrameCount, 0),
      visualCaptureRowCount: rows.filter((row) => row.visualCaptureFrameCount > 0).length,
      visualCaptureMissingRowCount: rows.filter((row) => row.missingLayers.includes("recorded replay visual capture")).length,
    },
    version: 1,
  };
}

export function summarizeMovementRecordedProofGate(
  manifest: MovementRecordedProofManifest,
): MovementRecordedProofGateSummary {
  const blockingRows = getBlockingRows(manifest.rows);
  const blockingRowsByStatus = countRowsByStatus(blockingRows);
  const blockingRowsByProofCase = countRowsByProofCase(blockingRows);
  const blockingRowsByMissingLayer = countRowsByMissingLayer(blockingRows);
  const blockingRowsByProofBlockerCode = countRowsByProofBlockerCode(blockingRows);
  const blockingRowsByCandidateRejectionCode = countRowsByCandidateRejectionCode(blockingRows);
  const blockingRowsByCandidateRejectionReason = countRowsByCandidateRejectionReason(blockingRows);

  if (blockingRows.length === 0) {
    return {
      blockingRowsByProofBlockerCode,
      blockingRowsByCandidateRejectionCode,
      blockingRowsByCandidateRejectionReason,
      blockingRowsByMissingLayer,
      blockingRowsByProofCase,
      blockingRows,
      blockingRowsByStatus,
      status: "passed",
      summary: "Recorded proof manifest gate passed.",
    };
  }

  const statusSummary = Object.entries(blockingRowsByStatus)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");

  return {
    blockingRowsByProofBlockerCode,
    blockingRowsByCandidateRejectionCode,
    blockingRowsByCandidateRejectionReason,
    blockingRowsByMissingLayer,
    blockingRowsByProofCase,
    blockingRows,
    blockingRowsByStatus,
    status: "blocked",
    summary: `Recorded proof manifest gate blocked by ${blockingRows.length} row(s): ${statusSummary}.`,
  };
}
