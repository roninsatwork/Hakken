"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertTriangle, ArrowRight, CircleCheck, HeartPulse } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { cn } from "@/src/ui/lib/utils";
import { useTranslations } from "next-intl";

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

/** `labelKey`/`actionKey` are catalogue keys relative to `admin.health` — the screen says the words. */
type Attention = { key: string; labelKey: string; count: number; actionKey: string; href: string };

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

// Catalogue keys, relative to `admin.health` — the screen says the words.
const RUN_RESULT_LABEL_KEYS: Record<string, string> = {
  SUCCESS: "results.worked",
  FAILED: "results.failed",
  CANCELLED: "results.stopped",
  RUNNING: "results.running",
  QUEUED: "results.queued",
  PENDING_APPROVAL: "results.waitingApproval",
};

export default function HealthPage() {
  const t = useTranslations("admin.health");
  const health = useQuery(api.systemHealth.getSystemHealthForAdmin, { daysBack: 7 }) as SystemHealth | undefined;
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
  const isHealthy = health !== undefined && attention.length === 0;
  // Same rule as the attention list: a missing section is not a reason to take
  // the whole screen down.
  const totals = runs?.totals;
  const recentRuns = runs?.recentRuns ?? [];

  // The list is short today and will not stay short: it is every run in the
  // last seven days. A search box and page numbers are what every other list
  // screen offers, and this had neither.
  const [runSearch, setRunSearch] = useState("");
  const [runPage, setRunPage] = useState(1);
  const runNeedle = runSearch.trim().toLowerCase();
  const visibleRuns = runNeedle
    ? recentRuns.filter((run) =>
        `${run.objective} ${run.agentName}`.toLowerCase().includes(runNeedle))
    : recentRuns;
  const runPaged = paginateItems(visibleRuns, runPage, TABLE_PAGE_SIZE);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<HeartPulse className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
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
                ? t("statusHealthy")
                : t("statusAttention", { count: attention.length })}
            </span>
            {health.checkedAt ? (
              <span className={cn("text-[14px]", isHealthy ? "text-[#10b981]" : "text-[#f59e0b]")}>
                {t("checkedAt", { date: formatDateTime(health.checkedAt) })}
              </span>
            ) : null}
          </div>

          {attention.length > 0 && (
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
          )}
        </>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("lastDaysTitle")}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">
            {runs === undefined
              ? t("countingRuns")
              : !totals || totals.runs === 0
                ? t("noRuns")
                : t("runsSummary", { runs: totals.runs, failed: totals.failedRuns, spend: formatSpend(totals.costGBP), duration: formatDuration(totals.averageLatencyMs) })}
          </p>
        </div>

        <DataTable
          rows={runs === undefined ? undefined : runPaged.items}
          rowKey={(run) => run.runId}
          minWidthClassName="min-w-[820px]"
          search={{
            value: runSearch,
            onChange: setRunSearch,
            placeholder: t("searchPlaceholder"),
          }}
          footer={{
            mode: "paged",
            page: runPage,
            totalPages: runPaged.totalPages,
            totalCount: runPaged.totalItems,
            pageSize: runPaged.pageSize,
            isLoading: runs === undefined,
            onPageChange: setRunPage,
            labels: { empty: t("emptyRuns") },
          }}
          empty={{ icon: <HeartPulse className="h-8 w-8 text-muted/30" />, label: t("emptyRuns") }}
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
                <span
                  className={cn(
                    "text-[13px]",
                    run.status === "FAILED" ? "text-rose-300" : "text-secondary",
                  )}
                >
                  {RUN_RESULT_LABEL_KEYS[run.status] ? t(RUN_RESULT_LABEL_KEYS[run.status]) : run.status}
                </span>
              ),
            },
            {
              key: "took",
              header: t("columnTook"),
              cell: (run) => (
                <span className="text-[13px] text-secondary">{formatDuration(run.latencyMs ?? 0)}</span>
              ),
            },
            {
              key: "cost",
              header: t("columnCost"),
              cell: (run) => (
                <span className="text-[13px] text-secondary">{formatSpend(run.costGBP ?? 0)}</span>
              ),
            },
            {
              key: "when",
              header: t("columnWhen"),
              cell: (run) => (
                <span className="text-[13px] text-secondary">{formatDateTime(run.startedAt)}</span>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
