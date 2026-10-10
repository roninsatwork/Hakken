"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN, PageLinkCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { ListDownload } from "../../../_components/SiteDownloads";
import { Figure } from "@/src/ui/components/screens/Figure";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { isPartHeld } from "../../../_components/SiteCoverage";
import { datedRow } from "../../../_components/datedRows";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;
type Band = (typeof BANDS)[number];
type Bands = Record<Band, number>;
type From = Band | "none";

/** Held within this share of the newest check's searches, a check covered the whole keyword list. */
const WHOLE_SHARE = 0.9;

/** The grid's colours, from the chart palette: up, down and newly ranking, never red against green. */
const MOVE_COLOURS = { up: CHART_SERIES_TEAL, down: CHART_SERIES_AMBER, fresh: CHART_SERIES_BLUE } as const;
/** A colour at a fifth of its strength, as a background: mixed with nothing, rather than an alpha glued onto the palette's hex. */
const tint = (colour: string) => `color-mix(in srgb, ${colour} 20%, transparent)`;

type MovedRow = FunctionReturnType<typeof api.siteBands.listBandMoves>["rows"][number];
type ClosestRow = FunctionReturnType<typeof api.siteBands.bandMoves>["closest"]["rows"][number];

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, where it was and is from the top, the band it landed in from
 * the top, and the most searched first — the order both lists open on.
 */
const MOVED_SORTS: SiteSortColumns<MovedRow, "keyword" | "was" | "now" | "band" | "volume"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  was: { value: (row) => row.was, first: "asc" },
  now: { value: (row) => row.now, first: "asc" },
  band: { value: (row) => BANDS.indexOf(row.to), first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
};
const CLOSEST_SORTS: SiteSortColumns<ClosestRow, "keyword" | "position" | "volume" | "traffic"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  traffic: { value: (row) => row.traffic, first: "desc" },
};
const keywordOf = (row: { keyword: string }) => row.keyword;

const pageOne = (bands: Bands) => bands.p01_03 + bands.p04_10;
const further = (bands: Bands) => bands.p21_50 + bands.p51_up;
const sum = (bands: Bands) => BANDS.reduce((total, band) => total + bands[band], 0);

/**
 * Position bands, as agreed with Anthony on 2026-09-27 ("B + C together"):
 * page one first — how many searches sit on it, the top three among them —
 * then page two and further down, over time; then what moved between the
 * bands at the newest check, the searches that did, and the searches just
 * off page one.
 *
 * The figures and the chart are the supplier's own bands across every search
 * the site ranks for, as the menu counts them — a list held in part cannot
 * give them (sites-data-completeness-plan.md, §4.E). What moved, and the
 * searches just off page one, are the keyword list's, and say how many
 * searches that is. With no bands of the supplier's yet, the list's own are
 * drawn, leaving out the checks before the whole list was first held, which
 * covered only the searches checked on every run.
 */
export default function SiteBandsPage() {
  const t = useTranslations("sites.bands");
  const tb = useTranslations("sites.overview.bands");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const router = useRouter();
  const listHref = useSiteListHref(siteId);
  const recordHref = useSiteRecordHref(siteId);
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const moves = useQuery(api.siteBands.bandMoves, { siteId });
  const moved = useQuery(api.siteBands.listBandMoves, { siteId });

  const points = series?.[0]?.points ?? [];
  const everySearch = points.flatMap((point) => (point.allBands ? [{ step: point.day, day: point.lastDay, bands: point.allBands }] : []));
  const checks = points.flatMap((point) =>
    point.bands && point.keywords !== undefined ? [{ step: point.day, day: point.lastDay, held: point.keywords, bands: point.bands }] : []);
  const newest = checks.at(-1);
  const wholes = everySearch.length > 0 ? everySearch : newest ? checks.filter((check) => check.held >= newest.held * WHOLE_SHARE) : [];
  const latest = wholes.at(-1) ?? null;
  const before = wholes.at(-2) ?? null;
  const total = latest ? sum(latest.bands) : 0;
  const coverage = site?.coverage;
  const partHeld = isPartHeld(coverage);
  const held = coverage?.searches.held ?? null;

  const change = (now: number, was: number | undefined) => {
    if (!before || was === undefined) return <span className="text-muted">{t("noBefore")}</span>;
    const day = formatShortDay(before.day);
    const text = now > was ? t("up", { count: formatNumber(now - was), day })
      : now < was ? t("down", { count: formatNumber(was - now), day })
        : t("same", { day });
    return <span className="text-secondary">{text}</span>;
  };

  const { rows: movedSorted, tableSort: movedSort } = useSiteSortedList(moved?.rows, MOVED_SORTS, { opening: "volume", name: keywordOf });
  const movedPager = useSitePager(movedSorted, { isLoading: moved === undefined, cut: moved?.cut });
  const closestRows = moves?.closest.rows;
  const { rows: closestSorted, tableSort: closestSort } = useSiteSortedList(closestRows, CLOSEST_SORTS, { opening: "volume", name: keywordOf, table: "closest" });
  const closestPager = useSitePager(closestSorted, {
    isLoading: moves === undefined,
    cut: moves && moves.closest.total > moves.closest.rows.length ? moves.closest.rows.length : null,
    table: "closest",
  });
  // On a list held in part a search can be new to it and have ranked before, below the list's limit (§4.C).
  const bandName = (from: From) => (from === "none" ? t(partHeld ? "moves.newToList" : "moves.notRanking") : tb(from));
  // Where a search moved, band to band: "11–20 → 1–3", or "new → 51+".
  const bandMove = (row: MovedRow) => `${row.from === "none" ? t("moved.fresh") : tb(row.from)} → ${tb(row.to)}`;
  const host = site?.host ?? "site";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Layers className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={latest ? (
          <span className="text-[12px] text-muted">
            {before
              ? t("asOfCompared", { day: formatShortDay(latest.day), count: formatNumber(total), before: formatShortDay(before.day) })
              : t("asOf", { day: formatShortDay(latest.day), count: formatNumber(total) })}
            {partHeld && held !== null ? ` · ${t("held", { count: formatNumber(held) })}` : null}
          </span>
        ) : null}
      />
      <SiteSees screen="keywordsBands" seen={moves?.seen} />

      {latest ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Figure
            label={t("pageOne")}
            value={formatNumber(pageOne(latest.bands))}
            detail={(
              <div className="flex flex-col gap-1">
                <span className="text-muted">{t("pageOneShare", { share: `${total ? Math.round((pageOne(latest.bands) / total) * 100) : 0}%`, total: formatNumber(total) })}</span>
                {change(pageOne(latest.bands), before ? pageOne(before.bands) : undefined)}
                {/* The top three and the rest of page one, each opening its own searches: two shares in one track, which the kit's Meter (one share) does not draw — frozen in the screen kit's `recipes` list. */}
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-hover" aria-hidden>
                  <span style={{ width: `${pageOne(latest.bands) ? (latest.bands.p01_03 / pageOne(latest.bands)) * 100 : 0}%`, backgroundColor: CHART_SERIES_ORANGE }} />
                  <span className="flex-1" style={{ backgroundColor: CHART_SERIES_BLUE }} />
                </div>
                <div className="flex justify-between gap-3 text-[12px]">
                  <Link href={listHref("keywords", { band: "p01_03" })} className="text-info hover:underline">{t("inTop3", { count: formatNumber(latest.bands.p01_03) })}</Link>
                  <Link href={listHref("keywords", { band: "p04_10" })} className="text-info hover:underline">{t("inRestOfPageOne", { count: formatNumber(latest.bands.p04_10) })}</Link>
                </div>
              </div>
            )}
          />
          <Figure
            label={t("pageTwo")}
            value={formatNumber(latest.bands.p11_20)}
            href={listHref("keywords", { band: "p11_20" })}
            detail={(
              <div className="flex flex-col gap-1">
                <span className="text-muted">{t("pageTwoMeaning")}</span>
                {change(latest.bands.p11_20, before?.bands.p11_20)}
              </div>
            )}
          />
          <Figure
            label={t("further")}
            value={formatNumber(further(latest.bands))}
            detail={(
              <div className="flex flex-col gap-1">
                <span className="text-muted">{t("furtherMeaning")}</span>
                {change(further(latest.bands), before ? further(before.bands) : undefined)}
              </div>
            )}
          />
        </div>
      ) : null}

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${host}-position-bands-${range.from}-to-${range.to}`}
        csv={() => toCsv(
          ["day", ...BANDS.map((band) => tb(band)), t("series.pageOne"), t("series.pageTwo"), t("series.further")],
          wholes.map((check) => [check.day, ...BANDS.map((band) => check.bands[band]), pageOne(check.bands), check.bands.p11_20, further(check.bands)]),
        )}
        enoughData={wholes.length > 0}
      >
        <SiteLineChart
          sharedScale
          height={240}
          data={wholes.map((check) => datedRow({ day: check.step, lastDay: check.day }, { pageOne: pageOne(check.bands), pageTwo: check.bands.p11_20, further: further(check.bands) }))}
          series={[
            { key: "pageOne", name: t("series.pageOne"), colour: CHART_SERIES_BLUE },
            { key: "pageTwo", name: t("series.pageTwo"), colour: CHART_SERIES_VIOLET },
            { key: "further", name: t("series.further"), colour: CHART_SERIES_TEAL },
          ]}
        />
        {everySearch.length === 0 && checks.length > wholes.length && wholes[0] ? (
          <p className="mt-3 text-[12px] text-muted">{t("early", { day: formatShortDay(wholes[0].day) })}</p>
        ) : null}
      </SiteChartCard>

      {moves ? <BandGrid moves={moves} bandName={bandName} held={partHeld ? held : null} /> : null}

      <DataTable
        rows={movedPager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        cardHeader={<TableBar
          footer={movedPager.footer}
          noun="searches"
          title={t("moved.title")}
          actions={(
            <ListDownload
              fileName={`${host}-changed-band`}
              rows={movedSorted}
              columns={[
                { header: t("moved.columns.keyword"), value: (row) => row.keyword },
                { header: t("moved.columns.was"), value: (row) => row.was },
                { header: t("moved.columns.now"), value: (row) => row.now },
                { header: t("moved.columns.band"), value: bandMove },
                { header: t("moved.columns.volume"), value: (row) => row.volume },
              ]}
            />
          )}
        />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("moved.empty") }}
        footer={movedPager.footer}
        sort={movedSort}
        columns={[
          { key: "keyword", header: t("moved.columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "was", header: t("moved.columns.was"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.was ?? "–"}</span> },
          { key: "now", header: t("moved.columns.now"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.now} /> },
          {
            key: "band",
            header: t("moved.columns.band"),
            sortable: true,
            cell: (row) => (
              <span className="whitespace-nowrap text-[12px] text-secondary">{bandMove(row)}</span>
            ),
          },
          { key: "volume", header: t("moved.columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.volume)}</span> },
        ]}
      />

      <DataTable
        rows={closestPager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        cardHeader={<TableBar
          footer={closestPager.footer}
          noun="searches"
          title={t("closest.title")}
          description={partHeld ? t("closest.descriptionHeld") : t("closest.description")}
          actions={moves && moves.bands.p11_20 > 0 ? (
            <Link href={listHref("keywords", { band: "p11_20" })} className="whitespace-nowrap text-[13px] text-info hover:underline">
              {t("closest.all", { count: formatNumber(moves.bands.p11_20) })} →
            </Link>
          ) : null}
        />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("closest.empty") }}
        footer={closestPager.footer}
        sort={closestSort}
        columns={[
          { key: "keyword", header: t("closest.columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
          { key: "position", header: t("closest.columns.position"), align: "right", sortable: true, cell: (row) => <PositionCell position={row.position} /> },
          { key: "volume", header: t("closest.columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.volume)}</span> },
          { key: "traffic", header: t("closest.columns.traffic"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.traffic)}</span> },
          {
            key: "page",
            header: t("closest.columns.page"),
            className: CUT_COLUMN.second,
            cell: (row) => (row.page ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} /> : <NoFigure />),
          },
        ]}
      />
    </div>
  );
}

/**
 * What moved between the bands at the newest check: a line saying it, then a
 * grid of from-this-band to-that-band, each square opening the searches that
 * made the move. A count that held level can hide two searches leaving the
 * top three and two arriving; the grid shows both.
 */
function BandGrid({ moves, bandName, held }: {
  moves: FunctionReturnType<typeof api.siteBands.bandMoves>;
  bandName: (from: From) => string;
  /** The searches held, for a list held in part: the moves are among those. */
  held: number | null;
}) {
  const t = useTranslations("sites.bands.moves");
  const recordHref = useSiteRecordHref(useSiteId());
  const count = (from: From, to: Band) => moves.moves.find((move) => move.from === from && move.to === to)?.count ?? 0;
  const movedInto = (to: Band) => moves.moves.filter((move) => move.to === to).reduce((total, move) => total + move.count, 0);
  const movedOut = (from: Band) => moves.moves.filter((move) => move.from === from).reduce((total, move) => total + move.count, 0);
  const moved = moves.moves.reduce((total, move) => total + move.count, 0);
  const day = moves.rankingDay ? formatShortDay(moves.rankingDay) : "";
  const before = moves.previousDay ? formatShortDay(moves.previousDay) : "";
  const start = moves.start ?? (moves.previousDay ? null : "FIRST");

  const into = movedInto("p01_03");
  const out = movedOut("p01_03");
  // On a list held in part a search new to it did not move into a band, and
  // the top 3 "before" is not known: it says what changed among those held (§4.C).
  const fresh = moves.moves.filter((move) => move.from === "none").reduce((total, move) => total + move.count, 0);
  const summary = start === "FIRST" ? t("first")
    : start === "FIRST_LIST" ? t("firstList", { day })
      : moved === 0 ? t("none", { before, day })
        : held !== null
          ? t("someHeld", { before, day, count: moved, fresh: formatNumber(fresh), now: formatNumber(moves.bands.p01_03) })
        : into === out
          ? t("someSame", { before, day, count: moved, into: formatNumber(into), out: formatNumber(out), now: formatNumber(moves.bands.p01_03) })
          : t("someChanged", {
            before, day, count: moved, into: formatNumber(into), out: formatNumber(out),
            now: formatNumber(moves.bands.p01_03), was: formatNumber(moves.bands.p01_03 - into + out),
          });
  const rows: From[] = ["none", ...BANDS];

  return (
    <ChartCard title={t("title")}>
      <p className="text-[13px] text-foreground">{summary}</p>
      {held !== null ? <p className="mt-1 text-[12px] text-secondary">{t("amongHeld", { count: formatNumber(held) })}</p> : null}
      {start || !moves.rankingDay ? null : (
        <>
          <div className="mt-4 grid grid-cols-[84px_repeat(5,minmax(0,1fr))] gap-1 text-[12px] sm:grid-cols-[120px_repeat(5,minmax(0,1fr))]">
            <span />
            {BANDS.map((band) => <span key={band} className="text-center text-[11px] text-secondary">{t("to", { band: bandName(band) })}</span>)}
            {rows.map((from) => (
              <div key={from} className="contents">
                <span className="flex items-center text-[11px] text-secondary">{t("from", { band: bandName(from) })}</span>
                {BANDS.map((to) => {
                  if (from === to) {
                    const stayed = moves.bands[to] - movedInto(to);
                    // A plain number: what stayed is read, not pressed, and needs no box.
                    return (
                      <span key={to} title={t("stayed", { count: stayed, band: bandName(to) })} className="flex h-9 items-center justify-center font-mono text-muted">
                        {formatNumber(stayed)}
                      </span>
                    );
                  }
                  const n = count(from, to);
                  if (n === 0) return <span key={to} className="flex h-9 items-center justify-center font-mono text-muted/60">·</span>;
                  const colour = from === "none" ? MOVE_COLOURS.fresh : BANDS.indexOf(from) > BANDS.indexOf(to) ? MOVE_COLOURS.up : MOVE_COLOURS.down;
                  const label = t("cell", { count: n, from: bandName(from), to: bandName(to) });
                  return (
                    <Link
                      key={to}
                      href={recordHref({ kind: "bandMove", move: `${from}.${to}` })}
                      aria-label={label}
                      title={label}
                      className="flex h-9 items-center justify-center rounded-md font-mono text-foreground transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      style={{ backgroundColor: tint(colour) }}
                    >
                      {formatNumber(n)}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-secondary">
            {([["legendUp", MOVE_COLOURS.up], ["legendDown", MOVE_COLOURS.down], [held !== null ? "legendNewToList" : "legendNew", MOVE_COLOURS.fresh]] as const).map(([key, colour]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: tint(colour), border: `1px solid ${colour}` }} />
                {t(key)}
              </span>
            ))}
            {/* The counts that stayed are plain numbers on the diagonal, so their key is the word alone, no swatch. */}
            <span className="inline-flex items-center gap-1.5">{t("legendStayed")}</span>
          </div>
        </>
      )}
    </ChartCard>
  );
}
