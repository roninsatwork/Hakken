"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  ShieldAlert,
  Wrench,
} from "lucide-react";

type HealthExample = {
  id: string;
  label: string;
  occurredAt?: number;
  summary?: string;
  targetName?: string;
  targetType?: "agent" | "schedule" | "workflow";
};

type HealthBucket = {
  count: number;
  examples: HealthExample[];
};

type HealthSignal = {
  count: number;
  details: string[];
  key: string;
  label: string;
  runbook: string;
};

type SystemHealth = {
  analytics: {
    liveToday: {
      agentTransactions: number;
      assistantMessages: number;
      date: string;
    };
    messageDimensions: {
      mismatched: number;
      missingDimensions: number;
      missingThreads: number;
      scanned: number;
    };
    snapshotCoverage: {
      duplicateSnapshotGroups: unknown[];
      missingGlobalDates: string[];
      totalSnapshots: number;
    };
  };
  checkedAt: number;
  checkedDate: string;
  daysBack: number;
  operations: {
    agentFailures: HealthBucket;
    failedAgentTransactions: HealthBucket;
    failedScheduledExecutions: HealthBucket;
    overdueSchedules: HealthBucket;
    schedulesMissingNextRun: HealthBucket;
    staleRunningScheduledExecutions: HealthBucket;
  };
  overdueScheduleThresholdMinutes: number;
  staleRunningThresholdMinutes: number;
  windowStartDate: string;
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDateTime(value?: number) {
  if (!value) return "No timestamp";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildSignalRows(health: SystemHealth): HealthSignal[] {
  const rows: HealthSignal[] = [];
  const add = (key: string, label: string, bucket: HealthBucket, runbook: string) => {
    if (bucket.count <= 0) return;
    rows.push({
      key,
      label,
      count: bucket.count,
      details: bucket.examples.length > 0
        ? bucket.examples.map((example) => [
          example.targetName || example.label,
          example.summary,
          formatDateTime(example.occurredAt),
          example.id,
        ].filter(Boolean).join(" | "))
        : ["No examples captured."],
      runbook,
    });
  };

  add("agentErrorLogs", "Agent execution errors", health.operations.agentFailures, "Open the agent log, inspect provider/config/tool failure, then retry or fix the agent configuration.");
  add("failedAgentTransactions", "Failed agent transactions", health.operations.failedAgentTransactions, "Compare with agent logs and provider health before treating it as billing-only telemetry.");
  add("failedScheduledExecutions", "Failed scheduled executions", health.operations.failedScheduledExecutions, "Open workflow execution logs, fix the failed node or target configuration, then rerun manually.");
  add("staleScheduledExecutions", "Stale running scheduled executions", health.operations.staleRunningScheduledExecutions, "Inspect Convex action logs and workflow steps; determine whether the run is still processing or stranded.");
  add("overdueSchedules", "Overdue active schedules", health.operations.overdueSchedules, "Check whether workflow-schedule-dispatcher is running, the target exists, and nextRunAt recalculates.");
  add("schedulesMissingNextRun", "Active schedules missing next run", health.operations.schedulesMissingNextRun, "Toggle the schedule or repair schedule config after validating intervalStr.");

  const analyticsIssueCount = health.analytics.snapshotCoverage.missingGlobalDates.length +
    health.analytics.snapshotCoverage.duplicateSnapshotGroups.length +
    health.analytics.messageDimensions.missingDimensions +
    health.analytics.messageDimensions.mismatched +
    health.analytics.messageDimensions.missingThreads;

  if (analyticsIssueCount > 0) {
    rows.push({
      key: "analyticsHealth",
      label: "Analytics data-health drift",
      count: analyticsIssueCount,
      details: [
        `${health.analytics.snapshotCoverage.missingGlobalDates.length} missing snapshots`,
        `${health.analytics.snapshotCoverage.duplicateSnapshotGroups.length} duplicate snapshot groups`,
        `${health.analytics.messageDimensions.missingDimensions} missing dimensions`,
        `${health.analytics.messageDimensions.mismatched} mismatches`,
        `${health.analytics.messageDimensions.missingThreads} missing threads`,
      ],
      runbook: "Open Analytics settings for snapshot and message-dimension repair details.",
    });
  }

  return rows;
}

function HealthCard({
  description,
  icon: Icon,
  label,
  tone,
  value,
}: {
  description: string;
  icon: typeof Bot;
  label: string;
  tone: string;
  value: number | string;
}) {
  return (
    <div className="border border-border-dim bg-card/40 rounded-[10px] p-4 min-h-[132px] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">{label}</span>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <div className="text-2xl font-semibold text-foreground">{typeof value === "number" ? formatCount(value) : value}</div>
      <p className="text-[12px] text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

export default function SystemHealthPage() {
  const health = useQuery(api.analyticsCron.getSystemHealthForAdmin, { daysBack: 7 }) as SystemHealth | undefined;
  const isLoading = health === undefined;
  const signals = health ? buildSignalRows(health) : [];
  const signalCount = signals.reduce((sum, signal) => sum + signal.count, 0);
  const isHealthy = !isLoading && signalCount === 0;

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-brand" />
            System Health
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            Monitor platform alerts for agents, schedules, analytics health, and operational drift.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full border text-[10px] uppercase font-mono tracking-widest ${
          isLoading
            ? "border-border-dim text-muted bg-card"
            : isHealthy
              ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/10"
              : "border-amber-500/20 text-amber-500 bg-amber-500/10"
        }`}>
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isHealthy ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{isLoading ? "Checking" : isHealthy ? "Healthy" : `${formatCount(signalCount)} signals`}</span>
        </div>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-1" />

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <HealthCard
          icon={Bot}
          label="Agent errors"
          value={health?.operations.agentFailures.count ?? "--"}
          tone="text-red-500"
          description={health ? `${formatCount(health.operations.failedAgentTransactions.count)} failed transactions in the same window.` : "Loading recent agent failure checks."}
        />
        <HealthCard
          icon={CalendarClock}
          label="Scheduled runs"
          value={health?.operations.failedScheduledExecutions.count ?? "--"}
          tone="text-amber-500"
          description={health ? `${formatCount(health.operations.staleRunningScheduledExecutions.count)} stale running executions over ${health.staleRunningThresholdMinutes} minutes.` : "Loading scheduled execution checks."}
        />
        <HealthCard
          icon={Clock3}
          label="Schedule timing"
          value={health?.operations.overdueSchedules.count ?? "--"}
          tone="text-blue-500"
          description={health ? `${formatCount(health.operations.schedulesMissingNextRun.count)} active schedules missing next run.` : "Loading active schedule timing checks."}
        />
        <HealthCard
          icon={Activity}
          label="Live today"
          value={health?.analytics.liveToday.assistantMessages ?? "--"}
          tone="text-emerald-500"
          description={health ? `${formatCount(health.analytics.liveToday.agentTransactions)} agent transactions on ${health.analytics.liveToday.date}.` : "Loading live ingestion checks."}
        />
        <HealthCard
          icon={RefreshCcw}
          label="Analytics drift"
          value={health ? health.analytics.snapshotCoverage.missingGlobalDates.length + health.analytics.snapshotCoverage.duplicateSnapshotGroups.length + health.analytics.messageDimensions.missingDimensions + health.analytics.messageDimensions.mismatched + health.analytics.messageDimensions.missingThreads : "--"}
          tone="text-violet-500"
          description={health ? `${formatCount(health.analytics.messageDimensions.scanned)} recent messages scanned.` : "Loading analytics data-health checks."}
        />
        <HealthCard
          icon={Wrench}
          label="Window"
          value={health ? `${health.daysBack}d` : "--"}
          tone="text-rose-500"
          description={health ? `${health.windowStartDate} through ${health.checkedDate}. Last checked ${formatDateTime(health.checkedAt)}.` : "Loading checked date range."}
        />
      </section>

      {health && signals.length === 0 ? (
        <section className="border border-emerald-500/20 bg-emerald-500/10 rounded-[10px] p-4 flex items-start gap-3 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-widest">No operator action needed</h2>
            <p className="text-[12px] mt-1 leading-relaxed text-secondary">
              Agent failures, scheduled automation, and analytics health are clean for the current window.
            </p>
          </div>
        </section>
      ) : null}

      {signals.length > 0 ? (
        <section className="border border-amber-500/20 bg-amber-500/10 rounded-[10px] p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-[12px] font-bold uppercase tracking-widest">Operator attention needed</h2>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {signals.map((signal) => (
              <div key={signal.key} className="border border-border-dim bg-background/50 rounded-[8px] p-3 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">{signal.label}</h3>
                    <p className="text-[12px] text-secondary mt-1">{signal.runbook}</p>
                  </div>
                  <span className="inline-flex self-start sm:self-auto items-center px-2 py-1 rounded-[6px] bg-amber-500/10 text-amber-500 text-[11px] font-mono uppercase">
                    {formatCount(signal.count)} signals
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {signal.details.map((detail) => (
                    <p key={detail} className="text-[12px] text-secondary leading-relaxed break-words">
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {health ? (
        <section className="border border-border-dim bg-card/30 rounded-[10px] p-4 flex flex-col gap-3">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted">Investigation links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
            <Link className="text-brand hover:underline" href="/admin/workflows/logs">Workflow execution logs</Link>
            <Link className="text-brand hover:underline" href="/admin/workflows/schedules">Schedules</Link>
            <Link className="text-brand hover:underline" href="/admin/settings/analytics">Analytics data health</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
