"use client";

import { useMemo } from "react";
import { Change } from "@/src/ui/components/screens/Change";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Swords } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { datedRow } from "../../_components/datedRows";
import { formatDay, formatNumber, toCsv } from "../../_components/siteFormat";
import { RecordLinkCell } from "../../_components/SiteCells";
import { heldIcon } from "../../_components/siteGroups";
import { MarkedHost } from "../../_components/SiteMark";
import { useSiteRecordHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { sideBySideSees } from "@/convex/utils/sees/competitors";
import { SiteSees } from "../../_components/SiteSees";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";
import { useSiteSearch } from "../../_components/useSiteParam";
import { ListDownload } from "../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { periodOrOpening } from "../../_components/siteRange";
import { useOpeningPeriod } from "../../_components/useCalendarPeriod";

type Figures = { websiteId: string; host: string; estimatedTraffic: number | null; keywords: number | null; referringDomains: number | null };
const hostOf = (row: Figures) => row.host;

const VERDICT_TONES: Record<string, StatusTone> = {
  AHEAD: "warning",
  LEVEL: "info",
  BEHIND: "success",
  GONE_QUIET: "neutral",
  TOO_NEW: "neutral",
  NOT_CHECKED: "neutral",
};

/**
 * Side by side: this site beside the others in its group — as each stood at
 * its newest check, and how each compares on the searches and questions the
 * site is measured on. The chart draws their estimated traffic together.
 */
/** Rival moves' sortable columns (sites-table-sorting-plan.md): the rival A to Z, each figure the most first. */
type MoveRow = { host: string; newSearches: number; climbed: number; fell: number; visits: number | null };
const MOVE_SORTS: SiteSortColumns<MoveRow, "rival" | "new" | "climbed" | "fell" | "visits"> = {
  rival: { value: (row) => row.host, first: "asc" },
  new: { value: (row) => row.newSearches, first: "desc" },
  climbed: { value: (row) => row.climbed, first: "desc" },
  fell: { value: (row) => row.fell, first: "desc" },
  visits: { value: (row) => row.visits, first: "desc" },
};

export default function SiteSideBySidePage() {
  const t = useTranslations("sites.sideBySide");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  // Custom dates are not offered here (sitePages.ts, PERIOD_ONLY_SEGMENTS): the address carrying them reads as the opening period.
  const period = periodOrOpening(range, useOpeningPeriod());
  const figures = useQuery(api.siteCharts.siteAndRivals, { siteId });
  const [search, setSearch, settled] = useSiteSearch();
  const lower = settled.toLowerCase();
  const matches = wordStartMatcher(lower);
  const shownFigures = figures?.filter((row) => !matches || matches(row.host));
  const rivals = useQuery(api.siteCompetitors.listRivals, { siteId });
  const compare = useMemo(() => new Map((rivals ?? []).map((row) => [row.websiteId as string, row])), [rivals]);
  // The columns that sort (docs/plans/active/sites-table-sorting-plan.md):
  // the website A to Z; the most visits — the order it opens on — keywords,
  // linking websites, and searches it is above this site on, first; this
  // site sorted in with the rest, still marked.
  const columns = useMemo<SiteSortColumns<Figures, "website" | "traffic" | "keywords" | "linking" | "beats">>(() => ({
    website: { value: (row) => row.host, first: "asc" },
    traffic: { value: (row) => row.estimatedTraffic, first: "desc" },
    keywords: { value: (row) => row.keywords, first: "desc" },
    linking: { value: (row) => row.referringDomains, first: "desc" },
    // Blank, and last, for a competitor with no place on any search compared: it shows "–".
    beats: { value: (row) => { const entry = compare.get(row.websiteId); return entry && entry.rankedOn > 0 ? entry.beatsYouOn : null; }, first: "desc" },
  }), [compare]);
  const { rows: sorted, tableSort } = useSiteSortedList(shownFigures, columns, { opening: "traffic", name: hostOf });
  // Paged like every table, however many rivals a group holds.
  const paged = useSitePager(sorted ?? [], { isLoading: figures === undefined });
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  // A competitor opens its own comparison with this site; this site is the one being read.
  const rivalHref = (row: { host: string; isYou: boolean }): string | null => {
    if (row.isYou) return null;
    const hold = site?.rivals.find((entry) => entry.host === row.host);
    return hold ? recordHref({ kind: "rival", rivalId: hold.siteId }) : null;
  };
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step, withRivals: true });
  const tm = useTranslations("sites.rivalMoves");
  const tp = useTranslations("common.periods");
  const moves = useQuery(api.siteRivalMoves.rivalMoves, { siteId, period: period });
  // Rivals are checked once a month: a week between two checks says so rather than showing noughts.
  const lastRivalCheck = moves && moves.length > 0 && moves.every((row) => !row.checked)
    ? moves.reduce<string | null>((newest, row) => (row.lastCheck && (!newest || row.lastCheck > newest) ? row.lastCheck : newest), null)
    : null;
  const newHeader = tm("columns.new", { period: tp(`inline.${period}`) });
  const [moveSearch, setMoveSearch, moveTerm] = useSiteSearch("mq", "moves");
  const moveMatches = moves?.filter((row) => !moveTerm || row.host.toLowerCase().includes(moveTerm.toLowerCase()));
  const { rows: moveRows, tableSort: moveSort } = useSiteSortedList(moveMatches, MOVE_SORTS, { opening: "new", name: (row) => row.host, table: "moves" });
  const movePages = useSitePager(moves ? moveRows : undefined, { isLoading: moves === undefined, table: "moves" });

  const lines = series ?? [];
  // A group of more than five draws the five with the most traffic, and says so (4.11).
  const drawn = lines.filter((line) => !line.isYou).length;
  const groupSize = site?.rivals.length ?? 0;
  const days = [...new Set(lines.flatMap((line) => line.points.map((point) => point.day)))].sort();
  const traffic = (line: (typeof lines)[number], day: string) => line.points.find((point) => point.day === day)?.estimatedTraffic ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Swords className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <SiteSees screen="competitors" seen={rivals && sideBySideSees(rivals, (host) => site?.holds.find((entry) => entry.host === host)?.siteId ?? null)} data={rivals && { rivals, figures, series, moves }} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={series !== undefined && groupSize > drawn ? t("chartHintSome", { shown: drawn, total: groupSize }) : t("chartHint")}
        exportName={`${site?.host ?? "site"}-traffic-side-by-side-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...lines.map((line) => line.host)], days.map((day) => [day, ...lines.map((line) => traffic(line, day))]))}
        enoughData={days.length > 0}
      >
        <SiteLineChart
          sharedScale
          data={days.map((day) => datedRow({ day }, Object.fromEntries(lines.map((line) => [line.host, traffic(line, day)]))))}
          series={lines.map((line, index) => ({
            key: line.host,
            name: line.isYou ? tc("you", { host: line.host }) : line.host,
            colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length],
            dashed: !line.isYou,
          }))}
        />
      </SiteChartCard>

      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.websiteId}
        onRowClick={(row) => { const href = rivalHref(row); if (href) router.push(href); }}
        rowClickable={(row) => rivalHref(row) !== null}
        search={{ value: search, onChange: setSearch, placeholder: tc("findWebsite") }}
        cardHeader={<TableBar footer={paged.footer} noun="websites" actions={<ListDownload fileName={`${site?.host ?? "site"}-side-by-side`} rows={sorted} columns={[{ header: t("columns.website"), value: (row) => row.host }, { header: t("columns.traffic"), value: (row) => row.estimatedTraffic }, { header: t("columns.keywords"), value: (row) => row.keywords }, { header: t("columns.top3"), value: (row) => row.top3 }, { header: t("columns.linking"), value: (row) => row.referringDomains }, { header: t("columns.rank"), value: (row) => row.domainRank }, { header: tc("lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: lower ? tc("noWebsiteMatch") : t("empty") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          {
            key: "website",
            header: t("columns.website"),
            sortable: true,
            cell: (row) => {
              const href = rivalHref(row);
              const className = `text-[13px] ${row.isYou ? "font-medium text-foreground" : "text-secondary"}`;
              const name = row.isYou ? tc("you", { host: row.host }) : row.host;
              const owned = row.isYou && site?.relationship === "OWNED";
              return (
                <MarkedHost host={row.host} iconUrl={heldIcon(site?.holds, { host: row.host })} owned={owned}>
                  {href ? <RecordLinkCell href={href} className={className}>{name}</RecordLinkCell> : <span className={className}>{name}</span>}
                </MarkedHost>
              );
            },
          },
          { key: "traffic", header: t("columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.estimatedTraffic)}</span> },
          { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.keywords)}</span> },
          { key: "linking", header: t("columns.linking"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.referringDomains)}</span> },
          {
            key: "beats",
            header: t("columns.beatsYou"),
            align: "right",
            sortable: true,
            cell: (row) => {
              const entry = compare.get(row.websiteId);
              // A competitor with no place on any search compared has nothing to count (4.9).
              return entry && entry.rankedOn > 0
                ? <span className="font-mono text-[12px]">{t("searchesOf", { count: entry.beatsYouOn, total: entry.comparedOn })}</span>
                : <NoFigure />;
            },
          },
          {
            key: "verdict",
            header: t("columns.verdict"),
            cell: (row) => {
              const entry = compare.get(row.websiteId);
              return entry ? <StatusLabel tone={VERDICT_TONES[entry.verdict] ?? "neutral"}>{t(`verdicts.${entry.verdict}`)}</StatusLabel> : <NoFigure />;
            },
          },
        ]}
      />

      {/* What the rivals did lately (insights-analyst-plan.md phase 4): their new searches, climbs and falls, and visits a month. */}
      {lastRivalCheck ? <Notice>{tm("notChecked", { day: formatDay(lastRivalCheck) })}</Notice> : null}
      <DataTable
        rows={movePages.pageRows}
        rowKey={(row) => row.siteId}
        onRowClick={(row) => router.push(`/app/sites/${siteId}/competitors/rival?rival=${row.siteId}`)}
        search={{ value: moveSearch, onChange: setMoveSearch, placeholder: tc("findWebsite") }}
        cardHeader={<TableBar footer={movePages.footer} noun="websites" title={tm("title")} actions={<ListDownload fileName={`${site?.host ?? "site"}-rival-moves`} rows={moveRows} columns={[{ header: tm("columns.rival"), value: (row) => row.host }, { header: newHeader, value: (row) => row.newSearches }, { header: tm("columns.climbed"), value: (row) => row.climbed }, { header: tm("columns.fell"), value: (row) => row.fell }, { header: tm("columns.biggest"), value: (row) => row.biggestNew?.keyword ?? "" }, { header: tm("columns.visits"), value: (row) => row.visits ?? "" }]} />} />}
        empty={{ icon: <Swords className="h-8 w-8 text-muted/30" />, label: moveTerm ? tc("noWebsiteMatch") : tm("empty") }}
        footer={movePages.footer}
        sort={moveSort}
        columns={[
          { key: "rival", header: tm("columns.rival"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.host}</span> },
          { key: "new", header: newHeader, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.newSearches)}</span> },
          { key: "climbed", header: tm("columns.climbed"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.climbed)}</span> },
          { key: "fell", header: tm("columns.fell"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.fell)}</span> },
          { key: "biggest", header: tm("columns.biggest"), cell: (row) => <span className="text-[12px] text-secondary">{row.biggestNew ? tm("biggest", { keyword: row.biggestNew.keyword, position: row.biggestNew.position ?? "–", volume: formatNumber(row.biggestNew.volume) }) : "–"}</span> },
          { key: "visits", header: tm("columns.visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.visits)}{row.visits !== null && row.visitsBefore ? <span className="ml-2"><Change by={row.visits - row.visitsBefore} /></span> : null}</span> },
        ]}
      />
    </div>
  );
}
