import type { MovementReplayAnalysis } from "../../_lib/movementReplayAnalyzer";
import type { MovementTrackingDebugState } from "../../_lib/movementTrackingCalibration";
import { countFailures, formatNumber, getFailureGroups } from "../_lib/replayLabHelpers";
import {
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
} from "../../_lib/movementPalette";

type ReplayAnalysisReviewSectionsProps = {
  analysis: MovementReplayAnalysis | null;
  currentAvatarVisual: MovementTrackingDebugState["avatarVisual"];
  failureGroups: ReturnType<typeof getFailureGroups>;
  onSeekFrame: (frameIndex: number) => void;
};

export default function ReplayAnalysisReviewSections({
  analysis,
  currentAvatarVisual,
  failureGroups,
  onSeekFrame,
}: ReplayAnalysisReviewSectionsProps) {
  return (
    <>
    <section className="hidden">
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Visual Match</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {analysis ? `${Math.round(analysis.metrics.visualMatchScore * 100)}%` : "--"}
        </div>
        <div className="mt-2 text-xs text-secondary">
          {analysis ? `${analysis.metrics.visualReliableFrameCount}/${analysis.summary.frameCount} reliable frames, ${Math.round(analysis.metrics.visualMotionCoverage * 100)}% motion coverage` : "Waiting for data"}
        </div>
      </div>
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Code Result</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {analysis
            ? countFailures(analysis, "error") > 0
              ? "FAIL"
              : countFailures(analysis, "warning") > 0
                ? "REVIEW"
                : "CLEAN"
            : "--"}
        </div>
        <div className="mt-2 text-xs text-secondary">
          {analysis
            ? `${countFailures(analysis, "error")} errors, ${countFailures(analysis, "warning")} warnings, ${analysis.metrics.strongFullBodyFrameCount} strong full-body frames, ${analysis.metrics.supportConstraintPartialFrameCount} partial support frames`
            : "Waiting for data"}
        </div>
      </div>
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Avatar Output</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {analysis?.metrics.avatarVisualFrameCount
            ? formatNumber(analysis.metrics.averageAvatarLowerBodyDirectionError)
            : typeof currentAvatarVisual?.averageLowerBodyDirectionError === "number"
              ? formatNumber(currentAvatarVisual.averageLowerBodyDirectionError)
            : "--"}
        </div>
        <div className="mt-2 text-xs text-secondary">
          {analysis?.metrics.avatarVisualFrameCount
            ? `${analysis.metrics.avatarVisualFrameCount} frames with VRM bone telemetry`
            : currentAvatarVisual
              ? `${currentAvatarVisual.comparedLowerBodySegments} live VRM segments on current frame`
            : "Run a recording to read live VRM bone telemetry"}
        </div>
      </div>
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Retarget</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {formatNumber(analysis?.metrics.averageRetargetQuality)}
        </div>
        <div className="mt-2 text-xs text-secondary">
          avg quality, {analysis?.metrics.lowerBodyOwnerTransitions ?? 0} lower-owner transitions
        </div>
      </div>
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Support</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {analysis ? analysis.metrics.supportConstraintPartialFrameCount : "--"}
        </div>
        <div className="mt-2 text-xs text-secondary">
          {analysis
            ? `${analysis.metrics.supportConstraintActiveFrameCount} active, ${analysis.metrics.supportContactCorrectionFrameCount} corrected, ${analysis.metrics.supportPresentationAppliedFrameCount} presented, ${analysis.metrics.supportConstraintMissingFrameCount} missing`
            : "Waiting for support constraints"}
        </div>
      </div>
      <div className="rounded-[8px] border border-border-dim bg-sidebar/35 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Bounds</h2>
        <div className="mt-3 text-3xl font-bold text-foreground">
          {formatNumber(analysis?.metrics.averageOutOfFrameCount)}
        </div>
        <div className="mt-2 text-xs text-secondary">
          avg out-of-frame, max {analysis?.metrics.maxOutOfFrameCount ?? "--"}
        </div>
      </div>
    </section>

    <section className="rounded-[8px] border border-border-dim bg-sidebar/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Flag Review</h2>
        <span className="text-xs text-muted">
          {analysis ? `${analysis.failures.length} flags · ${failureGroups.length} types` : "Waiting for analysis"}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {!analysis ? (
          <div className="text-sm text-secondary">Waiting for analysis.</div>
        ) : failureGroups.length === 0 ? (
          <div className={`rounded-[8px] border border-[${MOVEMENT_MINT}]/20 bg-[${MOVEMENT_MINT}]/10 p-3 text-sm text-[${MOVEMENT_MINT}]`}>
            No replay flags for this stored recording.
          </div>
        ) : failureGroups.map((group) => (
          <div
            key={group.code}
            className="rounded-[8px] border border-border-dim bg-background/50 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={`font-mono text-xs text-[${MOVEMENT_SALMON}]`}>{group.code}</span>
              <span className="text-xs uppercase tracking-wide text-muted">
                {group.count} · {group.severity}
                {typeof group.firstFrame === "number" ? ` · first ${group.firstFrame}` : ""}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {group.samples.map((failure, index) => (
                <button
                  key={`${group.code}-${failure.frameIndex ?? "session"}-${index}`}
                  type="button"
                  onClick={() => {
                    if (typeof failure.frameIndex === "number") {
                      onSeekFrame(failure.frameIndex);
                    }
                  }}
                  disabled={typeof failure.frameIndex !== "number"}
                  className="rounded-[8px] border border-border-dim px-2 py-1 text-left font-mono text-[11px] text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title={failure.detail}
                >
                  {typeof failure.frameIndex === "number" ? `frame ${failure.frameIndex}` : "session"}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-secondary">{group.samples[0]?.detail}</div>
          </div>
        ))}
      </div>
    </section>
    </>
  );
}
