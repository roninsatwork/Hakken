"use client";

import { useMemo, useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { Activity, ArrowRight, Loader2, UserCheck } from "lucide-react";
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
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";

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
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
] as const;

type Analytics = NonNullable<ReturnType<typeof useAnalytics>>;

function useAnalytics(agentId: Id<"agents">, lookbackDays: number) {
  return useQuery(api.agentRuns.getAnalyticsForAgent, { agentId, lookbackDays });
}

export default function AgentObservabilityPage() {
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
            How this agent is doing
          </h2>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Everything it has done recently, and whether anything needs your attention.
          </p>
        </div>

        <div className="flex gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
          {RANGES.map((range) => (
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
              {range.label}
            </button>
          ))}
        </div>
      </div>

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
              This agent has run more jobs than one screen can measure, so the figures above
              cover its most recent activity rather than the whole period.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="w-full min-h-[320px] border border-border-dim bg-card rounded-[14px] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Activity className="w-10 h-10 text-brand opacity-60" />
      <div className="flex flex-col gap-1.5 items-center">
        <span className="text-[16px] font-semibold text-foreground tracking-tight">
          This agent has not run yet
        </span>
        <span className="text-secondary text-[13px] max-w-md">
          Once it runs — on a schedule, from a conversation, or because you started it —
          everything it does will be recorded here.
        </span>
      </div>
    </div>
  );
}

function Vitals({ analytics }: { analytics: Analytics }) {
  const { current, previous } = analytics.comparison;
  const waiting = analytics.statusCounts.PENDING_APPROVAL ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      <Vital
        label="Jobs run"
        value={formatCount(current.runs)}
        change={formatCountChange(current.runs, previous.runs)}
        changeSuffix="than the period before"
      />
      <Vital
        label="Finished cleanly"
        value={formatPercent(current.successRate)}
        change={
          previous.runs === 0
            ? { label: "nothing to compare yet", direction: "unknown" }
            : formatRateChange(current.successRate, previous.successRate)
        }
        changeSuffix="than the period before"
      />
      <Vital
        label="Usually takes"
        value={
          analytics.latency.sampleSize === 0
            ? "—"
            : analytics.latency.medianMs === 0
              ? "under a second"
              : formatDuration(analytics.latency.medianMs)
        }
        footnote={
          analytics.latency.sampleSize === 0
            ? "no finished jobs to measure yet"
            // "1 in 20" needs at least twenty jobs to mean anything. Below that
            // the slowest of a handful was being reported as a rate, which is
            // the same invented precision this screen exists to remove.
            : analytics.latency.sampleSize < SLOW_TAIL_MIN_JOBS
              ? `across ${formatCount(analytics.latency.sampleSize)} ${analytics.latency.sampleSize === 1 ? "job" : "jobs"} so far`
              : analytics.latency.p95Ms > analytics.latency.medianMs
                ? `but 1 in 20 takes over ${formatDuration(analytics.latency.p95Ms)}`
                : "every job takes about the same"
        }
      />
      <Vital
        label="Costs per job"
        value={formatMoney(current.costPerRunGBP)}
        footnote={`${formatMoney(current.costGBP)} over this period`}
      />
      <Vital
        label="Waiting on a person"
        value={formatCount(waiting)}
        footnote={
          waiting > 0
            ? "these cannot finish until someone decides"
            : "nothing is held up"
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
                ? "text-emerald-500 font-medium"
                : change.direction === "down"
                  ? "text-rose-500 font-medium"
                  : "text-muted font-medium"
            }
          >
            {change.label}
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
  const series = analytics.dailySeries;
  const tallest = Math.max(1, ...series.map((day) => day.total));

  // Marked on the day the new configuration first carried traffic, so a reader
  // can see whether the shape of the chart changed when the agent did.
  const changedDays = useMemo(
    () => new Set(analytics.versionChangeDays),
    [analytics.versionChangeDays]
  );

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
            What it has been doing
          </h3>
          <p className="text-[12.5px] text-muted mt-1">
            Jobs per day. The orange line marks a change to this agent&apos;s setup.
          </p>
        </div>
        <div className="flex gap-4 text-[11.5px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500" /> Finished
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-500" /> Failed
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
                    <span className="absolute -top-1 left-0 -translate-x-1/2 z-20 whitespace-nowrap rounded-[6px] bg-brand px-2 py-[3px] text-[10.5px] text-white">
                      Settings changed
                    </span>
                  </>
                )}

                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap rounded-[6px] border border-border-dim bg-card px-2 py-1 text-[11px] text-foreground shadow-lg">
                  {formatCount(day.total)} {day.total === 1 ? "job" : "jobs"}
                  {day.failed > 0 ? `, ${formatCount(day.failed)} failed` : ""}
                </div>

                {day.failed > 0 && (
                  <div className="bg-rose-500 rounded-t-[3px]" style={{ height: `${Math.max(failedHeight, 3)}px` }} />
                )}
                {day.succeeded > 0 && (
                  <div
                    className={`bg-emerald-500 ${day.failed > 0 ? "" : "rounded-t-[3px]"}`}
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
              {formatDayLabel(day.dayStartMs)}
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
  const groups = analytics.failureGroups.slice(0, 5);

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
          What is going wrong
        </h3>
        <p className="text-[12.5px] text-muted mt-1">
          The same failure grouped together, worst first.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-secondary">
          Nothing has failed. Every job in this period finished.
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
                  reading as urgent. */}
              <span
                className={`w-1 self-stretch rounded-[3px] shrink-0 ${
                  index === 0 ? "bg-rose-500" : "bg-amber-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-medium text-foreground">{group.label}</p>
                <p className="text-[11.5px] text-muted mt-0.5">
                  Started {formatRelativeTime(group.firstSeenAt, now)} · last happened{" "}
                  {formatRelativeTime(group.lastSeenAt, now)}
                </p>
                {group.runIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenRun(group.runIds[0] as Id<"agentRuns">)}
                    className="text-[11.5px] text-brand hover:underline mt-1"
                  >
                    See a job this happened to
                  </button>
                )}
              </div>
              <span
                className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap tabular-nums shrink-0 ${
                  index === 0 ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {formatCount(group.count)} {group.count === 1 ? "job" : "jobs"}
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
  const tools = analytics.toolStats.slice(0, 6);

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div>
        <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
          The tools it relies on
        </h3>
        <p className="text-[12.5px] text-muted mt-1">
          When an agent misbehaves, a tool is usually the reason.
        </p>
      </div>

      {tools.length === 0 ? (
        <p className="text-[13px] text-secondary">
          No tools used yet. This agent has answered without reaching for anything.
        </p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] text-muted">
              <th className="font-medium pb-2">Tool</th>
              <th className="font-medium pb-2 text-right w-[58px] pr-4">Used</th>
              <th className="font-medium pb-2 w-[104px] text-right pr-4">Worked</th>
              {/* The column that shows which tool is slow. */}
              <th className="font-medium pb-2 text-right w-[58px]">Usually</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => {
              const rate = tool.calls > 0 ? tool.successes / tool.calls : 0;
              const struggling = rate < 0.95;

              return (
                <tr key={tool.handlerMapping} className="border-t border-border-dim/40">
                  <td className="py-2.5 pr-3 text-foreground truncate max-w-0">
                    {describeToolName(tool.handlerMapping, toolNameByHandler)}
                    {tool.notImplemented > 0 && (
                      <span className="block text-[11px] text-amber-500 mt-0.5">
                        {formatCount(tool.notImplemented)} of these went to a tool that is not connected
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-secondary pr-4">
                    {formatCount(tool.calls)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="h-[5px] flex-1 rounded-[3px] bg-border-dim overflow-hidden min-w-[30px]">
                        <span
                          className={`block h-full rounded-[3px] ${struggling ? "bg-rose-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.round(rate * 100)}%` }}
                        />
                      </span>
                      <span className="text-[11.5px] text-secondary tabular-nums w-[38px] text-right">
                        {formatPercent(rate)}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-secondary">
                    {tool.typicalMs > 0 ? formatDuration(tool.typicalMs) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
  const latest = runs;

  return (
    <div className="border border-border-dim rounded-[14px] bg-card px-5 py-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold text-foreground tracking-tight">
            Latest jobs
          </h3>
          <p className="text-[12.5px] text-muted mt-1">
            Open any one to see exactly what it did, step by step.
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="px-3 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all shrink-0"
        >
          See all activity
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : latest.length === 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-white/[0.02] px-4 py-8 text-center text-[13px] text-secondary">
          No jobs recorded yet.
        </div>
      ) : (
        <div className="flex flex-col">
          {latest.map((run) => (
            <button
              key={run._id}
              type="button"
              onClick={() => onOpenRun(run._id)}
              className="flex items-center gap-3 py-3 border-t border-border-dim/40 first:border-t-0 first:pt-0 text-left group min-w-0"
            >
              <StatusPill status={run.status} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] text-foreground truncate">{run.objective}</span>
                <span className="block text-[11.5px] text-muted truncate">
                  {describeTrigger(run.triggerType)} · {formatRelativeTime(run.startedAt, now)}
                  {run.error ? ` · ${run.error}` : ""}
                </span>
              </span>
              <span className="text-[11.5px] text-secondary tabular-nums whitespace-nowrap shrink-0">
                {run.completedAt
                  ? run.completedAt - run.startedAt === 0
                    ? "under a second"
                    : formatDuration(run.completedAt - run.startedAt)
                  : "—"}
                {run.costGBP !== undefined ? ` · ${formatMoney(run.costGBP)}` : ""}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
          {canLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-3 self-center px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all"
            >
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "SUCCESS"
      ? "bg-emerald-500/10 text-emerald-500"
      : status === "FAILED"
        ? "bg-rose-500/10 text-rose-500"
        : status === "PENDING_APPROVAL"
          ? "bg-amber-500/10 text-amber-500"
          : status === "RUNNING" || status === "QUEUED"
            ? "bg-brand/10 text-brand"
            : "bg-foreground/5 text-secondary";

  return (
    // Fixed width so every job title on the list starts at the same place. Pills
    // sized to their own text made the column ragged and the list hard to scan.
    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 w-[86px] text-center ${tone}`}>
      {status === "PENDING_APPROVAL" && <UserCheck className="w-3 h-3 inline-block mr-1 -mt-px" />}
      {describeRunStatus(status)}
    </span>
  );
}
