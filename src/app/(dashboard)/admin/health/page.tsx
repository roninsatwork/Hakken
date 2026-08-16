"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, ArrowRight, CircleCheck, HeartPulse } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import { cn } from "@/src/ui/lib/utils";

type HealthExample = {
  id?: string;
  label?: string;
  occurredAt?: number;
  summary?: string;
  targetName?: string;
};

type HealthBucket = { count: number; examples: HealthExample[] };

type SystemHealth = {
  budgetHealth: {
    agentCostBudgets: { count: number };
    tenantMessageBudgets: { count: number };
  };
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
  checkedAt: number;
};

type RunObservatory = {
  lookbackDays: number;
  sampledRuns: number;
  totals: {
    runs: number;
    failedRuns: number;
    activeRuns: number;
    costGBP: number;
    successRate: number;
    averageLatencyMs: number;
  };
  recentRuns: Array<{
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    agentName: string;
    status: string;
    objective: string;
    startedAt: number;
    latencyMs?: number;
    costGBP?: number;
    error?: string;
  }>;
};

type Attention = { key: string; label: string; count: number; action: string; href: string };

/**
 * Everything that needs attention is worth naming; everything that does not is
 * worth one line.
 *
 * The two screens this replaces led with counters — nine on one, six plus a
 * six-box status grid on the other — and on a healthy platform every one of
 * them read zero. The honest answer already existed in the code, as a list that
 * skips anything at zero, rendered underneath the wall of zeros where nobody
 * reached it.
 */
function buildAttention(health: SystemHealth): Attention[] {
  const rows: Attention[] = [];
  // A missing bucket is not the same as a failing one. Reading straight through
  // to `.count` meant one absent field took the whole screen down with it —
  // exactly what an admin does not need from the screen that tells them
  // whether anything is wrong.
  const add = (key: string, label: string, bucket: { count: number } | undefined, action: string, href: string) => {
    if (!bucket || bucket.count <= 0) return;
    rows.push({ key, label, count: bucket.count, action, href });
  };
  const ops = health.operations ?? ({} as SystemHealth["operations"]);
  const budgets = health.budgetHealth ?? ({} as SystemHealth["budgetHealth"]);

  add("agentFailures", "Agent runs that failed", ops.agentFailures, "Open the runs", "/admin/agents");
  add("staleAgentRuns", "Runs that started and never finished", ops.staleAgentRuns, "Open the runs", "/admin/agents");
  add("pendingApprovals", "Approvals waiting on a person", ops.pendingApprovals, "Open approvals", "/admin/governance/approvals");
  add("failedToolCalls", "Tool calls that failed", ops.failedToolCalls, "Open tools", "/admin/ai/tools");
  add("providerFailures", "Repeated failures from a model provider", ops.providerFailures, "Open models", "/admin/ai/models/providers");
  add("highCostAgents", "Agents costing more than expected", ops.highCostAgents, "Open agents", "/admin/agents");
  add("agentCostBudgets", "Agents close to their spend limit", budgets.agentCostBudgets, "Open agents", "/admin/agents");
  add("tenantMessageBudgets", "Companies close to their message limit", budgets.tenantMessageBudgets, "Open companies", "/admin/companies");
  add("overdueSchedules", "Schedules that should have run by now", ops.overdueSchedules, "Open schedules", "/admin/workflows/schedules");
  add("schedulesMissingNextRun", "Schedules with nothing planned next", ops.schedulesMissingNextRun, "Open schedules", "/admin/workflows/schedules");
  add("failedScheduledExecutions", "Scheduled runs that failed", ops.failedScheduledExecutions, "Open workflow runs", "/admin/workflows/executions");
  add("staleRunningScheduledExecutions", "Scheduled runs that never finished", ops.staleRunningScheduledExecutions, "Open workflow runs", "/admin/workflows/executions");
  add("failedAgentTransactions", "Agent charges that failed", ops.failedAgentTransactions, "Open agents", "/admin/agents");

  return rows;
}

/** Dollars to the cent. The old screen printed £0.0000, in the wrong currency. */
function formatSpend(value: number) {
  return `$${value.toFixed(2)}`;
}

/** Seconds, because nobody reads an agent run in milliseconds. */
function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const RUN_RESULT_LABELS: Record<string, string> = {
  SUCCESS: "Worked",
  FAILED: "Failed",
  CANCELLED: "Stopped",
  RUNNING: "Running",
  QUEUED: "Queued",
  PENDING_APPROVAL: "Waiting for approval",
};

export default function HealthPage() {
  const health = useQuery(api.analyticsCron.getSystemHealthForAdmin, { daysBack: 7 }) as SystemHealth | undefined;
  const runs = useQuery(api.agentRuns.getRunObservatory, { lookbackDays: 7 }) as RunObservatory | undefined;
  // The outside world, and the platform's own scheduled work (seven-gaps
  // plan, phase 2). This page reads internal tables only; without these two
  // a dead mailbox or a sweep that stopped running left it saying "nothing
  // needs attention".
  const connections = useQuery(api.connectionProbes.listConnections, {});
  const jobs = useQuery(api.jobLedger.listJobRuns, {});

  const attention = health ? buildAttention(health) : [];
  const brokenConnections = (connections ?? []).filter((row) => row.working === false).length;
  const troubledJobs = (jobs ?? []).filter((row) => row.lastOk === false || row.isOverdue).length;
  if (brokenConnections > 0) {
    attention.unshift({
      key: "connections",
      label: "Connections that stopped answering",
      count: brokenConnections,
      action: "Open connections",
      href: "/admin/connections",
    });
  }
  if (troubledJobs > 0) {
    attention.unshift({
      key: "scheduledJobs",
      label: "Scheduled jobs failing or late",
      count: troubledJobs,
      action: "Open connections",
      href: "/admin/connections",
    });
  }
  const isHealthy = health !== undefined && attention.length === 0;
  // Same rule as the attention list: a missing section is not a reason to take
  // the whole screen down.
  const totals = runs?.totals;
  const recentRuns = runs?.recentRuns ?? [];

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <AdminPageHeader
        icon={<HeartPulse className="h-6 w-6 text-brand" />}
        title="Health"
        description="Whether anything needs your attention, and how your agents have been running."
      />

      {health ? (
        <>
          <div
            className={cn(
              "flex items-center gap-3 rounded-[10px] border px-4 py-3",
              isHealthy
                ? "border-[#10b981]/20 bg-[#10b981]/10"
                : "border-[#f59e0b]/20 bg-[#f59e0b]/10",
            )}
          >
            {isHealthy
              ? <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[#10b981]" />
              : <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />}
            <span className={cn("text-[15px] font-semibold", isHealthy ? "text-[#10b981]" : "text-[#f59e0b]")}>
              {isHealthy
                ? "Nothing needs attention"
                : attention.length === 1
                  ? "1 thing needs attention"
                  : `${attention.length} things need attention`}
            </span>
            {health.checkedAt ? (
              <span className={cn("text-[14px]", isHealthy ? "text-[#10b981]" : "text-[#f59e0b]")}>
                · checked {formatDateTime(health.checkedAt)}
              </span>
            ) : null}
          </div>

          {attention.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-foreground">Fix these first</h2>
              {attention.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
                >
                  <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-foreground">{item.label}</div>
                    <div className="mt-0.5 text-[13px] text-secondary">
                      {item.count} in the last 7 days
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                    {item.action}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">The last 7 days</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">
            {runs === undefined
              ? "Counting recent runs."
              : !totals || totals.runs === 0
                ? "No agent has run in the last 7 days."
                : `${totals.runs} run${totals.runs === 1 ? "" : "s"}, ${totals.failedRuns} failed, ${formatSpend(totals.costGBP)} spent, ${formatDuration(totals.averageLatencyMs)} on average.`}
          </p>
        </div>

        <AdminTableShell minWidthClassName="min-w-[820px]">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>What ran</AdminTableHeaderCell>
              <AdminTableHeaderCell>Agent</AdminTableHeaderCell>
              <AdminTableHeaderCell>Result</AdminTableHeaderCell>
              <AdminTableHeaderCell>Took</AdminTableHeaderCell>
              <AdminTableHeaderCell>Cost</AdminTableHeaderCell>
              <AdminTableHeaderCell>When</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {runs === undefined ? (
              <AdminTableLoadingRow colSpan={6} />
            ) : recentRuns.length === 0 ? (
              <AdminTableEmptyRow
                colSpan={6}
                icon={<HeartPulse className="h-8 w-8 text-muted/30" />}
                label="Nothing has run yet"
              />
            ) : (
              recentRuns.map((run) => (
                <tr key={run.runId} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/agents/${run.agentId}/runs/${run.runId}`}
                      className="text-[13px] text-foreground transition-colors hover:text-brand"
                    >
                      {run.objective}
                    </Link>
                    {run.error ? (
                      <div className="mt-0.5 line-clamp-1 text-[12px] text-rose-300">{run.error}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">{run.agentName}</td>
                  <td
                    className={cn(
                      "px-4 py-3 align-top text-[13px]",
                      run.status === "FAILED" ? "text-rose-300" : "text-secondary",
                    )}
                  >
                    {RUN_RESULT_LABELS[run.status] ?? run.status}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {formatDuration(run.latencyMs ?? 0)}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {formatSpend(run.costGBP ?? 0)}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {formatDateTime(run.startedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableShell>
      </section>
    </div>
  );
}
