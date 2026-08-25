"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, CircleCheck } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
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

export type SystemHealth = {
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

export type RunObservatory = {
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

export type ConnectionHealth = { working?: boolean };
export type JobHealth = { lastOk?: boolean; isOverdue?: boolean };

type RunRow = RunObservatory["recentRuns"][number];

export type HealthRunTableProps = {
  rows: RunRow[] | undefined;
  columns: DataTableColumn<RunRow>[];
  search: string;
  onSearchChange: (next: string) => void;
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
};

type Attention = { key: string; labelKey: string; count: number; actionKey: string; href: string };

function buildAttention(health: SystemHealth): Attention[] {
  const rows: Attention[] = [];
  const add = (key: string, labelKey: string, bucket: { count: number } | undefined, actionKey: string, href: string) => {
    if (!bucket || bucket.count <= 0) return;
    rows.push({ key, labelKey, count: bucket.count, actionKey, href });
  };
  const ops = health.operations ?? ({} as SystemHealth["operations"]);
  const budgets = health.budgetHealth ?? ({} as SystemHealth["budgetHealth"]);

  add("agentFailures", "attention.agentFailures", ops.agentFailures, "actions.openRuns", "/admin/agents");
  add("staleAgentRuns", "attention.staleAgentRuns", ops.staleAgentRuns, "actions.openRuns", "/admin/agents");
  add("pendingApprovals", "attention.pendingApprovals", ops.pendingApprovals, "actions.openApprovals", "/admin/governance/approvals");
  add("failedToolCalls", "attention.failedToolCalls", ops.failedToolCalls, "actions.openTools", "/admin/ai/tools");
  add("providerFailures", "attention.providerFailures", ops.providerFailures, "actions.openModels", "/admin/ai/models/providers");
  add("highCostAgents", "attention.highCostAgents", ops.highCostAgents, "actions.openAgents", "/admin/agents");
  add("agentCostBudgets", "attention.agentCostBudgets", budgets.agentCostBudgets, "actions.openAgents", "/admin/agents");
  add("tenantMessageBudgets", "attention.tenantMessageBudgets", budgets.tenantMessageBudgets, "actions.openCompanies", "/admin/companies");
  add("overdueSchedules", "attention.overdueSchedules", ops.overdueSchedules, "actions.openSchedules", "/admin/workflows/schedules");
  add("schedulesMissingNextRun", "attention.schedulesMissingNextRun", ops.schedulesMissingNextRun, "actions.openSchedules", "/admin/workflows/schedules");
  add("failedScheduledExecutions", "attention.failedScheduledExecutions", ops.failedScheduledExecutions, "actions.openWorkflowRuns", "/admin/workflows/executions");
  add("staleRunningScheduledExecutions", "attention.staleRunningScheduledExecutions", ops.staleRunningScheduledExecutions, "actions.openWorkflowRuns", "/admin/workflows/executions");
  add("failedAgentTransactions", "attention.failedAgentTransactions", ops.failedAgentTransactions, "actions.openAgents", "/admin/agents");

  return rows;
}

function formatSpend(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const RUN_RESULT_LABEL_KEYS: Record<string, string> = {
  SUCCESS: "results.worked",
  FAILED: "results.failed",
  CANCELLED: "results.stopped",
  RUNNING: "results.running",
  QUEUED: "results.queued",
  PENDING_APPROVAL: "results.waitingApproval",
};

export function HealthAttention({
  health,
  connections,
  jobs,
}: {
  health: SystemHealth;
  connections: ConnectionHealth[] | undefined;
  jobs: JobHealth[] | undefined;
}) {
  const t = useTranslations("admin.health");
  const attention = buildAttention(health);
  const brokenConnections = (connections ?? []).filter((row) => row.working === false).length;
  const troubledJobs = (jobs ?? []).filter((row) => row.lastOk === false || row.isOverdue).length;

  if (brokenConnections > 0) {
    attention.unshift({
      key: "connections",
      labelKey: "attention.connections",
      count: brokenConnections,
      actionKey: "actions.openConnections",
      href: "/admin/connections",
    });
  }
  if (troubledJobs > 0) {
    attention.unshift({
      key: "scheduledJobs",
      labelKey: "attention.scheduledJobs",
      count: troubledJobs,
      actionKey: "actions.openConnections",
      href: "/admin/connections",
    });
  }

  const isHealthy = attention.length === 0;

  return (
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
            ? t("statusHealthy")
            : t("statusAttention", { count: attention.length })}
        </span>
        {health.checkedAt ? (
          <span className={cn("text-[14px]", isHealthy ? "text-[#10b981]" : "text-[#f59e0b]")}>
            {t("checkedAt", { date: formatDateTime(health.checkedAt) })}
          </span>
        ) : null}
      </div>

      {attention.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t("fixFirst")}</h2>
          {attention.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card px-4 py-3 transition-colors hover:border-brand/40"
            >
              <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#f59e0b]" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-foreground">{t(item.labelKey)}</div>
                <div className="mt-0.5 text-[13px] text-secondary">
                  {t("inLastDays", { count: item.count })}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-brand">
                {t(item.actionKey)}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function RunObservatoryResults({
  runs,
  search,
  onSearchChange,
  page,
  onPageChange,
  TableComponent,
}: {
  runs: RunObservatory;
  search: string;
  onSearchChange: (next: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  TableComponent: ComponentType<HealthRunTableProps>;
}) {
  const t = useTranslations("admin.health");
  const totals = runs.totals;
  const needle = search.trim().toLowerCase();
  const visibleRuns = needle
    ? runs.recentRuns.filter((run) => `${run.objective} ${run.agentName}`.toLowerCase().includes(needle))
    : runs.recentRuns;
  const paged = paginateItems(visibleRuns, page, TABLE_PAGE_SIZE);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{t("lastDaysTitle")}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">
          {!totals || totals.runs === 0
            ? t("noRuns")
            : t("runsSummary", { runs: totals.runs, failed: totals.failedRuns, spend: formatSpend(totals.costGBP), duration: formatDuration(totals.averageLatencyMs) })}
        </p>
      </div>

      <TableComponent
        rows={paged.items}
        search={search}
        onSearchChange={onSearchChange}
        page={page}
        totalPages={paged.totalPages}
        totalCount={paged.totalItems}
        pageSize={paged.pageSize}
        isLoading={false}
        onPageChange={onPageChange}
        columns={[
          {
            key: "what",
            header: t("columnWhat"),
            cell: (run) => (
              <>
                <Link
                  href={`/admin/agents/${run.agentId}/runs/${run.runId}`}
                  className="text-[13px] text-foreground transition-colors hover:text-brand"
                >
                  {run.objective}
                </Link>
                {run.error ? (
                  <div className="mt-0.5 line-clamp-1 text-[12px] text-rose-300">{run.error}</div>
                ) : null}
              </>
            ),
          },
          {
            key: "agent",
            header: t("columnAgent"),
            cell: (run) => <span className="text-[13px] text-secondary">{run.agentName}</span>,
          },
          {
            key: "result",
            header: t("columnResult"),
            cell: (run) => (
              <span className={cn("text-[13px]", run.status === "FAILED" ? "text-rose-300" : "text-secondary")}>
                {RUN_RESULT_LABEL_KEYS[run.status] ? t(RUN_RESULT_LABEL_KEYS[run.status]) : run.status}
              </span>
            ),
          },
          {
            key: "took",
            header: t("columnTook"),
            cell: (run) => <span className="text-[13px] text-secondary">{formatDuration(run.latencyMs ?? 0)}</span>,
          },
          {
            key: "cost",
            header: t("columnCost"),
            cell: (run) => <span className="text-[13px] text-secondary">{formatSpend(run.costGBP ?? 0)}</span>,
          },
          {
            key: "when",
            header: t("columnWhen"),
            cell: (run) => <span className="text-[13px] text-secondary">{formatDateTime(run.startedAt)}</span>,
          },
        ]}
      />
    </section>
  );
}
