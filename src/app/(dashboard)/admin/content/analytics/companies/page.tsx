"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { DataTable, type DataTableSort } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../../../app/sites/_components/siteFormat";
import { ANALYTICS_BASE, AnalyticsSection } from "../_components/AnalyticsSection";
import { ReadingChart } from "../_components/ReadingChart";
import { MEASURE_COLOURS, count } from "../_components/measures";
import { usePeriod, withPeriod } from "../_components/usePeriod";

type Answer = FunctionReturnType<typeof api.readingAnalytics.analyticsCompanies>;
type SortKey = "name" | "readers" | "views" | "reads" | "clicks" | "lastAt";

/**
 * Admin → Content → Analytics → Companies (content-people-knowledge-plan.md,
 * board 11): readers and the companies they came from, by day; then each
 * client company that read in the period — its readers, views, reads, clicks
 * and when it was last active — sorted by any heading on the server. A row
 * opens the company's own page.
 */
export default function AnalyticsCompaniesPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsSection>
        <CompaniesScreen />
      </AnalyticsSection>
    </Suspense>
  );
}

function CompaniesScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const convex = useConvex();
  const [period] = usePeriod();
  const downloader = useAdminAction({ scope: "admin-analytics-companies-download" });
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "views", direction: "desc" });
  const [page, setPage] = useState(1);
  const args = { period, sort: sort.key, direction: sort.direction };
  const listKey = JSON.stringify(args);
  const answer = useQuery(api.readingAnalytics.analyticsCompanies, { ...args, page, rows: TABLE_PAGE_SIZE });
  const [held, setHeld] = useState<{ listKey: string; result: Answer } | null>(null);
  if (answer !== undefined && (held?.result !== answer || held.listKey !== listKey)) setHeld({ listKey, result: answer });
  const shown = answer ?? (held?.listKey === listKey ? held.result : undefined);
  const tableSort: DataTableSort = {
    key: sort.key,
    direction: sort.direction,
    onSort: (pressed) => {
      const key = pressed as SortKey;
      setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" });
      setPage(1);
    },
  };
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;

  const download = () => void downloader.run(async () => {
    const all = await convex.query(api.readingAnalytics.analyticsCompanies, { ...args, page: 1, rows: TABLE_PAGE_SIZE, all: true });
    saveTextFile(toCsv(
      [t("columns.company"), t("measures.readers"), t("measures.views"), t("measures.reads"), t("measures.clicks"), t("columns.lastActive")],
      all.page.rows.map((row) => [row.name, row.readers, row.views, row.reads, row.clicks, new Date(row.lastAt).toISOString().slice(0, 10)]),
    ), `content-analytics-companies-${period}-days.csv`);
  }, { fallbackMessage: t("errors.downloadFailed") });

  return (
    <>
      <PageHeader icon={<Building2 className="h-6 w-6 text-brand" />} title={t("companies.title")} description={t("companies.subtitle", { platformName })} />
      {shown ? (
        <ReadingChart
          title={t("chart.readersTitle")}
          hint={t("chart.readersHint")}
          range={shown.range}
          days={shown.days}
          measures={[
            { key: "readers", name: t("measures.readers"), colour: MEASURE_COLOURS.readers },
            { key: "companies", name: t("measures.companies"), colour: MEASURE_COLOURS.companies },
          ]}
          exportName="content-analytics-readers"
        />
      ) : null}
      <DataTable
        rows={shown?.page.rows}
        rowKey={(row) => row.companyId}
        onRowClick={(row) => router.push(withPeriod(`${ANALYTICS_BASE}/companies/${row.companyId}`, period))}
        sort={tableSort}
        cardHeader={
          <TableBar
            footer={{ isLoading: shown === undefined, totalCount: shown?.page.total ?? 0 }}
            noun="companies"
            actions={<DownloadButton label={t("download")} busyLabel={t("downloading")} busy={downloader.isBusy()} disabled={!shown?.page.total} onClick={download} />}
          >
            {shown ? <span className="text-[12px] text-secondary">{t("companies.readersBetween", { count: shown.readers })}</span> : null}
          </TableBar>
        }
        empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: t("companies.empty", { days: Number(period) }) }}
        footer={{
          mode: "paged",
          page: shown?.page.page ?? page,
          totalPages: shown?.page.pages ?? 1,
          totalCount: shown?.page.total ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: answer === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "name", header: t("columns.company"), sortable: true, cell: (row) => <span className="text-[13px] font-medium text-foreground">{row.name}</span> },
          { key: "readers", header: t("measures.readers"), align: "right", sortable: true, cell: (row) => number(row.readers) },
          { key: "views", header: t("measures.views"), align: "right", sortable: true, cell: (row) => number(row.views) },
          { key: "reads", header: t("measures.reads"), align: "right", sortable: true, cell: (row) => number(row.reads) },
          { key: "clicks", header: t("measures.clicks"), align: "right", sortable: true, cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
          { key: "lastAt", header: t("columns.lastActive"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{formatDate(row.lastAt)}</span> },
        ]}
      />
    </>
  );
}
