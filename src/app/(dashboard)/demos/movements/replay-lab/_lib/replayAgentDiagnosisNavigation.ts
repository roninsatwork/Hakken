import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";

export type ReplayAgentDiagnosisNavigationTarget = {
  detail: string;
  frameIndex: number;
  key: "first-failure" | "worst-frame" | "owner-transition";
  label: string;
};

function firstFrameFailureTarget(
  analysis: MovementReplayAnalysis,
): ReplayAgentDiagnosisNavigationTarget | null {
  const replayFrame = analysis.replayStudio.frames.find((frame) => (
    frame.failures.some((failure) => failure.severity === "error")
  )) ?? analysis.replayStudio.frames.find((frame) => frame.failures.length > 0);

  if (replayFrame) {
    const failure = replayFrame.failures.find((item) => item.severity === "error") ??
      replayFrame.failures[0];
    return {
      detail: failure?.code ?? replayFrame.status,
      frameIndex: replayFrame.frameIndex,
      key: "first-failure",
      label: "First Failure",
    };
  }

  const analysisFailure = analysis.failures.find((failure) => (
    failure.severity === "error" && typeof failure.frameIndex === "number"
  )) ?? analysis.failures.find((failure) => typeof failure.frameIndex === "number");

  if (typeof analysisFailure?.frameIndex !== "number") return null;
  return {
    detail: analysisFailure.code,
    frameIndex: analysisFailure.frameIndex,
    key: "first-failure",
    label: "First Failure",
  };
}

function worstFrameTarget(
  analysis: MovementReplayAnalysis,
): ReplayAgentDiagnosisNavigationTarget | null {
  const worstFrame = analysis.replayStudio.session.worstFrames[0];
  if (!worstFrame) return null;

  return {
    detail: worstFrame.failures[0]?.code ?? worstFrame.status,
    frameIndex: worstFrame.frameIndex,
    key: "worst-frame",
    label: "Worst Frame",
  };
}

function firstOwnerTransitionTarget(
  analysis: MovementReplayAnalysis,
): ReplayAgentDiagnosisNavigationTarget | null {
  const frames = [...analysis.replayStudio.frames].sort((left, right) => left.frameIndex - right.frameIndex);
  let previousOwner: string | null = null;

  for (const frame of frames) {
    const owner = frame.actual.lowerOwner || "unknown";
    if (previousOwner && owner !== previousOwner) {
      return {
        detail: `${previousOwner} -> ${owner}`,
        frameIndex: frame.frameIndex,
        key: "owner-transition",
        label: "Owner Transition",
      };
    }
    previousOwner = owner;
  }

  return null;
}

export function buildReplayAgentDiagnosisNavigationTargets(
  analysis: MovementReplayAnalysis | null,
): ReplayAgentDiagnosisNavigationTarget[] {
  if (!analysis) return [];

  return [
    firstFrameFailureTarget(analysis),
    worstFrameTarget(analysis),
    firstOwnerTransitionTarget(analysis),
  ].filter((target): target is ReplayAgentDiagnosisNavigationTarget => target !== null);
}
