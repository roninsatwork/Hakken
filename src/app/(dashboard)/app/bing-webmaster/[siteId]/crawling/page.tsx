"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileSearch, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay, formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { BingGate } from "../../_components/BingNotices";
import { BingSees } from "../../_components/BingParts";
import { BingCrawlChart } from "../../_components/BingCharts";
import { useBingSiteId, useBingStatus, usePeriod, type BingStatus } from "../../_components/useBing";

type Crawling = NonNullable<FunctionReturnType<typeof api.bingWebmasterReads.bingCrawling>>;
type PageRow = Crawling["pages"][number];

const SORTS: SiteSortColumns<PageRow, "page" | "onBing" | "lastBing" | "lastGoogle"> = {
  page: { value: (row) => row.title ?? row.page, first: "asc" },
  onBing: { value: (row) => (row.inIndex === null ? null : row.inIndex ? 1 : 0), first: "asc" },
  lastBing: { value: (row) => row.lastRead, first: "asc" },
  lastGoogle: { value: (row) => row.googleLastRead, first: "asc" },
};
const FILTERS = ["all", "yes", "no"] as const;

/**
 * Crawling and indexing (bing-webmaster-plan.md §5, board 7): What Hakken
 * sees; the money pages in Bing's index beside Google's, the pages Bing read,
 * its errors and what robots.txt blocked; the pages read each day and the
 * errors; and every money page, in Bing's index or not, with the day Bing last
 * read it beside the day Google did.
 */
export default function BingCrawlingPage() {
  const t = useTranslations("bingWebmaster.crawling");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<FileSearch className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <BingGate status={status} siteId={siteId}>
          <CrawlingBody status={status} />
        </BingGate>
      ) : null}
    </div>
  );
}

function CrawlingBody({ status }: { status: BingStatus }) {
  const t = useTranslations("bingWebmaster.crawling");
  const tw = useTranslations("bingWebmaster.seen.crawling");
  const siteId = useBingSiteId();
  const [period] = usePeriod();
  const crawling = useQuery(api.bingWebmasterReads.bingCrawling, { siteId, period });
  const [search, setSearch, settled] = useSiteSearch();
  const [filter, setFilter] = useSiteParam<(typeof FILTERS)[number]>("index", "all", FILTERS);
  const matches = wordStartMatcher(settled.toLowerCase());
  const rows = crawling?.pages.filter((row) => (!matches || matches(`${row.title ?? ""} ${row.page}`.toLowerCase()))
    && (filter === "all" || (filter === "yes" ? row.inIndex === true : row.inIndex === false)));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "onBing", name: (row) => row.title ?? row.page });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  const pages = crawling?.pages ?? [];
  const asked = pages.filter((row) => row.inIndex !== null);
  const inIndex = asked.filter((row) => row.inIndex).length;
  const googleIndexed = pages.filter((row) => row.googleIndexed).length;
  const missing = pages.find((row) => row.inIndex === false);

  return (
    <div className="flex flex-col gap-6">
      {crawling ? (
        <BingSees says={[
          asked.length > 0 && tw("says", { count: formatNumber(inIndex), total: formatNumber(asked.length) }),
          missing && tw("missing", { page: missing.title ?? missing.page }),
          crawling.totals.errors > 0 ? tw("errors", { errors: formatNumber(crawling.totals.errors) }) : crawling.days.length > 0 && tw("noErrors"),
        ]} />
      ) : null}
      {crawling ? (
        <FigureRow>
          <Figure
            label={t("inIndex")}
            value={asked.length > 0 ? t("ofTotal", { count: formatNumber(inIndex), total: formatNumber(asked.length) }) : "–"}
            emphasis
            detail={<span className="text-secondary">{pages.some((row) => row.googleIndexed !== null) ? t("googleIndexed", { count: formatNumber(googleIndexed), total: formatNumber(pages.length) }) : t("notAsked")}</span>}
          />
          <Figure label={t("read")} value={formatNumber(crawling.totals.crawled)} detail={<span className="text-secondary">{t("inDays")}</span>} />
          <Figure label={t("errors")} value={formatNumber(crawling.totals.errors)} detail={<span className="text-secondary">{t("inDays")}</span>} />
          <Figure label={t("blocked")} value={formatNumber(crawling.totals.blocked)} detail={<span className="text-secondary">{crawling.totals.blocked === 0 ? t("none") : t("inDays")}</span>} />
        </FigureRow>
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}
      <BingCrawlChart
        days={crawling?.days ?? []}
        host={status.host}
        from={crawling?.from ?? null}
        to={crawling?.to ?? null}
        labels={{ title: t("chartTitle"), hint: t("chartHint"), read: t("pagesRead"), errors: t("errorsLine"), empty: t("noPages") }}
      />
      {crawling && pages.length === 0 ? <Notice>{t("noPages")}</Notice> : null}
      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.page}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <Select chip={{ label: t("filter"), choice: filter === "all" ? null : t(`filters.${filter}`) }} value={filter} onChange={(next) => setFilter(next as typeof filter)}>
            {FILTERS.map((entry) => <option key={entry} value={entry}>{t(`filters.${entry}`)}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={paged.footer}
            noun="pages"
            actions={
              <ListDownload
                fileName="bing-webmaster-money-pages"
                rows={sorted}
                columns={[
                  { header: t("csv.page"), value: (row) => row.page },
                  { header: t("csv.title"), value: (row) => row.title ?? "" },
                  { header: t("csv.onBing"), value: (row) => (row.inIndex === null ? "" : row.inIndex ? t("yes") : t("no")) },
                  { header: t("csv.lastBing"), value: (row) => row.lastRead ?? "" },
                  { header: t("csv.lastGoogle"), value: (row) => row.googleLastRead ?? "" },
                ]}
              />
            }
          />
        }
        empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: t("noPages") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          {
            key: "page",
            header: t("columns.page"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                {row.title ? <span className="truncate text-[13px] text-foreground">{row.title}</span> : null}
                <span title={row.page} className="truncate text-[12px] text-info">{row.page}</span>
              </span>
            ),
          },
          {
            key: "onBing",
            header: t("columns.onBing"),
            sortable: true,
            cell: (row) => row.inIndex === null
              ? <span className="text-[12px] text-muted">{t("notAsked")}</span>
              : <StatusLabel tone={row.inIndex ? "success" : "warning"}>{row.inIndex ? t("yes") : t("no")}</StatusLabel>,
          },
          { key: "lastBing", header: t("columns.lastBing"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{row.lastRead ? formatDay(row.lastRead) : "–"}</span> },
          { key: "lastGoogle", header: t("columns.lastGoogle"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{row.googleLastRead ? formatDay(row.googleLastRead) : "–"}</span> },
        ]}
      />
    </div>
  );
}
