import { extractOwner, type MovementDebugReplaySession } from "../../_lib/movementDebugReplay";
import type { MovementReplayAnalysis, MovementReplayFailure } from "../../_lib/movementReplayAnalyzer";
import type { ReplayStudioRepairPacket } from "../../_lib/movementReplayStudioRepairPacket";
import type { MovementTrackingDebugState } from "../../_lib/movementTrackingCalibration";
import { buildReplayAgentDiagnosisNavigationTargets } from "../_lib/replayAgentDiagnosisNavigation";
import type { AvatarFollowCriterionDisplay } from "../_lib/replayAvatarFollowDiagnosis";
import {
  avatarFollowCriterionClass,
  buildPathStripPoints,
  formatAngleDegrees,
  formatAnglesCompact,
  formatNumber,
  formatPoint,
  getReplayStudioParitySnapshot,
} from "../_lib/replayLabHelpers";
import ReplayAgentDiagnosisPanel from "./ReplayAgentDiagnosisPanel";

type ReplayStudioParitySnapshot = ReturnType<typeof getReplayStudioParitySnapshot>;

type ReplayCurrentFramePanelProps = {
  analysis: MovementReplayAnalysis | null;
  armConfidence: number | undefined;
  avatarFollowAcceptanceStatus: string;
  avatarFollowCriteria: AvatarFollowCriterionDisplay[];
  avatarFollowJudgeText: string;
  avatarFollowSessionFailures: MovementReplayFailure[];
  currentAvatarDebug: MovementTrackingDebugState | null;
  currentAvatarVisual: MovementTrackingDebugState["avatarVisual"];
  currentFrame: MovementDebugReplaySession["samples"][number] | undefined;
  currentFrameActiveLegMotion: boolean;
  currentFrameFailures: MovementReplayFailure[];
  currentFrameUsesSeatedSupport: boolean;
  currentGamePathFrame: MovementReplayAnalysis["gamePath"]["frames"][number] | undefined;
  currentLeftEar: Parameters<typeof formatPoint>[0];
  currentNose: Parameters<typeof formatPoint>[0];
  currentReplayStudioFrameVerdict: MovementReplayAnalysis["replayStudio"]["frames"][number] | undefined;
  currentReplayStudioPrimaryFailure:
    | MovementReplayAnalysis["replayStudio"]["frames"][number]["failures"][number]
    | null;
  currentRightEar: Parameters<typeof formatPoint>[0];
  currentRootMotionFrame: MovementReplayAnalysis["rootMotion"]["frames"][number] | undefined;
  currentRootPathDistance: number | undefined;
  currentRootPathPoint: ReturnType<typeof buildPathStripPoints>["points"][number] | undefined;
  currentSourceFrame: MovementReplayAnalysis["gamePath"]["sourceFrames"][number] | undefined;
  currentStartReadinessDetail: string;
  currentStartReadinessStatus: string;
  footConfidence: number | undefined;
  gamePathParityLabel: string;
  gamePathParityNeedsReview: boolean;
  legConfidence: number | undefined;
  liveFeetOwner: string | undefined;
  liveLowerOwner: string | undefined;
  onExportFixLog: () => void;
  onSeekFrame: (frameIndex: number) => void;
  replayFeetOwner: string | undefined;
  replayLowerOwner: string | undefined;
  repairPacket: ReplayStudioRepairPacket | null;
  replayStudioParity: {
    diffs: string[];
    label: string;
    replay: ReplayStudioParitySnapshot;
    studio: ReplayStudioParitySnapshot;
  } | null;
  replayStudioWorstFrames: MovementReplayAnalysis["replayStudio"]["session"]["worstFrames"];
  rootMotionLabel: string;
  rootMotionNeedsReview: boolean;
  rootPathStrip: ReturnType<typeof buildPathStripPoints>;
  safeFrameIndex: number;
  topStartReadinessMessages: MovementReplayAnalysis["gamePath"]["startReadinessMessageSummary"];
};

export default function ReplayCurrentFramePanel({
  analysis,
  armConfidence,
  avatarFollowAcceptanceStatus,
  avatarFollowCriteria,
  avatarFollowJudgeText,
  avatarFollowSessionFailures,
  currentAvatarDebug,
  currentAvatarVisual,
  currentFrame,
  currentFrameActiveLegMotion,
  currentFrameFailures,
  currentFrameUsesSeatedSupport,
  currentGamePathFrame,
  currentLeftEar,
  currentNose,
  currentReplayStudioFrameVerdict,
  currentReplayStudioPrimaryFailure,
  currentRightEar,
  currentRootMotionFrame,
  currentRootPathDistance,
  currentRootPathPoint,
  currentSourceFrame,
  currentStartReadinessDetail,
  currentStartReadinessStatus,
  footConfidence,
  gamePathParityLabel,
  gamePathParityNeedsReview,
  legConfidence,
  liveFeetOwner,
  liveLowerOwner,
  onExportFixLog,
  onSeekFrame,
  replayFeetOwner,
  replayLowerOwner,
  repairPacket,
  replayStudioParity,
  replayStudioWorstFrames,
  rootMotionLabel,
  rootMotionNeedsReview,
  rootPathStrip,
  safeFrameIndex,
  topStartReadinessMessages,
}: ReplayCurrentFramePanelProps) {
  const currentBodyConfidence = currentAvatarDebug?.bodyConfidence;
  const currentRetarget = currentAvatarDebug?.retarget;
  const currentFallbacks = currentAvatarDebug?.fallbacks;
  const currentSpineDrive = currentAvatarDebug?.spineDrive;
  const agentDiagnosisNavigationTargets = buildReplayAgentDiagnosisNavigationTargets(analysis);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[8px] border border-border-dim bg-sidebar/35 p-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">Current Frame</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted">Health</dt>
          <dd className="text-right text-secondary">{currentFrame?.health?.primaryAction ?? "--"}</dd>
          <dt className="text-muted">Lower owner</dt>
          <dd className="text-right text-secondary">
            {currentFrame ? extractOwner(currentFrame.fallbacks, "lower") : "--"}
          </dd>
          <dt className="text-muted">Feet owner</dt>
          <dd className="text-right text-secondary">
            {currentFrame ? extractOwner(currentFrame.fallbacks, "feet") : "--"}
          </dd>
          <dt className="text-muted">Quality</dt>
          <dd className="text-right text-secondary">{formatNumber(currentFrame?.retarget?.sourceQuality)}</dd>
          <dt className="text-muted">Squat / hip</dt>
          <dd className="text-right text-secondary">
            {formatNumber(currentFrame?.retarget?.squatDepth)} / {formatNumber(currentFrame?.retarget?.hipDrop)}
          </dd>
          <dt className="text-muted">Bounds y</dt>
          <dd className="text-right text-secondary">
            {formatNumber(currentFrame?.poseBounds?.minY)}..{formatNumber(currentFrame?.poseBounds?.maxY)}
          </dd>
            <dt className="text-muted">Out of frame</dt>
            <dd className="text-right text-secondary">{currentFrame?.poseBounds?.outOfFrameCount ?? "--"}</dd>
        </dl>

        <div
          className="mt-2 rounded-[8px] border border-border-dim bg-background/35 p-2"
          data-testid="movement-replay-start-gate"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Start Gate</h3>
            <span
              className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                currentSourceFrame?.canStartGame
                  ? "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                  : "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
              }`}
            >
              {currentStartReadinessStatus}
            </span>
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            {currentSourceFrame?.startReadinessMessage ?? "--"}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted">Can start game</dt>
            <dd className="text-right font-mono text-secondary">
              {currentSourceFrame ? String(currentSourceFrame.canStartGame) : "--"}
            </dd>
            <dt className="text-muted">Can record</dt>
            <dd className="text-right font-mono text-secondary">
              {currentSourceFrame ? String(currentSourceFrame.canStartRecording) : "--"}
            </dd>
            <dt className="text-muted">Reason</dt>
            <dd className="truncate text-right font-mono text-secondary" title={currentStartReadinessDetail}>
              {currentStartReadinessDetail}
            </dd>
            <dt className="text-muted">Batch</dt>
            <dd className="text-right font-mono text-secondary">
              {analysis
                ? `${analysis.metrics.startReadinessReadyFrameCount} ready · ${analysis.metrics.startReadinessBlockedFrameCount} blocked`
                : "--"}
            </dd>
          </dl>
          {topStartReadinessMessages.length > 0 ? (
            <div className="mt-2 border-t border-border-dim pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Top Messages
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {topStartReadinessMessages.map((item) => (
                  <button
                    key={item.message}
                    type="button"
                    onClick={() => onSeekFrame(item.firstFrameIndex)}
                    className="rounded-[6px] border border-border-dim bg-background/40 px-2 py-1 text-left text-[11px] text-secondary transition-colors hover:border-border hover:text-foreground"
                    data-first-frame-index={item.firstFrameIndex}
                    data-testid="movement-replay-start-gate-message"
                    title={`First frame ${item.firstFrameIndex}`}
                  >
                    <span className="font-mono text-foreground">{item.count}x</span>
                    {" "}
                    <span>{item.message}</span>
                    <span className="text-muted">
                      {" "}({item.blockedFrameCount} blocked)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-2 border-t border-border-dim pt-3">
          <div
            className="rounded-[8px] border border-border-dim bg-background/35 p-2"
            data-testid="movement-replay-avatar-follow"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Avatar Follow</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-[6px] border border-border-dim bg-background/45 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-secondary transition hover:border-[#f6ccbe]/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="movement-replay-export-fix-log"
                  disabled={!analysis}
                  onClick={onExportFixLog}
                >
                  Export Log
                </button>
                <span
                  className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                    avatarFollowAcceptanceStatus === "blocked-for-acceptance"
                      ? "border-[#ff8f8f]/35 bg-[#ff8f8f]/10 text-[#ffb0b0]"
                      : avatarFollowAcceptanceStatus === "review-only"
                        ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                        : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                  }`}
                >
                  {avatarFollowAcceptanceStatus}
                </span>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Judge</dt>
              <dd
                className="text-right font-mono text-secondary"
                data-testid="movement-replay-studio-judge-status"
              >
                {avatarFollowJudgeText}
              </dd>
              <dt className="text-muted">Acceptance</dt>
              <dd className="text-right font-mono text-secondary">
                {avatarFollowAcceptanceStatus}
              </dd>
              <dt className="text-muted">Visual match</dt>
              <dd className="text-right font-mono text-secondary">
                {analysis ? `${Math.round(analysis.metrics.visualMatchScore * 100)}%` : "--"}
              </dd>
              <dt className="text-muted">Lower error</dt>
              <dd className="text-right font-mono text-secondary">
                {formatNumber(
                  currentAvatarVisual?.averageLowerBodyDirectionError ??
                    analysis?.metrics.averageAvatarLowerBodyDirectionError,
                )}
              </dd>
              <dt className="text-muted">Upper error</dt>
              <dd className="text-right font-mono text-secondary">
                {formatNumber(currentAvatarVisual?.averageUpperBodyDirectionError)}
              </dd>
              <dt className="text-muted">Owner flicker</dt>
              <dd className="text-right font-mono text-secondary">
                {analysis ? `${formatNumber(analysis.metrics.ownerTransitionsPerSecond)}/s` : "--"}
              </dd>
              <dt className="text-muted">Visual frames</dt>
              <dd className="text-right font-mono text-secondary">
                {analysis
                  ? `${analysis.metrics.avatarVisualFrameCount} telemetry · ${currentAvatarVisual?.comparedLowerBodySegments ?? 0} current lower`
                  : "--"}
              </dd>
              <dt className="text-muted">Criteria</dt>
              <dd className="text-right font-mono text-secondary">
                {avatarFollowCriteria.filter((criterion) => criterion.status === "blocked").length} blocked
                {" "}· {avatarFollowCriteria.filter((criterion) => criterion.status === "review").length} review
              </dd>
              <dt className="text-muted">Current conflict</dt>
              <dd className="text-right font-mono text-secondary">
                {currentFrameUsesSeatedSupport && currentFrameActiveLegMotion
                  ? "seated support + leg motion"
                  : currentFrameActiveLegMotion
                    ? "leg motion"
                    : currentFrameUsesSeatedSupport
                      ? "seated support"
                      : "none"}
              </dd>
              <dt className="text-muted">Worst frame</dt>
              <dd
                className="text-right font-mono text-secondary"
                data-testid="movement-replay-studio-worst-frame"
              >
                {replayStudioWorstFrames[0]
                  ? `${replayStudioWorstFrames[0].frameIndex} · ${replayStudioWorstFrames[0].failures[0]?.code ?? replayStudioWorstFrames[0].status}`
                  : "--"}
              </dd>
            </dl>
            {repairPacket ? (
              <ReplayAgentDiagnosisPanel
                navigationTargets={agentDiagnosisNavigationTargets}
                onSeekFrame={onSeekFrame}
                repairPacket={repairPacket}
              />
            ) : null}
            {replayStudioWorstFrames.length > 0 ? (
              <div
                className="mt-2 flex flex-col gap-1.5"
                data-testid="movement-replay-studio-worst-frames"
              >
                {replayStudioWorstFrames.slice(0, 5).map((frame) => (
                  <button
                    key={frame.frameIndex}
                    type="button"
                    className={`rounded-[6px] border px-2 py-1 text-left text-[11px] transition ${
                      frame.status === "blocked"
                        ? "border-[#ff8f8f]/25 bg-[#ff8f8f]/10 text-[#ffb0b0] hover:border-[#ff8f8f]/50"
                        : "border-[#f6ccbe]/20 bg-[#f6ccbe]/10 text-[#f6ccbe] hover:border-[#f6ccbe]/45"
                    }`}
                    onClick={() => onSeekFrame(frame.frameIndex)}
                  >
                    <span className="font-mono">frame {frame.frameIndex}</span>
                    <span className="text-secondary">
                      {" "}· {frame.failures[0]?.code ?? frame.status}
                      {" "}· {frame.failures[0]?.nextFixArea ?? "review motion pipeline"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {currentReplayStudioPrimaryFailure ? (
              <div
                className={`mt-2 rounded-[6px] border px-2 py-1.5 text-[11px] ${
                  currentReplayStudioFrameVerdict?.status === "blocked"
                    ? "border-[#ff8f8f]/25 bg-[#ff8f8f]/10 text-[#ffb0b0]"
                    : "border-[#f6ccbe]/20 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                }`}
                data-testid="movement-replay-current-frame-failure"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono">{currentReplayStudioPrimaryFailure.code}</span>
                  <span className="font-mono uppercase">
                    {currentReplayStudioFrameVerdict?.status ?? "review"}
                  </span>
                </div>
                <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-secondary">
                  <dt>Source</dt>
                  <dd className="truncate text-right font-mono">
                    {currentReplayStudioFrameVerdict?.source.readiness ?? "--"}
                    {" "}q{formatNumber(currentReplayStudioFrameVerdict?.source.sourceQuality)}
                  </dd>
                  <dt>Expected</dt>
                  <dd className="truncate text-right font-mono">
                    {currentReplayStudioFrameVerdict?.expected.motion ?? "--"}
                    {currentReplayStudioFrameVerdict?.expected.side
                      ? ` ${currentReplayStudioFrameVerdict.expected.side}`
                      : ""}
                  </dd>
                  <dt>Actual</dt>
                  <dd className="truncate text-right font-mono">
                    lower {formatNumber(currentReplayStudioFrameVerdict?.actual.lowerBodyDirectionError ?? undefined)}
                    {" "}· upper {formatNumber(currentReplayStudioFrameVerdict?.actual.upperBodyDirectionError ?? undefined)}
                  </dd>
                  <dt>Owners</dt>
                  <dd
                    className="truncate text-right font-mono"
                    title={`${currentReplayStudioFrameVerdict?.actual.lowerOwner ?? "--"} · ${currentReplayStudioFrameVerdict?.actual.feetOwner ?? "--"}`}
                  >
                    {currentReplayStudioFrameVerdict?.actual.lowerOwner ?? "--"}
                    {" "}· {currentReplayStudioFrameVerdict?.actual.feetOwner ?? "--"}
                  </dd>
                  <dt>Support</dt>
                  <dd
                    className="truncate text-right font-mono"
                    title={`${currentReplayStudioFrameVerdict?.actual.supportIntent ?? "--"} · ${currentReplayStudioFrameVerdict?.actual.supportPresentation ?? "--"}`}
                  >
                    {currentReplayStudioFrameVerdict?.actual.supportIntent ?? "--"}
                    {" "}· {currentReplayStudioFrameVerdict?.actual.supportPresentation ?? "--"}
                  </dd>
                  <dt>Fix area</dt>
                  <dd className="truncate text-right font-mono" title={currentReplayStudioPrimaryFailure.nextFixArea}>
                    {currentReplayStudioPrimaryFailure.nextFixArea}
                  </dd>
                </dl>
              </div>
            ) : null}
            {avatarFollowSessionFailures.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {avatarFollowSessionFailures.slice(0, 3).map((failure, index) => (
                  <div
                    key={`${failure.code}-${index}`}
                    className={`rounded-[6px] border px-2 py-1 text-[11px] ${
                      failure.severity === "error"
                        ? "border-[#ff8f8f]/25 bg-[#ff8f8f]/10 text-[#ffb0b0]"
                        : "border-[#f6ccbe]/20 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                    }`}
                    data-avatar-follow-issue-severity={failure.severity}
                    data-testid="movement-replay-avatar-follow-issue"
                  >
                    <span className="font-mono">{failure.code}</span>
                    <span className="text-secondary"> · {failure.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 border-t border-border-dim pt-2" data-testid="movement-replay-avatar-follow-criteria">
              <div className="grid gap-1.5 text-[11px]">
                {avatarFollowCriteria.map((criterion) => (
                  <div
                    key={criterion.key}
                    className="grid grid-cols-[88px_64px_minmax(0,1fr)] items-center gap-2"
                    data-avatar-follow-criterion={criterion.key}
                    data-avatar-follow-criterion-status={criterion.status}
                  >
                    <span className="text-muted">{criterion.label}</span>
                    <span className={`text-right font-mono uppercase ${avatarFollowCriterionClass(criterion.status)}`}>
                      {criterion.status}
                    </span>
                    <span className="truncate text-right font-mono text-secondary" title={criterion.metric}>
                      {criterion.metric}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 border-t border-border-dim pt-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Frame Diagnostics</h3>
            <span className="font-mono text-xs text-secondary">frame {safeFrameIndex}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted">Owners</dt>
            <dd className="text-right font-mono text-secondary">
              h {currentFallbacks?.head ?? "--"} · t {currentFallbacks?.spine ?? "--"}
            </dd>
            <dt className="text-muted">Lower / feet</dt>
            <dd className="text-right font-mono text-secondary">
              {liveLowerOwner ?? "--"} · {liveFeetOwner ?? "--"}
            </dd>
            <dt className="text-muted">Arms</dt>
            <dd className="text-right font-mono text-secondary">
              L {currentFallbacks?.leftArm ?? "--"} · R {currentFallbacks?.rightArm ?? "--"}
            </dd>
            <dt className="text-muted">Confidence</dt>
            <dd className="text-right font-mono text-secondary">
              h {formatNumber(currentBodyConfidence?.head)} · t {formatNumber(currentBodyConfidence?.torso)}
            </dd>
            <dt className="text-muted">Spine drive</dt>
            <dd className="text-right font-mono text-secondary">
              b {formatNumber(currentSpineDrive?.sideBend)} · l {formatNumber(currentSpineDrive?.forwardLean)}
            </dd>
            <dt className="text-muted">Avatar upper</dt>
            <dd className="text-right font-mono text-secondary">
              e {formatNumber(currentAvatarVisual?.averageUpperBodyDirectionError)} · s {currentAvatarVisual?.comparedUpperBodySegments ?? "--"}
            </dd>
            <dt className="text-muted">Arm / leg / foot</dt>
            <dd className="text-right font-mono text-secondary">
              {formatNumber(armConfidence)} · {formatNumber(legConfidence)} · {formatNumber(footConfidence)}
            </dd>
            <dt className="text-muted">Retarget</dt>
            <dd className="text-right font-mono text-secondary">
              q {formatNumber(currentRetarget?.sourceQuality ?? currentFrame?.retarget?.sourceQuality)} · upper {currentRetarget?.appliedUpperBody ?? "--"}/{currentRetarget?.totalUpperBody ?? "--"} · lower {currentRetarget?.appliedLowerBody ?? "--"}/{currentRetarget?.totalLowerBody ?? "--"}
            </dd>
            <dt className="text-muted">Knees</dt>
            <dd className="text-right font-mono text-secondary">
              {formatNumber(currentRetarget?.leftKneeLift ?? currentFrame?.retarget?.leftKneeLift)} / {formatNumber(currentRetarget?.rightKneeLift ?? currentFrame?.retarget?.rightKneeLift)}
            </dd>
            <dt className="text-muted">Head source</dt>
            <dd className="text-right font-mono text-secondary">
              {currentAvatarDebug?.headRaw.source ?? "--"} / {formatNumber(currentAvatarDebug?.headRaw.confidence)}
            </dd>
            <dt className="text-muted">Head raw</dt>
            <dd className="text-right font-mono text-secondary">{formatAnglesCompact(currentAvatarDebug?.headRaw)}</dd>
            <dt className="text-muted">Head applied</dt>
            <dd className="text-right font-mono text-secondary">{formatAnglesCompact(currentAvatarDebug?.headApplied)}</dd>
          </dl>
          <div
            className="mt-3 rounded-[8px] border border-border-dim bg-background/35 p-2"
            data-testid="movement-replay-game-path"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Game Decision</h3>
              <span
                className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                  gamePathParityNeedsReview
                    ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                    : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                }`}
              >
                {gamePathParityLabel}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Replay lower / feet</dt>
              <dd className="text-right font-mono text-secondary">
                {replayLowerOwner ?? "--"} · {replayFeetOwner ?? "--"}
              </dd>
              <dt className="text-muted">Game lower / feet</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame
                  ? `${currentGamePathFrame.lowerOwner} · ${currentGamePathFrame.feetOwner}`
                  : "--"}
              </dd>
              <dt className="text-muted">Target stage</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame?.lowerBodyTargetStage ?? "--"}
              </dd>
              <dt className="text-muted">Game squat / hip</dt>
              <dd className="text-right font-mono text-secondary">
                {formatNumber(currentGamePathFrame?.squatDepth)} / {formatNumber(currentGamePathFrame?.hipDrop)}
              </dd>
              <dt className="text-muted">Game knees</dt>
              <dd className="text-right font-mono text-secondary">
                {formatNumber(currentGamePathFrame?.leftKneeLift)} / {formatNumber(currentGamePathFrame?.rightKneeLift)}
              </dd>
              <dt className="text-muted">Game drive</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame
                  ? `${currentGamePathFrame.shouldDrivePlayerSquat ? "squat" : currentGamePathFrame.shouldDrivePlayerLegRaise ? "leg" : "neutral"} · drop ${formatNumber(currentGamePathFrame.visualRootDrop)}`
                  : "--"}
              </dd>
              <dt className="text-muted">Game pose</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame?.exercisePoseLabel ?? "--"}
              </dd>
              <dt className="text-muted">Game support</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame
                  ? `${currentGamePathFrame.supportIntentLabel} · ${currentGamePathFrame.supportConstraintStatus} · ${currentGamePathFrame.supportContactOwner}`
                  : "--"}
              </dd>
              <dt className="text-muted">Game transition</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame?.exerciseTransitionLabel ?? "--"}
              </dd>
              <dt className="text-muted">Jump response</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame
                  ? `${currentGamePathFrame.rootMotionJumpResponseOwner} · ${formatNumber(currentGamePathFrame.rootMotionJumpResponseHeightOffset)}`
                  : "--"}
              </dd>
              <dt className="text-muted">Step response</dt>
              <dd className="text-right font-mono text-secondary">
                {currentGamePathFrame
                  ? `${currentGamePathFrame.rootMotionStepResponseOwner} · ${formatNumber(currentGamePathFrame.rootMotionStepResponseFootLiftOffset)}`
                  : "--"}
              </dd>
            </dl>
            <div
              className="mt-3 border-t border-border-dim pt-3"
              data-testid="movement-replay-physical-path"
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Physical Path</h4>
                <span
                  className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                    rootMotionNeedsReview
                      ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                      : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                  }`}
                >
                  {rootMotionLabel}
                </span>
              </div>
              <svg
                aria-hidden="true"
                className="mt-2 h-14 w-full overflow-visible border border-border-dim bg-black/25"
                preserveAspectRatio="none"
                viewBox="0 0 100 54"
              >
                <line x1="10" x2="90" y1="27" y2="27" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                <line x1="50" x2="50" y1="10" y2="44" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
                {rootPathStrip.polyline ? (
                  <polyline
                    fill="none"
                    points={rootPathStrip.polyline}
                    stroke="#a8d5ba"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                ) : null}
                {currentRootPathPoint ? (
                  <circle
                    cx={currentRootPathPoint.px}
                    cy={currentRootPathPoint.py}
                    fill="#f6ccbe"
                    r="2.6"
                  />
                ) : null}
              </svg>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted">Source</dt>
                <dd className="text-right font-mono text-secondary">
                  {currentRootMotionFrame?.debug.source ?? "--"}
                </dd>
                <dt className="text-muted">Intent</dt>
                <dd className="text-right font-mono text-secondary">
                  {currentRootMotionFrame
                    ? `${currentRootMotionFrame.intent.label} · ${currentRootMotionFrame.intent.travelDirection}`
                    : "--"}
                </dd>
                <dt className="text-muted">Heading</dt>
                <dd className="text-right font-mono text-secondary">
                  {formatAngleDegrees(currentRootMotionFrame?.headingYaw)} · q {formatNumber(currentRootMotionFrame?.headingConfidence)}
                </dd>
                <dt className="text-muted">Root X/Z</dt>
                <dd className="text-right font-mono text-secondary">
                  {currentRootMotionFrame
                    ? `${formatNumber(currentRootMotionFrame.rootPosition.x)} / ${formatNumber(currentRootMotionFrame.rootPosition.z)}`
                    : "--"}
                </dd>
                <dt className="text-muted">Path / q</dt>
                <dd className="text-right font-mono text-secondary">
                  {formatNumber(currentRootPathDistance)} / {formatNumber(currentRootMotionFrame?.rootPositionConfidence)}
                </dd>
                <dt className="text-muted">Feet</dt>
                <dd className="text-right font-mono text-secondary">
                  {currentRootMotionFrame
                    ? `${currentRootMotionFrame.feet.left.stepPhase} · ${currentRootMotionFrame.feet.right.stepPhase}`
                    : "--"}
                </dd>
                <dt className="text-muted">Plant / swing</dt>
                <dd className="text-right font-mono text-secondary">
                  {currentRootMotionFrame
                    ? `${currentRootMotionFrame.intent.plantedFoot} · ${currentRootMotionFrame.intent.swingFoot}`
                    : "--"}
                </dd>
                <dt className="text-muted">Batch</dt>
                <dd className="text-right font-mono text-secondary">
                  {analysis
                    ? `${analysis.rootMotion.worldLandmarkFrameCount} world · ${analysis.rootMotion.sourceLimitedFrameCount} limited`
                    : "--"}
                </dd>
                <dt className="text-muted">Intent counts</dt>
                <dd className="text-right font-mono text-secondary">
                  {analysis
                    ? `t ${analysis.metrics.rootMotionTravelFrameCount} · r ${analysis.metrics.rootMotionTurnFrameCount} · p ${analysis.metrics.rootMotionPivotFrameCount} · s ${analysis.metrics.rootMotionStepEventFrameCount} · j ${analysis.metrics.rootMotionJumpFrameCount}`
                    : "--"}
                </dd>
              </dl>
              {currentRootMotionFrame?.debug.reasons.length ? (
                <div className="mt-2 border-t border-border-dim pt-2 text-[11px] leading-relaxed text-muted">
                  {currentRootMotionFrame.debug.reasons[0]}
                </div>
              ) : null}
            </div>
            <div
              className="mt-3 border-t border-border-dim pt-3"
              data-testid="movement-replay-wrapper-parity"
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Wrapper Parity</h4>
                <span
                  className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
                    replayStudioParity?.label === "diverged"
                      ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                      : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
                  }`}
                >
                  {replayStudioParity?.label ?? "pending"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted">Replay decision</dt>
                <dd className="text-right font-mono text-secondary">
                  {replayStudioParity
                    ? `${replayStudioParity.replay.lowerOwner} · ${replayStudioParity.replay.feetOwner} · ${replayStudioParity.replay.spineOwner}`
                    : "--"}
                </dd>
                <dt className="text-muted">Studio decision</dt>
                <dd className="text-right font-mono text-secondary">
                  {replayStudioParity
                    ? `${replayStudioParity.studio.lowerOwner} · ${replayStudioParity.studio.feetOwner} · ${replayStudioParity.studio.spineOwner}`
                    : "--"}
                </dd>
                <dt className="text-muted">Parity</dt>
                <dd className="text-right font-mono text-secondary">
                  {replayStudioParity
                    ? replayStudioParity.diffs.length === 0
                      ? "matching"
                      : `${replayStudioParity.diffs.length} diff${replayStudioParity.diffs.length === 1 ? "" : "s"}`
                    : "--"}
                </dd>
              </dl>
              {replayStudioParity && replayStudioParity.diffs.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1">
                  {replayStudioParity.diffs.slice(0, 4).map((diff) => (
                    <div
                      key={diff}
                      className="rounded-[6px] border border-[#f6ccbe]/20 bg-[#f6ccbe]/10 px-2 py-1 font-mono text-[10px] text-[#f6ccbe]"
                    >
                      {diff}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <details className="mt-3 rounded-[8px] border border-border-dim bg-background/35 p-2 text-xs text-secondary">
            <summary className="cursor-pointer font-semibold uppercase tracking-wide text-muted">
              Raw points
            </summary>
            <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono">
              <dt>Nose</dt>
              <dd className="truncate">{formatPoint(currentNose)}</dd>
              <dt>Left ear</dt>
              <dd className="truncate">{formatPoint(currentLeftEar)}</dd>
              <dt>Right ear</dt>
              <dd className="truncate">{formatPoint(currentRightEar)}</dd>
            </dl>
          </details>
        </div>

        <div className="mt-2 border-t border-border-dim pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Frame Flags</h3>
          <div className="mt-2 flex flex-col gap-2">
            {currentFrameFailures.length === 0 ? (
              <div className="rounded-[8px] border border-[#a8d5ba]/20 bg-[#a8d5ba]/10 p-2 text-xs text-[#a8d5ba]">
                No current-code flags.
              </div>
            ) : currentFrameFailures.map((failure, index) => (
              <div
                key={`${failure.code}-${index}`}
                className="rounded-[8px] border border-[#f6ccbe]/20 bg-[#f6ccbe]/10 p-2 text-xs text-[#f6ccbe]"
              >
                <div className="font-mono">{failure.code}</div>
                <div className="mt-1 text-secondary">{failure.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
  );
}
