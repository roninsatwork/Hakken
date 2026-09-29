"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCheck, Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/src/lib/dates";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
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
import { formatMoney, type LabelRef } from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { describeStepKind, describeStepStatus } from "@/src/app/(dashboard)/admin/agents/_lib/jobWaterfall";
import type { AdminActionRunner } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
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
  const t = useTranslations("admin.agents.details.runs.detail");
  const tLabels = useTranslations("admin.agents.labels");
  // The pure rules return catalogue keys, not words; this says them.
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const router = useRouter();
  const runDetail = useQuery(api.agentRuns.getRunDetail, detailRunId ? { runId: detailRunId } : "skip");

  return (
    <HakkenModal
      isOpen={!!detailRunId}
      onClose={onClose}
      title={t("title")}
      size="xl"
    >
      {!detailRunId ? null : runDetail === undefined ? (
        <div className="py-16 flex items-center justify-center text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : runDetail === null ? (
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
          {t("notFound")}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusLabel
                    tone={getStatusTone(runDetail.run.status)}
                    icon={runDetail.run.status === "PENDING_APPROVAL" ? "approval" : undefined}
                    size="md"
                  >
                    {runDetail.run.status.replace("_", " ")}
                  </StatusLabel>
                  <span className="text-[11px] font-mono text-muted">{runDetail.run.triggerType}</span>
                  {runDetail.run.isRehearsal && (
                    <StatusLabel tone="info" size="md">{t("rehearsalNote")}</StatusLabel>
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
                {/* Stays raw: an inline brand text link drawn as a button — matches no variant. */}
                <button
                  type="button"
                  onClick={() => router.push(`/admin/agents/${agentId}/observability/${runDetail.run._id}`)}
                  className="text-[12px] text-brand hover:underline mt-2"
                >
                  {t("seeTime")}
                </button>
              </div>
              <div className="text-[11px] font-mono text-muted md:text-right flex flex-col gap-1 shrink-0">
                <span>{t("runId", { id: runDetail.run._id })}</span>
                {runDetail.run.agentVersionId && <span>{t("version", { id: runDetail.run.agentVersionId })}</span>}
                {runDetail.run.modelId && <span>{t("model", { id: runDetail.run.modelId })}</span>}
              </div>
            </div>

            {(runDetail.run.finalOutput || runDetail.run.error) && (
              <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                  {runDetail.run.error ? t("error") : t("finalOutput")}
                </div>
                <p className={`text-[12px] leading-relaxed whitespace-pre-wrap ${runDetail.run.error ? "text-destructive" : "text-secondary"}`}>
                  {runDetail.run.error || runDetail.run.finalOutput}
                </p>
              </div>
            )}
          </div>

          <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[12px] uppercase tracking-widest text-muted">{t("whatYouCanDo")}</h3>
              <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                {runDetail.evalFixtureContext.activeCount > 0
                  ? t("covered", { count: runDetail.evalFixtureContext.activeCount })
                  : runDetail.evalFixtureContext.canCreateFromRun
                    ? t("turnIntoCheck")
                    : t("canBecomeCheck")}
              </p>
              {runDetail.evalFixtureContext.fixtures.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {runDetail.evalFixtureContext.fixtures.map((fixture) => (
                    <StatusLabel key={fixture.fixtureId} tone={fixture.status === "ACTIVE" ? "info" : "neutral"} className="capitalize">
                      {fixture.type.toLowerCase().replaceAll("_", " ")} {fixture.status.toLowerCase()}
                    </StatusLabel>
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
                  {t("runAgainNow")}
                </Button>
              )}
              {canReplay(runDetail.run.status) && runDetail.run.agentVersionId && (
                // Stays raw: an info-tinted bordered pill — no variant wears the info tone.
                <button
                  type="button"
                  onClick={() => onReplay(runDetail.run._id, "SAME_VERSION")}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                  {t("runAgainAsWas")}
                </button>
              )}
              {canReplay(runDetail.run.status) && (
                // Stays raw: an info-tinted bordered pill — no variant wears the info tone.
                <button
                  type="button"
                  onClick={() => onReflect(runDetail.run._id)}
                  disabled={action.isBusy(runDetail.run._id)}
                  className="px-3 py-2 rounded-[8px] border border-info/20 bg-info/10 text-info text-[12px] font-semibold hover:bg-info/15 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {action.isBusy(runDetail.run._id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                  {t("askChange")}
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
                  {runDetail.evalFixtureContext.activeCount > 0 ? t("updateEval") : t("createEval")}
                </WriteButton>
              )}
            </div>
          </div>

          {(runDetail.replayContext.sourceRun || runDetail.replayContext.replayRuns.length > 0) && (
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-[12px] uppercase tracking-widest text-muted">{t("otherTimes")}</h3>
                  <p className="text-[12px] text-secondary mt-1">
                    {t("otherTimesHint")}
                  </p>
                </div>
                {runDetail.run.replayMode && (
                  <TagLabel className="self-start capitalize">
                    {runDetail.run.replayMode.replace("_", " ").toLowerCase()}
                  </TagLabel>
                )}
              </div>

              {runDetail.replayContext.sourceRun && runDetail.replayContext.comparison && (
                <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-3">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{t("replayOf")}</div>
                      {/* Stays raw: an inline brand text link drawn as a button — matches no variant. */}
                      <button
                        type="button"
                        onClick={() => onInspectRun(runDetail.replayContext.sourceRun?.runId || null)}
                        className="text-[13px] text-brand hover:text-brand-light transition-colors text-left break-all"
                      >
                        {runDetail.replayContext.sourceRun.runId}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusLabel tone={getStatusTone(runDetail.replayContext.sourceRun.status)} className="capitalize">
                        {t("originalStatus", { status: runDetail.replayContext.sourceRun.status.replace("_", " ").toLowerCase() })}
                      </StatusLabel>
                      <StatusLabel tone={getStatusTone(runDetail.replayContext.comparison.replayStatus)} className="capitalize">
                        {t("replayStatus", { status: runDetail.replayContext.comparison.replayStatus.replace("_", " ").toLowerCase() })}
                      </StatusLabel>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    {[
                      { label: t("deltas.latency"), value: formatSignedDurationDelta(runDetail.replayContext.comparison.latencyDeltaMs) ?? tLabels("notAvailable") },
                      { label: t("deltas.cost"), value: formatSignedCurrencyDelta(runDetail.replayContext.comparison.costDeltaUsd) ?? tLabels("notAvailable") },
                      { label: t("deltas.tokens"), value: formatSignedNumberDelta(runDetail.replayContext.comparison.tokenDelta) ?? tLabels("notAvailable") },
                      { label: t("deltas.steps"), value: formatSignedNumberDelta(runDetail.replayContext.comparison.stepCountDelta) ?? tLabels("notAvailable") },
                      {
                        label: t("deltas.output"),
                        value: runDetail.replayContext.comparison.outputChanged ? t("deltas.changed") : t("deltas.same"),
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
                      <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{t("timelineDiff")}</div>
                      {runDetail.replayContext.timelineDiff.map((diff) => (
                        <div key={diff.stepIndex} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-3 flex flex-col gap-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <TagLabel className="capitalize">{t("step", { index: diff.stepIndex })}</TagLabel>
                              <StatusLabel tone={getStepDiffTone(diff.changeType)} className="capitalize">
                                {diff.changeType.toLowerCase()}
                              </StatusLabel>
                              {diff.durationDeltaMs !== undefined && (
                                <TagLabel>{formatSignedDurationDelta(diff.durationDeltaMs)}</TagLabel>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                              {diff.kindChanged && <span>{t("kindWord")}</span>}
                              {diff.statusChanged && <span>{t("statusWord")}</span>}
                              {diff.outputChanged && <span>{t("outputWord")}</span>}
                              {diff.errorChanged && <span>{t("errorWord")}</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                              <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">{t("original")}</div>
                              {diff.source ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.source.kind.replace("_", " ")}</span>
                                    <StatusLabel tone={getStepTone(diff.source.status)}>{diff.source.status}</StatusLabel>
                                  </div>
                                  <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.source.summary}</p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted">{t("noOriginalStep")}</p>
                              )}
                            </div>
                            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 min-w-0">
                              <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">{t("replay")}</div>
                              {diff.replay ? (
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{diff.replay.kind.replace("_", " ")}</span>
                                    <StatusLabel tone={getStepTone(diff.replay.status)}>{diff.replay.status}</StatusLabel>
                                  </div>
                                  <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">{diff.replay.summary}</p>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted">{t("noReplayStep")}</p>
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
                  <div className="text-[11px] uppercase tracking-widest font-mono text-muted">{t("recentReplays")}</div>
                  {runDetail.replayContext.replayRuns.map((replay) => (
                    // Stays raw: a whole card row made clickable, status label inside — matches no variant.
                    <button
                      key={replay.runId}
                      type="button"
                      onClick={() => onInspectRun(replay.runId)}
                      className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <span className="text-[12px] text-secondary break-all">{replay.runId}</span>
                      <StatusLabel
                        tone={getStatusTone(replay.status)}
                        icon={replay.status === "PENDING_APPROVAL" ? "approval" : undefined}
                        className="self-start sm:self-auto"
                      >
                        {replay.status.replace("_", " ")}
                      </StatusLabel>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">{t("statSteps")}</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.steps.length}</div>
            </div>
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">{t("statTools")}</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.toolCalls.length}</div>
            </div>
            <div className="border border-border-dim rounded-[14px] bg-card px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">{t("statApprovals")}</div>
              <div className="text-[20px] font-semibold text-foreground mt-1">{runDetail.approvals.length}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-[12px] uppercase tracking-widest text-muted">{t("stepByStep")}</h3>
            {runDetail.timeline.length === 0 ? (
              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
                {t("didNotGetFar")}
              </div>
            ) : (
              runDetail.timeline.map((step) => (
                <div key={step.stepId} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <TagLabel>{step.stepIndex}. {label(describeStepKind(step.kind))}</TagLabel>
                      <StatusLabel tone={getStepTone(step.status)}>
                        {label(describeStepStatus(step.status))}
                      </StatusLabel>
                      {step.durationMs !== undefined && (
                        <TagLabel>{formatRunDuration(step.durationMs)}</TagLabel>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-muted">{formatDateTime(step.startedAt)}</span>
                  </div>
                  <p className="text-[12px] text-secondary leading-relaxed whitespace-pre-wrap">{step.summary}</p>

                  {(step.inputPreview || step.outputPreview || step.errorPreview) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {step.inputPreview && (
                        <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{t("whatWeSent")}</div>
                          <pre className="text-[11px] text-secondary whitespace-pre-wrap overflow-x-auto">{step.inputPreview}</pre>
                        </div>
                      )}
                      {(step.outputPreview || step.errorPreview) && (
                        <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                          <div className="text-[10px] uppercase tracking-widest font-mono text-muted mb-1">
                            {step.errorPreview ? t("whatWentWrong") : t("whatCameBack")}
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
                      <span>{t("tokens", { count: (step.inputTokens + step.outputTokens).toLocaleString("en-GB") })}</span>
                    )}
                    {step.costUsd !== undefined && <span>{t("costLabel", { amount: formatMoney(step.costUsd) })}</span>}
                  </div>
                  {(step.linkedToolCalls.length > 0 || step.linkedApprovals.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {step.linkedToolCalls.map((toolCall) => (
                        // Not capitalised: the handler mapping is an identifier ("knowledge.search").
                        <StatusLabel key={toolCall.toolCallId} tone="info">
                          {t("toolBadge", { mapping: toolCall.handlerMapping, status: toolCall.status.toLowerCase().replace("_", " ") })}
                        </StatusLabel>
                      ))}
                      {step.linkedApprovals.map((approval) => (
                        <StatusLabel key={approval.approvalId} tone="info" className="capitalize">
                          {t("approvalBadge", { status: approval.status.toLowerCase() })}
                        </StatusLabel>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {runDetail.toolCalls.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">{t("toolCalls")}</h3>
              {runDetail.toolCalls.map((toolCall) => (
                <div key={toolCall._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">{toolCall.normalizedToolName}</div>
                      <div className="text-[11px] font-mono text-muted truncate">{toolCall.handlerMapping}</div>
                    </div>
                    <StatusLabel tone={toolCall.status === "SUCCESS" ? "success" : toolCall.status === "FAILED" || toolCall.status === "DENIED" ? "danger" : "info"}>
                      {toolCall.status.replace("_", " ")}
                    </StatusLabel>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
                    <span>{toolCall.sideEffectLevel.toLowerCase()}</span>
                    <span>{toolCall.requiredRole.toLowerCase()}</span>
                    {toolCall.confirmationRequired && <span>{t("confirmationRequired")}</span>}
                    <span>{t("args", { mode: toolCall.argumentViewMode.toLowerCase() })}</span>
                  </div>
                  <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <div className="text-[10px] uppercase tracking-widest font-mono text-muted">
                        {toolCall.argumentViewMode === "RAW" ? t("rawArguments") : t("redactedArguments")}
                      </div>
                      {toolCall.rawArgumentsAvailable && toolCall.argumentViewMode !== "RAW" && (
                        <span className="text-[10px] uppercase tracking-widest font-mono text-muted">
                          {t("rawRestricted")}
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
              <h3 className="text-[12px] uppercase tracking-widest font-mono text-muted">{t("approvals")}</h3>
              {runDetail.approvals.map((approval) => (
                <div key={approval._id} className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <StatusLabel tone={approval.status === "APPROVED" ? "success" : approval.status === "REJECTED" ? "danger" : "info"}>
                      {approval.status}
                    </StatusLabel>
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
                      <span className="text-muted font-mono">{t("decisionLabel")}</span> {approval.decisionReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </HakkenModal>
  );
}
