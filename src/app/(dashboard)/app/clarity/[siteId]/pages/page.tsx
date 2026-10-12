"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
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
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { Select } from "@/src/ui/components/screens/Select";
import { DEVICE_JOIN } from "@/convex/utils/clarityRows";
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
 * Clarity's Pages (docs/plans/active/insights-analyst-plan.md I24, phase 15,
 * drawn as the ClarityPages board): each page's behaviour over the days
 * chosen — visits, how far down it is scrolled, active time, dead clicks and
 * quick backs — with a link to its heatmap in Clarity, which the export
 * doesn't carry.
 */
export default function ClarityPagesPage() {
  const t = useTranslations("clarity.pages");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const days = useClarityDays();
  const [device, setDevice] = useSiteParam<string>("device", "");
  const data = useQuery(api.clarity.clarityFigures, { siteId, by: device ? "PAGE_DEVICE" : "PAGE", days });
  const devices = useQuery(api.clarity.clarityFigures, { siteId, by: "DEVICE", days });
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term.toLowerCase());
  // With a device chosen, each page's own row on that device, named by its path alone.
  const rowsShown = device
    ? data?.rows.filter((row) => row.key.endsWith(`${DEVICE_JOIN}${device}`)).map((row) => ({ ...row, key: row.key.slice(0, row.key.lastIndexOf(DEVICE_JOIN)) }))
    : data?.rows;
  const matching = rowsShown?.filter((row) => !matches || matches(row.key));
  const { rows, tableSort } = useSiteSortedList(matching, SORTS, { opening: "visits", name: (row) => row.key });
  const pages = useSitePager(data ? rows : undefined, { isLoading: data === undefined });
  const low = data?.rows.filter((row) => row.sessions >= 20 && (row.scroll ?? 100) < 50) ?? [];
  const says = data && data.rows.length > 0
    ? [low.length > 0 ? t("sees.low", { count: low.length, pages: low.slice(0, 2).map((row) => row.key).join(", ") }) : t("sees.fine")]
    : [t("sees.none")];
  return (
    <>
      <PageHeader icon={<FileText className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <HakkenSees says={says} steps={[{ words: t("do"), link: t("seeReviews"), href: "/app/insights/page-reviews" }]} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("device"), choice: device || null }} value={device} onChange={setDevice} aria-label={t("device")}>
            <option value="">{t("everyDevice")}</option>
            {(devices?.rows ?? []).map((row) => <option key={row.key} value={row.key}>{row.key}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("tableTitle", { count: rows?.length ?? 0, days })} actions={<ListDownload label={t("download")} fileName={`${status?.host ?? "site"}-clarity-pages`} rows={rows} columns={[{ header: t("columns.page"), value: (row) => row.key }, { header: t("columns.visits"), value: (row) => row.sessions }, { header: t("columns.scroll"), value: (row) => row.scroll ?? "" }, { header: t("columns.time"), value: (row) => row.activeSeconds ?? "" }, { header: t("columns.dead"), value: (row) => row.dead ?? "" }, { header: t("columns.quickBack"), value: (row) => row.quickBack ?? "" }]} />} />}
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pages.footer}
        sort={tableSort}
        columns={[
          { key: "page", header: t("columns.page"), sortable: true, cell: (row) => <span className="truncate text-[13px] text-foreground">{row.key}</span> },
          { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.sessions)}</span> },
          { key: "scroll", header: t("columns.scroll"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.scroll)}</span> },
          { key: "time", header: t("columns.time"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{minutes(row.activeSeconds)}</span> },
          { key: "dead", header: t("columns.dead"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.dead)}</span> },
          { key: "quickBack", header: t("columns.quickBack"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{percent(row.quickBack)}</span> },
          { key: "heatmap", header: t("columns.heatmap"), cell: () => <a href="https://clarity.microsoft.com/" target="_blank" rel="noreferrer" className="text-[12px] text-info hover:underline">{t("openInClarity")}</a> },
        ]}
      />
    </>
  );
}
