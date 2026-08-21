"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CircleCheck, HelpCircle, Loader2, PlugZap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * Connections that are really checked (seven-gaps plan, phase 2).
 *
 * One row per thing the platform depends on, each saying "working" or
 * "needs attention" in words — never colour alone — with the moment it was
 * last actually contacted. The scheduled-work table beneath answers the
 * other half of the question: is the machinery still running at all.
 */
export default function ConnectionsPage() {
  const t = useTranslations("connections");
  const { platformName } = useSystemSettings();
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectionPage, setConnectionPage] = useState(1);
  const [jobSearch, setJobSearch] = useState("");
  const [jobPage, setJobPage] = useState(1);

  const connections = useQuery(api.connectionProbes.listConnections, {});
  const jobs = useQuery(api.jobLedger.listJobRuns, {});

  // Neither table had a search box or page numbers. Both lists grow with the
  // number of things wired up, and both are read when something has gone wrong,
  // which is exactly when finding one row quickly matters.
  const connectionNeedle = connectionSearch.trim().toLowerCase();
  const visibleConnections = (connections ?? []).filter((row) =>
    !connectionNeedle || `${row.name} ${row.detail ?? ""}`.toLowerCase().includes(connectionNeedle));
  const connectionPaged = paginateItems(visibleConnections, connectionPage, TABLE_PAGE_SIZE);

  const jobNeedle = jobSearch.trim().toLowerCase();
  const visibleJobs = (jobs ?? []).filter((job) =>
    !jobNeedle || job.job.toLowerCase().includes(jobNeedle));
  const jobPaged = paginateItems(visibleJobs, jobPage, TABLE_PAGE_SIZE);
  const probeNow = useAction(api.connectionProbes.probeConnectionsNow);
  const [isChecking, setIsChecking] = useState(false);

  const needAttention = (connections ?? []).filter((row) => row.working === false).length;

  const check = async () => {
    setIsChecking(true);
    try {
      await probeNow({});
    } finally {
      setIsChecking(false);
    }
  };

  const when = (at: number | null) => (at ? formatDateTime(at) : t("never"));

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<PlugZap className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle", { platformName })}
        divider
        action={
          <WriteButton
            onClick={() => void check()}
            disabled={isChecking}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-brand text-white text-[13px] font-medium disabled:opacity-40 transition-opacity"
          >
            {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isChecking ? t("checking") : t("checkNow")}
          </WriteButton>
        }
      />

      <div
        className={`rounded-[16px] border px-5 py-4 ${
          needAttention > 0 ? "border-warning/40 bg-warning/5" : "border-border-dim bg-card/40"
        }`}
      >
        <p className="flex items-center gap-2 text-[14px] text-foreground">
          {needAttention > 0 ? (
            <AlertTriangle className="w-4 h-4 text-warning" />
          ) : (
            <CircleCheck className="w-4 h-4 text-info" />
          )}
          {connections === undefined
            ? t("loading")
            : needAttention > 0
              ? t("someBroken", { count: needAttention })
              : t("allWell")}
        </p>
        <p className="mt-1 text-[12.5px] text-secondary">{t("hint")}</p>
      </div>

      <DataTable
        rows={connections === undefined ? undefined : connectionPaged.items}
        rowKey={(row) => row.id}
        minWidthClassName="min-w-[780px]"
        search={{
          value: connectionSearch,
          onChange: (value) => { setConnectionSearch(value); setConnectionPage(1); },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <PlugZap className="w-5 h-5" />, label: t("noConnections") }}
        footer={{
          mode: "paged",
          page: connectionPage,
          totalPages: connectionPaged.totalPages,
          totalCount: connectionPaged.totalItems,
          pageSize: connectionPaged.pageSize,
          isLoading: connections === undefined,
          onPageChange: setConnectionPage,
          labels: { empty: t("noConnections") },
        }}
        columns={[
          {
            key: "connection",
            header: t("columns.connection"),
            cell: (row) => (
              <>
                <span className="text-[14px] text-foreground">{row.name}</span>
                <span className="block text-[11px] uppercase tracking-[0.1em] text-muted mt-0.5">
                  {t(`kind.${row.kind}`)}
                </span>
              </>
            ),
          },
          {
            key: "state",
            header: t("columns.state"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  row.working === false
                    ? "bg-warning/15 text-warning"
                    : row.working === null
                      ? "bg-foreground/5 text-muted"
                      : "bg-info/15 text-info"
                }`}
              >
                {row.working === false ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : row.working === null ? (
                  <HelpCircle className="w-3 h-3" />
                ) : (
                  <CircleCheck className="w-3 h-3" />
                )}
                {row.working === false
                  ? t("state.attention")
                  : row.working === null
                    ? t("state.unknown")
                    : t("state.working")}
              </span>
            ),
          },
          {
            key: "detail",
            header: t("columns.detail"),
            className: "max-w-[380px]",
            cell: (row) => (
              <div className="text-[13px] text-secondary">
                <span className="line-clamp-2">{row.detail}</span>
                {row.lastHeardAt && (
                  <span className="block text-[12px] text-muted mt-0.5">
                    {t("lastHeard", { when: formatDateTime(row.lastHeardAt) })}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: "checked",
            header: t("columns.checked"),
            className: "whitespace-nowrap",
            cell: (row) => <span className="text-[13px] text-secondary">{when(row.checkedAt)}</span>,
          },
        ]}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">{t("jobs.title")}</h2>
        <p className="text-[12.5px] text-secondary">{t("jobs.hint")}</p>
      </div>

      <DataTable
        rows={jobs === undefined ? undefined : jobPaged.items}
        rowKey={(job) => job.job}
        minWidthClassName="min-w-[780px]"
        search={{
          value: jobSearch,
          onChange: (value) => { setJobSearch(value); setJobPage(1); },
          placeholder: t("jobs.searchPlaceholder"),
        }}
        empty={{ icon: <PlugZap className="w-5 h-5" />, label: t("jobs.noJobs") }}
        footer={{
          mode: "paged",
          page: jobPage,
          totalPages: jobPaged.totalPages,
          totalCount: jobPaged.totalItems,
          pageSize: jobPaged.pageSize,
          isLoading: jobs === undefined,
          onPageChange: setJobPage,
          labels: { empty: t("jobs.noJobs") },
        }}
        columns={[
          {
            key: "job",
            header: t("jobs.columns.job"),
            cell: (job) => <span className="text-[13.5px] text-foreground">{job.job}</span>,
          },
          {
            key: "state",
            header: t("jobs.columns.state"),
            className: "whitespace-nowrap",
            cell: (job) => {
              const bad = job.lastOk === false || job.isOverdue;
              return (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    bad
                      ? "bg-warning/15 text-warning"
                      : job.lastRanAt === null
                        ? "bg-foreground/5 text-muted"
                        : "bg-info/15 text-info"
                  }`}
                >
                  {job.lastOk === false
                    ? t("jobs.state.failed", { count: job.consecutiveFailures })
                    : job.isOverdue
                      ? t("jobs.state.overdue")
                      : job.lastRanAt === null
                        ? t("jobs.state.neverRan")
                        : t("jobs.state.ran")}
                </span>
              );
            },
          },
          {
            key: "lastRan",
            header: t("jobs.columns.lastRan"),
            className: "whitespace-nowrap",
            cell: (job) => <span className="text-[13px] text-secondary">{when(job.lastRanAt)}</span>,
          },
          {
            key: "lastWorked",
            header: t("jobs.columns.lastWorked"),
            className: "whitespace-nowrap",
            cell: (job) => (
              <span className="text-[13px] text-secondary">
                {when(job.lastSucceededAt)}
                {job.lastError && (
                  <span className="block text-[12px] text-muted max-w-[280px] truncate">
                    {job.lastError}
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
