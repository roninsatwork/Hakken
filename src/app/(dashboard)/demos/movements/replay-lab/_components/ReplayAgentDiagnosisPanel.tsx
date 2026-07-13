import type { ReplayStudioRepairPacket } from "../../_lib/movementReplayStudioRepairPacket";
import type { ReplayAgentDiagnosisNavigationTarget } from "../_lib/replayAgentDiagnosisNavigation";
import { formatNumber } from "../_lib/replayLabHelpers";

type ReplayAgentDiagnosisPanelProps = {
  navigationTargets?: ReplayAgentDiagnosisNavigationTarget[];
  onSeekFrame?: (frameIndex: number) => void;
  repairPacket: ReplayStudioRepairPacket;
};

export default function ReplayAgentDiagnosisPanel({
  navigationTargets = [],
  onSeekFrame,
  repairPacket,
}: ReplayAgentDiagnosisPanelProps) {
  const actualLowerError = typeof repairPacket.actual.bones.lowerBodyDirectionError === "number"
    ? formatNumber(repairPacket.actual.bones.lowerBodyDirectionError)
    : "--";
  const artifact = repairPacket.artifact;
  const artifactFreshness = artifact?.freshness;
  const artifactFreshnessStatus = artifactFreshness?.status ?? "unknown";
  const artifactFreshnessTitle = [
    artifactFreshness?.reason,
    artifact?.refreshCommand ? `Refresh: ${artifact.refreshCommand}` : null,
  ].filter(Boolean).join(" ");
  const artifactFreshnessClass = artifactFreshnessStatus === "current" ||
    artifactFreshnessStatus === "not-required" ||
    artifactFreshnessStatus === "recomputed"
    ? "text-secondary"
    : "text-[#f6ccbe]";

  return (
    <div
      className="mt-2 rounded-[8px] border border-border-dim bg-black/20 p-2"
      data-testid="movement-replay-agent-diagnosis"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Agent Diagnosis</h3>
        <span
          className={`rounded-[6px] border px-2 py-0.5 font-mono text-[10px] uppercase ${
            repairPacket.verdict.status === "blocked"
              ? "border-[#ff8f8f]/35 bg-[#ff8f8f]/10 text-[#ffb0b0]"
              : repairPacket.verdict.status === "review-only" || repairPacket.verdict.status === "not-supported"
                ? "border-[#f6ccbe]/35 bg-[#f6ccbe]/10 text-[#f6ccbe]"
                : "border-[#a8d5ba]/25 bg-[#a8d5ba]/10 text-[#a8d5ba]"
          }`}
          data-testid="movement-replay-agent-diagnosis-status"
        >
          {repairPacket.verdict.status}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted">Failure</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-failure"
          title={repairPacket.verdict.failureCode}
        >
          {repairPacket.verdict.failureCode}
        </dd>
        <dt className="text-muted">Stage</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-stage"
          title={repairPacket.divergence.firstDivergentStage}
        >
          {repairPacket.divergence.firstDivergentStage}
        </dd>
        <dt className="text-muted">Source</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-source"
          title={`${repairPacket.source.motion} ${repairPacket.source.anatomicalSide ?? "unknown"}`}
        >
          {repairPacket.source.motion} {repairPacket.source.anatomicalSide ?? "unknown"} q{" "}
          {formatNumber(repairPacket.source.quality)}
        </dd>
        <dt className="text-muted">Expected</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-expected"
          title={`${repairPacket.expected.avatarRole} ${repairPacket.expected.avatarSide ?? "unknown"} ${repairPacket.expected.anatomicalMapping}`}
        >
          {repairPacket.expected.avatarRole} {repairPacket.expected.avatarSide ?? "unknown"}{" "}
          {repairPacket.expected.anatomicalMapping}
        </dd>
        <dt className="text-muted">Actual</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-actual"
          title={`lower ${repairPacket.actual.owners.lower ?? "unknown"} / feet ${repairPacket.actual.owners.feet ?? "unknown"} / err ${actualLowerError}`}
        >
          lower {repairPacket.actual.owners.lower ?? "unknown"} / feet{" "}
          {repairPacket.actual.owners.feet ?? "unknown"} / err {actualLowerError}
        </dd>
        <dt className="text-muted">Evidence</dt>
        <dd className="text-right font-mono text-secondary">
          {repairPacket.verdict.evidenceStatus} &middot; q {formatNumber(repairPacket.verdict.confidence)}
        </dd>
        <dt className="text-muted">Frame scope</dt>
        <dd className="text-right font-mono text-secondary">
          {repairPacket.scope.frameStart}-{repairPacket.scope.frameEnd}
          {" "}&middot; skip {repairPacket.scope.silentSkipCount}
        </dd>
        <dt className="text-muted">Coverage</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-coverage"
          title={`${repairPacket.scope.totalFramesRendered} rendered / ${repairPacket.scope.totalFramesExpected} expected / ${repairPacket.scope.totalFramesCompared} compared`}
        >
          {repairPacket.scope.totalFramesRendered}/{repairPacket.scope.totalFramesExpected} rendered
          {" "}&middot; {repairPacket.scope.totalFramesCompared} compared
        </dd>
        <dt className="text-muted">Source hash</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-source-hash"
          title={repairPacket.recording.sourceHash}
        >
          {repairPacket.recording.sourceHash}
        </dd>
        <dt className="text-muted">Pipeline</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-pipeline"
          title={repairPacket.code.motionPipelineFingerprint}
        >
          {repairPacket.code.motionPipelineFingerprint}
        </dd>
        <dt className="text-muted">Generated</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-generated-at"
          title={repairPacket.generatedAt}
        >
          {repairPacket.generatedAt}
        </dd>
        <dt className="text-muted">Artifact</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          data-testid="movement-replay-agent-diagnosis-artifact"
          title={artifact?.path ?? "none"}
        >
          {artifact?.kind ?? "none"}
        </dd>
        <dt className="text-muted">Freshness</dt>
        <dd
          className={`truncate text-right font-mono ${artifactFreshnessClass}`}
          data-testid="movement-replay-agent-diagnosis-artifact-freshness"
          title={artifactFreshnessTitle || artifactFreshnessStatus}
        >
          {artifactFreshnessStatus}
        </dd>
        <dt className="text-muted">Likely file</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          title={repairPacket.repair.likelyFiles[0] ?? "none"}
        >
          {repairPacket.repair.likelyFiles[0] ?? "none"}
        </dd>
        <dt className="text-muted">Focused test</dt>
        <dd
          className="truncate text-right font-mono text-secondary"
          title={repairPacket.repair.focusedTests[0] ?? "none"}
        >
          {repairPacket.repair.focusedTests[0] ?? "none"}
        </dd>
      </dl>
      <div
        className="mt-2 truncate rounded-[6px] border border-border-dim bg-background/45 px-2 py-1 font-mono text-[11px] text-secondary"
        data-testid="movement-replay-agent-diagnosis-command"
        title={repairPacket.commands.reproduce}
      >
        {repairPacket.commands.reproduce}
      </div>
      {navigationTargets.length > 0 ? (
        <div
          className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3"
          data-testid="movement-replay-agent-diagnosis-targets"
        >
          {navigationTargets.map((target) => (
            <button
              key={target.key}
              type="button"
              className="rounded-[6px] border border-border-dim bg-background/45 px-2 py-1 text-left text-[11px] text-secondary transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              data-frame-index={target.frameIndex}
              data-testid={`movement-replay-agent-diagnosis-target-${target.key}`}
              disabled={!onSeekFrame}
              onClick={() => onSeekFrame?.(target.frameIndex)}
              title={`Frame ${target.frameIndex}: ${target.detail}`}
            >
              <span className="block font-mono text-foreground">f{target.frameIndex}</span>
              <span className="block truncate">{target.label}</span>
              <span className="block truncate font-mono text-[10px] text-muted">{target.detail}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
