"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TableFilterSelect } from "@/src/ui/components/screens/TableControls";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDateTime } from "@/src/lib/dates";

/**
 * Every DataForSEO pull, at whatever stage it has reached.
 *
 * **One table, not two.** The queue and the collected list were two tables on
 * this screen for a while — two searches, two footers, and the list anyone
 * actually reads sitting underneath one that is empty by design almost all the
 * time. They are the same rows one stage apart, so they are one list with a
 * state filter over it, and "failures only" is one value of that filter rather
 * than a chip of its own.
 *
 * It lives beside All Websites rather than inside a company for two reasons.
 * The queue is one shared pipeline, so a per-tenant slice of it would describe
 * something that does not exist. And every figure here is Hakken's own spend,
 * which no customer may ever see.
 */

/** The stages a pull passes through, in the order it passes through them. */
const STATES = ["PENDING", "CLAIMED", "SUBMITTED", "READY", "FAILED"] as const;
type PullState = (typeof STATES)[number];

const TONES: Record<string, StatusTone> = {
  PENDING: "neutral",
  CLAIMED: "info",
  SUBMITTED: "info",
  READY: "success",
  FAILED: "danger",
};

export default function SeoCollectionPage() {
  const t = useTranslations("admin.seoCollection");
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [state, setState] = useState<PullState | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const counts = useQuery(api.seoCollectionReports.readSeoQueueCounts, {});
  const pulls = useServerPagedTable(
    api.seoCollectionReports.listSeoPulls,
    {
      ...(state ? { status: state } : {}),
      searchTerm: debouncedSearch,
    },
    TABLE_PAGE_SIZE,
  );

  // A narrower list must not leave the reader on page nine of it.
  const narrow = (apply: () => void) => {
    apply();
    pulls.goToPage(1);
  };

  const label = (value: PullState) => t(`pull.${value}`);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("pullsTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {counts
            ? t("queueCounts", {
              pending: count(counts.pending, counts.capped),
              claimed: count(counts.claimed, counts.capped),
              submitted: count(counts.submitted, counts.capped),
            })
            : t("queueSubtitle")}
        </p>
      </div>

      <DataTable
        rows={pulls.isLoading ? undefined : pulls.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[860px]"
        onRowClick={(row) => {
          if (row.cycleId) router.push(`/admin/websites/collection/${row.cycleId}`);
        }}
        search={{
          value: searchTerm,
          onChange: (value) => narrow(() => setSearchTerm(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <TableFilterSelect
            label={t("stateFilter.label")}
            options={STATES.map(label)}
            value={state ? label(state) : null}
            onChange={(next) => narrow(() =>
              setState(next ? STATES.find((value) => label(value) === next) ?? null : null))}
            allLabel={t("stateFilter.all")}
            filterPlaceholder={t("stateFilter.search")}
            noMatchesLabel={t("stateFilter.noMatches")}
          />
        }
        empty={{
          icon: <Layers className="h-8 w-8 text-muted/30" />,
          label: searchTerm || state ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page: pulls.page,
          totalPages: pulls.totalPages,
          totalCount: pulls.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: pulls.isBusy,
          onPageChange: pulls.goToPage,
          labels: { empty: searchTerm || state ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("hostColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.host}</span>
                {/*
                  Whose cadence caused this, not somebody to charge. A shared
                  host is pulled once for everyone watching it.
                */}
                <span className="text-[11px] text-muted">{row.companyName}</span>
              </div>
            ),
          },
          {
            key: "operation",
            header: t("operationColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{t(`operation.${row.operationId}`)}</span>
            ),
          },
          {
            key: "state",
            header: t("stateColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-1">
                <StatusPill tone={TONES[row.status] ?? "neutral"}>
                  {t(`pull.${row.status}`)}
                </StatusPill>
                {row.error ? (
                  <span className="max-w-sm text-[11px] leading-relaxed text-warning">
                    {row.error}
                  </span>
                ) : row.attempts > 0 ? (
                  <span className="text-[11px] text-warning">
                    {t("attempts", { count: row.attempts })}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "when",
            header: t("whenColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.at ? formatDateTime(row.at) : "—"}
              </span>
            ),
          },
          {
            key: "cost",
            header: t("costColumn"),
            align: "right",
            cell: (row) => (
              row.sandbox ? (
                <span className="text-[12px] text-muted">{t("sandbox")}</span>
              ) : (
                <span className="font-mono text-[12px] text-secondary">
                  ${row.costUsd.toFixed(4)}
                </span>
              )
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * A count that hit its ceiling reads as "more than", because this is a number
 * on a screen somebody refreshes and an exact count over a huge table is the
 * query that works right up until the day it does not.
 */
function count(value: number, capped: boolean) {
  return capped && value >= 500 ? `${value}+` : String(value);
}
