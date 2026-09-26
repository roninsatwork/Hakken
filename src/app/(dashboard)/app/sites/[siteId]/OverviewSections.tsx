"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { ChartTooltipRow, ChartTooltipSurface, type ChartTooltipEntry } from "@/src/ui/components/charts/ChartTooltip";
import {
  CHART_SERIES_BLUE,
  CHART_SERIES_ORANGE,
  CHART_SERIES_SLATE,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { RecordLinkCell } from "../_components/SiteCells";
import { HoverArea, useHoverReadout } from "../_components/HoverReadout";
import { SiteChartCard } from "../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart, SiteScatterChart, type SiteScatterGroup } from "../_components/SiteCharts";
import { formatNumber, toCsv } from "../_components/siteFormat";
import { useSiteListHref, useSiteRecordHref } from "../_components/siteRecordLinks";
import { useSite, useSiteId } from "../_components/useSite";
import { SiteViewSwitch } from "../_components/SiteViewSwitch";

type Point = FunctionReturnType<typeof api.siteCharts.siteSeries>[number]["points"][number];
type Extras = FunctionReturnType<typeof api.siteOverview.overviewExtras>;

/** A share as a percentage to one place, or "<0.1%" for a sliver that is not nothing. */
function percent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const share = (part / whole) * 100;
  return share > 0 && share < 0.1 ? "<0.1%" : `${share.toFixed(1)}%`;
}

/**
 * The Overview's sections under its charts (drawn and agreed 2026-09-25, each
 * on its own row "to allow more space to read the information"): pages by
 * kind and by the visits each brings, the searches by what they are for, and
 * every competitor set up for the site. Each from the newest check, so none
 * follows the dates chosen; each opens the records behind it.
 */
export function OverviewSections({ latest, extras }: { latest: Point | null; extras: Extras | undefined }) {
  return (
    <>
      <PagesByKind extras={extras} />
      <PagesByVisits extras={extras} />
      <BrandedSearches latest={latest} />
      <Competitors extras={extras} />
    </>
  );
}

/**
 * Every ranking page by its kind — article, product, location… — with its
 * share of the pages and of the visits. Deep bars, a row that answers the
 * pointer with its numbers, and opens the pages of that kind (Anthony,
 * 2026-09-25: the bars looked "weedy and thin", and "we need hover states").
 */
function PagesByKind({ extras }: { extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.pageKinds");
  const tr = useTranslations("sites.overview.readout");
  const tp = useTranslations("sites.common.pageTypes");
  const router = useRouter();
  const siteId = useSiteId();
  const site = useSite();
  const listHref = useSiteListHref(siteId);
  const [showPages, setShowPages] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const { hover, bind } = useHoverReadout<string>();
  const pages = extras?.pages;
  const kinds = pages?.kinds ?? [];
  const pagesShare = (row: (typeof kinds)[number]) => (row.pages / Math.max(1, pages?.total ?? 1)) * 100;
  const visitsShare = (row: (typeof kinds)[number]) => (row.visits / Math.max(1, pages?.visits ?? 1)) * 100;
  // The bars share one scale: the largest share on show fills the track.
  const top = Math.max(1, ...kinds.flatMap((row) => [showPages ? pagesShare(row) : 0, showVisits ? visitsShare(row) : 0]));

  return (
    <SiteChartCard
      dated={false}
      title={t("title")}
      hint={pages ? t("hint", { count: formatNumber(pages.total) }) : undefined}
      exportName={`${site?.host ?? "site"}-pages-by-kind`}
      csv={() => toCsv(
        [t("kind"), t("pages"), t("pagesShare"), t("visits"), t("visitsShare")],
        kinds.map((row) => [tp(row.pageType), row.pages, percent(row.pages, pages?.total ?? 0), Math.round(row.visits), percent(row.visits, pages?.visits ?? 0)]),
      )}
      enoughData={kinds.length > 0}
      controls={
        <div className="flex flex-wrap gap-4">
          <Checkbox label={t("pages")} checked={showPages} onChange={setShowPages} />
          <Checkbox label={t("visits")} checked={showVisits} onChange={setShowVisits} />
        </div>
      }
    >
      <HoverArea
        hover={hover}
        className="flex flex-col gap-1"
        readout={(key) => {
          const row = kinds.find((entry) => entry.pageType === key);
          if (!row) return null;
          return (
            <ChartTooltipSurface heading={tp(row.pageType)}>
              <ChartTooltipRow colour={CHART_SERIES_BLUE} value={formatNumber(row.pages)} label={tr("pages", { count: row.pages, share: percent(row.pages, pages?.total ?? 0) })} />
              <ChartTooltipRow colour={CHART_SERIES_ORANGE} value={formatNumber(Math.round(row.visits))} label={tr("visits", { share: percent(row.visits, pages?.visits ?? 0) })} />
            </ChartTooltipSurface>
          );
        }}
      >
        {kinds.map((row) => {
          const href = listHref("keywords/pages", { type: row.pageType });
          return (
            <div
              key={row.pageType}
              {...bind(row.pageType)}
              onClick={() => router.push(href)}
              className="grid cursor-pointer grid-cols-1 items-center gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-hover md:grid-cols-[150px_minmax(0,1fr)_minmax(220px,auto)] md:gap-4"
            >
              <RecordLinkCell href={href}>{tp(row.pageType)}</RecordLinkCell>
              <div className="flex flex-col gap-1" aria-hidden="true">
                {showPages ? <span className="block h-3.5 rounded-[3px]" style={{ width: `${Math.max(0.5, (pagesShare(row) / top) * 100)}%`, background: CHART_SERIES_BLUE }} /> : null}
                {showVisits ? <span className="block h-3.5 rounded-[3px]" style={{ width: `${Math.max(0.5, (visitsShare(row) / top) * 100)}%`, background: CHART_SERIES_ORANGE }} /> : null}
              </div>
              <span className="text-[12px] tabular-nums text-secondary">
                {t("row", {
                  count: row.pages,
                  pagesShare: percent(row.pages, pages?.total ?? 0),
                  visitsShare: percent(row.visits, pages?.visits ?? 0),
                })}
              </span>
            </div>
          );
        })}
        {pages?.capped ? <p className="px-2 text-[12px] text-muted">{t("capped", { count: formatNumber(pages.total) })}</p> : null}
      </HoverArea>
    </SiteChartCard>
  );
}

const VISIT_BANDS = ["none", "to100", "to1000", "to10000", "over10000"] as const;

/** Pages grouped by the visits a month each brings, with each group's share of all the visits — or the counts themselves. */
function PagesByVisits({ extras }: { extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.pageVisits");
  const tr = useTranslations("sites.overview.readout");
  const site = useSite();
  const [mode, setMode] = useState<"percentage" | "number">("percentage");
  const [showPages, setShowPages] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const pages = extras?.pages;
  const bands = VISIT_BANDS.map((band) => pages?.visitBands.find((row) => row.band === band) ?? { band, pages: 0, visits: 0 });
  const value = (part: number, whole: number) => (mode === "percentage" ? (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0) : Math.round(part));
  const rows = bands.map((row) => ({
    label: t(`bands.${row.band}`),
    pages: value(row.pages, pages?.total ?? 0),
    visits: value(row.visits, pages?.visits ?? 0),
    // What the hover reads out, whichever way the bars are drawn: the count, then its share.
    pagesCount: row.pages,
    visitsCount: Math.round(row.visits),
    pagesPercent: percent(row.pages, pages?.total ?? 0),
    visitsPercent: percent(row.visits, pages?.visits ?? 0),
  }));
  const readValue = (_: number, entry: ChartTooltipEntry) => formatNumber(Number(entry.payload?.[`${entry.dataKey}Count`] ?? 0));
  const readLabel = (entry: ChartTooltipEntry) => {
    const share = String(entry.payload?.[`${entry.dataKey}Percent`] ?? "");
    return entry.dataKey === "pages"
      ? tr("pages", { count: Number(entry.payload?.pagesCount ?? 0), share })
      : tr("visits", { share });
  };
  const series = [
    ...(showPages ? [{ key: "pages", name: mode === "percentage" ? t("pagesShare") : t("pages"), colour: CHART_SERIES_BLUE }] : []),
    ...(showVisits ? [{ key: "visits", name: mode === "percentage" ? t("visitsShare") : t("visits"), colour: CHART_SERIES_ORANGE }] : []),
  ];

  return (
    <SiteChartCard
      dated={false}
      title={t("title")}
      hint={t("hint")}
      exportName={`${site?.host ?? "site"}-pages-by-visits`}
      csv={() => toCsv(
        [t("group"), t("pages"), t("pagesShare"), t("visits"), t("visitsShare")],
        bands.map((row) => [t(`bands.${row.band}`), row.pages, percent(row.pages, pages?.total ?? 0), Math.round(row.visits), percent(row.visits, pages?.visits ?? 0)]),
      )}
      enoughData={(pages?.total ?? 0) > 0 && series.length > 0}
      controls={
        <div className="flex flex-wrap items-center gap-4">
          <SiteViewSwitch
            label={t("title")}
            options={(["percentage", "number"] as const).map((entry) => ({ value: entry, label: t(entry) }))}
            value={mode}
            onChange={setMode}
          />
          <Checkbox label={t("pages")} checked={showPages} onChange={setShowPages} />
          <Checkbox label={t("visits")} checked={showVisits} onChange={setShowVisits} />
        </div>
      }
    >
      <SiteBarChart data={rows} series={series} height={300} formatValue={readValue} seriesLabel={readLabel} />
    </SiteChartCard>
  );
}

const GROUPS = [
  { key: "branded", intent: "BRANDED", colour: CHART_SERIES_ORANGE },
  { key: "buying", intent: "BUYING", colour: CHART_SERIES_BLUE },
  { key: "researching", intent: "RESEARCHING", colour: CHART_SERIES_VIOLET },
  { key: "other", intent: null, colour: CHART_SERIES_SLATE },
] as const;

/** The visits by what the searches bringing them are for: naming the brand, ready to buy, researching, the rest. */
function BrandedSearches({ latest }: { latest: Point | null }) {
  const t = useTranslations("sites.overview.branded");
  const tr = useTranslations("sites.overview.readout");
  const { hover, bind } = useHoverReadout<(typeof GROUPS)[number]["key"]>();
  const siteId = useSiteId();
  const site = useSite();
  const listHref = useSiteListHref(siteId);
  const split = latest?.intentSplit ?? null;
  const total = split ? GROUPS.reduce((sum, group) => sum + split[group.key].visits, 0) : 0;

  return (
    <SiteChartCard
      dated={false}
      title={t("title")}
      hint={split ? t("hint", { visits: formatNumber(total) }) : undefined}
      exportName={`${site?.host ?? "site"}-branded-and-other-searches`}
      csv={() => toCsv(
        [t("group"), t("searches"), t("visits"), t("share")],
        split ? GROUPS.map((group) => [t(`groups.${group.key}`), split[group.key].searches, Math.round(split[group.key].visits), percent(split[group.key].visits, total)]) : [],
      )}
      enoughData={split !== null && total > 0}
    >
      {split ? (
        <div className="flex flex-col gap-5">
          <HoverArea
            hover={hover}
            readout={(key) => {
              const group = GROUPS.find((entry) => entry.key === key);
              if (!group) return null;
              return (
                <ChartTooltipSurface heading={t(`groups.${group.key}`)}>
                  <ChartTooltipRow colour={group.colour} value={formatNumber(Math.round(split[group.key].visits))} label={tr("visits", { share: percent(split[group.key].visits, total) })} />
                  <ChartTooltipRow colour={group.colour} value={formatNumber(split[group.key].searches)} label={tr("searches", { count: split[group.key].searches })} />
                </ChartTooltipSurface>
              );
            }}
          >
            <div className="flex h-7 gap-0.5 overflow-hidden rounded-lg" aria-hidden="true">
              {GROUPS.map((group) => (
                <span
                  key={group.key}
                  {...bind(group.key)}
                  className={`block h-full transition-opacity ${hover && hover.key !== group.key ? "opacity-40" : ""}`}
                  style={{ width: `${(split[group.key].visits / total) * 100}%`, background: group.colour }}
                />
              ))}
            </div>
          </HoverArea>
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-[12px] text-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ background: group.colour }} aria-hidden="true" />
                  {group.intent
                    ? <RecordLinkCell href={listHref("keywords", { intent: group.intent })} className="text-[12px] text-secondary">{t(`groups.${group.key}`)}</RecordLinkCell>
                    : t(`groups.${group.key}`)}
                </span>
                <span className="text-[22px] font-semibold tabular-nums text-foreground">{percent(split[group.key].visits, total)}</span>
                <span className="text-[12px] text-secondary">
                  {t("row", { visits: formatNumber(split[group.key].visits), searches: formatNumber(split[group.key].searches) })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SiteChartCard>
  );
}

/**
 * Every competitor set up for the site, all of them (Anthony, 2026-09-25:
 * "why all the competitors korda tackle has are not listed here"): where each
 * sits beside it, then the list. The competitors only found ranking for the
 * same searches are one click on, in Organic competitors.
 *
 * Two views of the same competitors (Anthony, 2026-09-26: "a toggler to show
 * traffic too … with the component changing including the text to match the
 * intent"). **Searches**: how many searches each ranks for and shares with the
 * site, most shared first. **Traffic**: the visits each gets from the searches
 * both rank for — the traffic it is taking from the site's searches — most
 * first. The chart, the words, the columns and the download all follow the
 * view; it opens on Searches.
 */
type CompetitorView = "searches" | "traffic";

function Competitors({ extras }: { extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.competitors");
  const siteId = useSiteId();
  const site = useSite();
  const listHref = useSiteListHref(siteId);
  const recordHref = useSiteRecordHref(siteId);
  const [view, setView] = useState<CompetitorView>("searches");
  const traffic = view === "traffic";
  const competitors = extras?.competitors;
  const bySearches = competitors?.rivals ?? [];
  // Most visits on shared searches first; those not known after, biggest first.
  const rivals = traffic
    ? [...bySearches].sort((left, right) =>
      (right.sharedVisits ?? -1) - (left.sharedVisits ?? -1) || (right.visits ?? -1) - (left.visits ?? -1))
    : bySearches;
  const yourKeywords = competitors?.you.keywords ?? 0;
  const yourVisits = competitors?.you.visits ?? 0;
  const you = t("you", { host: site?.host ?? "" });
  // Traffic: across, the visits from searches both rank for — all of the
  // site's own; up, the visits in all. A competitor whose visits on the shared
  // searches are not known has no place across, and is left off the chart.
  const groups: SiteScatterGroup[] = [
    {
      key: "you",
      name: you,
      colour: SITE_SERIES_COLOURS[0],
      labelled: true,
      points: [traffic
        ? { x: yourVisits, y: yourVisits, label: you }
        : { x: yourKeywords, y: yourVisits, label: you }],
    },
    {
      key: "rivals",
      name: t("title"),
      colour: CHART_SERIES_BLUE,
      labelled: true,
      points: rivals.map((row) => (traffic
        ? { x: row.sharedVisits ?? 0, y: row.visits ?? 0, label: row.host }
        : { x: row.keywords ?? 0, y: row.visits ?? 0, label: row.host })),
    },
  ];
  const share = (part: number | null, whole: number) => (part === null ? "–" : percent(part, whole));
  const overlap = (row: (typeof rivals)[number]) => (traffic
    ? (row.sharedVisits === null ? null : row.sharedVisits / Math.max(1, yourVisits))
    : (row.shared === null ? null : row.shared / Math.max(1, yourKeywords)));
  const visits = (value: number | null) => (value === null ? null : Math.round(value));
  const numberCell = (value: number | null, strong = false) => (
    <span className={`font-mono text-[12px] ${strong ? "text-foreground" : "text-secondary"}`}>{formatNumber(value)}</span>
  );

  return (
    <SiteChartCard
      dated={false}
      title={t("title")}
      hint={t(traffic ? "hintTraffic" : "hint", { count: rivals.length, host: site?.host ?? "" })}
      controls={(
        <SiteViewSwitch
          label={t("view")}
          options={(["searches", "traffic"] as const).map((entry) => ({ value: entry, label: t(`views.${entry}`) }))}
          value={view}
          onChange={setView}
        />
      )}
      exportName={`${site?.host ?? "site"}-competitors-${view}`}
      csv={() => (traffic
        ? toCsv(
          [t("columns.website"), t("columns.sharedVisits"), t("columns.ofYourVisits"), t("columns.theirVisits"), t("columns.theirSearches")],
          rivals.map((row) => [row.host, visits(row.sharedVisits), row.sharedVisits === null ? null : share(row.sharedVisits, yourVisits), visits(row.visits), row.keywords]),
        )
        : toCsv(
          [t("columns.website"), t("columns.shared"), t("columns.ofYours"), t("columns.theirSearches"), t("columns.theirVisits")],
          rivals.map((row) => [row.host, row.shared, row.shared === null ? null : share(row.shared, yourKeywords), row.keywords, visits(row.visits)]),
        ))}
      enoughData={rivals.length > 0}
    >
      <div className="flex flex-col gap-5">
        <SiteScatterChart groups={groups} xLabel={t(traffic ? "xAxisTraffic" : "xAxis")} yLabel={t("yAxis")} height={360} />
        <CompactList
          rows={rivals}
          rowKey={(row) => row.siteId}
          empty="–"
          columns={[
            {
              key: "website",
              header: t("columns.website"),
              className: "whitespace-nowrap",
              cell: (row) => <RecordLinkCell href={recordHref({ kind: "rival", rivalId: row.siteId })}>{row.host}</RecordLinkCell>,
            },
            {
              key: "overlap",
              header: t("columns.overlap"),
              cell: (row) => {
                const part = overlap(row);
                return (
                  <span className="flex h-1.5 w-40 overflow-hidden rounded-full bg-hover" aria-hidden="true">
                    {part !== null ? <span className="block h-full" style={{ width: `${Math.min(100, part * 100)}%`, background: CHART_SERIES_BLUE }} /> : null}
                  </span>
                );
              },
            },
            ...(traffic
              ? [
                { key: "sharedVisits", header: t("columns.sharedVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.sharedVisits, true) },
                { key: "ofYourVisits", header: t("columns.ofYourVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => <span className="font-mono text-[12px] text-secondary">{share(row.sharedVisits, yourVisits)}</span> },
                { key: "theirVisits", header: t("columns.theirVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.visits) },
                { key: "theirSearches", header: t("columns.theirSearches"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.keywords) },
              ]
              : [
                { key: "shared", header: t("columns.shared"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.shared, true) },
                { key: "ofYours", header: t("columns.ofYours"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => <span className="font-mono text-[12px] text-secondary">{share(row.shared, yourKeywords)}</span> },
                { key: "theirSearches", header: t("columns.theirSearches"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.keywords) },
                { key: "theirVisits", header: t("columns.theirVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.visits) },
              ]),
          ]}
        />
        {traffic
          ? (rivals.some((row) => row.sharedVisits === null) ? <p className="text-[12px] text-muted">{t("sharedVisitsUnknown")}</p> : null)
          : (rivals.some((row) => row.shared === null) ? <p className="text-[12px] text-muted">{t("sharedUnknown")}</p> : null)}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="text-secondary">{t("found", { count: formatNumber(competitors?.found ?? 0) })}</span>
          <RecordLinkCell href={listHref("competitors/organic", { kind: "COMPETITOR" })} className="text-[12px] text-info">{t("seeAll")} →</RecordLinkCell>
        </div>
      </div>
    </SiteChartCard>
  );
}
