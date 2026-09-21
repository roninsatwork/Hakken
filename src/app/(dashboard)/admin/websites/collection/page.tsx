"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDateTime } from "@/src/lib/dates";

/**
 * The collection queue, across every company.
 *
 * Two tables of the same thing at two stages: what is going out, then what has
 * been settled. They carry the same columns on purpose. An earlier version
 * showed work in flight as individual requests and finished work as *runs*,
 * which described two different things on one screen and invited the reader to
 * compare numbers that were never comparable.
 *
 * It lives beside All Websites rather than inside a company for two reasons.
 * The queue is one shared pipeline, so a per-tenant slice of it would describe
 * something that does not exist. And every figure here is Hakken's own spend,
 * which no customer may ever see.
 */
export default function SeoCollectionPage() {
  const t = useTranslations("admin.seoCollection");
  const router = useRouter();
  const [failedOnly, setFailedOnly] = useState(false);
  const [queueSearch, setQueueSearch] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const debouncedQueueSearch = useDebounce(queueSearch, 400);
  const debouncedHistorySearch = useDebounce(historySearch, 400);

  const queue = useQuery(api.seoCollectionReports.listSeoQueue, {
    searchTerm: debouncedQueueSearch,
    page: queuePage,
    pageSize: TABLE_PAGE_SIZE,
  });
  const spend = useQuery(api.seoCollectionReports.readSeoSpend, {});
  const history = useServerPagedTable(
    api.seoCollectionReports.listSeoHistory,
    {
      ...(failedOnly ? { status: "FAILED" as const } : {}),
      searchTerm: debouncedHistorySearch,
    },
    TABLE_PAGE_SIZE,
  );

  const queueLoading = queue === undefined;

  // A new search must not leave the reader on page nine of a shorter list.
  const searchQueue = (value: string) => {
    setQueueSearch(value);
    setQueuePage(1);
  };
  const searchHistory = (value: string) => {
    setHistorySearch(value);
    history.goToPage(1);
  };

  const openCycle = (cycleId: string | null) => {
    if (cycleId) router.push(`/admin/websites/collection/${cycleId}`);
  };

  return (
    <div className="flex w-full flex-col gap-8 pb-12">
      <PageHeader
        divider
        icon={<Layers className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      {/*
        Section heading above the table, matching `admin/websites/[websiteId]`
        — the sibling screen in this same feature. A title passed to
        `cardHeader` renders flush against the card edge while the columns stay
        indented, which is the failure the screen-kit guard names outright.
      */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("queueTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {queue
            ? t("queueCounts", {
              pending: count(queue.pending, queue.countsAreCapped),
              claimed: count(queue.claimed, queue.countsAreCapped),
              submitted: count(queue.submitted, queue.countsAreCapped),
            })
            : t("queueSubtitle")}
        </p>
      </div>

      <DataTable
        rows={queueLoading ? undefined : queue.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        onRowClick={(row) => openCycle(row.cycleId)}
        search={{
          value: queueSearch,
          onChange: searchQueue,
          placeholder: t("queueSearchPlaceholder"),
        }}
        empty={{
          icon: <Layers className="h-8 w-8 text-muted/30" />,
          label: queueSearch ? t("noMatch") : t("queueEmpty"),
        }}
        footer={{
          mode: "paged",
          page: queuePage,
          totalPages: queue?.totalPages ?? 1,
          totalCount: queue?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: queueLoading,
          onPageChange: setQueuePage,
          labels: { empty: queueSearch ? t("noMatch") : t("queueEmpty") },
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
                <StatusPill tone={PULL_TONES[row.status] ?? "neutral"}>
                  {t(`pull.${row.status}`)}
                </StatusPill>
                {row.attempts > 0 ? (
                  <span className="text-[11px] text-warning">{t("attempts", { count: row.attempts })}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "due",
            header: t("dueColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.sentAt
                  ? t("sentAt", { when: formatDateTime(row.sentAt) })
                  : row.dueAt
                    ? formatDateTime(row.dueAt)
                    : "—"}
              </span>
            ),
          },
        ]}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("historyTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">
          {spend
            ? t("spend", {
              // USD as DataForSEO reports it. Never converted on the way in,
              // so it can still be checked against an invoice.
              cost: spend.totalCostUsd.toFixed(2),
              pulls: spend.totalPulls,
            })
            : t("historySubtitle")}
        </p>
      </div>

      <DataTable
        filters={
          <FilterToggle
            label={t("failedOnly")}
            active={failedOnly}
            onToggle={() => {
              setFailedOnly((value) => !value);
              history.goToPage(1);
            }}
          />
        }
        rows={history.isLoading ? undefined : history.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        onRowClick={(row) => openCycle(row.cycleId)}
        search={{
          value: historySearch,
          onChange: searchHistory,
          placeholder: t("historySearchPlaceholder"),
        }}
        empty={{
          icon: <Layers className="h-8 w-8 text-muted/30" />,
          label: historySearch ? t("noMatch") : t("historyEmpty"),
        }}
        footer={{
          mode: "paged",
          page: history.page,
          totalPages: history.totalPages,
          totalCount: history.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: history.isBusy,
          onPageChange: history.goToPage,
          labels: { empty: historySearch ? t("noMatch") : t("historyEmpty") },
        }}
        columns={[
          {
            key: "website",
            header: t("hostColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.host}</span>
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
                <StatusPill tone={PULL_TONES[row.status] ?? "neutral"}>
                  {t(`pull.${row.status}`)}
                </StatusPill>
                {row.error ? (
                  <span className="max-w-sm text-[11px] leading-relaxed text-warning">{row.error}</span>
                ) : null}
              </div>
            ),
          },
          {
            key: "collected",
            header: t("collectedColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.completedAt ? formatDateTime(row.completedAt) : "—"}
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
                <span className="font-mono text-[12px] text-secondary">${row.costUsd.toFixed(4)}</span>
              )
            ),
          },
        ]}
      />
    </div>
  );
}

const PULL_TONES: Record<string, StatusTone> = {
  PENDING: "neutral",
  CLAIMED: "info",
  SUBMITTED: "info",
  READY: "success",
  FAILED: "danger",
};

function FilterToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  // `outline` is the kit's bordered chip with no fill; the pressed state
  // recolours it through className, which merges after the variant.
  return (
    <Button
      variant="outline"
      onClick={onToggle}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-[12px] ${
        active ? "border-warning/40 bg-warning/10 text-warning" : ""
      }`}
    >
      {label}
    </Button>
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
