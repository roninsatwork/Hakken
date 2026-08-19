"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  canReplay,
  formatRunDuration,
  formatSignedCurrencyDelta,
  formatSignedDurationDelta,
  formatSignedNumberDelta,
  getStatusTone,
  getStepDiffTone,
  getStepTone,
  type ReplayMode,
} from "@/src/app/(dashboard)/admin/agents/_lib/runStatusRules";
import { formatMoney } from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { describeStepKind, describeStepStatus } from "@/src/app/(dashboard)/admin/agents/_lib/jobWaterfall";
import type { AdminActionRunner } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/atoms/Button";
import { STATUS_TONE_CLASSES } from "@/src/ui/atoms/statusTone";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

/**
 * One job, opened for acting on: replay it, learn from it, turn it into a
 * check, and read what it did step by step.
 *
 * The detail query lives here and is skipped until a run is selected, so the
 * list never pays for a detail nobody has opened. The write handlers come in
 * from the page because the row menu offers the same actions — one handler,
 * one toast, wherever it is triggered from.
 */
export function RunDetailModal({
  agentId,
  detailRunId,
  onClose,
  onInspectRun,
  action,
  onReplay,
  onReflect,
  onCreateEvalFixture,
}: {
  agentId: Id<"agents">;
  detailRunId: Id<"agentRuns"> | null;
  onClose: () => void;
  onInspectRun: (runId: Id<"agentRuns"> | null) => void;
  action: AdminActionRunner;
  onReplay: (runId: Id<"agentRuns">, mode: ReplayMode) => void;
  onReflect: (runId: Id<"agentRuns">) => void;
  onCreateEvalFixture: (runId: Id<"agentRuns">) => void;
}) {
  const router = useRouter();
  const runDetail = useQuery(api.agentRuns.getRunDetail, detailRunId ? { runId: detailRunId } : "skip");

  return (
    <SonaeModal
      isOpen={!!detailRunId}
      onClose={onClose}
      title="Job detail"
      size="xl"
    >
      {!detailRunId ? null : runDetail === undefined ? (
        <div className="py-16 flex items-center justify-center text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : runDetail === null ? (
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
          This job could not be found, or it belongs to a workspace you cannot see.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.run.status)]}`}>
                    {runDetail.run.status.replace("_", " ")}
                  </span>
                  <span className="text-[11px] font-mono text-muted">{runDetail.run.triggerType}</span>
                  {runDetail.run.isRehearsal && (
                    <span className="rounded-[4px] border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                      Rehearsal — writes recorded, not performed
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-muted">{formatDateTime(runDetail.run.startedAt)}</span>
                  {runDetail.run.completedAt && (
                    <span className="text-[11px] font-mono text-muted">
                      {formatRunDuration(runDetail.run.completedAt - runDetail.run.startedAt)}
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-foreground leading-relaxed mt-3">{runDetail.run.objective}</p>
                {/* This modal is for acting on a run — replay it, learn from
                    it, turn it into a check. Reading where its time went is a
                    different job, and it has its own screen. */}
                <button
                  type="button"
                  onClick={() => router.push(`/admin/agents/${agentId}/observability/${runDetail.run._id}`)}
                  className="text-[12px] text-brand hover:underline mt-2"
                >
                  See where the time went
                </button>
              </div>
              <div className="text-[11px] font-mono text-muted md:text-right flex flex-col gap-1 shrink-0">
                <span>run: {runDetail.run._id}</span>
                {runDetail.run.agentVersionId && <span>version: {runDetail.run.agentVersionId}</span>}
                {runDetail.run.modelId && <span>model: {runDetail.run.modelId}</span>}
              </div>
            </div>

            {(runDetail.run.finalOutput || runDetail.run.error) && (
              <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                  {runDetail.run.error ? "Error" : "Final output"}
                </div>
                <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${runDetail.run.error ? "text-destructive" : "text-secondary"}`}>
                  {runDetail.run.error || runDetail.run.finalOutput}
                </p>
              </div>
            )}
          </div>

          <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[12px] uppercase tracking-widest text-muted">What you can do with this job</h3>
              <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                {runDetail.evalFixtureContext.activeCount > 0
                  ? `This run is covered by ${runDetail.evalFixtureContext.activeCount} active eval fixture${runDetail.evalFixtureContext.activeCount === 1 ? "" : "s"}.`
                  : runDetail.evalFixtureContext.canCreateFromRun
                    ? "Turn this job into a check, so this exact case is tested from now on."
                    : "A job can become a check once it has finished."}
              </p>
              {runDetail.evalFixtureContext.fixtures.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {runDetail.evalFixtureContext.fixtures.map((fixture) => (
                    <span key={fixture.fixtureId} className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${
                      fixture.status === "ACTIVE"
                        ? "border-info/20 bg-info/10 text-info"
                        : "border-border-dim bg-white/[0.03] text-muted"
                    }`}>
                      {fixture.type.toLowerCase().replaceAll("_", " ")} {fixture.status.toLowerCase()}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {canReplay(runDetail.run.status) && (
                <Button
                  variant="accent"
                  onClick={() => onReplay(runDetail.run._id, "CURRENT_ACTIVE")}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Run again now
                </Button>
              )}
              {canReplay(runDetail.run.status) && runDetail.run.agentVersionId && (
                <button
                  type="button"
                  onClick={() => onReplay(runDetail.run._id, "SAME_VERSION")}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                  Run again as it was
                </button>
              )}
              {canReplay(runDetail.run.status) && (
                <button
                  type="button"
                  onClick={() => onReflect(runDetail.run._id)}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                  Ask what it would change
                </button>
              )}
              {runDetail.evalFixtureContext.canCreateFromRun && (
                <WriteButton
                  type="button"
                  onClick={() => onCreateEvalFixture(runDetail.run._id)}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                  {runDetail.evalFixtureContext.activeCount > 0 ? "Update eval" : "Create eval"}
                </WriteButton>
              )}
            </div>
          </div>

          {(runDetail.replayContext.sourceRun || runDetail.replayContext.replayRuns.length > 0) && (
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-[12px] uppercase tracking-widest text-muted">Other times this job was run</h3>
                  <p className="text-[12px] text-secondary mt-1">
                    How this job went the other times it was run.
                  </p>
                </div>
                {runDetail.run.replayMode && (
                  <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info self-start">
                    {runDetail.run.replayMode.replace("_", " ").toLowerCase()}
                  </span>
                )}
              </div>

              {runDetail.replayContext.sourceRun && runDetail.replayContext.comparison && (
                <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Replay of</div>
                      <button
                        type="button"
                        onClick={() => onInspectRun(runDetail.replayContext.sourceRun?.runId || null)}
                        className="text-[13px] text-brand hover:text-brand-light transition-colors text-left break-all"
                      >
                        {runDetail.replayContext.sourceRun.runId}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.replayContext.sourceRun.status)]}`}>
                        original {runDetail.replayContext.sourceRun.status.replace("_", " ")}
                      </span>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStatusTone(runDetail.replayContext.comparison.replayStatus)]}`}>
                        replay {runDetail.replayContext.comparison.replayStatus.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    {[
                      { label: "Latency", value: formatSignedDurationDelta(runDetail.replayContext.comparison.latencyDeltaMs) },
                      { label: "Cost", value: formatSignedCurrencyDelta(runDetail.replayContext.comparison.costDeltaGBP) },
                      { label: "Tokens", value: formatSignedNumberDelta(runDetail.replayContext.comparison.tokenDelta) },
                      { label: "Steps", value: formatSignedNumberDelta(runDetail.replayContext.comparison.stepCountDelta) },
                      {
                        label: "Output",
                        value: runDetail.replayContext.comparison.outputChanged ? "changed" : "same",
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{item.label}</div>
                        <div className="text-[13px] text-foreground font-semibold mt-1 truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {runDetail.replayContext.timelineDiff.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Timeline diff</div>
                      {runDetail.replayContext.timelineDiff.map((diff) => (
                        <div key={diff.stepIndex} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-3 flex flex-col gap-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                                step {diff.stepIndex}
                              </span>
                              <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStepDiffTone(diff.changeType)]}`}>
                                {diff.changeType.toLowerCase()}
                              </span>
                              {diff.durationDeltaMs !== undefined && (
                                <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-muted">
                                  {formatSignedDurationDelta(diff.durationDeltaMs)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                              {diff.kindChanged && <span>kind</span>}
                              {diff.statusChanged && <span>status</span>}
                              {diff.outputChanged && <span>output</span>}
                              {diff.errorChanged && <span>error</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                              <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">Original</div>
                              {diff.source ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.source.kind.replace("_", " ")}</span>
                                    <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.source.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                                      {diff.source.status}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.source.summary}</p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted">No matching original step.</p>
                              )}
                            </div>
                            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                              <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">Replay</div>
                              {diff.replay ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.replay.kind.replace("_", " ")}</span>
                                    <span className={`text-[10px] uppercase font-mono tracking-widest ${diff.replay.status === "FAILED" ? "text-destructive" : "text-secondary"}`}>
                                      {diff.replay.status}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.replay.summary}</p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted">No matching replay step.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {runDetail.replayContext.replayRuns.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Recent replays</div>
                  {runDetail.replayContext.replayRuns.map((replay) => (
                    <button
                      key={replay.runId}
                      type="button"
                      onClick={() => onInspectRun(replay.runId)}
                      className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <span className="text-[12px] text-secondary break-all">{replay.runId}</span>
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border self-start sm:self-auto ${STATUS_TONE_CLASSES[getStatusTone(replay.status)]}`}>
                        {replay.status.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">Steps</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.steps.length}</div>
            </div>
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">Tools used</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.toolCalls.length}</div>
            </div>
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">Waiting on people</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.approvals.length}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-[12px] uppercase tracking-widest text-muted">What it did, step by step</h3>
            {runDetail.timeline.length === 0 ? (
              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
                This job did not get far enough to record what it was doing.
              </div>
            ) : (
              runDetail.timeline.map((step) => (
                <div key={step.stepId} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                        {step.stepIndex}. {describeStepKind(step.kind)}
                      </span>
                      <span className={`text-[11px] px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[getStepTone(step.status)]}`}>
                        {describeStepStatus(step.status)}
                      </span>
                      {step.durationMs !== undefined && (
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-muted">
                          {formatRunDuration(step.durationMs)}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-muted">{formatDateTime(step.startedAt)}</span>
                  </div>
                  <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{step.summary}</p>

                  {(step.inputPreview || step.outputPreview || step.errorPreview) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {step.inputPreview && (
                        <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">What we sent</div>
                          <pre className="text-[11px] text-secondary whitespace-pre-wrap overflow-x-auto">{step.inputPreview}</pre>
                        </div>
                      )}
                      {(step.outputPreview || step.errorPreview) && (
                        <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                            {step.errorPreview ? "What went wrong" : "What came back"}
                          </div>
                          <pre className={`text-[11px] whitespace-pre-wrap overflow-x-auto ${step.errorPreview ? "text-destructive" : "text-secondary"}`}>
                            {step.errorPreview || step.outputPreview}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                    {/* Left as tokens. It is the unit this is actually
                        measured in, and calling them words would be plainer
                        but wrong — a token is roughly three quarters of one. */}
                    {step.inputTokens !== undefined && step.outputTokens !== undefined && (
                      <span>{(step.inputTokens + step.outputTokens).toLocaleString("en-GB")} tokens</span>
                    )}
                    {step.costGBP !== undefined && <span>cost {formatMoney(step.costGBP)}</span>}
                  </div>
                  {(step.linkedToolCalls.length > 0 || step.linkedApprovals.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {step.linkedToolCalls.map((toolCall) => (
                        <span key={toolCall.toolCallId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info">
                          tool {toolCall.handlerMapping}: {toolCall.status.toLowerCase().replace("_", " ")}
                        </span>
                      ))}
                      {step.linkedApprovals.map((approval) => (
                        <span key={approval.approvalId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-info/20 bg-info/10 text-info">
                          approval {approval.status.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {runDetail.toolCalls.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Tool calls</h3>
              {runDetail.toolCalls.map((toolCall) => (
                <div key={toolCall._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">{toolCall.normalizedToolName}</div>
                      <div className="text-[11px] font-mono text-muted truncate">{toolCall.handlerMapping}</div>
                    </div>
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${STATUS_TONE_CLASSES[toolCall.status === "SUCCESS" ? "success" : toolCall.status === "FAILED" || toolCall.status === "DENIED" ? "danger" : "info"]}`}>
                      {toolCall.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                    <span>{toolCall.sideEffectLevel.toLowerCase()}</span>
                    <span>{toolCall.requiredRole.toLowerCase()}</span>
                    {toolCall.confirmationRequired && <span>confirmation required</span>}
                    <span>{toolCall.argumentViewMode.toLowerCase()} args</span>
                  </div>
                  <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <div className="text-[10px] uppercase tracking-widest font-mono text-muted">
                        {toolCall.argumentViewMode === "RAW" ? "Raw arguments" : "Redacted arguments"}
                      </div>
                      {toolCall.rawArgumentsAvailable && toolCall.argumentViewMode !== "RAW" && (
                        <span className="text-[10px] uppercase tracking-widest font-mono text-muted">
                          raw restricted
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] text-secondary overflow-x-auto whitespace-pre-wrap">
                      {toolCall.argumentsPreview}
                    </pre>
                  </div>
                  {(toolCall.resultJson || toolCall.error) && (
                    <p className={`text-[12px] leading-relaxed line-clamp-4 ${toolCall.error ? "text-destructive" : "text-secondary"}`}>
                      {toolCall.error || toolCall.resultJson}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {runDetail.approvals.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">Approvals</h3>
              {runDetail.approvals.map((approval) => (
                <div key={approval._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border w-fit ${STATUS_TONE_CLASSES[approval.status === "APPROVED" ? "success" : approval.status === "REJECTED" ? "danger" : "info"]}`}>
                      {approval.status}
                    </span>
                    <span className="text-[11px] font-mono text-muted">{formatDateTime(approval.requestedAt)}</span>
                  </div>
                  {approval.message && <p className="text-[12px] text-secondary leading-relaxed">{approval.message}</p>}
                  {approval.previewJson && (
                    <pre className="text-[11px] text-secondary bg-black/20 border border-border-dim rounded-[8px] p-3 overflow-x-auto whitespace-pre-wrap">
                      {approval.previewJson}
                    </pre>
                  )}
                  {approval.decisionReason && (
                    <p className="text-[12px] text-secondary leading-relaxed">
                      <span className="text-muted font-mono">decision:</span> {approval.decisionReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SonaeModal>
  );
}
