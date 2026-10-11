"use client";

import { useParams } from "next/navigation";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Trophy } from "lucide-react";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { LeagueCard, leagueName, type LeagueData } from "../../_components/LeagueCard";
import { isLeague, useInsightsHref, useInsightsLeagues } from "../../_components/useInsights";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";

type Row = LeagueData["rows"][number] & { label: string; gap: number | null; move: number | null };

const SORTS: SiteSortColumns<Row, "place" | "label" | "value" | "move" | "gap"> = {
  place: { value: (row) => row.place, first: "asc" },
  label: { value: (row) => row.label, first: "asc" },
  value: { value: (row) => row.value, first: "desc" },
  move: { value: (row) => row.move, first: "desc" },
  gap: { value: (row) => row.gap, first: "asc" },
};

/**
 * One league (insights-analyst-plan.md §5; drawn as the league boards): your
 * place, your figure, the gap to the place above and the leader, the league
 * as a chart, and every website in it — each with its move since a year
 * before, where Hakken holds it, and its gap to the place above.
 */
export default function InsightsLeaguePage() {
  const params = useParams();
  const id = String(params.league ?? "");
  const t = usePlatformTranslations("insights.league");
  const tl = usePlatformTranslations("insights.leagues");
  const tPlace = usePlatformTranslations("insights.place");
  const href = useInsightsHref();
  const data = useInsightsLeagues();
  const league = data?.leagues.find((entry) => entry.id === id) ?? null;
  const [search, setSearch, term] = useSiteSearch();
  const rows: Row[] | undefined = league?.rows.map((row, index) => ({
    ...row,
    label: leagueName(league, row),
    gap: index > 0 ? league.rows[index - 1].value - row.value : null,
    move: row.placeBefore !== null ? row.placeBefore - row.place : null,
  }));
  const matches = wordStartMatcher(term.toLowerCase());
  const order = useSiteSortedList(matches ? rows?.filter((row) => matches(row.label)) : rows, SORTS, { opening: "place", name: (row) => row.label });
  const pages = useSitePager(order.rows, { isLoading: rows === undefined });

  if (!isLeague(id)) return <HakkenEmptyState icon={Trophy} title={t("notFound")} description={t("notFoundDescription")} />;
  const header = <PageHeader icon={<Trophy className="h-5 w-5 text-brand" />} title={tl(`${id}.title`)} description={tl(`${id}.hint`)} />;
  if (data === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (!data || !league) return <>{header}<HakkenEmptyState icon={Trophy} title={t("emptyTitle")} description={t("emptyDescription")} /></>;

  const mine = league.rows.find((row) => row.you) ?? null;
  const leader = league.rows[0];
  const above = mine && mine.place > 1 ? league.rows[mine.place - 2] : null;
  const ord = (place: number) => tPlace("ordinal", { place });
  const moved = mine && mine.placeBefore !== null ? mine.placeBefore - mine.place : null;
  const says = mine
    ? [
      mine.place === 1
        ? t("sees.lead", { figure: formatNumber(mine.value), second: league.rows[1] ? leagueName(league, league.rows[1]) : "", secondFigure: league.rows[1] ? formatNumber(league.rows[1].value) : "" })
        : t("sees.place", { place: ord(mine.place), total: league.rows.length, figure: formatNumber(mine.value), leader: leagueName(league, leader), leaderFigure: formatNumber(leader.value) }),
      moved === null ? t("sees.noMove") : moved === 0 ? t("sees.held") : t(moved > 0 ? "sees.rose" : "sees.fell", { count: Math.abs(moved) }),
    ]
    : [t("sees.notIn")];

  return (
    <>
      {header}
      <HakkenSees says={says} steps={[{ words: t("sees.allLeagues"), link: t("seeAll"), href: href("leaderboards") }]} />
      <FigureRow>
        <Figure
          label={t("figures.place")}
          value={mine ? tPlace("ofTotal", { place: mine.place, total: league.rows.length }) : "–"}
          detail={moved === null ? <span className="text-secondary">{t("figures.noMove")}</span> : <ChangeLine by={moved}>{moved === 0 ? t("figures.held") : t("figures.moved", { count: Math.abs(moved) })}</ChangeLine>}
        />
        <Figure label={t("figures.figure")} value={mine ? formatNumber(mine.value) : "–"} detail={<span className="text-secondary">{tl(`${id}.figure`)}</span>} />
        <Figure label={t("figures.gap")} value={above && mine ? formatNumber(above.value - mine.value) : "–"} detail={<span className="text-secondary">{above ? t("figures.behind", { name: leagueName(league, above) }) : t("figures.top")}</span>} />
        <Figure label={t("figures.leader")} value={formatNumber(leader.value)} detail={<span className="text-secondary">{leagueName(league, leader)}</span>} />
      </FigureRow>
      <LeagueCard league={league} host={data.host} title={t("chart")} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => `${row.place}-${row.name}`}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        cardHeader={
          <TableBar
            footer={pages.footer}
            noun="websites"
            actions={
              <ListDownload
                label={t("download")}
                fileName={`${data.host}-${id}-league`}
                rows={order.rows}
                columns={[
                  { header: t("columns.place"), value: (row) => row.place },
                  { header: t("columns.website"), value: (row) => row.label },
                  { header: tl(`${id}.figure`), value: (row) => row.value },
                  { header: t("columns.move"), value: (row) => row.move ?? "" },
                  { header: t("columns.gap"), value: (row) => row.gap ?? "" },
                ]}
              />
            }
          />
        }
        sort={order.tableSort}
        empty={{ icon: <Trophy className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={pages.footer}
        columns={[
          { key: "place", header: t("columns.place"), sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.place}</span> },
          {
            key: "label",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => (
              <span className="flex items-center gap-2">
                <span className={row.you ? "text-[13px] font-semibold text-foreground" : "text-[13px] text-foreground"}>{row.label}</span>
                <TagLabel>{row.you ? t("you") : t("rival")}</TagLabel>
              </span>
            ),
          },
          { key: "value", header: tl(`${id}.title`), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.value)}</span> },
          {
            key: "move",
            header: t("columns.move"),
            align: "right",
            sortable: true,
            cell: (row) => (row.move === null ? <span className="text-[12px] text-muted">–</span> : <ChangeLine by={row.move}>{row.move === 0 ? t("figures.held") : t("figures.moved", { count: Math.abs(row.move) })}</ChangeLine>),
          },
          { key: "gap", header: t("columns.gap"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.gap === null ? "–" : formatNumber(row.gap)}</span> },
        ]}
      />
    </>
  );
}
