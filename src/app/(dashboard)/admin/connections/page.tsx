"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CircleCheck, HelpCircle, Loader2, PlugZap } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import {
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { formatDateTime } from "@/src/lib/dates";

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
  const connections = useQuery(api.connectionProbes.listConnections, {});
  const jobs = useQuery(api.jobLedger.listJobRuns, {});
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
        description={t("subtitle")}
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

      <TableShell minWidthClassName="min-w-[780px]">
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.connection")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.state")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.detail")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.checked")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {connections === undefined ? (
            <TableLoadingRow colSpan={4} />
          ) : connections.length === 0 ? (
            <TableEmptyRow
              colSpan={4}
              icon={<PlugZap className="w-5 h-5" />}
              label={t("noConnections")}
            />
          ) : (
            connections.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border-dim/50 last:border-b-0 hover:bg-hover/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="text-[14px] text-foreground">{row.name}</span>
                  <span className="block text-[11px] uppercase tracking-[0.1em] text-muted mt-0.5">
                    {t(`kind.${row.kind}`)}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
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
                </td>
                <td className="px-4 py-3 text-[13px] text-secondary max-w-[380px]">
                  <span className="line-clamp-2">{row.detail}</span>
                  {row.lastHeardAt && (
                    <span className="block text-[12px] text-muted mt-0.5">
                      {t("lastHeard", { when: formatDateTime(row.lastHeardAt) })}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] text-secondary whitespace-nowrap">
                  {when(row.checkedAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>

      <div className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">{t("jobs.title")}</h2>
        <p className="text-[12.5px] text-secondary">{t("jobs.hint")}</p>
      </div>

      <TableShell minWidthClassName="min-w-[780px]">
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("jobs.columns.job")}</TableHeaderCell>
            <TableHeaderCell>{t("jobs.columns.state")}</TableHeaderCell>
            <TableHeaderCell>{t("jobs.columns.lastRan")}</TableHeaderCell>
            <TableHeaderCell>{t("jobs.columns.lastWorked")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {jobs === undefined ? (
            <TableLoadingRow colSpan={4} />
          ) : (
            jobs.map((job) => {
              const bad = job.lastOk === false || job.isOverdue;
              return (
                <tr
                  key={job.job}
                  className="border-b border-border-dim/50 last:border-b-0 hover:bg-hover/40 transition-colors"
                >
                  <td className="px-4 py-3 text-[13.5px] text-foreground">{job.job}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
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
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary whitespace-nowrap">
                    {when(job.lastRanAt)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary whitespace-nowrap">
                    {when(job.lastSucceededAt)}
                    {job.lastError && (
                      <span className="block text-[12px] text-muted max-w-[280px] truncate">
                        {job.lastError}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
