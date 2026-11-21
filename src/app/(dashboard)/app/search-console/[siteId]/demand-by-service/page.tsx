"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { servicesSees } from "@/convex/utils/sees/searchConsoleScreens";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { usePageKinds } from "../../../_components/usePageKinds";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { DemandBandsCard, DemandBoxes, DemandSquaresCard, useDemand } from "../../_components/DemandParts";
import type { DemandPart } from "../../_components/demandSees";
import { demandEyeData, demandPartsOf } from "@/convex/utils/sees/eyeData/searchConsoleDemand";
import { wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";
import { GoogleCutLine } from "../../_components/GoogleCutLine";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { useSiteFiguresFor } from "../../_components/SearchConsoleFigures";
import { LiveProblem, NothingOfKind, SearchConsoleGate, hasFigures } from "../../_components/SearchConsoleNotices";
import { ShownHeading } from "../../_components/SearchConsoleTables";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { periodArg, useSearchConsoleHref, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

/** The table's Show menu: every row, or those whose clicks went up, or down, since the dates before. */
const MOVED = ["all", "more", "fewer"] as const;
type Moved = (typeof MOVED)[number];

/** The table's sortable columns: the name A to Z, every figure and move the most first, as Search Console's lists. */
const SORTS: SiteSortColumns<DemandPart, "name" | "shown" | "shownUp" | "clicks" | "clicksUp" | "pages"> = {
  name: { value: (row) => row.name, first: "asc" },
  shown: { value: (row) => row.impressions, first: "desc" },
  shownUp: { value: (row) => (row.impressionsBefore === null ? null : row.impressions - row.impressionsBefore), first: "desc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  clicksUp: { value: (row) => (row.clicksBefore === null ? null : row.clicks - row.clicksBefore), first: "desc" },
  pages: { value: (row) => row.pages, first: "desc" },
};
const nameOfRow = (row: DemandPart) => row.name;

/**
 * Demand by Classification (search-console-plan.md §5; the page was Demand by service until Anthony renamed it on the
 * canvas, 18 November 2026), as he chose it that day: the canvas's Way 2 ("I want way 2 for demand by classification";
 * search-console-demand-by-classification-way-2-plan-2026-11-18.md). Every figure follows the country menu ("the country
 * in scope"): Performance's four boxes for the country; what Google shows against what gets clicked; out of every 100
 * clicks; and each Classification on one line, with its impressions, clicks and pages. The boxes are the country's own
 * totals; the bands, squares and table share out only the clicks Google ties to a page, as Keywords does with the searches
 * it names, with no part for the difference (Anthony, 18 November 2026: "yes i think so"). Its address stays
 * `/demand-by-service`, so links keep working.
 */
export default function SearchConsoleDemandPage() {
  const t = useTranslations("searchConsole");
  const ts = useTranslations("searchConsole.services");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const host = status?.host ?? "";
  const held = Boolean(status && hasFigures(status));
  // The boxes: the website's figures for the country chosen, Performance's own read. Demand is about web results.
  const site = useSiteFiguresFor(held ? { siteId, searchType: "web", from: range.from, to: range.to, ...periodArg(range) } : null);
  const demand = useDemand(held);
  const pageKinds = usePageKinds(siteId);
  const figures = site.problem ? undefined : site.figures;
  const totals = figures?.totals ?? null;
  const previous = figures?.previous ?? null;
  const answer = demand.answer;
  const { label } = pageKinds;
  // Hakken's "not judged yet" reads as Unclassified, as Performance's squares say it. Built by the same functions a chat
  // app's question builds them with (chatAppEyes/searchConsole.ts), so the two can't disagree.
  const parts = useMemo(() => demandPartsOf(answer, figures ? { previous } : undefined, label), [answer, figures, previous, label]);
  const seesData = useMemo(() => demandEyeData({ parts, totals, previous }, wordsReader(t)), [parts, totals, previous, t]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Layers className="h-5 w-5 text-brand" />} title={ts("title")} description={ts("description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees screen="services" seen={parts && range.period !== "custom" ? servicesSees(parts) : null} data={seesData} />
          {site.problem ? (
            <LiveProblem problem={site.problem} retry={site.retry} />
          ) : figures && !totals ? (
            <NothingOfKind from={range.from} to={range.to} />
          ) : (
            <>
              <DemandBoxes figures={figures} />
              {demand.problem ? <LiveProblem problem={demand.problem} retry={demand.retry} /> : null}
              <DemandBandsCard parts={demand.problem ? [] : parts} host={host} />
              <DemandSquaresCard parts={demand.problem ? [] : parts} host={host} />
              <DemandTable parts={demand.problem ? [] : parts} host={host} cut={demand.cut} />
            </>
          )}
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * The table, lean (AGENTS.md "Tables are lean"), as the board draws it: Category (Classification on hover), Shown, Up or
 * down, Clicks, Up or down and Pages, one line a row, the most impressions first. A Classification opens Pages for it.
 */
function DemandTable({ parts, host, cut }: { parts: readonly DemandPart[] | undefined; host: string; cut: number | null }) {
  const t = useTranslations("searchConsole");
  const ts = useTranslations("searchConsole.services");
  const siteId = useSearchConsoleSiteId();
  const hrefOf = useSearchConsoleHref(siteId);
  const router = useRouter();
  const dates = usePerformanceDates();
  const [search, setSearch, term] = useSiteSearch();
  const [moved, setMoved] = useSiteParam<Moved>("moved", "all", MOVED);
  const matching = useMemo(() => {
    const matches = wordStartMatcher(term.toLowerCase());
    return parts?.filter((row) => (!matches || matches(row.name))
      && (moved === "all" || (row.clicksBefore !== null && (moved === "more" ? row.clicks > row.clicksBefore : row.clicks < row.clicksBefore))));
  }, [parts, term, moved]);
  const order = useSiteSortedList(matching, SORTS, { opening: "shown", name: nameOfRow });
  const pages = useSitePager(order.rows, { isLoading: parts === undefined });
  const href = (row: DemandPart) => hrefOf("pages", { kind: row.key });
  const showWords: Record<Moved, string> = { all: ts("show.all"), more: ts("show.more"), fewer: ts("show.fewer") };
  const figure = (value: number, tone = "text-secondary") => <span className={`font-mono text-[12px] ${tone}`}>{formatNumber(value)}</span>;
  return (
    <DataTable
      rows={pages.pageRows}
      rowKey={(row) => row.key}
      search={{ value: search, onChange: setSearch, placeholder: ts("search") }}
      filters={(
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label={ts("show.label")} chip={{ label: ts("show.label"), choice: moved === "all" ? null : showWords[moved] }} value={moved} onChange={(next) => setMoved(next as Moved)}>
            {MOVED.map((value) => <option key={value} value={value}>{showWords[value]}</option>)}
          </Select>
        </div>
      )}
      cardHeader={
        <TableBar
          footer={pages.footer}
          noun="classifications"
          actions={(
            <ListDownload
              label={ts("download")}
              fileName={`${host}-search-console-demand-by-classification`}
              rows={order.rows}
              columns={[
                { header: ts("columns.categoryTitle"), value: (row) => row.name },
                { header: t("table.impressions"), value: (row) => row.impressions },
                { header: ts("csv.shownBefore", { before: dates.inBefore }), value: (row) => row.impressionsBefore },
                { header: t("table.clicks"), value: (row) => row.clicks },
                { header: ts("csv.clicksBefore", { before: dates.inBefore }), value: (row) => row.clicksBefore },
                { header: t("table.pages"), value: (row) => row.pages },
              ]}
            />
          )}
        >
          <GoogleCutLine most={cut} noun="pages" />
        </TableBar>
      }
      sort={order.tableSort}
      onRowClick={(row) => router.push(href(row))}
      empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : ts("empty") }}
      footer={pages.footer}
      columns={[
        {
          key: "name",
          header: <span title={ts("columns.categoryTitle")}>{ts("columns.category")}</span>,
          sortable: true,
          className: `${CUT_COLUMN.first} min-w-[160px]`,
          cell: (row) => <RecordLinkCell cut href={href(row)} hover={row.sorted ? row.name : ts("unclassifiedHover")}>{row.name}</RecordLinkCell>,
        },
        { key: "shown", header: <ShownHeading say={t} />, align: "right", sortable: true, cell: (row) => figure(row.impressions) },
        {
          key: "shownUp",
          header: <span title={ts("columns.shownUpTitle", { before: dates.inBefore })}>{t("table.change")}</span>,
          align: "right",
          sortable: true,
          className: "whitespace-nowrap",
          cell: (row) => <Change by={row.impressionsBefore === null ? null : row.impressions - row.impressionsBefore} same format={formatNumber} />,
        },
        { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => figure(row.clicks, "text-foreground") },
        {
          key: "clicksUp",
          header: <span title={ts("columns.clicksUpTitle", { before: dates.inBefore })}>{t("table.change")}</span>,
          align: "right",
          sortable: true,
          className: "whitespace-nowrap",
          cell: (row) => <Change by={row.clicksBefore === null ? null : row.clicks - row.clicksBefore} same format={formatNumber} />,
        },
        {
          key: "pages",
          header: <span title={ts("columns.pagesTitle", { when: dates.inNow })}>{t("table.pages")}</span>,
          align: "right",
          sortable: true,
          cell: (row) => figure(row.pages),
        },
      ]}
    />
  );
}
