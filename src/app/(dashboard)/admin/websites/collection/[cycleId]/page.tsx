"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { BackRow, DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDateTime } from "@/src/lib/dates";
import { smallDollars } from "@/src/app/(dashboard)/admin/companies/[id]/websites/money";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";

/**
 * One collection run, line by line.
 *
 * The question this answers is "what did Monday's run actually do", and the
 * column that answers it is **paid**. A line marked as already held was served
 * by a pull somebody else bought — one host is stored once and fetched once —
 * and it shows no cost here because charging it twice on two screens is how a
 * saving turns into a phantom bill.
 *
 * Hosts from several companies appear together, which is the one place that is
 * allowed to happen and the reason this screen is super admin only.
 */
/**
 * How a run's status is coloured. The two capped statuses are both warnings
 * and are deliberately separate words: one is the customer's own plan limit,
 * which they can act on, and the other is our spend cap, which only an
 * operator can.
 */
const CYCLE_TONES: Record<string, StatusTone> = {
  DONE: "success",
  EXPANDING: "info",
  SENDING: "info",
  COLLECTING: "info",
  CAPPED_PLAN: "warning",
  CAPPED_SPEND: "warning",
  FAILED: "danger",
};

export default function SeoCycleDetailPage() {
  const t = useTranslations("admin.seoCollection");
  const params = useParams();
  const cycleId = params.cycleId as Id<"seoCollectionCycles">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const cycle = useQuery(api.seoCollectionReports.getSeoCycle, { cycleId });
  // The summary and the rows are separate reads because they change at
  // different rates: the pills settle once, the table is searched and paged.
  const lines = useQuery(api.seoCollectionReports.listSeoCycleLines, {
    cycleId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  // A new search must not leave the reader on page nine of a shorter list.
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const back = { label: t("back"), href: "/admin/websites/collection" };

  if (cycle === undefined) {
    return (
      <div className="flex w-full flex-col gap-6 pb-12">
        <BackRow {...back} />
        <div role="status" aria-busy="true" aria-label={t("loading")} className="h-24 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }

  if (cycle === null) {
    return (
      <div className="flex w-full flex-col gap-6 pb-12">
        <BackRow {...back} />
        <HakkenEmptyState icon={Layers} title={t("notFoundTitle")} description={t("notFound")} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={back}
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={cycle.companyName}
        description={t("runStarted", {
          when: formatDateTime(cycle.startedAt),
          trigger: t(`trigger.${cycle.trigger}`),
        })}
        pills={
          <>
            <StatusLabel tone={CYCLE_TONES[cycle.status] ?? "neutral"}>
              {t(`status.${cycle.status}`)}
            </StatusLabel>
            <TagLabel>{t("readyOfPlanned", { ready: cycle.ready, planned: cycle.planned })}</TagLabel>
            {cycle.reused > 0 ? (
              <StatusLabel tone="success">{t("reused", { count: cycle.reused })}</StatusLabel>
            ) : null}
            {cycle.failed > 0 ? (
              <StatusLabel tone="warning">{t("failed", { count: cycle.failed })}</StatusLabel>
            ) : null}
            <TagLabel>{smallDollars(cycle.costUsd)}</TagLabel>
          </>
        }
      />

      {cycle.cappedReason ? <Notice>{cycle.cappedReason}</Notice> : null}

      {/*
        Section heading above the table, matching `admin/websites/[websiteId]`
        — the sibling screen in this same feature. An earlier version put the
        title inside `cardHeader`, where it renders flush against the card edge
        while the columns stay indented, which is the exact failure the
        screen-kit guard describes in its own words.
      */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("linesTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {lines?.isCapped ? t("linesCapped") : t("linesSubtitle")}
        </p>
      </div>

      <DataTable
        rows={lines === undefined ? undefined : lines.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[780px]"
        search={{
          value: searchTerm,
          onChange: handleSearch,
          placeholder: t("linesSearchPlaceholder"),
        }}
        empty={{
          icon: <Layers className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("noLines"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: lines?.totalPages ?? 1,
          totalCount: lines?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: lines === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("noLines") },
        }}
        columns={[
          {
            key: "host",
            header: t("hostColumn"),
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.host}</span>
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
                <StatusLabel tone={row.status === "READY" ? "success" : row.status === "FAILED" ? "danger" : "info"}>
                  {t(`pull.${row.status}`)}
                </StatusLabel>
                {row.error ? (
                  <span className="max-w-sm text-[11px] leading-relaxed text-warning">{row.error}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "paid",
            header: t("paidColumn"),
            cell: (row) => (
              row.reused ? (
                <span className="text-[12px] text-success">{t("alreadyHeld")}</span>
              ) : (
                <span className="font-mono text-[12px] text-secondary">{smallDollars(row.costUsd)}</span>
              )
            ),
          },
        ]}
      />
    </div>
  );
}
