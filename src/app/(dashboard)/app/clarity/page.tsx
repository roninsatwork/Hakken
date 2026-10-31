"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatDateTime } from "@/src/lib/dates";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatNumber } from "../sites/_components/siteFormat";
import { formatPosition } from "../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../sites/_components/SiteDownloads";
import { useSitePager } from "../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../sites/_components/useSiteSort";
import { SiteMark } from "../sites/_components/SiteMark";

type Row = { siteId: string; host: string; status: string; sessions: number | null; scroll: number | null; lastCollectedAt: number | null };
const SORTS: SiteSortColumns<Row, "host" | "sessions" | "scroll" | "updated"> = {
  host: { value: (row) => row.host, first: "asc" },
  sessions: { value: (row) => row.sessions, first: "desc" },
  scroll: { value: (row) => row.scroll, first: "desc" },
  updated: { value: (row) => row.lastCollectedAt, first: "desc" },
};
const TONE: Record<string, "success" | "warning" | "neutral"> = { CONNECTED: "success", NEEDS_RECONNECT: "warning", DISCONNECTED: "neutral", NOT_CONNECTED: "neutral" };

/**
 * Microsoft Clarity's section (docs/plans/active/insights-analyst-plan.md
 * I27, phase 15): the company's own websites, each with its Clarity
 * connection and its last month. Opening one gives its Overview, Pages,
 * Devices and Connection.
 */
export default function ClarityPage() {
  const t = useTranslations("clarity.list");
  const ts = useTranslations("clarity.status");
  const router = useRouter();
  const sites = useQuery(api.clarity.claritySites, {});
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = sites?.filter((row) => !matches || matches(row.host));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "host", name: (row) => row.host });
  const pages = useSitePager(sites ? rows : undefined, { isLoading: sites === undefined });
  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<MousePointerClick className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
        <HakkenSees says={[]} steps={[]} page={{ screen: "clarity.websites", data: sites }} />
        <DataTable
          rows={pages.pageRows}
          rowKey={(row) => row.siteId}
          onRowClick={(row) => router.push(`/app/clarity/${row.siteId}${row.status === "CONNECTED" ? "" : "/connection"}`)}
          search={{ value: search, onChange: setSearch, placeholder: t("search") }}
          cardHeader={<TableBar footer={pages.footer} noun="websites" actions={<ListDownload label={t("download")} fileName="clarity-websites" rows={rows} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.status"), value: (row) => ts(row.status) }, { header: t("columns.sessions"), value: (row) => row.sessions ?? "" }, { header: t("columns.scroll"), value: (row) => row.scroll ?? "" }]} />} />}
          empty={{ icon: <MousePointerClick className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
          footer={pages.footer}
          sort={tableSort}
          columns={[
            { key: "host", header: t("columns.website"), sortable: true, cell: (row) => <span className="flex items-center gap-2"><SiteMark host={row.host} iconUrl={null} owned /><span className="text-[13px] text-foreground">{row.host}</span></span> },
            { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone={TONE[row.status] ?? "neutral"}>{ts(row.status)}</StatusLabel> },
            { key: "sessions", header: t("columns.sessions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.sessions)}</span> },
            { key: "scroll", header: t("columns.scroll"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.scroll === null ? "–" : `${formatPosition(row.scroll)}%`}</span> },
            { key: "updated", header: t("columns.updated"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.lastCollectedAt ? formatDateTime(row.lastCollectedAt) : "–"}</span> },
          ]}
        />
      </div>
    </>
  );
}
