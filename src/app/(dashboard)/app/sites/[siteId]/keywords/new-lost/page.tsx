"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { ArrowUpDown, CalendarDays } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_SLATE, CHART_SERIES_TEAL } from "@/src/ui/components/charts/chartPalette";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Change } from "@/src/ui/components/screens/Change";
import { CUT_COLUMN, CheckedCell, PageLinkCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { ListDownload } from "../../../_components/SiteDownloads";
import { SiteGainLossChart, type GainLossKind, type GainLossStep } from "../../../_components/SiteGainLossChart";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSiteParam } from "../../../_components/useSiteParam";
import { useSiteListPage, useSitePager } from "../../../_components/useSitePagedTable";
import { dayOf, dayTableSorts, useSiteSort, useSiteSortedList } from "../../../_components/useSiteSort";
import { isPartHeld } from "../../../_components/SiteCoverage";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

/**
 * The fourth move: lost, from a list that held everything the site ranks
 * for; on a list held in part, left the list — never lost, for a search that
 * left it may still rank below its limit (sites-data-completeness-plan.md, §4.C).
 */
type Direction = "NEW" | "UP" | "DOWN" | "LOST" | "LEFT";
const WHOLE_DIRECTIONS: Direction[] = ["NEW", "UP", "DOWN", "LOST"];
const HELD_DIRECTIONS: Direction[] = ["NEW", "UP", "DOWN", "LEFT"];
const ALL_DIRECTIONS: Direction[] = ["NEW", "UP", "DOWN", "LOST", "LEFT"];
const KINDS: readonly GainLossKind[] = ["new", "up", "down", "lost"];
const KIND_OF: Record<Direction, GainLossKind> = { NEW: "new", UP: "up", DOWN: "down", LOST: "lost", LEFT: "lost" };
const COUNT_OF = { new: "rankedNew", up: "rankedUp", down: "rankedDown", lost: "rankedLost" } as const;
const LEFT_COUNT = "rankedLeft" as const;
/**
 * The arrows carry the direction; colour only repeats it, and no red sits beside green (the owner cannot tell them apart).
 * A key to the chart's four series rather than a move, so not the kit's `Change` (frozen in the screen kit's `recipes` list).
 */
const ARROWS: Record<GainLossKind, string> = { new: "▲", up: "↑", down: "↓", lost: "▼" };
/**
 * The chart's series, from the chart palette. The tabs' arrows and underline
 * wear the same colours: they are the chart's key, so they match it exactly.
 */
const COLOURS: Record<GainLossKind, string> = { new: CHART_SERIES_BLUE, up: CHART_SERIES_TEAL, down: CHART_SERIES_AMBER, lost: CHART_SERIES_SLATE };

type Checks = FunctionReturnType<typeof api.siteChecks.siteChecks>;
type Step = Checks["steps"][number];
type Newest = NonNullable<Checks["newest"]>;

const isStart = (kind: Newest["kind"]) => kind === "FIRST" || kind === "FIRST_LIST";
const netOf = (row: Pick<Step, "rankedNew" | "rankedUp" | "rankedDown" | "rankedLost" | "rankedLeft">) =>
  row.rankedNew === null ? null : row.rankedNew + (row.rankedUp ?? 0) - (row.rankedDown ?? 0) - (row.rankedLost ?? 0) - (row.rankedLeft ?? 0);
const signed = (value: number | null) => (value === null ? "–" : value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : "0");

/** The checks table's columns that sort: the day, newest first — the order it opens on — and each count and the net, the most first. */
const CHECK_SORTS = dayTableSorts<Step, GainLossKind | "net">([...KINDS, "net"], (row, figure) =>
  (figure === "net" ? netOf(row) : figure === "lost" ? (row.rankedLost ?? 0) + (row.rankedLeft ?? 0) : row[COUNT_OF[figure]]));

/**
 * The moves' columns that sort, over every move (docs/plans/active/
 * sites-table-sorting-plan.md): the search A to Z, where it stands now from
 * the top, the size of the move, and the most searched first — the order the
 * list opens on, as the design agreed.
 */
const MOVE_SORTS = { keyword: "asc", fromTo: "asc", change: "desc", volume: "desc" } as const;

/**
 * New and lost keywords, as agreed with Anthony on 2026-09-27 ("A + B
 * together"): the newest check and what it covered; the searches gained and
 * lost at each check, on one chart; the newest check's new, up, down and lost
 * searches, one list at a time; then every check in the dates with its counts.
 *
 * The counts are the same comparison Wins and losses lists
 * counts, so a number and the searches it opens agree (docs/plans/active/
 * sites-audit-fixes-plan.md, 1.3). A check with nothing before it — the
 * site's first, or the first day its whole list was held — is marked as such
 * and not counted as moves: those searches were new to the list, not new
 * rankings.
 */
export default function SiteNewLostPage() {
  const t = useTranslations("sites.newLost");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const checks = useQuery(api.siteChecks.siteChecks, { siteId, from: range.from, to: range.to, step: range.step });
  const coverage = site?.coverage;
  const partHeld = isPartHeld(coverage);
  const directions = partHeld ? HELD_DIRECTIONS : WHOLE_DIRECTIONS;
  const [chosenDirection, setDirection] = useSiteParam<Direction>("direction", "UP", ALL_DIRECTIONS);
  // A link made on one kind of list still opens the fourth move on the other.
  const direction: Direction = chosenDirection === "LOST" && partHeld ? "LEFT" : chosenDirection === "LEFT" && !partHeld ? "LOST" : chosenDirection;
  /** A move's count at a check: the fourth is what left a list held in part, what was lost from a whole one. */
  const countOf = (row: Pick<Step, "rankedNew" | "rankedUp" | "rankedDown" | "rankedLost" | "rankedLeft">, kind: GainLossKind) =>
    kind === "lost" && partHeld ? row[LEFT_COUNT] : row[COUNT_OF[kind]];
  const newest = checks?.newest ?? null;
  const newestIsStart = newest !== null && isStart(newest.kind);
  const order = useSiteSort(MOVE_SORTS, "volume");
  const moves = useSiteListPage(
    api.siteKeywords.listMoves,
    checks !== undefined && (newest === null || newestIsStart) ? "skip" : { siteId, status: direction, sort: order.key, direction: order.direction },
    [{ siteId, list: "keywords" }],
  );

  const steps = checks?.steps ?? [];
  const { rows: sortedSteps, tableSort: checkSort } = useSiteSortedList(checks?.steps, CHECK_SORTS, { opening: "day", name: dayOf, table: "checks" });
  const checkPager = useSitePager(sortedSteps, { isLoading: checks === undefined, table: "checks" });

  // A list is "whole" only when it held everything the site ranks for; one held to its limit is the list kept (§4.F).
  const kindLabel = (row: { kind: Newest["kind"]; complete: boolean }) =>
    t(`kinds.${row.kind === "WHOLE" && !row.complete ? "KEPT" : row.kind === "FIRST_LIST" && !row.complete ? "FIRST_KEPT" : row.kind}`);
  const covered = (row: { kind: Newest["kind"]; complete: boolean; checked: number | null }) =>
    row.checked === null ? kindLabel(row) : t("covered", { kind: kindLabel(row), count: row.checked });
  const startNote = (row: { kind: Newest["kind"]; held: number }) =>
    row.kind === "FIRST_LIST" ? t("startNotes.FIRST_LIST", { count: row.held }) : t("startNotes.FIRST");
  const stepDetail = (row: Step) => {
    if (row.checks === 1) return covered(row);
    if (row.start === "FIRST") return t("checks.severalWithFirst", { count: row.checks });
    if (row.start === "FIRST_LIST") return t("checks.severalWithFirstList", { count: row.checks });
    return t("checks.several", { count: row.checks });
  };
  const chartSteps: GainLossStep[] = steps.map((step) => ({
    day: step.day,
    lastDay: step.lastDay,
    label: formatShortDay(step.day),
    detail: range.step === "day" ? kindLabel(step) : undefined,
    counts: step.rankedNew === null ? null : { new: step.rankedNew, up: step.rankedUp ?? 0, down: step.rankedDown ?? 0, lost: countOf(step, "lost") ?? 0 },
    startLabel: step.start ? t(`startLabels.${step.start}`) : undefined,
    startNote: step.rankedNew === null ? startNote(step) : undefined,
  }));
  const chosen = KIND_OF[direction];
  const host = site?.host ?? "site";
  const seriesName = (kind: GainLossKind) => (kind === "lost" && partHeld ? t("series.left") : t(`series.${kind}`));
  const columnName = (kind: GainLossKind) => (kind === "lost" && partHeld ? t("checks.columns.left") : t(`checks.columns.${kind}`));
  const every = coverage?.moves ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ArrowUpDown className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <SiteSees screen="googleMoves" seen={moves.result?.seen} />

      {newest ? (
        <div className="flex flex-wrap items-center gap-3">
          {/* Plain words with their icon: nothing here is pressed, so no box. */}
          <span className="inline-flex items-center gap-2 text-[12px] text-secondary">
            <CalendarDays className="h-3.5 w-3.5 text-muted" aria-hidden />
            {newestIsStart ? t("newestStart", { day: formatShortDay(newest.day) }) : t("newest", { day: formatShortDay(newest.day) })}
          </span>
          <span className="text-[12px] text-muted">{covered(newest)}</span>
        </div>
      ) : null}
      {newest && partHeld && coverage?.searches.held !== null ? (
        <p className="text-[12px] leading-relaxed text-secondary">
          {t("amongHeld", { count: formatNumber(coverage?.searches.held ?? 0) })}
          {every ? ` ${t("everySearch", {
            fresh: formatNumber(every.fresh), up: formatNumber(every.up), down: formatNumber(every.down), lost: formatNumber(every.lost),
          })}` : null}
        </p>
      ) : null}

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${host}-new-and-lost-${range.from}-to-${range.to}`}
        csv={() => toCsv(
          ["day", t("checks.columns.day"), ...KINDS.map(seriesName), t("net")],
          steps.map((step) => [step.lastDay, stepDetail(step), ...KINDS.map((kind) => countOf(step, kind)), netOf(step)]),
        )}
        enoughData={steps.length > 0}
      >
        <SiteGainLossChart
          steps={chartSteps}
          series={KINDS.map((kind) => ({ key: kind, name: seriesName(kind), colour: COLOURS[kind] }))}
          netLabel={t("net")}
          startLegend={t("startLegend")}
        />
      </SiteChartCard>

      {newest && newestIsStart ? (
        <Notice>{startNote(newest)}</Notice>
      ) : newest ? (
        <>
          {/* The newest check's moves, one list at a time; the counts are the lists' own. */}
          <div role="tablist" aria-label={t("tabs")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {directions.map((entry) => {
              const kind = KIND_OF[entry];
              const on = direction === entry;
              return (
                <Button
                  key={entry}
                  variant="ghost"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setDirection(entry)}
                  className={`flex h-auto flex-col items-stretch rounded-2xl border px-4 pb-2 pt-3 text-left ${on ? "border-secondary/40 bg-hover" : "border-border-dim bg-card/40"}`}
                >
                  <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                    <span aria-hidden style={{ color: COLOURS[kind] }}>{ARROWS[kind]}</span>
                    {t(`tabNames.${entry}`)}
                  </span>
                  <span className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">{formatNumber(countOf(newest, kind))}</span>
                  <span aria-hidden className="mt-2 h-0.5 rounded-full" style={{ backgroundColor: on ? COLOURS[kind] : "transparent" }} />
                </Button>
              );
            })}
          </div>

          <DataTable
            rows={moves.pageRows}
            rowKey={(row) => row._id}
            onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
            cardHeader={<TableBar footer={moves.footer} noun="searches" title={`${ARROWS[chosen]} ${t(`tabNames.${direction}`)}`} />}
            empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: t("moves.empty") }}
            footer={moves.footer}
            sort={order.tableSort}
            columns={[
              { key: "keyword", header: t("moves.columns.keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.keyword}</RecordLinkCell> },
              {
                key: "fromTo",
                header: t("moves.columns.fromTo"),
                align: "right",
                sortable: true,
                cell: (row) => (
                  <span className="flex items-center justify-end gap-1.5 font-mono text-[12px]">
                    <span className="text-secondary">{row.previousPosition ?? "–"}</span>
                    <span className="text-muted">→</span>
                    <PositionCell position={row.position} />
                  </span>
                ),
              },
              { key: "change", header: t("moves.columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.change} /> },
              { key: "volume", header: t("moves.columns.volume"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.volume)}</span> },
              {
                key: "page",
                header: t("moves.columns.page"),
                className: CUT_COLUMN.second,
                cell: (row) => (row.page ? <PageLinkCell href={recordHref({ kind: "page", page: row.page })} page={row.page} was={row.previousPage} /> : <NoFigure />),
              },
            ]}
          />
        </>
      ) : null}

      <DataTable
        rows={checkPager.pageRows}
        rowKey={(row) => row.day}
        cardHeader={<TableBar
          footer={checkPager.footer}
          noun={range.step === "week" ? "weeks" : range.step === "month" ? "months" : "checks"}
          actions={(
            <ListDownload
              fileName={`${host}-new-and-lost`}
              rows={sortedSteps}
              columns={[
                { header: t("checks.columns.day"), value: (row) => row.lastDay },
                { header: t("checks.columns.covered"), value: (row) => stepDetail(row) },
                ...KINDS.map((kind) => ({ header: columnName(kind), value: (row: Step) => countOf(row, kind) })),
                { header: t("checks.columns.net"), value: (row) => netOf(row) },
              ]}
            />
          )}
        />}
        empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={checkPager.footer}
        sort={checkSort}
        columns={[
          {
            key: "day",
            header: t("checks.columns.day"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col">
                <CheckedCell day={row.lastDay} />
                <span className="text-[11px] text-muted">{stepDetail(row)}</span>
              </span>
            ),
          },
          ...KINDS.map((kind) => ({
            key: kind,
            header: columnName(kind),
            align: "right" as const,
            sortable: true,
            cell: (row: Step) => {
              const count = countOf(row, kind);
              return count === null
                ? <span className="font-mono text-[12px] text-muted" title={startNote(row)}>–</span>
                : <span className="font-mono text-[12px] text-foreground">{formatNumber(count)}</span>;
            },
          })),
          { key: "net", header: t("checks.columns.net"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{signed(netOf(row))}</span> },
        ]}
      />
    </div>
  );
}
