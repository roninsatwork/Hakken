import type { MovementNextProofRehearsalItem } from "./movementNextProofRehearsal";
import type { MovementReplayAnalysis, MovementReplayGamePathFrame } from "../../_lib/movementReplayAnalyzer";

export type MovementProofRehearsalRequirement = {
  label: string;
  proofCase: "root-travel" | "seated-forward-fold";
  requiredScore: number;
};

export type MovementProofRehearsalScoreState = "missing" | "below-threshold" | "meets-threshold";

export type MovementProofRehearsalEvidence = {
  detail: string;
  frameIndex: number;
  label: string;
  requiredScore: number;
  score: number;
  scorePercent: number;
  scoreState: MovementProofRehearsalScoreState;
  scoreSummary: string;
};

export type MovementProofRehearsalBatchEvidence = MovementProofRehearsalEvidence & {
  recordingId: string;
  recordingTitle: string;
};

export type MovementProofRehearsalBatchAnalysis = {
  analysis: MovementReplayAnalysis;
  order?: number;
  recordingId: string;
  recordingTitle?: string | null;
};

export type MovementProofRehearsalBatchSummary = {
  belowThresholdCount: number;
  meetsThresholdCount: number;
  missingCount: number;
  rows: Array<{
    evidence: MovementProofRehearsalBatchEvidence | null;
    freshRecordingLabel: string;
    requirement: MovementProofRehearsalRequirement | null;
    scoreState: MovementProofRehearsalScoreState;
  }>;
  total: number;
};

const ROOT_TRAVEL_REQUIRED_SCORE = 0.16;
const SEATED_FORWARD_FOLD_REQUIRED_SCORE = 1;

function scorePercent(score: number, requiredScore: number) {
  if (requiredScore <= 0) return 0;
  return Math.round((score / requiredScore) * 100);
}

export function getMovementProofRehearsalRequirement(
  item: MovementNextProofRehearsalItem,
): MovementProofRehearsalRequirement | null {
  if (item.proofCases.includes("root-travel")) {
    return {
      label: "Required root travel",
      proofCase: "root-travel",
      requiredScore: ROOT_TRAVEL_REQUIRED_SCORE,
    };
  }

  if (item.proofCases.includes("seated-forward-fold")) {
    return {
      label: "Required fold score",
      proofCase: "seated-forward-fold",
      requiredScore: SEATED_FORWARD_FOLD_REQUIRED_SCORE,
    };
  }

  return null;
}

export function getMovementProofRehearsalScoreSummary(
  score: number,
  requirement: MovementProofRehearsalRequirement,
) {
  const percent = scorePercent(score, requirement.requiredScore);
  const scoreState: MovementProofRehearsalScoreState = score <= 0
    ? "missing"
    : score >= requirement.requiredScore
      ? "meets-threshold"
      : "below-threshold";

  return {
    scorePercent: percent,
    scoreState,
    scoreSummary: `${score.toFixed(2)} / ${requirement.requiredScore.toFixed(2)} (${percent}%)`,
  };
}

function strongestFrame(
  frames: MovementReplayGamePathFrame[],
  scoreForFrame: (frame: MovementReplayGamePathFrame) => number,
) {
  return frames
    .map((frame) => ({
      frame,
      score: scoreForFrame(frame),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      left.frame.frameIndex - right.frame.frameIndex
    ))[0] ?? null;
}

export function getMovementProofRehearsalEvidence(
  item: MovementNextProofRehearsalItem,
  analysis: MovementReplayAnalysis | null,
): MovementProofRehearsalEvidence | null {
  if (!analysis) return null;
  const requirement = getMovementProofRehearsalRequirement(item);
  if (!requirement) return null;

  if (item.proofCases.includes("root-travel")) {
    const strongestRootTravel = strongestFrame(analysis.gamePath.frames, (frame) => (
      frame.rootMotionIntentKey === "root-travel"
        ? Math.max(frame.rootMotionTravelDistance, frame.rootPathDistance)
        : 0
    ));
    if (!strongestRootTravel) return null;

    return {
      detail: `travel ${strongestRootTravel.frame.rootMotionTravelDirection || "unknown"} · ${strongestRootTravel.score.toFixed(2)}`,
      frameIndex: strongestRootTravel.frame.frameIndex,
      label: "Root-travel evidence",
      requiredScore: requirement.requiredScore,
      score: strongestRootTravel.score,
      ...getMovementProofRehearsalScoreSummary(strongestRootTravel.score, requirement),
    };
  }

  if (item.proofCases.includes("seated-forward-fold")) {
    const strongestSeatedFold = strongestFrame(analysis.gamePath.frames, (frame) => (
      Math.max(
        frame.seatedForwardFoldCandidateScore ?? 0,
        frame.exercisePoseKey === "seated-forward-fold" ? frame.exercisePoseQualityScore : 0,
        frame.supportPresentationOwner.includes("seated-forward-fold") ? 1 : 0,
      )
    ));
    if (!strongestSeatedFold) return null;

    return {
      detail: `fold score ${strongestSeatedFold.score.toFixed(2)}`,
      frameIndex: strongestSeatedFold.frame.frameIndex,
      label: "Seated-fold evidence",
      requiredScore: requirement.requiredScore,
      score: strongestSeatedFold.score,
      ...getMovementProofRehearsalScoreSummary(strongestSeatedFold.score, requirement),
    };
  }

  return null;
}

export function getMovementProofRehearsalBatchEvidence(
  item: MovementNextProofRehearsalItem,
  entries: MovementProofRehearsalBatchAnalysis[],
): MovementProofRehearsalBatchEvidence | null {
  const strongestEvidence = entries
    .map((entry, index) => {
      const evidence = getMovementProofRehearsalEvidence(item, entry.analysis);
      if (!evidence) return null;

      return {
        ...evidence,
        order: entry.order ?? index,
        recordingId: entry.recordingId,
        recordingTitle: entry.recordingTitle || entry.recordingId,
      };
    })
    .filter((evidence): evidence is MovementProofRehearsalBatchEvidence & { order: number } => (
      evidence !== null
    ))
    .sort((left, right) => (
      right.score - left.score ||
      left.order - right.order ||
      left.frameIndex - right.frameIndex ||
      left.recordingTitle.localeCompare(right.recordingTitle)
    ))[0] ?? null;

  if (!strongestEvidence) return null;
  return {
    detail: strongestEvidence.detail,
    frameIndex: strongestEvidence.frameIndex,
    label: strongestEvidence.label,
    recordingId: strongestEvidence.recordingId,
    recordingTitle: strongestEvidence.recordingTitle,
    requiredScore: strongestEvidence.requiredScore,
    score: strongestEvidence.score,
    scorePercent: strongestEvidence.scorePercent,
    scoreState: strongestEvidence.scoreState,
    scoreSummary: strongestEvidence.scoreSummary,
  };
}

export function getMovementProofRehearsalBatchSummary(
  items: MovementNextProofRehearsalItem[],
  entries: MovementProofRehearsalBatchAnalysis[],
): MovementProofRehearsalBatchSummary {
  const rows = items.map((item) => {
    const evidence = getMovementProofRehearsalBatchEvidence(item, entries);
    const requirement = getMovementProofRehearsalRequirement(item);
    const scoreState = evidence?.scoreState ?? "missing";

    return {
      evidence,
      freshRecordingLabel: item.freshRecordingLabel,
      requirement,
      scoreState,
    };
  });

  return {
    belowThresholdCount: rows.filter((row) => row.scoreState === "below-threshold").length,
    meetsThresholdCount: rows.filter((row) => row.scoreState === "meets-threshold").length,
    missingCount: rows.filter((row) => row.scoreState === "missing").length,
    rows,
    total: rows.length,
  };
}
