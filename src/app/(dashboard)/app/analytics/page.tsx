"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChartColumn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatDateTime } from "@/src/lib/dates";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatNumber } from "../sites/_components/siteFormat";
import { ListDownload } from "../sites/_components/SiteDownloads";
import { useSitePager } from "../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../sites/_components/useSiteSort";
import { SiteMark } from "../sites/_components/SiteMark";
import { formatMoney } from "./_components/analyticsFormat";
import { analyticsQuery } from "./_components/useAnalytics";

type SiteRow = FunctionReturnType<typeof api.googleAnalyticsReads.analyticsSites>[number];

const TONES: Record<SiteRow["status"], StatusTone> = {
  NOT_CONNECTED: "neutral",
  CHOOSING: "neutral",
  COUNTING: "neutral",
  CONNECTED: "success",
  NEEDS_RECONNECT: "warning",
  DISCONNECTED: "neutral",
};

/** The website A to Z — the order it opens on — and the most of each figure first. */
const SORTS: SiteSortColumns<SiteRow, "host" | "visits" | "conversions" | "value" | "updated"> = {
  host: { value: (row) => row.host, first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  conversions: { value: (row) => row.conversions, first: "desc" },
  value: { value: (row) => row.value, first: "desc" },
  updated: { value: (row) => row.lastCollectedAt, first: "desc" },
};
const hostOf = (row: SiteRow) => row.host;

/**
 * The Google Analytics section (docs/plans/active/google-analytics-plan.md
 * GA1, §11 board 1): the company's own websites — never one it only watches —
 * each with its connection and the last 30 days to Analytics' newest day.
 * Opening one gives its Overview, Channels, Landing pages, All pages and
 * Conversions, its tracking health and its connection.
 */
export default function GoogleAnalyticsPage() {
  const t = useTranslations("googleAnalytics.list");
  const ts = useTranslations("googleAnalytics.status");
  const router = useRouter();
  const params = useSearchParams();
  const sites = useQuery(api.googleAnalyticsReads.analyticsSites, {});
  const [search, setSearch, settled] = useSiteSearch();
  const matches = wordStartMatcher(settled.toLowerCase());
  const rows = sites?.filter((row) => !matches || matches(row.host));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "host", name: hostOf });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  const dash = <NoFigure />;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<ChartColumn className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        <DataTable
          rows={paged.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/analytics/${row.siteId}${analyticsQuery(params)}`)}
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          cardHeader={
            <TableBar
              footer={paged.footer}
              noun="websites"
              actions={
                <ListDownload
                  fileName="google-analytics"
                  rows={sorted}
                  columns={[
                    { header: t("columns.website"), value: (row) => row.host },
                    { header: t("columns.status"), value: (row) => ts(row.status) },
                    { header: t("columns.visits"), value: (row) => row.visits },
                    { header: t("columns.conversions"), value: (row) => row.conversions },
                    { header: t("columns.value"), value: (row) => (row.value === null ? null : row.value / 100) },
                  ]}
                />
              }
            >
              <span className="text-[12px] text-secondary">{t("period")}</span>
            </TableBar>
          }
          empty={{ icon: <ChartColumn className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
          footer={paged.footer}
          sort={tableSort}
          columns={[
            {
              key: "host",
              header: t("columns.website"),
              sortable: true,
              cell: (row) => (
                <span className="flex min-w-0 items-center gap-3">
                  <SiteMark host={row.host} iconUrl={row.iconUrl} owned />
                  <span className="truncate text-[13px] font-medium text-foreground">{row.host}</span>
                </span>
              ),
            },
            { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone={TONES[row.status]}>{ts(row.status)}</StatusLabel> },
            { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => (row.visits !== null ? <span className="font-mono text-[12px] text-foreground">{formatNumber(row.visits)}</span> : dash) },
            { key: "conversions", header: t("columns.conversions"), align: "right", sortable: true, cell: (row) => (row.conversions !== null ? <span className="font-mono text-[12px] text-secondary">{formatNumber(row.conversions)}</span> : dash) },
            { key: "value", header: t("columns.value"), align: "right", sortable: true, cell: (row) => (row.value ? <span className="font-mono text-[12px] text-secondary">{formatMoney(row.value, row.currency)}</span> : dash) },
            { key: "updated", header: t("columns.updated"), sortable: true, cell: (row) => (row.lastCollectedAt ? <span className="whitespace-nowrap text-[12px] text-secondary">{formatDateTime(row.lastCollectedAt)}</span> : dash) },
          ]}
        />
      </div>
    </>
  );
}
