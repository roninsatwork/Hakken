"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SearchCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { formatDateTime } from "@/src/lib/dates";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatNumber } from "../sites/_components/siteFormat";
import { SiteTableBar } from "../sites/_components/SiteTableBar";
import { ListDownload } from "../sites/_components/SiteDownloads";
import { useSitePager } from "../sites/_components/useSitePagedTable";
import { sharedSiteQuery, useSiteSearch } from "../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../sites/_components/useSiteSort";
import { formatPosition, formatRate } from "./_components/searchConsoleFormat";

type SiteRow = FunctionReturnType<typeof api.searchConsoleReads.listSearchConsoleSites>[number];

const TONES: Record<SiteRow["status"], StatusTone> = {
  NOT_CONNECTED: "neutral",
  CHOOSING: "neutral",
  CONNECTED: "success",
  NEEDS_RECONNECT: "warning",
  DISCONNECTED: "neutral",
};

/** The columns that sort: the website A to Z — the order it opens on — and the most of each figure first. */
const SORTS: SiteSortColumns<SiteRow, "host" | "clicks" | "impressions" | "ctr" | "position" | "updated"> = {
  host: { value: (row) => row.host, first: "asc" },
  clicks: { value: (row) => row.figures?.clicks ?? null, first: "desc" },
  impressions: { value: (row) => row.figures?.impressions ?? null, first: "desc" },
  ctr: { value: (row) => row.figures?.ctr ?? null, first: "desc" },
  position: { value: (row) => row.figures?.position ?? null, first: "asc" },
  updated: { value: (row) => row.lastCollectedAt, first: "desc" },
};
const hostOf = (row: SiteRow) => row.host;

/**
 * The Search Console section (docs/plans/active/search-console-plan.md,
 * SC1): the company's own websites — never one it only watches — each with
 * its connection and the last thirty days Google has figures for. Opening one
 * gives its Performance, Searches, Pages, Countries and devices, and its
 * connection.
 */
export default function SearchConsolePage() {
  const t = useTranslations("searchConsole.list");
  const ts = useTranslations("searchConsole.status");
  const router = useRouter();
  const params = useSearchParams();
  const sites = useQuery(api.searchConsoleReads.listSearchConsoleSites, {});
  const [search, setSearch, settled] = useSiteSearch();
  const matches = wordStartMatcher(settled.toLowerCase());
  const rows = sites?.filter((row) => !matches || matches(row.host));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "host", name: hostOf });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  // Into a website go the dates only.
  const range = sharedSiteQuery(params);
  const dash = <span className="text-muted">–</span>;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<SearchCheck className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        <DataTable
          rows={paged.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/search-console/${row.siteId}${range}`)}
          minWidthClassName="min-w-[860px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          cardHeader={
            <SiteTableBar
              footer={paged.footer}
              noun="websites"
              actions={
                <ListDownload
                  fileName="search-console"
                  rows={sorted}
                  columns={[
                    { header: t("columns.website"), value: (row) => row.host },
                    { header: t("columns.status"), value: (row) => ts(row.status) },
                    { header: t("columns.clicks"), value: (row) => row.figures?.clicks ?? null },
                    { header: t("columns.impressions"), value: (row) => row.figures?.impressions ?? null },
                    { header: t("columns.ctr"), value: (row) => (row.figures ? Math.round(row.figures.ctr * 1000) / 10 : null) },
                    { header: t("columns.position"), value: (row) => (row.figures ? Math.round(row.figures.position * 10) / 10 : null) },
                  ]}
                />
              }
            >
              <span className="text-[12px] text-secondary">{t("period")}</span>
            </SiteTableBar>
          }
          empty={{ icon: <SearchCheck className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
          footer={paged.footer}
          sort={tableSort}
          columns={[
            { key: "host", header: t("columns.website"), sortable: true, cell: (row) => <span className="font-medium text-foreground">{row.host}</span> },
            { key: "status", header: t("columns.status"), cell: (row) => <StatusPill tone={TONES[row.status]}>{ts(row.status)}</StatusPill> },
            { key: "clicks", header: t("columns.clicks"), align: "right", sortable: true, cell: (row) => (row.figures ? <span className="font-mono text-[12px] text-foreground">{formatNumber(row.figures.clicks)}</span> : dash) },
            { key: "impressions", header: t("columns.impressions"), align: "right", sortable: true, cell: (row) => (row.figures ? <span className="font-mono text-[12px] text-secondary">{formatNumber(row.figures.impressions)}</span> : dash) },
            { key: "ctr", header: t("columns.ctr"), align: "right", sortable: true, cell: (row) => (row.figures ? <span className="font-mono text-[12px] text-secondary">{formatRate(row.figures.ctr)}</span> : dash) },
            { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => (row.figures ? <span className="font-mono text-[12px] text-secondary">{formatPosition(row.figures.position)}</span> : dash) },
            { key: "updated", header: t("columns.updated"), sortable: true, cell: (row) => (row.lastCollectedAt ? <span className="text-secondary">{formatDateTime(row.lastCollectedAt)}</span> : dash) },
          ]}
        />
      </div>
    </>
  );
}
