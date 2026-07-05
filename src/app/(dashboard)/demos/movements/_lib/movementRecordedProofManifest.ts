import type { MovementReplayAnalysis } from "./movementReplayAnalyzer";

export type MovementRecordedProofStatus =
  | "failed"
  | "manual-review"
  | "missing-proof"
  | "passed"
  | "source-data-limitation";

export type MovementRecordedAutomatedProofStatus =
  | "failed"
  | "missing-proof"
  | "passed"
  | "source-data-limitation";

export type MovementRecordedProofLayer =
  | "recorded replay analyzer proof"
  | "recorded replay visual capture"
  | "Game Studio parity proof"
  | "scoring/message proof";

export type MovementRecordedProofCase =
  | "standing"
  | "side-bend"
  | "head-direction"
  | "squat"
  | "far-squat"
  | "left-leg-raise"
  | "right-leg-raise"
  | "weak-feet"
  | "lower-body-out-of-frame"
  | "root-turn"
  | "root-travel"
  | "mirror-side-ownership"
  | "scoring-message-events";

export type MovementRecordedProofManifestRow = {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  automatedStatusReason: string;
  avatarSide: "avatar-left" | "avatar-right" | "both" | "n/a" | "unknown";
  bodyPartMotion: string;
  directionSign: "negative" | "neutral" | "positive" | "unknown";
  evidenceFrameCount: number;
  expectedFrameWindow: {
    endFrame: number | null;
    startFrame: number | null;
  };
  expectedMinimumAmplitude: number | null;
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
  nextAction: string;
  observedAmplitude: number | null;
  proofCase: MovementRecordedProofCase;
  recordingId: string;
  requiredLayers: MovementRecordedProofLayer[];
  scoringOrMessageEvent: string | null;
  sourceSide: "both" | "left" | "n/a" | "right" | "unknown";
  status: MovementRecordedProofStatus;
  statusReason: string;
  visualCaptureFrameCount: number;
  visualCaptureFrames: number[];
};

export type MovementRecordedVisualCaptureFrame = {
  avatarLowerError: number | null;
  avatarPath: string | null;
  avatarUpperError: number | null;
  frameIndex: number;
  recordingId: string;
  sourcePath: string | null;
};

export type MovementRecordedProofManifestOptions = {
  visualCaptures?: MovementRecordedVisualCaptureFrame[];
};

export type MovementRecordedProofManifest = {
  generatedBy: "movement-replay-analyzer";
  recordingCount: number;
  rows: MovementRecordedProofManifestRow[];
  summary: {
    failedCount: number;
    manualReviewCount: number;
    missingProofCount: number;
    passedCount: number;
    sourceDataLimitationCount: number;
    automatedFailedCount: number;
    automatedMissingProofCount: number;
    automatedPassedCount: number;
    automatedSourceDataLimitationCount: number;
    blockingRowCount: number;
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
  return rows.filter((row) => row.status !== "passed");
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

const ERROR_BY_PROOF_CASE: Partial<Record<MovementRecordedProofCase, string[]>> = {
  "head-direction": ["head-direction-reversed", "head-motion-missing"],
  "left-leg-raise": ["leg-lift-missing", "leg-lift-wrong-side", "leg-lift-collapsed-to-squat"],
  "mirror-side-ownership": ["mirror-side-mismatch"],
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
    case "root-turn":
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
    default:
      return null;
  }
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
        .filter((frame) => frame.leftKneeLift >= 0.18)
        .map((frame) => frame.frameIndex);
    case "right-leg-raise":
      return analysis.gamePath.frames
        .filter((frame) => frame.rightKneeLift >= 0.18)
        .map((frame) => frame.frameIndex);
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
    case "mirror-side-ownership":
      return [];
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
    analysis.metrics.gameplayClearMovementEventCount === 0 &&
    analysis.metrics.gameplayTrackingUncertaintyEventCount === 0 &&
    analysis.metrics.gameplayScoreDeltaTotal === 0
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

function visualCaptureFramesForCase({
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
  return Array.from(new Set(visualCaptures
    .filter((capture) => capture.recordingId === analysis.sessionId && evidence.has(capture.frameIndex))
    .map((capture) => capture.frameIndex)))
    .sort((left, right) => left - right);
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
  if (proofCase === "mirror-side-ownership" || proofCase === "side-bend") {
    return evidenceFrameCount > 0 ? "manual-review" : "missing-proof";
  }
  if (automatedStatus === "missing-proof") return "missing-proof";
  if (missingLayers.length > 0 || analysis.metrics.visualMatchScore < 0.85) return "manual-review";
  return "passed";
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
  if (proofCase === "mirror-side-ownership" || proofCase === "side-bend") {
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
  automatedStatus,
  evidenceFrameCount,
  failureCodes,
  missingLayers,
  status,
}: {
  automatedStatus: MovementRecordedAutomatedProofStatus;
  evidenceFrameCount: number;
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
  status: MovementRecordedProofStatus;
}) {
  if (failureCodes.length > 0) {
    return `Analyzer reported ${failureCodes.join(", ")}.`;
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
    return `Missing ${missingLayers.join(", ")}.`;
  }
  if (status === "manual-review") {
    return "Analyzer evidence exists, but this proof still needs visual or semantic review.";
  }
  return `Analyzer evidence found in ${evidenceFrameCount} frame(s).`;
}

function nextActionForCase({
  failureCodes,
  missingLayers,
  proofCase,
  status,
}: {
  failureCodes: string[];
  missingLayers: MovementRecordedProofLayer[];
  proofCase: MovementRecordedProofCase;
  status: MovementRecordedProofStatus;
}) {
  if (status === "passed") return "No action.";
  if (failureCodes.length > 0) {
    return `Fix ${proofCase} failure before accepting this proof: ${failureCodes.join(", ")}.`;
  }
  if (status === "source-data-limitation") {
    return `Record a better ${proofCase} sample if this case must be supported, or document the source-data limitation.`;
  }
  if (missingLayers.includes("recorded replay analyzer proof")) {
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

export function buildMovementRecordedProofManifest(
  analyses: MovementReplayAnalysis[],
  options: MovementRecordedProofManifestOptions = {},
): MovementRecordedProofManifest {
  const visualCaptures = options.visualCaptures ?? [];
  const coverageSummary = analyses[0]?.coverage.summary;
  const rows = analyses.flatMap((analysis) => (
    PROOF_CASES.map((definition): MovementRecordedProofManifestRow => {
      const indexes = indexesForCase(analysis, definition.proofCase);
      const failureCodes = Array.from(new Set(failureCodesForCase(analysis, definition.proofCase)));
      const visualCaptureFrames = visualCaptureFramesForCase({
        analysis,
        evidenceIndexes: indexes,
        visualCaptures,
      });
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
      const automatedStatus = automatedStatusForCase({
        evidenceFrameCount: indexes.length,
        failureCodes,
        missingLayers,
        proofCase: definition.proofCase,
      });
      const status = statusForCase({
        automatedStatus,
        analysis,
        evidenceFrameCount: indexes.length,
        failureCodes,
        missingLayers,
        proofCase: definition.proofCase,
      });

      return {
        automatedStatus,
        automatedStatusReason: automatedStatusReasonForCase({
          automatedStatus,
          evidenceFrameCount: indexes.length,
          failureCodes,
          missingLayers,
        }),
        avatarSide: definition.avatarSide,
        bodyPartMotion: definition.bodyPartMotion,
        directionSign: directionSignForCase({
          analysis,
          definition,
          indexes,
        }),
        evidenceFrameCount: indexes.length,
        expectedFrameWindow: frameWindowFromIndexes(indexes),
        expectedMinimumAmplitude: definition.expectedMinimumAmplitude,
        failureCodes,
        missingLayers,
        nextAction: nextActionForCase({
          failureCodes,
          missingLayers,
          proofCase: definition.proofCase,
          status,
        }),
        observedAmplitude,
        proofCase: definition.proofCase,
        recordingId: analysis.sessionId,
        requiredLayers: requiredLayersForCase(definition.proofCase),
        scoringOrMessageEvent: definition.proofCase === "scoring-message-events"
          ? "clear-movement-match | tracking/help | score-delta"
          : null,
        sourceSide: definition.sourceSide,
        status,
        statusReason: statusReasonForCase({
          automatedStatus,
          evidenceFrameCount: indexes.length,
          failureCodes,
          missingLayers,
          status,
        }),
        visualCaptureFrameCount: visualCaptureFrames.length,
        visualCaptureFrames,
      };
    })
  ));
  const blockingRows = getBlockingRows(rows);

  return {
    generatedBy: "movement-replay-analyzer",
    recordingCount: analyses.length,
    rows,
    summary: {
      failedCount: rows.filter((row) => row.status === "failed").length,
      manualReviewCount: rows.filter((row) => row.status === "manual-review").length,
      missingProofCount: rows.filter((row) => row.status === "missing-proof").length,
      passedCount: rows.filter((row) => row.status === "passed").length,
      sourceDataLimitationCount: rows.filter((row) => row.status === "source-data-limitation").length,
      automatedFailedCount: rows.filter((row) => row.automatedStatus === "failed").length,
      automatedMissingProofCount: rows.filter((row) => row.automatedStatus === "missing-proof").length,
      automatedPassedCount: rows.filter((row) => row.automatedStatus === "passed").length,
      automatedSourceDataLimitationCount: rows.filter((row) => row.automatedStatus === "source-data-limitation").length,
      blockingRowCount: blockingRows.length,
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

  if (blockingRows.length === 0) {
    return {
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
    blockingRowsByMissingLayer,
    blockingRowsByProofCase,
    blockingRows,
    blockingRowsByStatus,
    status: "blocked",
    summary: `Recorded proof manifest gate blocked by ${blockingRows.length} row(s): ${statusSummary}.`,
  };
}
