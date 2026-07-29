"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  describeInteractionType,
  describeRunStatus,
  describeTrigger,
  formatDuration,
  formatMoney,
  formatRelativeTime,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import {
  buildWaterfall,
  summariseWaterfall,
  type WaterfallRow,
} from "@/src/app/(dashboard)/admin/agents/_lib/jobWaterfall";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";

const TONE_CLASS: Record<WaterfallRow["tone"], string> = {
  thinking: "bg-secondary/40",
  tool: "bg-brand",
  waiting: "bg-amber-500/70",
  failed: "bg-rose-500",
};

function useRunDetail(runId: Id<"agentRuns">) {
  return useQuery(api.agentRuns.getRunDetail, { runId });
}

type RunDetail = NonNullable<ReturnType<typeof useRunDetail>>;

export default function AgentJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;
  const runId = params.runId as Id<"agentRuns">;

  const now = useNow();
  const detail = useRunDetail(runId);
  const logs = useQuery(api.agentLogs.getForRun, { runId }) as Doc<"agentLogs">[] | undefined;

  const replayRun = useMutation(api.agentRuns.replayRun);
  const upsertFeedback = useMutation(api.agentRunFeedback.upsertForRun);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [rating, setRating] = useState(false);

  /**
   * One place for every action on this screen, so a failure always says
   * something rather than leaving a button that quietly did nothing.
   */
  const perform = async (key: string, work: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await work();
      setNotice({ tone: "good", text: done });
    } catch (error) {
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "That did not work.",
      });
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => {
    if (!detail) return [];
    return buildWaterfall(detail.steps, {
      runStartedAt: detail.run.startedAt,
      runCompletedAt: detail.run.completedAt,
      now,
    });
  }, [detail, now]);

  const summary = useMemo(() => summariseWaterfall(rows), [rows]);

  if (detail === undefined) {
    return (
      <div className="w-full py-24 flex items-center justify-center text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="w-full py-20 flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-[15px] font-semibold text-foreground">This job could not be found</p>
        <p className="text-[13px] text-secondary max-w-md">
          It may have been removed, or it belongs to a workspace you cannot see.
        </p>
        <button
          type="button"
          onClick={() => router.push(`/admin/agents/${agentId}/observability`)}
          className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground transition-all"
        >
          Back to the overview
        </button>
      </div>
    );
  }

  const { run } = detail;
  const durationMs = run.completedAt ? run.completedAt - run.startedAt : undefined;
  // Matches the runtime's own rule: only a job that stopped short can be
  // started again. Offering it on a job that finished would be a button that
  // always errors.
  const canReplay = run.status === "FAILED" || run.status === "CANCELLED";

  return (
    <div className="flex flex-col gap-5 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(`/admin/agents/${agentId}/observability`)}
            className="text-[12px] text-secondary hover:text-foreground transition-colors flex items-center gap-1.5 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to the overview
          </button>
          <h2 className="text-[19px] font-semibold text-foreground tracking-tight">{run.objective}</h2>
          {/* One sentence rather than a status pill and a row of fragments. The
              design reads "Ran Tuesday at 09:14 · took 31.4 seconds · cost
              £0.021 · failed at the last step." — the outcome is part of the
              sentence, not a badge off to one side. */}
          <p className="text-[13px] text-secondary mt-1.5">
            {describeTrigger(run.triggerType)} {formatRelativeTime(run.startedAt, now)}
            {durationMs === undefined ? " · still running" : ` · took ${formatDuration(durationMs)}`}
            {run.costGBP !== undefined ? ` · cost ${formatMoney(run.costGBP)}` : ""}
            {run.status === "FAILED"
              ? " · it did not finish"
              : run.status === "PENDING_APPROVAL"
                ? " · waiting for someone to approve it"
                : run.status === "SUCCESS"
                  ? " · finished cleanly"
                  : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {canReplay && (
            <Action
              busy={busy === "replay"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "replay",
                  () => replayRun({ runId, mode: "CURRENT_ACTIVE" }),
                  "Started again. The new job will appear in Activity."
                )
              }
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              label="Run it again"
            />
          )}
          <Action
            onClick={() => setRating((open) => !open)}
            disabled={busy !== null}
            icon={<ThumbsUp className="w-3.5 h-3.5" />}
            label="Rate this job"
            active={rating}
          />
          {detail.evalFixtureContext.canCreateFromRun && (
            <Action
              busy={busy === "check"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "check",
                  () => createEvalFixture({ runId }),
                  "Saved as a check. This case will be tested from now on."
                )
              }
              icon={<ClipboardCheck className="w-3.5 h-3.5" />}
              label={
                detail.evalFixtureContext.activeCount > 0
                  ? "Update the check"
                  : "Turn into a check"
              }
            />
          )}
        </div>
      </div>

      {rating && (
        <div className="rounded-[12px] border border-border-dim bg-card px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-secondary">Did this job do what you wanted?</span>
          <div className="flex gap-2">
            <Action
              busy={busy === "rate-good"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "rate-good",
                  () => upsertFeedback({ runId, rating: "POSITIVE", labels: ["GOOD_ANSWER"] }),
                  "Thanks — recorded as a good one."
                )
              }
              icon={<ThumbsUp className="w-3.5 h-3.5" />}
              label="It did"
            />
            <Action
              busy={busy === "rate-bad"}
              disabled={busy !== null}
              onClick={() =>
                perform(
                  "rate-bad",
                  () => upsertFeedback({ runId, rating: "NEGATIVE", labels: ["INCORRECT"] }),
                  "Thanks — recorded as one that went wrong."
                )
              }
              icon={<ThumbsDown className="w-3.5 h-3.5" />}
              label="It did not"
            />
          </div>
        </div>
      )}

      {notice && (
        <p
          className={`text-[12.5px] ${notice.tone === "good" ? "text-emerald-500" : "text-rose-500"}`}
          role="status"
        >
          {notice.text}
        </p>
      )}

      <RepeatHistory
        detail={detail}
        onOpenRun={(other) => router.push(`/admin/agents/${agentId}/observability/${other}`)}
      />

      {(run.error || run.finalOutput) && (
        <div
          className={`rounded-[12px] border px-4 py-3 ${
            run.error ? "border-rose-500/20 bg-rose-500/[0.06]" : "border-border-dim bg-white/[0.02]"
          }`}
        >
          <div className="text-[11.5px] text-muted mb-1">
            {run.error ? "Why it stopped" : "What it came back with"}
          </div>
          <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${run.error ? "text-rose-400" : "text-secondary"}`}>
            {run.error || run.finalOutput}
          </p>
        </div>
      )}

      <section
        aria-label="Where the time went"
        className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4"
      >
        <div>
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Where the time went</h3>
          <p className="text-[12px] text-secondary mt-1">
            Each step of the job, drawn against the time it took.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center">
            <p className="text-[13px] text-foreground font-medium">No steps were recorded</p>
            <p className="text-[12px] text-muted mt-1">
              This job did not get far enough to record what it was doing.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(120px,190px)_minmax(0,1fr)_64px] gap-3 items-center">
                <span className={`text-[12.5px] truncate ${row.isLongest ? "text-foreground font-medium" : "text-secondary"}`}>
                  {row.label}
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

        {/* The reading of the chart sits under it, as drawn — a reader looks at
            the bars first and wants the sentence confirming what they saw. */}
        {summary && <p className="text-[12px] text-muted">{summary}</p>}
      </section>

      <RawExchange logs={logs} />
    </div>
  );
}

function Action({
  label,
  icon,
  onClick,
  busy,
  disabled,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
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
    </button>
  );
}

/**
 * How this job went the other times it ran.
 *
 * The screen is most useful when somebody is asking "did this always do that?",
 * and the answer is already recorded — a replay carries a link back to the job
 * it repeated, and forward to the ones that repeated it.
 */
function RepeatHistory({
  detail,
  onOpenRun,
}: {
  detail: RunDetail;
  onOpenRun: (runId: Id<"agentRuns">) => void;
}) {
  const { sourceRun, replayRuns } = detail.replayContext;
  const related = [...(sourceRun ? [sourceRun] : []), ...replayRuns];
  if (related.length === 0) return null;

  const total = related.length + 1;
  const worked = related.filter((other) => other.status === "SUCCESS").length;

  return (
    <div className="rounded-[14px] border border-border-dim bg-card px-5 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[12px] text-muted">This job has been run {total} times</div>
        <div className="text-[13.5px] text-foreground mt-1">
          {worked === related.length
            ? `The other ${related.length === 1 ? "one" : related.length} finished cleanly.`
            : worked === 0
              ? `The other ${related.length === 1 ? "one did not finish either" : `${related.length} did not finish either`}.`
              : `${worked} of the other ${related.length} finished cleanly.`}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenRun((sourceRun ?? related[0]).runId as Id<"agentRuns">)}
        className="px-3.5 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12.5px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all shrink-0"
      >
        {sourceRun ? "See the one it repeated" : "See another"}
      </button>
    </div>
  );
}

function RawExchange({ logs }: { logs: Doc<"agentLogs">[] | undefined }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section
      aria-label="What was actually said"
      className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4"
    >
      <div>
        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">What was actually said</h3>
        <p className="text-[12px] text-secondary mt-1">
          Word for word, what this agent was sent and what came back. Open any line to see it in full.
        </p>
      </div>

      {logs === undefined ? (
        <div className="py-8 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center">
          <p className="text-[13px] text-foreground font-medium">Nothing was recorded for this job</p>
          <p className="text-[12px] text-muted mt-1">
            Jobs that ran before the exchange was linked to them show nothing here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {logs.map((log) => {
            const isOpen = openId === log._id;
            return (
              <div key={log._id} className="border-t border-border-dim/40 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : log._id)}
                  className="w-full flex items-center gap-3 py-2.5 text-left min-w-0"
                >
                  <span className={`text-[10.5px] px-2 py-1 rounded-[6px] whitespace-nowrap shrink-0 w-[86px] text-center ${outcomeTone(log.outcome)}`}>
                    {outcomeLabel(log.outcome)}
                  </span>
                  <span className="flex-1 min-w-0 text-[12.5px] text-foreground truncate">
                    {describeInteractionType(log.interactionType)}
                  </span>
                  <span className="text-[11px] text-muted tabular-nums whitespace-nowrap shrink-0">
                    {log.durationMs !== undefined ? formatDuration(log.durationMs) : ""}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-4 pt-1">
                    <Pane title="What we sent" body={log.promptContent} />
                    <Pane title="What came back" body={log.responseContent} isError={log.outcome === "FAILED"} />
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
          isError ? "text-rose-400" : "text-secondary"
        }`}
      >
        {body}
      </pre>
    </div>
  );
}

function outcomeLabel(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "Worked";
  if (outcome === "FAILED") return "Failed";
  return "Not recorded";
}

function outcomeTone(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "bg-emerald-500/10 text-emerald-500";
  if (outcome === "FAILED") return "bg-rose-500/10 text-rose-500";
  return "bg-foreground/5 text-muted";
}
