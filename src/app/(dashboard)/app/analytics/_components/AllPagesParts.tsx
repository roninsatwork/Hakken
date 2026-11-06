"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { MOST_PLOTTED } from "@/convex/utils/pageMoves";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { SHOP_PAGES_KIND } from "@/convex/utils/shopPages";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_SLATE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import type { ExplorerControl } from "@/src/ui/components/screens/ChartExplorer";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { PageMap, arrowMove, type PageMapBox } from "@/src/ui/components/screens/PageMap";
import { Select } from "@/src/ui/components/screens/Select";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { usePageKinds } from "../../_components/usePageKinds";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import type { ListPageAnswer } from "./AnalyticsListScreen";
import { BeforeLine } from "./AnalyticsFigures";
import { formatPerVisit, pathOf } from "./analyticsFormat";
import { useIsShop } from "./useIsShop";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, useStep } from "./useAnalytics";
import { useWebsiteForEye } from "./useEyeFigures";
import { spansOfList, useSpanInWords, useSpanWords } from "./VisitsCharts";

/**
 * All pages' own parts (docs/plans/active/all-pages-way-6-plan-2026-11-04.md; board "Way 6"): its Classification menu, its
 * four boxes, its map of pages and its Views each day. The map itself and the chart with menus are the kit's (`PageMap`,
 * `ChartExplorer`); what's here is what they show on this page.
 */

/** The Classification menu's two choices that aren't a classification. The page opens with the shop's own pages left out. */
const LEFT_OUT = "leftOut";
const EVERY = "every";

export type ClassificationChoice = {
  value: string;
  set: (next: string) => void;
  /** The menu's choices, as they read. Each classification with views in these dates, most first. */
  options: ReadonlyArray<{ value: string; label: string }>;
  /** What the lists ask for. */
  group: string | undefined;
  leaveOut: boolean;
  /** Each classification's views now and before, for the eye. */
  kinds: ReadonlyArray<{ name: string; views: number; viewsBefore: number; pages: number; shop: boolean; sorted: boolean }> | undefined;
};

/**
 * One choice, read and set from two menus: the map's and the table's. The boxes, map, table, filters and download follow
 * it. A website with no search, basket or account pages never says "All but search and basket".
 */
export function useClassificationChoice(): ClassificationChoice {
  const t = useTranslations("googleAnalytics.allPages.classification");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  // A website that doesn't sell has no basket to speak of: it says search and account pages.
  const shopWord = useIsShop() ? "shop" : "shopService";
  const leftOutWord = shopWord === "shop" ? "leftOut" : "leftOutService";
  const pageKinds = usePageKinds(useAnalyticsSiteId());
  const answer = useQuery(api.googleAnalyticsPageKindViews.analyticsPageKindViews, status?.connection?.newestDay ? { ...args, against: true } : "skip");
  const [raw, set] = useSiteParam<string>("classification", LEFT_OUT);
  const nameOf = useMemo(() => (kind: { kind: string; name: string | null }) => (
    kind.kind === SHOP_PAGES_KIND ? t(shopWord) : kind.kind === NOT_SORTED_KIND ? t("notSorted") : kind.name ?? kind.kind
  ), [t, shopWord]);
  const found = answer?.kinds;
  const hasShop = found?.some((kind) => kind.kind === SHOP_PAGES_KIND) ?? true;
  const special = raw === LEFT_OUT || raw === EVERY;
  const named = (found ?? []).map((kind) => ({ value: kind.kind, label: nameOf(kind) }));
  // A classification with no views in these dates, or one from a saved link, still says what it is.
  const missing = !special && !named.some((option) => option.value === raw) ? [{ value: raw, label: raw === SHOP_PAGES_KIND ? t(shopWord) : raw === NOT_SORTED_KIND ? t("notSorted") : pageKinds.label(raw) }] : [];
  const kinds = useMemo(() => found?.map((kind) => ({
    name: nameOf(kind), views: kind.views, viewsBefore: kind.viewsBefore ?? 0, pages: kind.pages, shop: kind.kind === SHOP_PAGES_KIND, sorted: kind.kind !== NOT_SORTED_KIND,
  })), [found, nameOf]);
  return {
    value: raw === LEFT_OUT && !hasShop ? EVERY : raw,
    set: (next) => set(next === EVERY && !hasShop ? LEFT_OUT : next),
    options: [...(hasShop ? [{ value: LEFT_OUT, label: t(leftOutWord) }] : []), { value: EVERY, label: t("every") }, ...named, ...missing],
    group: special ? undefined : raw,
    leaveOut: raw === LEFT_OUT,
    kinds,
  };
}

/** The menu on the table's search row, the same choices as the map's. */
export function ClassificationSelect({ choice }: { choice: ClassificationChoice }) {
  const t = useTranslations("googleAnalytics.allPages.classification");
  return (
    <Select
      aria-label={t("label")}
      value={choice.value}
      onChange={choice.set}
      chip={{ label: t("label"), choice: choice.options.find((option) => option.value === choice.value)?.label ?? null, changed: false }}
    >
      {choice.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </Select>
  );
}

/**
 * Four boxes. Page views and pages a visit are the whole website's, so they match Overview and Visits; with one
 * classification chosen, page views are that classification's. Busy and quiet follow the menu, so they match the table.
 */
export function AllPagesBoxes({ answer, choice }: { answer: ListPageAnswer | undefined; choice: ClassificationChoice }) {
  const t = useTranslations("googleAnalytics.allPages.boxes");
  const website = useWebsiteForEye();
  const dates = spansOfList(answer);
  const spans = useSpanWords(...dates);
  const inWords = useSpanInWords(...dates);
  if (!website) return null;
  const pagesAVisit = website.visits > 0 ? website.views / website.visits : null;
  const pagesAVisitBefore = website.visitsBefore && website.viewsBefore !== null ? website.viewsBefore / website.visitsBefore : null;
  const one = choice.group !== undefined ? answer?.groupTotals : null;
  const views = one ? one.views : website.views;
  const viewsBefore = one ? one.viewsBefore : website.viewsBefore;
  const bands = answer?.bands ?? null;
  const beforeWords = pagesAVisitBefore !== null ? t("pagesAVisitBefore", { figure: formatPerVisit(pagesAVisitBefore), before: inWords.before }) : "";
  return (
    <FigureRow columns={4}>
      <Figure label={t("pageViews")} value={formatNumber(views)} detail={<BeforeLine now={views} before={viewsBefore} named={spans.before} />} />
      <Figure
        label={t("pagesAVisit")}
        value={formatPerVisit(pagesAVisit)}
        detail={<span className="text-secondary">{one ? t("wholeWebsite", { words: beforeWords }) : beforeWords}</span>}
      />
      <Figure
        label={t("busyFewer")}
        value={bands ? formatNumber(bands.busyFewer) : "–"}
        detail={bands ? <span className="text-secondary">{t("busyOutOf", { count: formatNumber(bands.busy), visits: formatNumber(bands.busyVisits) })}</span> : undefined}
      />
      <Figure
        label={t("quietMore")}
        value={bands ? formatNumber(bands.quietMore) : "–"}
        detail={bands ? <span className="text-secondary">{t("quietOutOf", { count: formatNumber(bands.quiet), visits: formatNumber(bands.busyVisits) })}</span> : undefined}
      />
    </FigureRow>
  );
}

type Count = "views" | "visits";
type Measure = Count | "conversions";
const COUNTS: readonly Count[] = ["views", "visits"];
const MEASURES: readonly Measure[] = ["views", "visits", "conversions"];
const FOLLOWS_COUNT = "follow";
const COLOURS: ReadonlyArray<Measure | typeof FOLLOWS_COUNT> = [FOLLOWS_COUNT, ...MEASURES];

/** Forty pages: the busiest by what Count says. The table has the rest. */
export const MAP_PAGES = 40;

type ListRowShown = ListPageAnswer["rows"][number];

/** A page as the map and the lines name it: "Home page", its title, or its address. */
function usePageName(): (address: string, title: string | undefined) => string {
  const t = useTranslations("googleAnalytics.allPages.map");
  const home = t("homePage");
  return useMemo(() => (address, title) => (pathOf(address) === "/" ? home : title ?? pathOf(address)), [home]);
}

function figuresOf(row: ListRowShown, measure: Measure): { now: number; before: number | null } {
  if (measure === "views") return { now: row.views, before: row.viewsBefore };
  if (measure === "visits") return { now: row.visits, before: row.visitsBefore ?? null };
  return { now: row.conversions, before: row.conversionsBefore };
}

/**
 * The map (Anthony, 2026-11-04: "this control is lovely"): the pages most viewed or visited, each a box, orange if it went
 * up and grey if it went down. Count changes the size, the colour and the hover. Colour shows follows Count until someone
 * changes it. Pressing a box opens that page's own screen.
 */
export function PagesMapCard({ choice, answer }: { choice: ClassificationChoice; answer: ListPageAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.allPages.map");
  const tc = useTranslations("googleAnalytics.chart");
  const tk = useTranslations("googleAnalytics.allPages.classification");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const router = useRouter();
  const pageHref = usePageHref();
  const website = useWebsiteForEye();
  const [count, setCount] = useSiteParam<Count>("count", "views", COUNTS);
  const [colourChosen, setColour] = useSiteParam<Measure | typeof FOLLOWS_COUNT>("colour", FOLLOWS_COUNT, COLOURS);
  const colour: Measure = colourChosen === FOLLOWS_COUNT ? count : colourChosen;
  const ready = Boolean(status?.connection?.newestDay);
  const ask = {
    ...args, list: "page" as const, sort: count, direction: "desc" as const, page: 1, rows: MAP_PAGES,
    ...(choice.group !== undefined ? { group: choice.group } : {}), ...(choice.leaveOut ? { leaveOut: true } : {}),
  };
  const read = useQuery(api.googleAnalyticsReads.analyticsListPage, ready ? ask : "skip");
  // A device's list the next collection builds: every device's meanwhile, as the table does.
  const everyDevice = useQuery(api.googleAnalyticsReads.analyticsListPage, read?.live ? { ...ask, device: "" } : "skip");
  const list = read?.live ? everyDevice : read;
  const inWords = useSpanInWords(...spansOfList(answer));
  const rows = useMemo(() => (list?.rows ?? []).filter((row) => row.key.startsWith("~") && row[count] > 0), [list?.rows, count]);
  const pageName = usePageName();
  const boxes: PageMapBox[] = rows.map((row) => {
    const shown = figuresOf(row, colour);
    const others = MEASURES.filter((measure) => measure !== colour);
    return {
      id: row.key,
      name: pageName(row.label, row.title),
      size: row[count],
      now: shown.now,
      before: shown.before,
      figure: t(`figure.${count}`, { count: row[count] }),
      readout: [
        { value: formatNumber(shown.now), label: t(`in.${colour}`, { when: inWords.now }) },
        ...(shown.before !== null ? [
          { value: formatNumber(shown.before), label: t(`in.${colour}`, { when: inWords.before }) },
          { value: arrowMove(shown.now, shown.before) ?? t("same"), label: t("upOrDown") },
        ] : []),
        ...others.map((measure) => ({ value: formatNumber(figuresOf(row, measure).now), label: t(`measure.${measure}`) })),
      ],
    };
  });
  // The eye reads the boxes on screen, for whichever Count is chosen. Never money.
  const seen = useMemo(() => (list ? {
    count,
    pages: rows.map((row) => ({
      name: pageName(row.label, row.title), page: pathOf(row.label),
      views: row.views, viewsBefore: row.viewsBefore, visits: row.visits, visitsBefore: row.visitsBefore ?? null, conversions: row.conversions, conversionsBefore: row.conversionsBefore,
    })),
  } : undefined), [list, rows, count, pageName]);
  useSeesPart("pageMap", seen);

  const held = rows.reduce((sum, row) => sum + row.views, 0);
  const whole = choice.group !== undefined ? read?.groupTotals?.views ?? null : website?.views ?? null;
  const share = whole ? Math.round((held / whole) * 100) : null;
  const leftOut = choice.leaveOut && choice.options.some((option) => option.value === LEFT_OUT);
  const under = [
    count === "visits" ? t("cantAdd")
      : share !== null && rows.length < (list?.total ?? 0) ? t(choice.group !== undefined ? "shareOfClassification" : "share", { count: rows.length, share: `${share}%` })
        : null,
    leftOut ? t("leftOut") : null,
  ].filter(Boolean).join(" ");
  const controls: ExplorerControl[] = [
    { kind: "select", key: "count", label: t("count"), value: count, options: COUNTS.map((one) => ({ value: one, label: t(`measure.${one}`) })), onChange: (next) => setCount(next as Count) },
    { kind: "select", key: "classification", label: tk("label"), value: choice.value, options: choice.options, onChange: choice.set },
    { kind: "select", key: "colour", label: t("colourShows"), value: colour, options: MEASURES.map((one) => ({ value: one, label: t(`measure.${one}`) })), onChange: (next) => setColour(next === count ? FOLLOWS_COUNT : next as Measure) },
  ];
  return (
    <MapCard
      title={t("title")}
      hint={`${t(`hint.${count}`, { count: MAP_PAGES })} ${t(`colourHint.${colour}`, { before: inWords.before })}`}
      exportName="google-analytics-page-map"
      csv={() => toCsv(
        [t("csv.page"), t("csv.address"), t("csv.views"), t("csv.viewsBefore"), t("csv.visits"), t("csv.visitsBefore"), t("csv.conversions"), t("csv.conversionsBefore")],
        rows.map((row) => [pageName(row.label, row.title), row.label, row.views, row.viewsBefore, row.visits, row.visitsBefore ?? null, row.conversions, row.conversionsBefore]),
      )}
      host={status?.host ?? ""}
      controls={controls}
      loading={list === undefined}
      message={boxes.length === 0 ? tc("empty") : null}
      under={under ? <p className="text-[12px] text-muted">{under}</p> : null}
    >
      <PageMap boxes={boxes} onOpen={(id) => router.push(pageHref(id))} />
    </MapCard>
  );
}

/** Each ticked page's line, in the order ticked. Your whole website is grey and dashed. */
const PLOTTED_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_AMBER, CHART_SERIES_TEAL];
const LINES_HEIGHT = 200;
const WHOLE_SWITCH = ["off", "on"] as const;

type Point = { day: string; lastDay?: string; views: number; visits: number; conversions: number };

/**
 * Views each day: it opens on the whole website's line with no page ticked (Anthony, 2026-11-04: "make this the default
 * view"), and each page ticked in the table adds a line, five at most. Show chooses views, visits or conversions. Your whole
 * website is a switch: at about 5,000 views a day against 300 for a page, turning it off lets ticked pages be told apart.
 */
export function PagesLinesCard({ pages, answer }: { pages: readonly string[]; answer: ListPageAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.allPages.lines");
  const tc = useTranslations("googleAnalytics.chart");
  const tm = useTranslations("googleAnalytics.allPages.map");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [step] = useStep();
  const [show, setShow] = useSiteParam<Measure>("show", "views", MEASURES);
  const [whole, setWhole] = useSiteParam<(typeof WHOLE_SWITCH)[number]>("whole", "on", WHOLE_SWITCH);
  const ready = Boolean(status?.connection?.newestDay);
  const website = useQuery(api.googleAnalyticsChartReads.analyticsChart, ready && whole === "on" ? args : "skip");
  const daily = useQuery(api.googleAnalyticsPageReads.analyticsPagesDaily, ready && pages.length > 0 ? { ...args, pages: [...pages] } : "skip");
  const inWords = useSpanInWords(...spansOfList(answer));
  const pageName = usePageName();
  const drawn = pages.flatMap((ref, index) => {
    const page = daily?.pages.find((one) => one.ref === ref);
    return page?.points ? [{ ...page, points: page.points, colour: PLOTTED_COLOURS[index] ?? CHART_SERIES_SLATE }] : [];
  });
  const websiteOn = whole === "on" && Boolean(website);
  const pointsOf = (points: readonly Point[]) => points.map((point) => ({ day: point.day, ...(point.lastDay ? { lastDay: point.lastDay } : {}), value: point[show] }));
  const lines: DaysLine[] = [
    ...drawn.map((page, index) => ({ key: `page${index}`, name: pageName(page.address, page.title), colour: page.colour, points: pointsOf(page.points) })),
    ...(websiteOn ? [{ key: "website", name: t("website"), colour: CHART_SERIES_SLATE, dashed: true, points: pointsOf(website?.points ?? []) }] : []),
  ];
  // The eye reads every line drawn, each point by its day. By the pages' numbers, not the array they come in, which is new each time the table draws.
  const ticked = pages.join(",");
  const seen = useMemo(() => (website || daily ? {
    show,
    ...(website ? { website: website.points.map((point) => ({ day: point.day, views: point.views, visits: point.visits, conversions: point.conversions })) } : {}),
    pages: (ticked ? ticked.split(",") : []).flatMap((ref) => {
      const page = daily?.pages.find((one) => one.ref === ref);
      return page?.points ? [{ name: pageName(page.address, page.title), days: page.points }] : [];
    }),
  } : undefined), [website, daily, ticked, show, pageName]);
  useSeesPart("viewsADay", seen);
  return (
    <DaysChart
      title={t(`title.${show}.${step}`)}
      hint={(coarse) => `${t("hint", { count: pages.length, when: inWords.now })}${coarse ? ` ${tc(`coarse.${step}`)}` : ""}`}
      exportName="google-analytics-pages-daily"
      csvDay={t("csvDay")}
      host={status?.host ?? ""}
      step={step}
      waiting={null}
      controls={[
        { kind: "select", key: "show", label: t("show"), value: show, options: MEASURES.map((one) => ({ value: one, label: tm(`measure.${one}`) })), onChange: (next) => setShow(next as Measure) },
        { kind: "select", key: "whole", label: t("website"), value: whole, options: WHOLE_SWITCH.map((one) => ({ value: one, label: t(`switch.${one}`) })), onChange: (next) => setWhole(next as "off" | "on") },
      ]}
      nothingTicked={pages.length === 0 && whole === "off" ? t("nothingTicked", { most: MOST_PLOTTED }) : null}
      lines={lines}
      figure={tm(`measure.${show}`)}
      plain
      empty={tc("empty")}
      height={LINES_HEIGHT}
    />
  );
}
