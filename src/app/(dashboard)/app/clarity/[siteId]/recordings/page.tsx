"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { PageLink } from "../../../analytics/_components/AnalyticsCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { WatchLink, duration, formatWhen, mono, quiet, useClarityLinks, useSourceName } from "../../_components/ClarityParts";
import { useRecordingWords, type ClarityRecordingRow } from "../../_components/RecordingsList";
import { useClarityPageHref, useClaritySiteId, useClarityStatus } from "../../_components/useClarity";

const KINDS = ["ERRORS", "ERROR_CLICKS", "RAGE", "DEAD", "QUICK_BACK", "LONGEST"] as const;
type Sort = "when" | "page" | "length" | "pages" | "clicks";
const SORTS: SiteSortColumns<ClarityRecordingRow, Sort> = {
  when: { value: (row) => row.startedAt, first: "desc" },
  page: { value: (row) => row.page, first: "asc" },
  length: { value: (row) => row.activeSeconds, first: "desc" },
  pages: { value: (row) => row.pages, first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
};
const nameOf = (row: ClarityRecordingRow) => row.link;

/**
 * Recordings worth watching (docs/plans/active/agents-and-clarity-plan.md,
 * CM2; Part 4, CS2): the visits Hakken picks each morning from Clarity's own
 * recordings — those that hit an error, clicked something that failed or
 * clicked in anger, went straight back, and the longest — each with its link
 * to watch it in Clarity, which keeps a recording 30 days: every one it still
 * keeps, whatever the date menu says, which this screen does not draw
 * (calendar-periods-plan.md, item 11.6). The standard list: search, what it
 * shows, the table and its download.
 */
export default function ClarityRecordingsPage() {
  const t = useTranslations("clarity.recordings");
  const tc = useTranslations("clarity.common");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const pageHref = useClarityPageHref();
  const links = useClarityLinks();
  const words = useRecordingWords();
  const sourceName = useSourceName();
  const data = useQuery(api.clarityScreens.clarityRecordingsList, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const [kind, setKind] = useSiteParam<(typeof KINDS)[number] | "">("kind", "", ["", ...KINDS]);
  const matches = settled ? wordStartMatcher(settled.toLowerCase()) : null;
  const listed = data?.recordings.filter((row) => (!matches || matches(row.page)) && (!kind || row.kind === kind));
  const { rows, tableSort } = useSiteSortedList(listed, SORTS, { opening: "when", name: nameOf });
  const pager = useSitePager(rows, { isLoading: data === undefined });
  const counts = new Map(KINDS.map((one) => [one, data?.recordings.filter((row) => row.kind === one).length ?? 0]));
  const picked = KINDS.filter((one) => (counts.get(one) ?? 0) > 0);
  const span = t("span");
  const says = !data
    ? [t("sees.loading")]
    : data.recordings.length === 0
      ? [t("sees.none")]
      : [t("sees.count", { count: data.recordings.length, span, kinds: picked.map((one) => t(`kinds.${one}`).toLowerCase()).join(", ") }), t("sees.how")];

  return (
    <>
      <PageHeader icon={<PlayCircle className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <HakkenSees says={says} steps={[{ words: t("do.all"), link: t("do.openClarity"), href: links.project, external: true }]} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.link}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={(next) => setKind(next as (typeof KINDS)[number] | "")} aria-label={t("kindFilter")}>
            <option value="">{t("everyKind")}</option>
            {KINDS.map((one) => <option key={one} value={one}>{t("kindCount", { kind: t(`kinds.${one}`), count: counts.get(one) ?? 0 })}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="recordings"
            actions={
              <ListDownload
                label={tc("downloadCsv")}
                fileName={`${status?.host ?? "site"}-clarity-recordings`}
                rows={rows}
                columns={[
                  { header: tc("columns.recording"), value: (row) => words(row) },
                  { header: tc("columns.page"), value: (row) => row.page },
                  { header: tc("columns.from"), value: (row) => sourceName(row.referrer ?? "") },
                  { header: tc("columns.when"), value: (row) => new Date(row.startedAt).toISOString() },
                  { header: tc("columns.activeSeconds"), value: (row) => row.activeSeconds },
                  { header: tc("columns.pages"), value: (row) => row.pages },
                  { header: tc("columns.clicks"), value: (row) => row.clicks },
                  { header: tc("columns.link"), value: (row) => row.link },
                ]}
              />
            }
          >
            <span className="text-[12px] text-secondary">{t("tableNote")}</span>
          </TableBar>
        }
        empty={{ icon: <PlayCircle className="h-8 w-8 text-muted/30" />, label: settled || kind ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "what", header: tc("columns.recording"), className: "w-[34%] max-w-0", cell: (row) => <span className="block truncate text-[13px] text-foreground" title={words(row)}>{words(row)}</span> },
          { key: "page", header: tc("columns.page"), sortable: true, className: "w-[22%] max-w-0", cell: (row) => <PageLink address={row.page} href={pageHref(row.page)} title={row.title ?? undefined} /> },
          { key: "from", header: tc("columns.from"), cell: (row) => quiet(sourceName(row.referrer ?? "")) },
          { key: "when", header: tc("columns.when"), sortable: true, cell: (row) => (row.startedAt > 0 ? quiet(formatWhen(row.startedAt)) : <NoFigure />) },
          { key: "length", header: tc("columns.length"), sortable: true, align: "right", cell: (row) => mono(duration(row.activeSeconds), "text-secondary") },
          { key: "pages", header: tc("columns.pages"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.pages), "text-secondary") },
          { key: "clicks", header: tc("columns.clicks"), sortable: true, align: "right", cell: (row) => mono(formatNumber(row.clicks), "text-secondary") },
          { key: "watch", header: "", align: "right", cell: (row) => <WatchLink href={row.link} /> },
        ]}
      />
    </>
  );
}
