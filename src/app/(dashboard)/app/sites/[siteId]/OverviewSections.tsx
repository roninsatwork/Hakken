"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Figure } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { ChartTooltipRow, ChartTooltipSurface, type ChartTooltipEntry } from "@/src/ui/components/charts/ChartTooltip";
import {
  CHART_SERIES_BLUE,
  CHART_SERIES_ORANGE,
  CHART_SERIES_SLATE,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { KindBars } from "../../_components/KindBars";
import { usePageKinds } from "../../_components/usePageKinds";
import { RecordLinkCell } from "../_components/SiteCells";
import { HoverArea, useHoverReadout } from "../_components/HoverReadout";
import { SiteChartCard } from "../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart, SiteScatterChart, type SiteScatterGroup } from "../_components/SiteCharts";
import { formatNumber, toCsv } from "../_components/siteFormat";
import { useSiteListHref, useSiteRecordHref } from "../_components/siteRecordLinks";
import { useSite, useSiteId } from "../_components/useSite";
import { SiteViewSwitch } from "../_components/SiteViewSwitch";
import { isPartHeld } from "../_components/SiteCoverage";

type Point = FunctionReturnType<typeof api.siteCharts.siteSeries>[number]["points"][number];
type Extras = FunctionReturnType<typeof api.siteOverview.overviewExtras>;

/**
 * The visits a panel's shares are of: the whole site's, as estimated across
 * everything it ranks for, when the list holds only part of it — the rest
 * then named, outside the searches held (sites-data-completeness-plan.md,
 * §4.D4) — else the visits held.
 */
function useVisitsOf(held: number): { of: number; outside: number | null } {
  const coverage = useSite()?.coverage;
  const whole = isPartHeld(coverage) && coverage?.visits.total ? Math.max(coverage.visits.total, held) : null;
  // The visits held can pass the site's own estimate, worked out apart: then nothing is left outside.
  return { of: whole ?? held, outside: whole !== null && whole > held ? whole - held : null };
}

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
 *
 * Once the website has classifications of the company's own, it is Pages by
 * classification: one bar per classification and one for Not sorted, in the
 * same colours, bars and hover (page-groups-plan.md, decision 2).
 */
function PagesByKind({ extras }: { extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.pageKinds");
  const to = useTranslations("sites.overview");
  const tr = useTranslations("sites.overview.readout");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const listHref = useSiteListHref(siteId);
  const pageKinds = usePageKinds(siteId);
  const [showPages, setShowPages] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const pages = extras?.pages;
  const classified = Boolean(pages?.classified);
  // Each row's kind: a page type, or — once the website has classifications — a classification's id or Not sorted.
  const kinds = pages?.classified ?? (pages?.kinds ?? []).map((row) => ({ kind: row.pageType as string, pages: row.pages, visits: row.visits }));
  const visitsOf = useVisitsOf(pages?.visits ?? 0);
  const partHeld = isPartHeld(site?.coverage);

  return (
    <SiteChartCard
      dated={false}
      title={t(classified ? "titleClassified" : "title")}
      hint={pages ? t(classified ? (partHeld ? "hintHeldClassified" : "hintClassified") : (partHeld ? "hintHeld" : "hint"), { count: formatNumber(pages.total) }) : undefined}
      exportName={`${site?.host ?? "site"}-pages-by-${classified ? "classification" : "kind"}`}
      csv={() => toCsv(
        [classified ? tc("classification") : t("kind"), t("pages"), t("pagesShare"), t("visits"), t("visitsShare")],
        kinds.map((row) => [pageKinds.label(row.kind), row.pages, percent(row.pages, pages?.total ?? 0), Math.round(row.visits), percent(row.visits, visitsOf.of)]),
      )}
      enoughData={kinds.length > 0}
      controls={
        <div className="flex flex-wrap gap-4">
          <Checkbox label={t("pages")} checked={showPages} onChange={setShowPages} />
          <Checkbox label={t("visits")} checked={showVisits} onChange={setShowVisits} />
        </div>
      }
    >
      <KindBars
        colours={[CHART_SERIES_BLUE, CHART_SERIES_ORANGE]}
        shown={[showPages, showVisits]}
        rows={kinds.map((row) => ({
          key: row.kind,
          label: pageKinds.label(row.kind),
          href: listHref("keywords/pages", { type: row.kind }),
          shares: [row.pages / Math.max(1, pages?.total ?? 1), row.visits / Math.max(1, visitsOf.of)],
          line: t("row", {
            count: row.pages,
            pagesShare: percent(row.pages, pages?.total ?? 0),
            visitsShare: percent(row.visits, visitsOf.of),
          }),
          readout: [
            { value: formatNumber(row.pages), label: tr("pages", { count: row.pages, share: percent(row.pages, pages?.total ?? 0) }) },
            { value: formatNumber(Math.round(row.visits)), label: tr("visits", { share: percent(row.visits, visitsOf.of) }) },
          ],
        }))}
      >
        {pages?.capped ? <p className="px-2 text-[12px] text-muted">{t("capped", { count: formatNumber(pages.total) })}</p> : null}
        {visitsOf.outside !== null ? <p className="px-2 text-[12px] text-muted">{to("outsideHeld", { share: percent(visitsOf.outside, visitsOf.of) })}</p> : null}
      </KindBars>
    </SiteChartCard>
  );
}

const VISIT_BANDS = ["none", "to100", "to1000", "to10000", "over10000"] as const;

/** Pages grouped by the visits a month each brings, with each group's share of all the visits — or the counts themselves. */
function PagesByVisits({ extras }: { extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.pageVisits");
  const to = useTranslations("sites.overview");
  const tr = useTranslations("sites.overview.readout");
  const site = useSite();
  const [mode, setMode] = useState<"percentage" | "number">("percentage");
  const [showPages, setShowPages] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const pages = extras?.pages;
  const visitsOf = useVisitsOf(pages?.visits ?? 0);
  const bands = VISIT_BANDS.map((band) => pages?.visitBands.find((row) => row.band === band) ?? { band, pages: 0, visits: 0 });
  const value = (part: number, whole: number) => (mode === "percentage" ? (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0) : Math.round(part));
  const rows = bands.map((row) => ({
    label: t(`bands.${row.band}`),
    pages: value(row.pages, pages?.total ?? 0),
    visits: value(row.visits, visitsOf.of),
    // What the hover reads out, whichever way the bars are drawn: the count, then its share.
    pagesCount: row.pages,
    visitsCount: Math.round(row.visits),
    pagesPercent: percent(row.pages, pages?.total ?? 0),
    visitsPercent: percent(row.visits, visitsOf.of),
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
      hint={t(isPartHeld(site?.coverage) ? "hintHeld" : "hint")}
      exportName={`${site?.host ?? "site"}-pages-by-visits`}
      csv={() => toCsv(
        [t("group"), t("pages"), t("pagesShare"), t("visits"), t("visitsShare")],
        bands.map((row) => [t(`bands.${row.band}`), row.pages, percent(row.pages, pages?.total ?? 0), Math.round(row.visits), percent(row.visits, visitsOf.of)]),
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
      {visitsOf.outside !== null ? <p className="mt-2 text-[12px] text-muted">{to("outsideHeld", { share: percent(visitsOf.outside, visitsOf.of) })}</p> : null}
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
  const to = useTranslations("sites.overview");
  const split = latest?.intentSplit ?? null;
  const held = split ? GROUPS.reduce((sum, group) => sum + split[group.key].visits, 0) : 0;
  // Of the whole site's visits, the rest named, for a list held in part (§4.D4).
  const { of: total, outside } = useVisitsOf(held);

  return (
    <SiteChartCard
      dated={false}
      title={t("title")}
      hint={split ? t(outside !== null ? "hintHeld" : "hint", { visits: formatNumber(total) }) : undefined}
      exportName={`${site?.host ?? "site"}-branded-and-other-searches`}
      csv={() => toCsv(
        [t("group"), t("searches"), t("visits"), t("share")],
        split
          ? [
            ...GROUPS.map((group) => [t(`groups.${group.key}`), split[group.key].searches, Math.round(split[group.key].visits), percent(split[group.key].visits, total)]),
            ...(outside !== null ? [[to("outsideGroup"), null, Math.round(outside), percent(outside, total)]] : []),
          ]
          : [],
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
              {outside !== null ? <span className="block h-full bg-hover" style={{ width: `${(outside / total) * 100}%` }} /> : null}
            </div>
          </HoverArea>
          <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            {GROUPS.map((group) => (
              // The kit's figure, inside the card; the dot beside the share is the bar's key above.
              <Figure
                key={group.key}
                framed={false}
                label={t(`groups.${group.key}`)}
                href={group.intent ? listHref("keywords", { intent: group.intent }) : undefined}
                value={(
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: group.colour }} aria-hidden="true" />
                    {percent(split[group.key].visits, total)}
                  </span>
                )}
                detail={(
                  <span className="text-secondary">
                    {t("row", { visits: formatNumber(split[group.key].visits), searches: formatNumber(split[group.key].searches) })}
                  </span>
                )}
              />
            ))}
          </div>
          {outside !== null ? <p className="text-[12px] text-muted">{to("outsideHeld", { share: percent(outside, total) })}</p> : null}
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
  // Traffic: the most visits in all first, as a market's leaders are read.
  const rivals = traffic
    ? [...bySearches].sort((left, right) => (right.visits ?? -1) - (left.visits ?? -1) || (right.keywords ?? -1) - (left.keywords ?? -1))
    : bySearches;
  const yourKeywords = competitors?.you.keywords ?? 0;
  const yourVisits = competitors?.you.visits ?? 0;
  const you = t("you", { host: site?.host ?? "" });
  // Every site at its totals, the site among them, whichever the view: across,
  // every search it ranks for; up, its visits a month (Anthony, 2026-09-27:
  // "it should be total traffic vs total keywords"). The Traffic view once
  // drew, across, the site's own visits from the searches each competitor
  // shares — no competitor's total — and read as the site ahead of
  // chilliapple.co.uk, which gets more.
  const groups: SiteScatterGroup[] = [
    {
      key: "you",
      name: you,
      colour: SITE_SERIES_COLOURS[0],
      labelled: true,
      points: [{ x: yourKeywords, y: Math.round(yourVisits), label: you }],
    },
    {
      key: "rivals",
      name: t("title"),
      colour: CHART_SERIES_BLUE,
      labelled: true,
      // Whole visits, as the table shows them: the supplier's estimates carry
      // decimals, and "126.513" reads as thousands in Italian.
      points: rivals.map((row) => ({ x: row.keywords ?? 0, y: Math.round(row.visits ?? 0), label: row.host })),
    },
  ];
  const share = (part: number | null, whole: number) => (part === null ? "–" : percent(part, whole));
  // Traffic: how much of the site's own visits come from searches the competitor ranks for too.
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
      hint={t(traffic ? "hintTraffic" : "hint", { count: rivals.length, host: site?.host ?? "", place: site?.placeLabel ?? "" })}
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
          [t("columns.website"), t("columns.theirVisits"), t("columns.theirSearches"), t("columns.sharedVisits"), t("columns.ofYourVisits")],
          rivals.map((row) => [row.host, visits(row.visits), row.keywords, visits(row.sharedVisits), row.sharedVisits === null ? null : share(row.sharedVisits, yourVisits)]),
        )
        : toCsv(
          [t("columns.website"), t("columns.shared"), t("columns.ofYours"), t("columns.theirSearches"), t("columns.theirVisits")],
          rivals.map((row) => [row.host, row.shared, row.shared === null ? null : share(row.shared, yourKeywords), row.keywords, visits(row.visits)]),
        ))}
      enoughData={rivals.length > 0}
    >
      <div className="flex flex-col gap-5">
        <SiteScatterChart
          groups={groups}
          xLabel={t("xAxis")}
          yLabel={t("yAxis")}
          readout={{ x: t("readout.searches"), y: t("readout.visits") }}
          height={360}
        />
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
              // Up to the kit's 160px, narrower when the table needs the room (design-drift-plan D4).
              cell: (row) => <Meter value={overlap(row)} colour={CHART_SERIES_BLUE} className="w-full max-w-40" />,
            },
            ...(traffic
              ? [
                { key: "theirVisits", header: t("columns.theirVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.visits, true) },
                { key: "theirSearches", header: t("columns.theirSearches"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.keywords) },
                { key: "sharedVisits", header: t("columns.sharedVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => numberCell(row.sharedVisits) },
                { key: "ofYourVisits", header: t("columns.ofYourVisits"), align: "right" as const, className: "whitespace-nowrap", cell: (row: (typeof rivals)[number]) => <span className="font-mono text-[12px] text-secondary">{share(row.sharedVisits, yourVisits)}</span> },
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
          <span className="text-secondary">
            {competitors && competitors.readOf !== null && competitors.readOf > competitors.read
              ? t("foundOf", { count: formatNumber(competitors.found), read: formatNumber(competitors.read), total: formatNumber(competitors.readOf) })
              : t("found", { count: formatNumber(competitors?.found ?? 0) })}
          </span>
          <RecordLinkCell href={listHref("competitors/organic", { kind: "COMPETITOR" })} className="text-[12px] text-info">{t("seeAll")} →</RecordLinkCell>
        </div>
      </div>
    </SiteChartCard>
  );
}
