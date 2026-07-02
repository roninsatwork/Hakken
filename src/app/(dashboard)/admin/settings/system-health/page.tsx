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
  Download,
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

type BudgetExample = {
  id: string;
  limit: number;
  occurredAt?: number;
  percentUsed: number;
  summary: string;
  targetName: string;
  targetType: "agent" | "company";
  used: number;
};

type BudgetBucket = {
  count: number;
  examples: BudgetExample[];
};

type AlertRule = {
  count: number;
  details: string[];
  key: string;
  label: string;
  nextAction: string;
  status: "ok" | "warning" | "critical";
  threshold: string;
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
  alertRules: AlertRule[];
  budgetHealth: {
    agentCostBudgets: BudgetBucket;
    tenantMessageBudgets: BudgetBucket;
  };
  checkedAt: number;
  checkedDate: string;
  daysBack: number;
  operations: {
    agentFailures: HealthBucket;
    failedAgentTransactions: HealthBucket;
    failedToolCalls: HealthBucket;
    failedScheduledExecutions: HealthBucket;
    highCostAgents: HealthBucket;
    overdueSchedules: HealthBucket;
    pendingApprovals: HealthBucket;
    providerFailures: HealthBucket;
    schedulesMissingNextRun: HealthBucket;
    staleAgentRuns: HealthBucket;
    staleRunningScheduledExecutions: HealthBucket;
  };
  overdueScheduleThresholdMinutes: number;
  pendingApprovalThresholdMinutes: number;
  highCostAgentThresholdGBP: number;
  scope: {
    companyId?: string;
    companyName?: string;
    type: "company" | "platform";
  };
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

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatBudgetExample(example: BudgetExample) {
  return [
    example.targetName,
    `${formatPercent(example.percentUsed)} used`,
    example.summary,
    formatDateTime(example.occurredAt),
    example.id,
  ].filter(Boolean).join(" | ");
}

function downloadHealthReport(health: SystemHealth) {
  const payload = JSON.stringify(health, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sonae-system-health-${health.scope.type}-${health.checkedDate}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  add("staleAgentRuns", "Stale agent runs", health.operations.staleAgentRuns, "Open the run detail timeline, inspect the latest step, and decide whether the run needs cancellation, replay, or provider/tool repair.");
  add("pendingApprovals", "Pending agent approvals", health.operations.pendingApprovals, "Open agent approvals and either approve, reject, or tune the approval policy if these are repeatedly stranded.");
  add("failedToolCalls", "Failed agent tool calls", health.operations.failedToolCalls, "Inspect the tool call arguments/result, connector diagnostics, and tenant policy before retrying the agent run.");
  add("providerFailures", "Provider failure clusters", health.operations.providerFailures, "Check provider health, model defaults, credentials, and recent deploys before changing agent prompts or tools.");
  add("highCostAgents", "High-cost agents", health.operations.highCostAgents, "Review run volume, token usage, model choice, budgets, and whether cheaper defaults or tighter retrieval limits are appropriate.");
  if (health.budgetHealth.agentCostBudgets.count > 0) {
    rows.push({
      key: "agentCostBudgetPressure",
      label: "Agent cost budget pressure",
      count: health.budgetHealth.agentCostBudgets.count,
      details: health.budgetHealth.agentCostBudgets.examples.length > 0
        ? health.budgetHealth.agentCostBudgets.examples.map(formatBudgetExample)
        : ["No examples captured."],
      runbook: "Open the run timeline, check model choice, retrieval breadth, and maxCostGBP before raising the budget.",
    });
  }
  if (health.budgetHealth.tenantMessageBudgets.count > 0) {
    rows.push({
      key: "tenantMessageBudgetPressure",
      label: "Tenant message budget pressure",
      count: health.budgetHealth.tenantMessageBudgets.count,
      details: health.budgetHealth.tenantMessageBudgets.examples.length > 0
        ? health.budgetHealth.tenantMessageBudgets.examples.map(formatBudgetExample)
        : ["No examples captured."],
      runbook: "Review the tenant plan assignment, current usage, and expected month-end activity before increasing capacity.",
    });
  }
  add("failedScheduledExecutions", "Failed scheduled executions", health.operations.failedScheduledExecutions, "Check the target workflow or agent run, fix the failed node or target configuration, then rerun manually.");
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

function getRuleTone(status: AlertRule["status"]) {
  if (status === "critical") return "border-red-500/20 bg-red-500/10 text-red-500";
  if (status === "warning") return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
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
          {health ? (
            <p className="text-[12px] text-muted mt-2">
              Scope: {health.scope.type === "platform" ? "Platform-wide" : health.scope.companyName || "Active company"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {health ? (
            <button
              type="button"
              onClick={() => downloadHealthReport(health)}
              className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-[8px] border border-border-dim bg-card/50 text-[11px] text-secondary hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5" />
              Export report
            </button>
          ) : null}
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
        </div>
      </header>

      <div className="w-full h-[1px] bg-border-dim my-1" />

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <HealthCard
          icon={Bot}
          label="Agent errors"
          value={health?.operations.agentFailures.count ?? "--"}
          tone="text-red-500"
          description={health ? `${formatCount(health.operations.staleAgentRuns.count)} stale runs and ${formatCount(health.operations.failedAgentTransactions.count)} failed transactions.` : "Loading recent agent failure checks."}
        />
        <HealthCard
          icon={ShieldAlert}
          label="Approvals"
          value={health?.operations.pendingApprovals.count ?? "--"}
          tone="text-amber-500"
          description={health ? `Pending longer than ${health.pendingApprovalThresholdMinutes} minutes.` : "Loading approval queue checks."}
        />
        <HealthCard
          icon={Wrench}
          label="Tool failures"
          value={health?.operations.failedToolCalls.count ?? "--"}
          tone="text-red-500"
          description={health ? `${formatCount(health.operations.providerFailures.count)} provider failure signals in the same window.` : "Loading tool and provider checks."}
        />
        <HealthCard
          icon={Activity}
          label="Cost risk"
          value={health ? health.operations.highCostAgents.count + health.budgetHealth.agentCostBudgets.count + health.budgetHealth.tenantMessageBudgets.count : "--"}
          tone="text-rose-500"
          description={health ? `Spend above £${health.highCostAgentThresholdGBP.toFixed(2)} or budgets above 80%.` : "Loading cost risk checks."}
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

      {health ? (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="border border-border-dim bg-card/30 rounded-[10px] p-4 flex flex-col gap-3">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted">Budget controls</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-border-dim rounded-[8px] p-3 bg-background/40">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Run budgets</p>
                <p className="text-xl font-semibold text-foreground mt-2">{formatCount(health.budgetHealth.agentCostBudgets.count)}</p>
                <p className="text-[12px] text-secondary mt-1">Agent runs above 80% of configured maxCostGBP.</p>
              </div>
              <div className="border border-border-dim rounded-[8px] p-3 bg-background/40">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Tenant quotas</p>
                <p className="text-xl font-semibold text-foreground mt-2">{formatCount(health.budgetHealth.tenantMessageBudgets.count)}</p>
                <p className="text-[12px] text-secondary mt-1">Companies above 80% of assigned plan message limit.</p>
              </div>
            </div>
          </div>
          <div className="border border-border-dim bg-card/30 rounded-[10px] p-4 flex flex-col gap-3">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted">Alert rules</h2>
            <div className="grid grid-cols-1 gap-2">
              {health.alertRules.map((rule) => (
                <div key={rule.key} className="border border-border-dim rounded-[8px] p-3 bg-background/40 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold text-foreground">{rule.label}</p>
                    <span className={`px-2 py-1 rounded-[6px] border text-[10px] uppercase font-mono ${getRuleTone(rule.status)}`}>
                      {rule.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-secondary">{rule.threshold}</p>
                  {rule.count > 0 ? <p className="text-[12px] text-muted">{rule.nextAction}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

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
            <Link className="text-brand hover:underline" href="/admin/workflows/schedules">Schedules</Link>
            <Link className="text-brand hover:underline" href="/admin/agents/approvals">Agent approvals</Link>
            <Link className="text-brand hover:underline" href="/admin/agents">Agents</Link>
            <Link className="text-brand hover:underline" href="/admin/ai/usage/costs">AI costs</Link>
            <Link className="text-brand hover:underline" href="/admin/settings/analytics">Analytics data health</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
