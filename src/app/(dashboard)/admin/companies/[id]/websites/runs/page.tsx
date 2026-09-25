"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { CostFigure, dollars } from "../CostFigure";
import { HourlyCheckNote } from "./HourlyCheckNote";
import { RunStatus } from "./RunStatus";
import { useRunFormat } from "./runFormat";

/** How far back the list reaches, in days; `all` has no bound. */
const PERIODS = { months3: 92, months12: 366, all: null } as const;
type Period = keyof typeof PERIODS;

/**
 * Every collection run for one company — "a run is when the agents run for a
 * company" (Anthony, 2026-09-24) — with what it cost and where it stands, and
 * above it this month's spend, the last run, a month from now and the next
 * run. A row opens the run in full (`[cycleId]/page.tsx`).
 *
 * Super admin only, like the rest of the company screens: what a client costs
 * is a margin question, never shown to them. The figures come from each run's
 * report, worked out in the background (`convex/seoRunReports.ts`); a run too
 * new to have one shows what its requests have cost so far.
 */
export default function CompanyCollectionRunsPage() {
  const t = useTranslations("admin.collectionRuns");
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;
  const [period, setPeriod] = useState<Period>("months3");

  const summary = useQuery(api.seoRunReports.getCompanyRunSummary, { companyId });
  const runs = useServerPagedTable(
    api.seoRunReports.listCompanyRuns,
    { companyId, ...(PERIODS[period] !== null ? { withinDays: PERIODS[period] } : {}) },
    TABLE_PAGE_SIZE,
  );
  const { count, when, day, clock } = useRunFormat();

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Receipt className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CostFigure
          label={t("figures.month")}
          value={summary ? dollars(summary.monthUsd) : "…"}
          hint={t("figures.monthHint", { count: summary?.monthRuns ?? 0 })}
          emphasis
        />
        <CostFigure
          label={t("figures.lastRun")}
          value={summary?.lastRun ? dollars(summary.lastRun.totalUsd) : t("figures.noRunYet")}
          hint={summary?.lastRun ? when(summary.lastRun.startedAt) : ""}
        />
        <CostFigure
          label={t("figures.estimate")}
          value={summary?.estimate ? dollars(summary.estimate.perMonthUsd) : "–"}
          hint={summary?.estimate ? t("figures.estimateHint") : t("figures.estimateOff")}
        />
        <CostFigure
          label={t("figures.nextRun")}
          value={summary?.nextRun ? day(summary.nextRun.at) : t("figures.notScheduled")}
          hint={summary?.nextRun
            ? t("figures.nextRunHint", {
              time: clock(summary.nextRun.at),
              cadence: t(`cadence.${summary.nextRun.cadence}`),
            })
            : ""}
        />
      </div>

      <HourlyCheckNote />

      <DataTable
        rows={runs.isLoading ? undefined : runs.rows}
        rowKey={(row) => row.cycleId}
        minWidthClassName="min-w-[900px]"
        onRowClick={(row) => router.push(`/admin/companies/${companyId}/websites/runs/${row.cycleId}`)}
        filters={
          <Select aria-label={t("period.label")} value={period} onChange={(value) => setPeriod(value as Period)}>
            {(Object.keys(PERIODS) as Period[]).map((key) => (
              <option key={key} value={key}>{t(`period.${key}`)}</option>
            ))}
          </Select>
        }
        empty={{ icon: <Receipt className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: runs.page,
          totalPages: runs.totalPages,
          totalCount: runs.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: runs.isBusy,
          onPageChange: runs.goToPage,
        }}
        columns={[
          {
            key: "run",
            header: t("columns.run"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{when(row.startedAt)}</span>
                <span className="text-[11px] text-muted">{t("runLine", { count: row.collectorRuns ?? 0 })}</span>
              </span>
            ),
          },
          {
            key: "websites",
            header: t("columns.websites"),
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.websites === null ? "–" : count(row.websites)}</span>,
          },
          {
            key: "requests",
            header: t("columns.requests"),
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{count(row.requests)}</span>,
          },
          {
            key: "held",
            header: t("columns.held"),
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{count(row.reused)}</span>,
          },
          {
            key: "data",
            header: t("columns.data"),
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{dollars(row.costUsd)}</span>,
          },
          {
            key: "ai",
            header: t("columns.ai"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">
                {row.aiCostUsd === null ? t("workingOut") : dollars(row.aiCostUsd)}
              </span>
            ),
          },
          {
            key: "total",
            header: t("columns.total"),
            align: "right",
            cell: (row) => <span className="font-mono text-[13px] font-semibold text-foreground">{dollars(row.totalUsd)}</span>,
          },
          {
            key: "status",
            header: t("columns.status"),
            cell: (row) => (
              <RunStatus
                totalUsd={row.totalUsd}
                previousTotalUsd={row.previousTotalUsd}
                waiting={row.waiting}
                answering={row.answering}
                failed={row.failed}
                final={row.final}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
