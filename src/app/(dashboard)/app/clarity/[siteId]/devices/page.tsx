"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Smartphone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import type { ClarityRow } from "@/convex/utils/clarityRows";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { formatPosition } from "../../../search-console/_components/searchConsoleFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useClarityDays, useClaritySiteId, useClarityStatus } from "../../_components/useClarity";

const SORTS: SiteSortColumns<ClarityRow, "page" | "visits" | "scroll" | "time" | "dead" | "quickBack"> = {
  page: { value: (row) => row.key, first: "asc" },
  visits: { value: (row) => row.sessions, first: "desc" },
  scroll: { value: (row) => row.scroll, first: "asc" },
  time: { value: (row) => row.activeSeconds, first: "asc" },
  dead: { value: (row) => row.dead, first: "desc" },
  quickBack: { value: (row) => row.quickBack, first: "desc" },
};
const percent = (value: number | null) => (value === null ? "–" : `${formatPosition(value)}%`);
const minutes = (seconds: number | null) => (seconds === null ? "–" : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`);

/**
 * Clarity's Devices (docs/plans/active/insights-analyst-plan.md §4.4, phase
 * 15): the same behaviour by device — phones, computers, tablets — over the
 * days chosen, so a page that works on a computer and not on a phone shows.
 */
export default function ClarityDevicesPage() {
  const t = useTranslations("clarity.devices");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const days = useClarityDays();
  const data = useQuery(api.clarity.clarityFigures, { siteId, by: "DEVICE", days });
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = data?.rows.filter((row) => !matches || matches(row.key));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "visits", name: (row) => row.key });
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const low = data?.rows.filter((row) => row.sessions >= 20 && (row.scroll ?? 100) < 50) ?? [];
  const says = data && data.rows.length > 0
    ? [low.length > 0 ? t("sees.low", { count: low.length, pages: low.slice(0, 2).map((row) => row.key).join(", ") }) : t("sees.fine")]
    : [t("sees.none")];
  return (
    <>
      <PageHeader icon={<Smartphone className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <HakkenSees says={says} steps={[{ words: t("do"), link: t("seeReviews"), href: "/app/insights/page-reviews" }]} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0, days })} actions={<ListDownload label={t("download")} fileName={`${status?.host ?? "site"}-clarity.devices`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.key }, { header: t("columns.visits"), value: (row) => row.sessions }, { header: t("columns.scroll"), value: (row) => row.scroll ?? "" }, { header: t("columns.time"), value: (row) => row.activeSeconds ?? "" }, { header: t("columns.dead"), value: (row) => row.dead ?? "" }, { header: t("columns.quickBack"), value: (row) => row.quickBack ?? "" }]} />} />}
        empty={{ icon: <Smartphone className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pages.footer}
        sort={tableSort}
        columns={[
          { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <span className="truncate text-[13px] text-foreground">{row.key}</span> },
          { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.sessions)}</span> },
          { key: "scroll", header: t("columns.scroll"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.scroll)}</span> },
          { key: "time", header: t("columns.time"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{minutes(row.activeSeconds)}</span> },
          { key: "dead", header: t("columns.dead"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.dead)}</span> },
          { key: "quickBack", header: t("columns.quickBack"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.quickBack)}</span> },
        ]}
      />
    </>
  );
}
