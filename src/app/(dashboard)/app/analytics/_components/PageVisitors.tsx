"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { PageStory } from "@/convex/googleAnalyticsPageStory";
import { ChartExplorer } from "@/src/ui/components/screens/ChartExplorer";
import type { ChartReadoutTableProps, ReadoutCell, ReadoutColumn } from "@/src/ui/components/charts/ChartReadoutTable";
import { CHART_COMPARATOR_GREY, CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import type { SiteSeries } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { pathOf } from "./analyticsFormat";
import { useSourceName } from "./PageStory";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, periodWord } from "./useAnalytics";

type By = "channel" | "source" | "returning" | "before" | "next";
type Show = "visits" | "share" | "back" | "pages" | "read" | "views" | "viewsShare";
type Split = "none" | "returning";
type Against = "none" | "website";
const BY: readonly By[] = ["channel", "source", "returning", "before", "next"];
const SHOWS: Record<By, readonly Show[]> = {
  channel: ["visits", "share", "back", "pages", "read"],
  source: ["visits", "share", "back", "pages", "read"],
  returning: ["visits", "share"],
  before: ["views", "viewsShare"],
  next: ["views", "viewsShare"],
};
/** The bars ticked at first, as many as the page's charts showed before (none for every one). */
const FIRST: Record<By, number | null> = { channel: null, source: 12, returning: null, before: 8, next: null };

/** A bar's figures: its visits (or views) and, where the figures have them, its visitors' habits. */
type Item = { key: string; name: string; visits: number; back: number | null; pages: number | null; read: number | null; website?: number | null };
type BeforeRow = { key: string; kind: string; label: string; title?: string | null; views: number; share: number };

/**
 * A page's "Visitors to this page" (docs/plans/active/page-visitors-explorer-plan.md; drawn and approved 2026-10-20,
 * Anthony: "this is nice … then go"): one configurable chart in place of five — the visits that started on the page by
 * channel, by source, and by first visit or back again, and its views by the place just before and the page next. By
 * picks what the bars are, Show the figure, the tick boxes which bars, and Split or Against where the figures allow.
 * About visitors, not conversions ("it's about visitors now"): the hover leads with visits on its band. Drawn by the
 * kit's `ChartExplorer` as bars; every figure is one the screen already reads.
 */
export function PageVisitorsCard({ page, story, before }: { page: string; story: PageStory; before: readonly BeforeRow[] }) {
  const t = useTranslations("googleAnalytics.pageVisitors");
  const ts = useTranslations("googleAnalytics.page.story");
  const tp = useTranslations("googleAnalytics.page");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const sourceName = useSourceName();
  const grid = useQuery(api.googleAnalyticsPageConversions.analyticsPageConversionGrid, status?.connection?.newestDay && page ? { ...args, page } : "skip");
  const [by, setBy] = useState<By>("channel");
  const [shows, setShows] = useState<Partial<Record<By, Show>>>({});
  const [ticked, setTicked] = useState<Partial<Record<By, string[]>>>({});
  const [split, setSplit] = useState<Split>("none");
  const [chosenAgainst, setAgainst] = useState<Against>("none");

  const show = shows[by] ?? SHOWS[by][0];
  const ofVisits = by !== "before" && by !== "next";
  const shareShown = show === "share" || show === "viewsShare";
  // Split only for sources' visits; against the whole website only for a share it holds.
  const splitShown = by === "source" && show === "visits";
  const againstShown = (by === "channel" || by === "returning") && show === "share";
  const splitting = splitShown && split === "returning";
  const against: Against = againstShown ? chosenAgainst : "none";

  // A channel's habits are its sources' together, weighted by their visits.
  const weighed = (key: string, name: string, rows: PageStory["sources"], website: number | null = null): Item => {
    const visits = rows.reduce((sum, row) => sum + row.visits, 0);
    const of = (field: "back" | "pages" | "read") => {
      const held = rows.filter((row) => row[field] !== null);
      const weight = held.reduce((sum, row) => sum + row.visits, 0);
      return weight > 0 ? held.reduce((sum, row) => sum + (row[field] ?? 0) * row.visits, 0) / weight : null;
    };
    return { key, name, visits, back: of("back"), pages: of("pages"), read: of("read"), website };
  };
  const siteVisits = (grid?.channels ?? []).reduce((sum, row) => sum + row.websiteVisits, 0);
  // Google's paid and unpaid visits both read "Google": named apart by their channel.
  const names = story.sources.map((row) => sourceName(row));
  const twice = new Set(names.filter((name, at) => names.indexOf(name) !== at));
  const itemsOf = (which: By): Item[] => {
    if (which === "channel") {
      return (grid?.channels ?? []).filter((row) => row.visits > 0).map((row) => ({
        ...weighed(row.channel, row.channel, story.sources.filter((source) => source.channel === row.channel), siteVisits > 0 ? row.websiteVisits / siteVisits : null),
        visits: row.visits,
      }));
    }
    if (which === "source") {
      return story.sources.map((row, at) => weighed(`${row.channel}|${row.source}|${at}`, twice.has(names[at]) ? `${names[at]} · ${row.channel}` : names[at], [row]));
    }
    if (which === "returning") {
      const kept = story.returning;
      if (!kept) return [];
      return [
        { key: "first", name: ts("firstVisit"), visits: kept.first, back: null, pages: null, read: null, website: null },
        { key: "back", name: ts("backAgain"), visits: kept.back, back: null, pages: null, read: null, website: kept.websiteBack },
        { key: "unknown", name: ts("notKnown"), visits: kept.unknown, back: null, pages: null, read: null, website: null },
      ].filter((row) => row.visits > 0);
    }
    if (which === "before") {
      return before.map((row) => ({
        key: row.key, visits: row.views, back: null, pages: null, read: null,
        name: row.kind === "none" ? tp("noPageBefore") : row.kind === "other" ? tp("otherBefore") : row.kind === "page" ? pathOf(row.label) : row.label,
      }));
    }
    return story.next.map((row, at) => ({
      key: `${row.kind}|${row.key ?? at}`, visits: row.views, back: null, pages: null, read: null,
      name: row.kind === "again" ? ts("thisPageAgain") : row.kind === "left" ? ts("leftWebsite") : row.kind === "others" ? ts("otherPages") : pathOf(row.address),
    }));
  };
  const items = itemsOf(by);
  const total = items.reduce((sum, item) => sum + item.visits, 0);
  const firstTicks = items.slice(0, FIRST[by] ?? items.length).map((item) => item.key);
  const pickedKeys = (ticked[by] ?? firstTicks).filter((key) => items.some((item) => item.key === key));
  const value = (item: Item): number | null => {
    if (show === "visits" || show === "views") return item.visits;
    if (show === "share" || show === "viewsShare") return total > 0 ? (item.visits / total) * 100 : null;
    if (show === "pages") return item.pages;
    const share = show === "back" ? item.back : item.read;
    return share === null ? null : share * 100;
  };
  // The ticked bars, the most first by what is shown; a bar with no figure last.
  const picked = items.filter((item) => pickedKeys.includes(item.key)).sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1));

  const percent = (share: number) => `${(Math.round(share * 10) / 10).toFixed(1)}%`;
  const figure = (amount: number) => (show === "pages" ? amount.toFixed(1) : shareShown || show === "back" || show === "read" ? percent(amount) : formatNumber(amount));
  const series: SiteSeries[] = splitting
    ? [{ key: "first", name: ts("firstVisit"), colour: CHART_SERIES_ORANGE }, { key: "again", name: ts("backAgain"), colour: CHART_SERIES_BLUE }]
    : against === "website"
      ? [{ key: "value", name: t("thisPage"), colour: CHART_SERIES_ORANGE }, { key: "website", name: t("website"), colour: CHART_COMPARATOR_GREY }]
      : [{ key: "value", name: t(`shows.${show}`), colour: CHART_SERIES_ORANGE }];
  const data = picked.map((item) => ({
    key: item.key,
    label: item.name,
    ...(splitting
      ? { first: Math.round(item.visits * (1 - (item.back ?? 0))), again: Math.round(item.visits * (item.back ?? 0)) }
      : { value: value(item), ...(against === "website" ? { website: item.website === null || item.website === undefined ? null : item.website * 100 } : {}) }),
  }));
  const labels = (amount: number, key: string, row: Record<string, unknown>) => {
    if (splitting) return key === "again" ? formatNumber(Number(row.first) + Number(row.again)) : null;
    return Number.isFinite(amount) ? figure(amount) : null;
  };

  // The hover: the bar's figures on the kit's table, every visit's (or the whole website's) under them.
  const people = <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />;
  const share = (visits: number) => (total > 0 ? percent((visits / total) * 100) : "–");
  const habit = (amount: number | null, kind: "share" | "pages"): ReadoutCell => (amount === null ? { text: "–", quiet: true } : { text: kind === "pages" ? amount.toFixed(1) : percent(amount * 100) });
  const everyVisit = weighed("all", t("everyVisit"), story.sources);
  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }): ChartReadoutTableProps => {
    const item = items.find((one) => one.key === row.key);
    const head = t("heading", { name: String(heading), period: tf(`periods.${periodWord(period)}`).toLowerCase() });
    if (!item) return { heading: head, columns: [], rows: [] };
    const count: ReadoutColumn = { key: "visits", label: ofVisits ? t("columns.visits") : t("columns.views"), tone: "band", icon: people, drawn: show === "visits" || show === "views" };
    const shareColumn: ReadoutColumn = { key: "share", label: t("columns.share"), tone: "quiet", drawn: shareShown };
    if (splitting) {
      const first = Math.round(item.visits * (1 - (item.back ?? 0)));
      const again = item.visits - first;
      const part = (visits: number) => ({ visits: { text: formatNumber(visits) }, share: { text: item.visits > 0 ? percent((visits / item.visits) * 100) : "–" } });
      return {
        heading: head,
        columns: [count, { ...shareColumn, drawn: false }],
        rows: [
          { key: "first", name: ts("firstVisit"), colour: CHART_SERIES_ORANGE, cells: part(first) },
          { key: "again", name: ts("backAgain"), colour: CHART_SERIES_BLUE, cells: part(again) },
        ],
        total: { visits: { text: formatNumber(item.visits) }, share: { text: percent(100) } },
      };
    }
    if (by === "channel" || by === "source") {
      if (against === "website") {
        return {
          heading: head,
          columns: [{ ...count, drawn: false }, shareColumn],
          rows: [
            { key: "page", name: t("thisPage"), colour: CHART_SERIES_ORANGE, cells: { visits: { text: formatNumber(item.visits) }, share: { text: share(item.visits) } } },
            { key: "site", name: t("website"), colour: CHART_COMPARATOR_GREY, cells: { visits: { text: "–", quiet: true }, share: { text: item.website === null || item.website === undefined ? "–" : percent(item.website * 100), quiet: item.website === null || item.website === undefined } } },
          ],
        };
      }
      const cells = (one: Item, visits: number): Record<string, ReadoutCell> => ({
        visits: { text: formatNumber(visits) }, share: { text: share(visits) }, back: habit(one.back, "share"), pages: habit(one.pages, "pages"), read: habit(one.read, "share"),
      });
      return {
        heading: head,
        columns: [count, shareColumn,
          { key: "back", label: t("columns.back"), tone: "quiet", drawn: show === "back" },
          { key: "pages", label: t("columns.pages"), tone: "quiet", drawn: show === "pages" },
          { key: "read", label: t("columns.read"), tone: "quiet", drawn: show === "read" }],
        rows: [
          { key: item.key, name: item.name, colour: CHART_SERIES_ORANGE, cells: cells(item, item.visits) },
          { key: "all", name: t("everyVisit"), colour: CHART_COMPARATOR_GREY, cells: cells(everyVisit, total) },
        ],
      };
    }
    const own = { visits: { text: formatNumber(item.visits) }, share: { text: share(item.visits) } };
    const site = against === "website" && item.website !== null && item.website !== undefined
      ? [{ key: "site", name: t("website"), colour: CHART_COMPARATOR_GREY, cells: { visits: { text: "–", quiet: true }, share: { text: percent(item.website * 100) } } }]
      : [];
    return { heading: head, columns: [count, shareColumn], rows: [{ key: item.key, name: item.name, colour: CHART_SERIES_ORANGE, cells: own }, ...site] };
  };

  const title = [
    t("title", { show, by }),
    splitting ? t("titleSplit") : "",
    against === "website" ? t("titleAgainst") : "",
  ].join("");
  const csv = () => toCsv([t(`by.${by}`), ...series.map((entry) => entry.name)], data.map((row) => [row.label, ...series.map((entry) => (row as Record<string, unknown>)[entry.key] as number | null)]));
  const tickWords = { channel: "channels", source: "sources", returning: "kinds", before: "places", next: "places" } as const;

  return (
    <ChartExplorer
      title={title}
      hint={t(ofVisits ? "hintVisits" : "hintViews", { period: tf(`periods.${periodWord(period)}`) })}
      exportName="google-analytics-page-visitors"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
      waiting={by === "channel" && grid === undefined ? undefined : story.live ? ts("collecting") : null}
      controls={[
        { kind: "select", key: "by", label: t("byLabel"), value: by, options: BY.map((one) => ({ value: one, label: t(`by.${one}`) })), onChange: (next) => setBy(next as By) },
        { kind: "select", key: "show", label: t("show"), value: show, options: SHOWS[by].map((one) => ({ value: one, label: t(`shows.${one}`) })), onChange: (next) => setShows({ ...shows, [by]: next as Show }) },
        { kind: "ticks", key: "bars", label: t(`ticks.${tickWords[by]}`), everyWord: t(`every.${tickWords[by]}`), choices: items.map((item) => ({ key: item.key, label: item.name })), ticked: pickedKeys, onChange: (next) => setTicked({ ...ticked, [by]: next }) },
        ...(splitShown ? [{ kind: "select" as const, key: "split", label: t("split"), value: split, options: (["none", "returning"] as const).map((one) => ({ value: one, label: t(`splits.${one}`) })), onChange: (next: string) => setSplit(next as Split) }] : []),
        ...(againstShown ? [{ kind: "select" as const, key: "against", label: t("against"), value: against, options: (["none", "website"] as const).map((one) => ({ value: one, label: t(`againsts.${one}`) })), onChange: (next: string) => setAgainst(next as Against) }] : []),
      ]}
      nothingTicked={items.length > 0 && pickedKeys.length === 0 ? t("nothingTicked", { what: tickWords[by] }) : null}
      data={data}
      series={series}
      readout={readout}
      anything={picked.some((item) => (value(item) ?? 0) > 0)}
      empty={ts("empty")}
      bars={{ labels, stacked: splitting }}
    />
  );
}
