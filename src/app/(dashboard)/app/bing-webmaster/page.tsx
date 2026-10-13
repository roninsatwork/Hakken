"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ScanSearch } from "lucide-react";
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
import { BingSees, formatCtr, formatShare } from "./_components/BingParts";
import { bingQuery } from "./_components/useBing";

type SiteRow = FunctionReturnType<typeof api.bingWebmasterReads.bingSites>[number];

const TONES: Record<SiteRow["status"], StatusTone> = {
  NOT_CONNECTED: "neutral",
  CONNECTING: "neutral",
  CHOOSING: "neutral",
  CONNECTED: "success",
  NEEDS_RECONNECT: "warning",
  DISCONNECTED: "neutral",
};

/** The website A to Z — the order it opens on — and the most of each figure first. */
const SORTS: SiteSortColumns<SiteRow, "host" | "clicks" | "impressions" | "ctr" | "share" | "updated"> = {
  host: { value: (row) => row.host, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => (row.clicks !== null && row.impressions ? row.clicks / row.impressions : null), first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  updated: { value: (row) => row.lastCollectedAt, first: "desc" },
};
const hostOf = (row: SiteRow) => row.host;
const ctrOf = (row: SiteRow) => (row.clicks !== null && row.impressions ? row.clicks / row.impressions : null);

/**
 * The Bing Webmaster section (docs/plans/active/bing-webmaster-plan.md BW4,
 * §5 board 1): the company's own websites — never one it only watches — each
 * with its connection and its last 90 days on Bing beside Google's, under
 * What Hakken sees. Opening one gives its Performance, Keywords, Pages,
 * Crawling and indexing, Bing against Google and its connection.
 */
export default function BingWebmasterPage() {
  const t = useTranslations("bingWebmaster.list");
  const ts = useTranslations("bingWebmaster.status");
  const tw = useTranslations("bingWebmaster.seen.websites");
  const router = useRouter();
  const params = useSearchParams();
  const sites = useQuery(api.bingWebmasterReads.bingSites, {});
  const [search, setSearch, settled] = useSiteSearch();
  const matches = wordStartMatcher(settled.toLowerCase());
  const rows = sites?.filter((row) => !matches || matches(row.host));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "host", name: hostOf });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  const dash = <NoFigure />;
  const top = sites?.filter((row) => row.clicks !== null).sort((left, right) => (right.clicks ?? 0) - (left.clicks ?? 0))[0];

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader icon={<ScanSearch className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} divider />

        {sites ? (
          <BingSees says={[
            top
              ? top.googleClicks !== null
                ? tw("top", { host: top.host, clicks: formatNumber(top.clicks), share: formatShare(top.share), google: formatNumber(top.googleClicks) })
                : tw("topNoGoogle", { host: top.host, clicks: formatNumber(top.clicks) })
              : tw("none"),
          ]} />
        ) : null}

        <DataTable
          rows={paged.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/bing-webmaster/${row.siteId}${bingQuery(params)}`)}
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          cardHeader={
            <TableBar
              footer={paged.footer}
              noun="websites"
              actions={
                <ListDownload
                  fileName="bing-webmaster"
                  rows={sorted}
                  columns={[
                    { header: t("csv.website"), value: (row) => row.host },
                    { header: t("csv.status"), value: (row) => ts(row.status) },
                    { header: t("csv.clicks"), value: (row) => row.clicks },
                    { header: t("csv.impressions"), value: (row) => row.impressions },
                    { header: t("csv.ctr"), value: (row) => { const ctr = ctrOf(row); return ctr === null ? null : Math.round(ctr * 10_000) / 100; } },
                    { header: t("csv.share"), value: (row) => (row.share === null ? null : Math.round(row.share * 1000) / 10) },
                    { header: t("csv.googleClicks"), value: (row) => row.googleClicks },
                  ]}
                />
              }
            >
              <span className="text-[12px] text-secondary">{t("caption")}</span>
            </TableBar>
          }
          empty={{ icon: <ScanSearch className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
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
            { key: "clicks", header: t("columns.clicks"), align: "right", sortable: true, cell: (row) => (row.clicks !== null ? <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> : dash) },
            { key: "impressions", header: t("columns.impressions"), align: "right", sortable: true, cell: (row) => (row.impressions !== null ? <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> : dash) },
            { key: "ctr", header: t("columns.ctr"), align: "right", sortable: true, cell: (row) => (ctrOf(row) !== null ? <span className="font-mono text-[12px] text-secondary">{formatCtr(ctrOf(row))}</span> : dash) },
            { key: "share", header: t("columns.share"), align: "right", sortable: true, cell: (row) => (row.share !== null ? <span className="font-mono text-[12px] text-secondary">{formatShare(row.share)}</span> : dash) },
            { key: "updated", header: t("columns.updated"), sortable: true, cell: (row) => (row.lastCollectedAt ? <span className="whitespace-nowrap text-[12px] text-secondary">{formatDateTime(row.lastCollectedAt)}</span> : dash) },
          ]}
        />
      </div>
    </>
  );
}
