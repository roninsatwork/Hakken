"use client";

import { useMemo, useState, type ButtonHTMLAttributes, type ComponentType } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  describeInteractionType,
  describeTrigger,
  formatDuration,
  formatMoney,
  formatRelativeTime,
  type LabelRef,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import {
  buildWaterfall,
  describeToolCallSubject,
  humaniseToolName,
  summariseWaterfall,
  type WaterfallRow,
} from "@/src/app/(dashboard)/admin/agents/_lib/jobWaterfall";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";
import { toUserFacingMessage } from "@/src/lib/errors";
import { Button } from "@/src/ui/components/screens/Button";

const TONE_CLASS: Record<WaterfallRow["tone"], string> = {
  thinking: "bg-secondary/40",
  tool: "bg-brand",
  waiting: "bg-warning/70",
  failed: "bg-destructive",
};

type RunDetail = NonNullable<FunctionReturnType<typeof api.agentRuns.getRunDetail>>;

function getRunDisplay(
  objective: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const rightmoveUrl = objective.match(/^Rightmove search URL:\s*(.+)$/m)?.[1]?.trim();
  const propertyLimit = objective.match(/^Gather up to\s+(\d+)\s+properties\./m)?.[1];
  const isRightmoveCollection =
    objective.startsWith("Collect property listings from this Rightmove search and file them for the team.")
    && rightmoveUrl;

  if (!isRightmoveCollection) {
    return { title: objective, detail: null, url: null };
  }

  return {
    title: t("rightmove.title"),
    detail: propertyLimit ? t("rightmove.detailWithLimit", { count: propertyLimit }) : t("rightmove.detail"),
    url: rightmoveUrl,
  };
}

export function AgentJobDetailContent({
  agentId,
  runId,
  detail,
  logs,
  RawButton,
}: {
  agentId: Id<"agents">;
  runId: Id<"agentRuns">;
  detail: RunDetail | null;
  logs: Doc<"agentLogs">[] | undefined;
  RawButton: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
}) {
  const t = useTranslations("admin.agents.details.observability.run");
  const tLabels = useTranslations("admin.agents.labels");
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const router = useRouter();
  const now = useNow();

  const replayRun = useMutation(api.agentRuns.replayRun);
  const upsertFeedback = useMutation(api.agentRunFeedback.upsertForRun);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [rating, setRating] = useState(false);

  const perform = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await work();
      setNotice({ tone: "good", text: done });
    } catch (error) {
      setNotice({
        tone: "bad",
        text: toUserFacingMessage(error, t("actionFailed")),
      });
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    if (!detail) return [];

    const nameByStepId = new Map<string, string>();
    const nameByRuntimeName = new Map<string, string>();
    const subjectByStepId = new Map<string, string>();
    for (const toolCall of detail.toolCalls) {
      if (toolCall.stepId) {
        const subject = describeToolCallSubject(toolCall.argumentsPreview);
        if (subject) subjectByStepId.set(toolCall.stepId, subject);
      }
      const name = toolCall.toolName ?? humaniseToolName(toolCall.normalizedToolName);
      if (!name) continue;
      if (toolCall.stepId) nameByStepId.set(toolCall.stepId, name);
      nameByRuntimeName.set(toolCall.normalizedToolName, name);
    }

    const steps = detail.steps.map((step) => ({
      ...step,
      toolName: nameByStepId.get(step._id)
        ?? (step.input ? nameByRuntimeName.get(step.input.trim()) : undefined)
        ?? (step.kind === "TOOL_RESULT" && step.input ? humaniseToolName(step.input) : undefined),
      toolSubject: subjectByStepId.get(step._id),
    }));

    return buildWaterfall(steps, {
      runStartedAt: detail.run.startedAt,
      runCompletedAt: detail.run.completedAt,
      now,
    });
  }, [detail, now]);

  const summary = useMemo(() => summariseWaterfall(rows), [rows]);

  if (detail === null) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-[15px] font-semibold text-foreground">{t("notFoundTitle")}</p>
        <p className="text-[13px] text-secondary max-w-md">{t("notFoundBody")}</p>
        {/* Raw: quiet's shape but deliberately no hover fill — one token short of the variant. */}
        <RawButton
          type="button"
          onClick={() => router.push(`/admin/agents/${agentId}/observability`)}
          className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground transition-all"
        >
          {t("backToOverview")}
        </RawButton>
      </div>
    );
  }

  const { run } = detail;
  const derived = getRunDisplay(run.objective, t);
  const runDisplay = run.title ? { ...derived, title: run.title } : derived;
  const durationMs = run.completedAt ? run.completedAt - run.startedAt : undefined;
  const canReplay = run.status === "FAILED" || run.status === "CANCELLED";

  return (
    <div className="flex flex-col gap-5 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Raw: an inline back link, not a button shape — no kit variant is a bare link. */}
          <RawButton
            type="button"
            onClick={() => router.push(`/admin/agents/${agentId}/observability`)}
            className="text-[12px] text-secondary hover:text-foreground transition-colors flex items-center gap-1.5 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("backToOverview")}
          </RawButton>
          <h2 className="text-[19px] font-semibold text-foreground tracking-tight">{runDisplay.title}</h2>
          {runDisplay.detail && (
            <p className="text-[13px] text-secondary mt-1.5">{runDisplay.detail}</p>
          )}
          {runDisplay.url && (
            <p className="text-[12px] text-muted mt-1 break-all">{runDisplay.url}</p>
          )}
          <p className="text-[13px] text-secondary mt-1.5">
            {label(describeTrigger(run.triggerType))} {label(formatRelativeTime(run.startedAt, now))}
            {durationMs === undefined ? ` ${t("stillRunning")}` : ` ${t("took", { duration: formatDuration(durationMs) })}`}
            {run.costGBP !== undefined ? ` ${t("cost", { amount: formatMoney(run.costGBP) })}` : ""}
            {run.status === "FAILED"
              ? run.continuedByRunId
                ? ` ${t("handedOver")}`
                : ` ${t("didNotFinish")}`
              : run.status === "PENDING_APPROVAL"
                ? ` ${t("waitingApproval")}`
                : run.status === "SUCCESS"
                  ? ` ${t("finishedCleanly")}`
                  : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {canReplay && (
            <Action
              RawButton={RawButton}
              busy={busy === "replay"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "replay",
                  () => replayRun({ runId, mode: "CURRENT_ACTIVE" }),
                  t("replayDone"),
                )
              }
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              label={t("runAgain")}
            />
          )}
          <Action
            RawButton={RawButton}
            onClick={() => setRating((open) => !open)}
            disabled={busy !== null}
            icon={<ThumbsUp className="w-3.5 h-3.5" />}
            label={t("rate")}
            active={rating}
          />
          {detail.evalFixtureContext.canCreateFromRun && (
            <Action
              RawButton={RawButton}
              busy={busy === "check"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "check",
                  () => createEvalFixture({ runId }),
                  t("checkDone"),
                )
              }
              icon={<ClipboardCheck className="w-3.5 h-3.5" />}
              label={detail.evalFixtureContext.activeCount > 0 ? t("updateCheck") : t("turnIntoCheck")}
            />
          )}
        </div>
      </div>

      {rating && (
        <div className="rounded-[12px] border border-border-dim bg-card px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-secondary">{t("ratingQuestion")}</span>
          <div className="flex gap-2">
            <Action
              RawButton={RawButton}
              busy={busy === "rate-good"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "rate-good",
                  () => upsertFeedback({ runId, rating: "POSITIVE", labels: ["GOOD_ANSWER"] }),
                  t("ratedGood"),
                )
              }
              icon={<ThumbsUp className="w-3.5 h-3.5" />}
              label={t("itDid")}
            />
            <Action
              RawButton={RawButton}
              busy={busy === "rate-bad"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "rate-bad",
                  () => upsertFeedback({ runId, rating: "NEGATIVE", labels: ["INCORRECT"] }),
                  t("ratedBad"),
                )
              }
              icon={<ThumbsDown className="w-3.5 h-3.5" />}
              label={t("itDidNot")}
            />
          </div>
        </div>
      )}

      {notice && (
        <p
          className={`text-[12.5px] ${notice.tone === "good" ? "text-success" : "text-destructive"}`}
          role="status"
        >
          {notice.text}
        </p>
      )}

      <RepeatHistory
        detail={detail}
        onOpenRun={(other) => router.push(`/admin/agents/${agentId}/observability/${other}`)}
      />

      {run.error && (
        <div className="rounded-[12px] border border-destructive/20 bg-destructive/[0.06] px-4 py-3">
          <div className="text-[11.5px] text-muted mb-1">{t("whyStopped")}</div>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-destructive">{run.error}</p>
        </div>
      )}

      {/* template:remove:start salesData */}
      <RunRecord runId={runId} />
      {/* template:remove:end */}

      {run.finalOutput && !run.error && (
        <CollapsedAccount finalOutput={run.finalOutput} RawButton={RawButton} />
      )}

      <section
        aria-label={t("timeTitle")}
        className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4"
      >
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("timeTitle")}</h3>
          <p className="text-[12px] text-secondary mt-1">{t("timeHint")}</p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center">
            <p className="text-[13px] text-foreground font-medium">{t("noSteps")}</p>
            <p className="text-[12px] text-muted mt-1">{t("noStepsHint")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(120px,190px)_minmax(0,1fr)_64px] gap-3 items-center">
                <span className={`text-[12.5px] truncate ${row.isLongest ? "text-foreground font-medium" : "text-secondary"}`}>
                  {label(row.label)}
                </span>
                <span className="h-[22px] rounded-[6px] bg-white/[0.03] border border-border-dim/60 relative">
                  <span
                    className={`absolute top-[3px] bottom-[3px] rounded-[4px] ${TONE_CLASS[row.tone]}`}
                    style={{ left: `${row.offsetPercent}%`, width: `${row.widthPercent}%` }}
                  />
                </span>
                <span className="text-[11.5px] text-muted tabular-nums text-right">
                  {formatDuration(row.durationMs)}
                </span>
              </div>
            ))}
          </div>
        )}

        {summary && (
          <p className="text-[12px] text-muted">
            {tLabels(summary.key, { share: summary.share, step: label(summary.step).toLowerCase() })}
          </p>
        )}
      </section>

      <RawExchange logs={logs} RawButton={RawButton} />
    </div>
  );
}

// template:remove:start salesData
function RunRecord({ runId }: { runId: Id<"agentRuns"> }) {
  const t = useTranslations("admin.agents.details.observability.run.record");
  const record = useQuery(api.salesDataResearchJobs.getRunRecord, { runId });
  if (!record) return null;

  const total = record.details.length + record.prospects.length;
  return (
    <section
      aria-label={t("title")}
      className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-3"
    >
      <div>
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("title")}</h3>
        <p className="text-[12px] text-secondary mt-1">{t("hint")}</p>
      </div>

      {total === 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-6 text-center">
          <p className="text-[13px] text-foreground font-medium">{t("nothing")}</p>
          <p className="text-[12px] text-muted mt-1">{t("nothingHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {record.prospects.map((prospect, index) => (
            <RecordLine
              key={`prospect-${index}`}
              subject={prospect.siteName}
              detail={`${prospect.groupName} · ${prospect.outcome}`}
              note={prospect.conflictNote}
              sourceName={prospect.sourceName}
              sourceUrl={prospect.sourceUrl}
              good
            />
          ))}
          {record.details.map((finding, index) => (
            <RecordLine
              key={`detail-${index}`}
              subject={finding.subject}
              detail={finding.value !== null
                ? `${finding.field} · ${finding.outcome} · ${finding.value}`
                : `${finding.field} · ${finding.outcome}`}
              sourceName={finding.sourceName}
              sourceUrl={finding.sourceUrl}
              good={finding.saved}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecordLine({
  subject,
  detail,
  note,
  sourceName,
  sourceUrl,
  good,
}: {
  subject: string;
  detail: string;
  note?: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  good: boolean;
}) {
  return (
    <div className="border-t border-border-dim/40 first:border-t-0 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className={`w-1.5 h-1.5 rounded-full self-center shrink-0 ${good ? "bg-success" : "bg-foreground/25"}`} />
      <span className="text-[12.5px] font-medium text-foreground">{subject}</span>
      <span className="text-[12.5px] text-secondary min-w-0">{detail}</span>
      {note && <span className="text-[12px] text-warning basis-full pl-4">{note}</span>}
      {(sourceName || sourceUrl) && (
        sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-muted hover:text-foreground transition-colors truncate max-w-[260px] ml-auto"
          >
            {sourceName ?? sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        ) : (
          <span className="text-[11.5px] text-muted truncate max-w-[260px] ml-auto">{sourceName}</span>
        )
      )}
    </div>
  );
}
// template:remove:end

function CollapsedAccount({
  finalOutput,
  RawButton,
}: {
  finalOutput: string;
  RawButton: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
}) {
  const t = useTranslations("admin.agents.details.observability.run.account");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[12px] border border-border-dim bg-white/[0.02]">
      {/* Raw: a full-width fold header is the hit target — a layout, not a button recipe. */}
      <RawButton
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-[12.5px] font-medium text-foreground flex-1">{t("title")}</span>
        <span className="text-[11.5px] text-muted">{t("unchecked")}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </RawButton>
      {open && (
        <p className="px-4 pb-4 text-[13px] leading-relaxed whitespace-pre-wrap text-secondary">
          {finalOutput}
        </p>
      )}
    </div>
  );
}

function Action({
  RawButton,
  label,
  icon,
  onClick,
  busy,
  disabled,
  active,
}: {
  RawButton: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    // Raw: swaps whole colour schemes with its active state; no kit variant is stateful.
    <RawButton
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3.5 py-2 rounded-[10px] border text-[12.5px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
        active
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-border-dim bg-white/[0.03] text-secondary hover:text-foreground hover:bg-white/[0.06]"
      }`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </RawButton>
  );
}

function RepeatHistory({
  detail,
  onOpenRun,
}: {
  detail: RunDetail;
  onOpenRun: (runId: Id<"agentRuns">) => void;
}) {
  const t = useTranslations("admin.agents.details.observability.run.repeat");
  const { sourceRun, replayRuns } = detail.replayContext;
  const related = [...(sourceRun ? [sourceRun] : []), ...replayRuns];
  if (related.length === 0) return null;

  const total = related.length + 1;
  const worked = related.filter((other) => other.status === "SUCCESS").length;

  return (
    <div className="rounded-[14px] border border-border-dim bg-card px-5 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[12px] text-muted">{t("timesRun", { count: total })}</div>
        <div className="text-[13.5px] text-foreground mt-1">
          {worked === related.length
            ? t("allWorked", { count: related.length })
            : worked === 0
              ? t("noneWorked", { count: related.length })
              : t("someWorked", { worked, count: related.length })}
        </div>
      </div>
      <Button
        variant="quiet"
        onClick={() => onOpenRun((sourceRun ?? related[0]).runId as Id<"agentRuns">)}
        className="px-3.5 py-2 text-[12.5px] shrink-0"
      >
        {sourceRun ? t("seeSource") : t("seeAnother")}
      </Button>
    </div>
  );
}

function RawExchange({
  logs,
  RawButton,
}: {
  logs: Doc<"agentLogs">[] | undefined;
  RawButton: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
}) {
  const t = useTranslations("admin.agents.details.observability.run");
  const tLabels = useTranslations("admin.agents.labels");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section
      aria-label={t("exchange.title")}
      className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4"
    >
      <div>
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{t("exchange.title")}</h3>
        <p className="text-[12px] text-secondary mt-1">{t("exchange.hint")}</p>
      </div>

      {logs === undefined ? (
        <div className="py-8 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center">
          <p className="text-[13px] text-foreground font-medium">{t("exchange.nothingRecorded")}</p>
          <p className="text-[12px] text-muted mt-1">{t("exchange.nothingHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {logs.map((log) => {
            const isOpen = openId === log._id;
            return (
              <div key={log._id} className="border-t border-border-dim/40 first:border-t-0">
                {/* Raw: a whole list row is the hit target — a layout, not a button recipe. */}
                <RawButton
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : log._id)}
                  className="w-full flex items-center gap-3 py-2.5 text-left min-w-0"
                >
                  <span className={`text-[10.5px] px-2 py-1 rounded-[6px] whitespace-nowrap shrink-0 w-[86px] text-center ${outcomeTone(log.outcome)}`}>
                    {t(outcomeKey(log.outcome))}
                  </span>
                  <span className="flex-1 min-w-0 text-[12.5px] text-foreground truncate">
                    {tLabels(describeInteractionType(log.interactionType).key, describeInteractionType(log.interactionType).params)}
                  </span>
                  <span className="text-[11px] text-muted tabular-nums whitespace-nowrap shrink-0">
                    {log.durationMs !== undefined ? formatDuration(log.durationMs) : ""}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </RawButton>

                {isOpen && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-4 pt-1">
                    <Pane title={t("exchange.whatWeSent")} body={log.promptContent} />
                    <Pane
                      title={t("exchange.whatCameBack")}
                      body={log.responseContent}
                      isError={log.outcome === "FAILED"}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Pane({ title, body, isError }: { title: string; body: string; isError?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted mb-1.5">{title}</div>
      <pre
        className={`text-[11.5px] leading-relaxed font-mono m-0 px-3 py-2.5 rounded-[10px] border border-border-dim bg-sidebar/60 overflow-x-auto whitespace-pre-wrap break-words max-h-[280px] ${
          isError ? "text-destructive" : "text-secondary"
        }`}
      >
        {body}
      </pre>
    </div>
  );
}

function outcomeKey(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "outcome.worked";
  if (outcome === "FAILED") return "outcome.failed";
  return "outcome.notRecorded";
}

function outcomeTone(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "bg-success/10 text-success";
  if (outcome === "FAILED") return "bg-destructive/10 text-destructive";
  return "bg-foreground/5 text-muted";
}
