"use client";

import { useMemo, useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Activity, AlertTriangle, ArrowRight, Loader2, UserCheck } from "lucide-react";
import {
  describeRunStatus,
  describeToolName,
  describeTrigger,
  formatCount,
  formatCountChange,
  formatDayLabel,
  formatDuration,
  formatMoney,
  formatPercent,
  formatRateChange,
  formatRelativeTime,
  type Change,
  type LabelRef,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { Button } from "@/src/ui/components/screens/Button";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";
import { FAILED_HATCH } from "../../_lib/observabilityStyles";

/** How many jobs the "latest" list shows before sending the reader to Activity. */
const LATEST_JOB_COUNT = 6;

/** Tall enough to read a shape off, short enough to leave the page scannable. */
const PLOT_HEIGHT = 150;

/** Below this there is no twentieth job, so there is no "1 in 20" to report. */
const SLOW_TAIL_MIN_JOBS = 20;

/** Four gridlines, so the scale reads top, two thirds, one third, nothing. */
const AXIS_FRACTIONS = [1, 2 / 3, 1 / 3, 0];

/**
 * Whole-number ticks, with duplicates removed.
 *
 * Jobs are counted, not measured, so a scale reading 1.33 is meaningless — and
 * on an agent with a single job the fractions all rounded to the same value and
 * the axis printed "1, 1, 0, 0".
 */
function buildAxisTicks(tallest: number): number[] {
  const ticks = AXIS_FRACTIONS.map((fraction) => Math.round(tallest * fraction));
  return ticks.filter((tick, index) => index === 0 || tick !== ticks[index - 1]);
}

const RANGES = [
  { labelKey: "ranges.day", days: 1 },
  { labelKey: "ranges.week", days: 7 },
  { labelKey: "ranges.month", days: 30 },
] as const;

type Analytics = NonNullable<ReturnType<typeof useAnalytics>>;

function useAnalytics(agentId: Id<"agents">, lookbackDays: number) {
  return useQuery(api.agentRuns.getAnalyticsForAgent, { agentId, lookbackDays });
}

// template:remove:start salesData
/**
 * The job this agent is working, above the runs that carry it out.
 *
 * A run list answers "what did it do at 09:14". It cannot answer "is the list
 * finished", because no run knows about the list — which is the whole reason the
 * job exists. Anthony, 2026-08-03: *"what is the purpose of building
 * observability tools if you hide stuff from it."*
 *
 * Shows nothing at all for an agent that has never had a job, rather than an
 * empty panel every other agent has to scroll past.
 */
function ResearchJobPanel({ agentId }: { agentId: Id<"agents"> }) {
  const t = useTranslations("admin.agents.details.observability.dashboard.research");
  const job = useQuery(api.salesDataResearchJobs.getResearchJobForAgent, { agentId });
  if (!job) return null;

  const isRunning = job.status === "RUNNING";
  const tone =
    job.status === "COMPLETE"
      ? "text-success"
      : job.status === "RUNNING"
        ? "text-brand"
        : job.status === "COMPLETE_WITH_EXCEPTIONS"
          ? "text-warning"
          : "text-secondary";

  return (
    <section
      aria-label={t("aria")}
      className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
            {isRunning ? job.progress : t("lastJob")}
          </h3>
          <p className={`text-[12.5px] mt-1 ${tone}`}>
            {isRunning
              ? `${t("progress", { done: job.done, remaining: job.remaining })}${job.failed > 0 ? ` ${t("failedSuffix", { failed: job.failed })}` : ""}`
              : job.endedReason}
          </p>
        </div>
        <div className="text-[12px] text-muted tabular-nums text-right">
          <div>
            {t("spentOfMax", { spent: job.spentGBP.toFixed(2), max: job.maxCostGBP })}
          </div>
          {/* The run count is the mechanism, not the work — small, and last. */}
          <div className="mt-0.5">
            {t("runs", { count: job.runsStarted })}
          </div>
        </div>
      </div>

      {/* What the queue is made of, so "39 of 49" is not a mystery. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-secondary">
        <span>{t("customers", { count: job.customers })}</span>
        <span>{t("chains", { count: job.chains })}</span>
        <span>{t("prospects", { count: job.prospects })}</span>
      </div>

      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full bg-brand transition-all"
          style={{
            width: `${job.total === 0 ? 0 : Math.round(((job.done + job.failed) / job.total) * 100)}%`,
          }}
        />
      </div>

      {/* The two things a person watching actually wants: what it has in hand
          this second, and the newest things it has genuinely recorded — from
          the job, so this never goes stale when a run hands over. */}
      {isRunning && job.workingOn && (
        <p className="text-[12.5px] text-foreground">
          <span className="text-muted">{t("rightNow")}</span>
          {job.workingOn.kind === "CHAIN"
            ? t("lookingThrough", { label: job.workingOn.label })
            : t("researching", { label: job.workingOn.label })}
        </p>
      )}

      {job.records.length > 0 && (
        <div className="flex flex-col">
          <p className="text-[11.5px] text-muted mb-1">{t("latestRecorded")}</p>
          {job.records.map((record, index) => (
            <div
              key={`${record.subject}-${record.at}-${index}`}
              className="border-t border-border-dim/40 first:border-t-0 py-1.5 flex items-baseline gap-x-3"
            >
              {/* Decoration, not the signal: the detail beside it already reads
                  "saved · …" or "looked for, not published", so the dot repeats
                  in colour what the row says in words. Hidden from screen
                  readers for the same reason. */}
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full self-center shrink-0 ${record.saved ? "bg-success" : "bg-foreground/25"}`}
              />
              <span className="text-[12px] font-medium text-foreground whitespace-nowrap">{record.subject}</span>
              <span className="text-[12px] text-secondary truncate min-w-0">{record.detail}</span>
            </div>
          ))}
        </div>
      )}

      {job.exceptions.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <p className="text-[12px] text-warning">{t("couldNotDo")}</p>
          {job.exceptions.slice(0, 8).map((exception) => (
            <p key={exception.name} className="text-[12px] text-secondary">
              {t("exception", { name: exception.name, reason: exception.reason })}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
// template:remove:end

export default function AgentObservabilityPage() {
  const t = useTranslations("admin.agents.details.observability.dashboard");
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;

  const [lookbackDays, setLookbackDays] = useState<number>(7);

  const analytics = useAnalytics(agentId, lookbackDays);
  const tools = useQuery(api.aiTools.getTools, {}) as Doc<"aiTools">[] | undefined;

  // Asks for exactly what it shows. It used to fetch a full admin page and
  // throw most of it away in the browser.
  const {
    results: runs,
    status: runsStatus,
    loadMore: loadMoreRuns,
  } = usePaginatedQuery(
    api.agentRuns.getForAgent,
    { agentId },
    { initialNumItems: LATEST_JOB_COUNT }
  );

  const toolNameByHandler = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of tools ?? []) map.set(tool.handlerMapping, tool.name);
    return map;
  }, [tools]);

  // Ticks rather than being read during render, so "10 minutes ago" stays true
  // on a screen somebody leaves open.
  const now = useNow();

  if (analytics === undefined) {
    return (
      <div className="w-full py-24 flex items-center justify-center text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const hasHistory = analytics.totals.runs > 0;

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold text-foreground tracking-tight">
            {t("title")}
          </h2>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            {t("description")}
          </p>
        </div>

        <div className="flex gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
          {RANGES.map((range) => (
            /* Raw: segmented range picker — the active option swaps its colours; no kit variant is stateful. */
            <button
              key={range.days}
              type="button"
              onClick={() => setLookbackDays(range.days)}
              className={`px-3 py-1.5 rounded-[7px] text-[12px] transition-all ${
                lookbackDays === range.days
                  ? "bg-card text-foreground border border-border-dim"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              {t(range.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* template:remove:start salesData */}
      <ResearchJobPanel agentId={agentId} />
      {/* template:remove:end */}

      {!hasHistory ? (
        <EmptyHistory />
      ) : (
        <>
          <Vitals analytics={analytics} />
          {/* A week-long chart needs more than one day of activity to say
              anything. Below that it is a single bar in an empty grid. */}
          {analytics.dailySeries.filter((day) => day.total > 0).length > 1 && (
            <ActivityChart analytics={analytics} />
          )}

          {/* Full width and stacked rather than side by side. The design draws
              them as two columns, but inside the dashboard's own width that
              left both panels cramped — and on an agent with nothing wrong
              they were two mostly-empty boxes sharing a line. */}
          <FailureGroups
            analytics={analytics}
            now={now}
            onOpenRun={(runId) => router.push(`/admin/agents/${agentId}/observability/${runId}`)}
          />
          <ToolReliability analytics={analytics} toolNameByHandler={toolNameByHandler} />

          <LatestJobs
            runs={runs}
            isLoading={runsStatus === "LoadingFirstPage"}
            canLoadMore={runsStatus === "CanLoadMore"}
            onLoadMore={() => loadMoreRuns(LATEST_JOB_COUNT)}
            now={now}
            onOpenRun={(runId) => router.push(`/admin/agents/${agentId}/observability/${runId}`)}
            onSeeAll={() => router.push(`/admin/agents/${agentId}/runs`)}
          />

          {analytics.sampleTruncated && (
            <p className="text-[12px] text-muted">
              {t("truncated")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyHistory() {
  const t = useTranslations("admin.agents.details.observability.dashboard");
  return (
    <div className="w-full min-h-[320px] border border-border-dim bg-card rounded-[14px] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Activity className="w-10 h-10 text-brand opacity-60" />
      <div className="flex flex-col gap-1.5 items-center">
        <span className="text-[16px] font-semibold text-foreground tracking-tight">
          {t("emptyTitle")}
        </span>
        <span className="text-secondary text-[13px] max-w-md">
          {t("emptyBody")}
        </span>
      </div>
    </div>
  );
}

function Vitals({ analytics }: { analytics: Analytics }) {
  const t = useTranslations("admin.agents.details.observability.dashboard.vitals");
  const { current, previous } = analytics.comparison;
  const waiting = analytics.statusCounts.PENDING_APPROVAL ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      <Vital
        label={t("jobsRun")}
        value={formatCount(current.runs)}
        change={formatCountChange(current.runs, previous.runs)}
        changeSuffix={t("thanBefore")}
      />
      <Vital
        label={t("finishedCleanly")}
        value={formatPercent(current.successRate)}
        change={
          previous.runs === 0
            ? { label: { key: "change.nothingToCompare" }, direction: "unknown" }
            : formatRateChange(current.successRate, previous.successRate)
        }
        changeSuffix={t("thanBefore")}
      />
      <Vital
        label={t("usuallyTakes")}
        value={
          analytics.latency.sampleSize === 0
            ? "—"
            : analytics.latency.medianMs === 0
              ? t("underASecond")
              : formatDuration(analytics.latency.medianMs)
        }
        footnote={
          analytics.latency.sampleSize === 0
            ? t("noFinishedJobs")
            // "1 in 20" needs at least twenty jobs to mean anything. Below that
            // the slowest of a handful was being reported as a rate, which is
            // the same invented precision this screen exists to remove.
            : analytics.latency.sampleSize < SLOW_TAIL_MIN_JOBS
              ? t("acrossJobs", { formatted: formatCount(analytics.latency.sampleSize), count: analytics.latency.sampleSize })
              : analytics.latency.p95Ms > analytics.latency.medianMs
                ? t("slowTail", { duration: formatDuration(analytics.latency.p95Ms) })
                : t("sameTime")
        }
      />
      <Vital
        label={t("costsPerJob")}
        value={formatMoney(current.costPerRunGBP)}
        footnote={t("overPeriod", { amount: formatMoney(current.costGBP) })}
      />
      <Vital
        label={t("waiting")}
        value={formatCount(waiting)}
        footnote={
          waiting > 0
            ? t("cannotFinish")
            : t("nothingHeld")
        }
      />
    </div>
  );
}

function Vital({
  label,
  value,
  change,
  changeSuffix,
  footnote,
}: {
  label: string;
  value: string;
  change?: Change;
  changeSuffix?: string;
  footnote?: string;
}) {
  // Change labels arrive as catalogue keys from the pure formatters.
  const tLabels = useTranslations("admin.agents.labels");
  return (
    <div className="flex flex-col gap-2 p-4 rounded-[14px] bg-card border border-border-dim shadow-sm min-w-0">
      <div className="text-[12px] text-secondary truncate">{label}</div>
      <div className="text-[26px] font-semibold text-foreground tracking-tight tabular-nums leading-none">
        {value}
      </div>
      {change ? (
        <div className="text-[11.5px] text-muted flex items-center gap-1.5 flex-wrap">
          <span
            className={
              change.direction === "up"
                ? "text-success font-medium"
                : change.direction === "down"
                  ? "text-destructive font-medium"
                  : "text-muted font-medium"
            }
          >
            {tLabels(change.label.key, change.label.params)}
          </span>
          {change.direction !== "unknown" && changeSuffix ? <span>{changeSuffix}</span> : null}
        </div>
      ) : (
        <div className="text-[11.5px] text-muted">{footnote}</div>
      )}
    </div>
  );
}

function ActivityChart({ analytics }: { analytics: Analytics }) {
  const t = useTranslations("admin.agents.details.observability.dashboard.chart");
  const locale = useLocale();
  const series = analytics.dailySeries;
  const tallest = Math.max(1, ...series.map((day) => day.total));

  // Marked on the day the new configuration first carried traffic, so a reader
  // can see whether the shape of the chart changed when the agent did.
  const changedDays = useMemo(
    () => new Set(analytics.versionChangeDays),
    [analytics.versionChangeDays]
  );

  // Which of those markers gets to carry the wording.
  //
  // Every changed day used to render the full "Settings changed" pill. Change
  // the agent on four days in a row — which is an ordinary week of tuning —
  // and the four pills overlap and clip each other, so the chart reads
  // "Settir Settir Settir Settir Settings changed". Garbled text says less
  // than no text.
  //
  // The line still marks every changed day; only the wording thins out. The
  // spacing comes from how many days are on screen, because the same pill is
  // roughly one bar wide over seven days and roughly four bars wide over
  // thirty.
  const labelledChangeDays = useMemo(() => {
    const minimumGap = Math.max(1, Math.round(series.length / 7));
    const labelled = new Set<number>();
    let lastLabelled = -Infinity;

    series.forEach((day, index) => {
      if (!changedDays.has(day.dayStartMs)) return;
      if (index - lastLabelled < minimumGap) return;
      labelled.add(day.dayStartMs);
      lastLabelled = index;
    });

    return labelled;
  }, [series, changedDays]);

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
            {t("title")}
          </h3>
          <p className="text-[12.5px] text-muted mt-1">
            {t("hint")}
          </p>
        </div>
        <div className="flex gap-4 text-[11.5px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-info" /> {t("finished")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-warning" style={FAILED_HATCH} /> {t("failed")}
          </span>
        </div>
      </div>

      {/* Columns span the card so the week reads left to right, but each bar is
          capped inside its column: stretched to full width a seven-day series
          reads as slabs and the shape of the week disappears. */}
      <div className="flex gap-3">
        {/* The scale. Without it the bars are decoration: you can see that one
            day is taller than another but not read a number off either. */}
        <div className="flex flex-col justify-between text-[10.5px] text-muted tabular-nums text-right shrink-0 min-w-[26px]">
          {buildAxisTicks(tallest).map((tick) => (
            <span key={tick}>{formatCount(tick)}</span>
          ))}
        </div>

        <div
          className="flex-1 flex items-end gap-1.5 relative"
          style={{
            height: `${PLOT_HEIGHT}px`,
            backgroundImage:
              "repeating-linear-gradient(to top, transparent, transparent calc(25% - 1px), var(--color-border-dim) calc(25% - 1px), var(--color-border-dim) 25%)",
            backgroundSize: `100% ${PLOT_HEIGHT}px`,
            backgroundPosition: "bottom left",
            backgroundRepeat: "no-repeat",
          }}
        >
          {series.map((day) => {
            const failedHeight = Math.round((day.failed / tallest) * PLOT_HEIGHT);
            const succeededHeight = Math.round((day.succeeded / tallest) * PLOT_HEIGHT);
            const changed = changedDays.has(day.dayStartMs);

            return (
              <div key={day.dayStartMs} className="flex-1 flex flex-col justify-end min-w-0 group relative h-full">
                {/* The setup change reads as a line through the chart with a
                    label on it. A bare dot beside the day name told nobody
                    anything. */}
                {changed && (
                  <>
                    <span className="absolute -left-[3px] top-0 bottom-6 w-[2px] bg-brand/60 pointer-events-none" />
                    {labelledChangeDays.has(day.dayStartMs) && (
                      <span className="absolute -top-1 left-0 -translate-x-1/2 z-20 whitespace-nowrap rounded-[6px] bg-brand px-2 py-[3px] text-[10.5px] text-white">
                        {t("settingsChanged")}
                      </span>
                    )}
                  </>
                )}

                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap rounded-[6px] border border-border-dim bg-card px-2 py-1 text-[11px] text-foreground shadow-lg">
                  {t("tooltip", { formatted: formatCount(day.total), count: day.total })}
                  {day.failed > 0 ? t("tooltipFailed", { count: formatCount(day.failed) }) : ""}
                </div>

                {day.failed > 0 && (
                  <>
                    <span
                      className="text-[10px] leading-none text-warning tabular-nums text-center truncate mb-1"
                      title={t("failedCount", { formatted: formatCount(day.failed), count: day.failed })}
                    >
                      {formatCount(day.failed)}
                    </span>
                    <div
                      className="bg-warning rounded-t-[3px]"
                      style={{ ...FAILED_HATCH, height: `${Math.max(failedHeight, 3)}px` }}
                    />
                  </>
                )}
                {day.succeeded > 0 && (
                  <div
                    className={`bg-info ${day.failed > 0 ? "border-t-2 border-card" : "rounded-t-[3px]"}`}
                    style={{ height: `${Math.max(succeededHeight, 3)}px` }}
                  />
                )}
                {day.total === 0 && <div className="h-[2px] bg-border-dim rounded-[2px]" />}

              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <span className="shrink-0 min-w-[26px]" aria-hidden="true" />
        <div className="flex-1 flex gap-1.5">
          {series.map((day) => (
            <span
              key={day.dayStartMs}
              className="flex-1 min-w-0 text-[10.5px] text-muted text-center truncate"
            >
              {formatDayLabel(day.dayStartMs, locale)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FailureGroups({
  analytics,
  now,
  onOpenRun,
}: {
  analytics: Analytics;
  now: number;
  onOpenRun: (runId: Id<"agentRuns">) => void;
}) {
  const t = useTranslations("admin.agents.details.observability.dashboard.failures");
  const tLabels = useTranslations("admin.agents.labels");
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const groups = analytics.failureGroups.slice(0, 5);

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
          {t("title")}
        </h3>
        <p className="text-[12.5px] text-muted mt-1">
          {t("hint")}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-secondary">
          {t("none")}
        </p>
      ) : (
        <div className="flex flex-col">
          {groups.map((group, index) => (
            <div
              key={group.failureKey}
              className="flex items-start gap-3 py-3 border-t border-border-dim/40 first:border-t-0 first:pt-0"
            >
              {/* The worst one is red; the rest are amber. All-red made every
                  row read as equally urgent, which is the same as none of them
                  reading as urgent.
                  Red against amber is a hard pair for the reader this platform
                  is built for, so the rank is carried by the word below and the
                  colour only agrees with it. */}
              <span
                className={`w-1 self-stretch rounded-[3px] shrink-0 ${
                  index === 0 ? "bg-destructive" : "bg-warning"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">
                  {group.label}
                  {index === 0 && (
                    <span className="ml-2 align-middle text-[10.5px] font-semibold uppercase tracking-wide text-destructive">
                      {t("worst")}
                    </span>
                  )}
                </p>
                <p className="text-[11.5px] text-muted mt-0.5">
                  {t("started", { first: label(formatRelativeTime(group.firstSeenAt, now)), last: label(formatRelativeTime(group.lastSeenAt, now)) })}
                </p>
                {group.runIds.length > 0 && (
                  /* Raw: an inline text link, not a button shape — no kit variant is a bare link. */
                  <button
                    type="button"
                    onClick={() => onOpenRun(group.runIds[0] as Id<"agentRuns">)}
                    className="text-[11.5px] text-brand hover:underline mt-1"
                  >
                    {t("seeJob")}
                  </button>
                )}
              </div>
              <span
                className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap tabular-nums shrink-0 ${
                  index === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                }`}
              >
                {t("jobs", { formatted: formatCount(group.count), count: group.count })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolReliability({
  analytics,
  toolNameByHandler,
}: {
  analytics: Analytics;
  toolNameByHandler: Map<string, string>;
}) {
  const t = useTranslations("admin.agents.details.observability.dashboard.tools");
  const tools = analytics.toolStats.slice(0, 6);

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
          {t("title")}
        </h3>
        <p className="text-[12.5px] text-muted mt-1">
          {t("hint")}
        </p>
      </div>

      <CompactList
        rows={tools}
        rowKey={(tool) => tool.handlerMapping}
        dividers="rule"
        empty={t("empty")}
        columns={[
          {
            key: "tool",
            header: t("columns.tool"),
            className: "px-0 pr-3 py-2.5 text-foreground truncate max-w-0",
            cell: (tool) => (
              <>
                {describeToolName(tool.handlerMapping, toolNameByHandler)}
                {tool.notImplemented > 0 && (
                  <span className="block text-[11px] text-warning mt-0.5">
                    {t("notConnected", { count: formatCount(tool.notImplemented) })}
                  </span>
                )}
              </>
            ),
          },
          {
            key: "used",
            header: t("columns.used"),
            align: "right",
            className: "px-0 pr-4 py-2.5 w-[58px] tabular-nums text-secondary",
            cell: (tool) => formatCount(tool.calls),
          },
          {
            key: "worked",
            header: t("columns.worked"),
            align: "right",
            className: "px-0 pr-4 py-2.5 w-[128px]",
            cell: (tool) => {
              const rate = tool.calls > 0 ? tool.successes / tool.calls : 0;
              const struggling = rate < 0.95;

              return (
                <div className="flex items-center gap-2">
                  <span className="h-[5px] flex-1 rounded-[3px] bg-border-dim overflow-hidden min-w-[30px]">
                    <span
                      className={`block h-full rounded-[3px] ${struggling ? "bg-warning" : "bg-info"}`}
                      style={{ width: `${Math.round(rate * 100)}%` }}
                    />
                  </span>
                  {struggling && (
                    <span className="flex items-center text-warning shrink-0" title={t("failsOften")}>
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="sr-only">{t("failsOften")}</span>
                    </span>
                  )}
                  <span className="text-[11.5px] text-secondary tabular-nums w-[38px] text-right">
                    {formatPercent(rate)}
                  </span>
                </div>
              );
            },
          },
          {
            key: "usually",
            header: t("columns.usually"),
            align: "right",
            className: "px-0 py-2.5 w-[58px] tabular-nums text-secondary",
            cell: (tool) => (tool.typicalMs > 0 ? formatDuration(tool.typicalMs) : "\u2014"),
          },
        ]}
      />
    </div>
  );
}

function LatestJobs({
  runs,
  isLoading,
  canLoadMore,
  onLoadMore,
  now,
  onOpenRun,
  onSeeAll,
}: {
  runs: Doc<"agentRuns">[];
  isLoading: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  now: number;
  onOpenRun: (runId: Id<"agentRuns">) => void;
  onSeeAll: () => void;
}) {
  const t = useTranslations("admin.agents.details.observability.dashboard.latest");
  const tLabels = useTranslations("admin.agents.labels");
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const latest = runs;

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
            {t("title")}
          </h3>
          <p className="text-[12.5px] text-muted mt-1">
            {t("hint")}
          </p>
        </div>
        <Button variant="quiet" onClick={onSeeAll} className="py-2 shrink-0">
          {t("seeAll")}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : latest.length === 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center text-[13px] text-secondary">
          {t("none")}
        </div>
      ) : (
        <div className="flex flex-col">
          {latest.map((run) => (
            /* Raw: a whole list row is the hit target — a layout, not a button recipe. */
            <button
              key={run._id}
              type="button"
              onClick={() => onOpenRun(run._id)}
              className="flex items-center gap-3 py-3 border-t border-border-dim/40 first:border-t-0 first:pt-0 text-left group min-w-0"
            >
              <RunStatusPill status={run.status} continued={Boolean(run.continuedByRunId)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] text-foreground truncate">{run.objective}</span>
                <span className="block text-[11.5px] text-muted truncate">
                  {label(describeTrigger(run.triggerType))} · {label(formatRelativeTime(run.startedAt, now))}
                  {run.error ? ` · ${run.error}` : ""}
                </span>
              </span>
              <span className="text-[11.5px] text-secondary tabular-nums whitespace-nowrap shrink-0">
                {run.completedAt
                  ? run.completedAt - run.startedAt === 0
                    ? t("underASecond")
                    : formatDuration(run.completedAt - run.startedAt)
                  : "—"}
                {run.costGBP !== undefined ? ` · ${formatMoney(run.costGBP)}` : ""}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
          {canLoadMore && (
            <Button variant="quiet" onClick={onLoadMore} className="mt-3 self-center px-4 py-2">
              {t("showMore")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A run's status, as the house pill.
 *
 * This was a local `StatusPill`, which shadowed the kit's own atom of that name:
 * anyone reading this file saw a familiar name and got something else. It also
 * re-derived its own colour per status, which is the habit `toneForStatus`
 * exists to end — eighteen such helpers once split FAILED between red and rose
 * depending on which file you opened, and left the Aesthetics screen's status
 * colours controlling nothing.
 *
 * One judgement here is genuinely local and stays. A run that handed its queue
 * to the next run reports FAILED, and red taught people to distrust a healthy
 * job; a handover reads as information. It turns on a second prop, so no shared
 * status map can express it.
 */
function RunStatusPill({ status, continued = false }: { status: string; continued?: boolean }) {
  const tLabels = useTranslations("admin.agents.labels");
  const statusRef = describeRunStatus(status, continued);
  const tone = status === "FAILED" && continued ? "info" : toneForStatus(status);

  return (
    <StatusPill
      tone={tone}
      size="md"
      icon={status === "PENDING_APPROVAL" ? <UserCheck className="w-3 h-3" /> : undefined}
      // Fixed width so every job title on the list starts at the same place.
      // Pills sized to their own text made the column ragged and hard to scan.
      className="w-[86px] shrink-0 justify-center whitespace-nowrap"
    >
      {tLabels(statusRef.key, statusRef.params)}
    </StatusPill>
  );
}
