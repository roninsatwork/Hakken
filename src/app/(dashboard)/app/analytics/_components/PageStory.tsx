"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PageStory } from "@/convex/googleAnalyticsPageStory";
import { ChartExplorer } from "@/src/ui/components/screens/ChartExplorer";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import type { ChartReadoutTableProps } from "@/src/ui/components/charts/ChartReadoutTable";
import { SiteBarChart, type SiteSeries } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../search-console/_components/SearchConsoleChartCard";
import { usePeriod, periodWord } from "./useAnalytics";
import { OTHER_ROWS } from "@/convex/utils/analyticsSharedLists";

/**
 * A page's story on its own All pages screen, as drawn and approved on
 * 2026-10-13 (docs/plans/active/analytics-page-screen-plan.md §2;
 * `docs/plans/assets/analytics-page-screen/`): the visits that started on it
 * and the conversions they went on to make, named apart from those made on
 * it (PS1); each source on its own line (PS2); where its views went next;
 * who reads it; and its page group beside it. Read with the screen's own
 * query; the parts Google is asked for when the screen opens say so while
 * they come.
 */

type Source = PageStory["sources"][number];

/** The words of a page's story, and the dates chosen as the screens name them. */
function useStoryWords() {
  const t = useTranslations("googleAnalytics.page.story");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  return { t, tf, period: tf(`periods.${periodWord(period)}`) };
}

/** A source by the name people know it by, or typed in, or a channel's other sources added up, or not known. */
export function useSourceName() {
  const { t } = useStoryWords();
  return (row: Source) => row.name ?? (row.source === "(direct)" ? t("typedIn") : row.source === OTHER_ROWS ? t("otherSources") : t("notKnown"));
}

/** One chart of the story: its card, the chart, or what it is waiting for. */
function StoryChart({ title, hint, exportName, csv, host, shown, collecting, children }: {
  title: string;
  hint: string;
  exportName: string;
  csv: () => string;
  host: string;
  shown: boolean;
  /** Its shared lists not built yet: the next collection builds them (ga-stored-figures-plan.md SF15). */
  collecting: boolean;
  children: ReactNode;
}) {
  const { t } = useStoryWords();
  return (
    <SearchConsoleChartCard title={title} hint={hint} exportName={exportName} csv={csv} host={host} from={null} to={null}>
      {shown ? children : <p className="py-10 text-center text-[12px] text-muted">{collecting ? t("collecting") : t("empty")}</p>}
    </SearchConsoleChartCard>
  );
}


type WhoBy = "device" | "country" | "age" | "gender";
const WHO_BY: readonly WhoBy[] = ["device", "country", "age", "gender"];

/**
 * Who looks at this page (page-screen-redo-plan-2026-11-03.md, step 1; approved by Anthony on 3 November 2026, "This
 * component is approved"): the four charts that were Phone or computer, Where its readers are, Their age and Their
 * gender, as one chart with menus — the kit's `ChartExplorer` as bars. By picks device, country, age or gender;
 * Compare with puts the whole website beside this page in grey where its figures are kept (not for countries, whose
 * whole-website figures this read doesn't keep). One figure a bar; the conversions Google could place by age or
 * gender are a sentence under the title, not words on a bar.
 */
function WhoLooksCard({ story, host }: { story: PageStory; host: string }) {
  const { t } = useStoryWords();
  const tw = useTranslations("googleAnalytics.page.who");
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const [by, setBy] = useState<WhoBy>("device");
  const [against, setAgainst] = useState<"website" | "none">("website");
  const countries = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale === "en" ? "en-GB" : locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const percent = (value: number) => `${Math.round(value)}%`;
  const comparing = by !== "country" && against === "website";
  type Bar = { key: string; label: string; value: number; website: number | null; conversions: number };
  const bars: Bar[] = by === "device"
    ? story.devices.map((row) => ({ key: row.device, label: tf(`devices.${row.device}`), value: row.share * 100, website: row.websiteShare === null ? null : row.websiteShare * 100, conversions: 0 }))
    : by === "country"
      ? story.countries.map((row) => ({ key: row.code, label: countries?.of(row.code) ?? row.code, value: row.people, website: null, conversions: 0 }))
      : (by === "age" ? story.ages : story.genders).rows.map((row) => ({
        key: row.key,
        label: by === "age" ? row.key.replace("-", "–") : row.key === "female" ? t("female") : row.key === "male" ? t("male") : row.key,
        value: row.share * 100,
        website: row.websiteShare === null ? null : row.websiteShare * 100,
        conversions: row.conversions,
      }));
  const figure = (value: number) => (by === "country" ? formatNumber(value) : percent(value));
  const data = bars.map((bar) => ({ key: bar.key, label: bar.label, value: bar.value, ...(comparing ? { website: bar.website } : {}) }));
  const series: SiteSeries[] = comparing
    ? [{ key: "value", name: tw("thisPage"), colour: CHART_SERIES_ORANGE }, { key: "website", name: tw("wholeWebsite"), colour: CHART_SERIES_SLATE }]
    : [{ key: "value", name: tw("thisPage"), colour: CHART_SERIES_ORANGE }];

  // The line under the title: what the bars are, and how many people Google could place.
  const placed = by === "age" ? story.ages : by === "gender" ? story.genders : null;
  const convertedIn = bars.filter((bar) => bar.conversions > 0);
  const hint = [
    by === "device" ? tw("hintDevice") : by === "country" ? tw("hintCountry")
      : tw(by === "age" ? "hintAge" : "hintGender", { placed: formatNumber(placed?.readersPlaced ?? 0), readers: formatNumber(placed?.readers ?? 0) }),
    placed && convertedIn.length === 1 && placed.conversionsPlaced > 0
      ? tw(by === "age" ? "allConvertedAge" : "allConvertedGender", { count: placed.conversionsPlaced, group: by === "age" ? convertedIn[0].label : convertedIn[0].key })
      : null,
    comparing ? tw("greyBars") : null,
  ].filter(Boolean).join(" ");

  const readout = ({ row, heading }: { row: Record<string, unknown>; heading: ReactNode }): ChartReadoutTableProps => {
    const bar = bars.find((one) => one.key === row.key);
    const column = { key: "value", label: by === "country" ? tw("people") : tw("share"), tone: "band" as const, drawn: true };
    if (!bar) return { heading, columns: [], rows: [] };
    return {
      heading,
      columns: [column],
      rows: [
        { key: "page", name: tw("thisPage"), colour: CHART_SERIES_ORANGE, cells: { value: { text: figure(bar.value) } } },
        ...(comparing ? [{ key: "website", name: tw("wholeWebsite"), colour: CHART_SERIES_SLATE, cells: { value: bar.website === null ? { text: "–", quiet: true } : { text: figure(bar.website) } } }] : []),
      ],
    };
  };
  const csv = () => toCsv([tw(`by.${by}`), tw("thisPage"), ...(comparing ? [tw("wholeWebsite")] : [])], bars.map((bar) => [bar.label, Math.round(bar.value), ...(comparing ? [bar.website === null ? null : Math.round(bar.website)] : [])]));

  return (
    <ChartExplorer
      title={tw("title", { by })}
      hint={hint}
      exportName={`google-analytics-page-who-${by}`}
      csv={csv}
      host={host}
      from={null}
      to={null}
      waiting={story.live ? t("collecting") : null}
      controls={[
        { kind: "select", key: "by", label: tw("byLabel"), value: by, options: WHO_BY.map((one) => ({ value: one, label: tw(`by.${one}`) })), onChange: (next) => setBy(next as WhoBy) },
        ...(by === "country" ? [] : [{ kind: "select" as const, key: "against", label: tw("compareWith"), value: against, options: (["website", "none"] as const).map((one) => ({ value: one, label: tw(`against.${one}`) })), onChange: (next: string) => setAgainst(next as "website" | "none") }]),
      ]}
      nothingTicked={null}
      data={data}
      series={series}
      readout={readout}
      anything={bars.some((bar) => bar.value > 0)}
      empty={t("empty")}
      bars={{ labels: (value: number) => (Number.isFinite(value) ? figure(value) : null) }}
    />
  );
}

/**
 * The story's charts under the boxes and lines (page-screen-redo-plan-2026-11-03.md, step 1): who looks at the page,
 * then its busiest days of the week.
 */
export function PageStoryCharts({ story, host }: { story: PageStory; host: string }) {
  const { t, period } = useStoryWords();
  const locale = useLocale();
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { weekday: "short", timeZone: "UTC" }), [locale]);
  // 2024-01-07 was a Sunday: Google's day 0.
  const dayName = (day: string) => weekday.format(new Date(Date.UTC(2024, 0, 7 + Number(day))));
  const weekdays = story.weekdays.map((row) => ({ label: dayName(row.day), views: row.views }));

  return (
    <>
      <WhoLooksCard story={story} host={host} />
      <StoryChart title={t("weekdaysTitle")} hint={t("weekdaysHint", { period: period.toLowerCase() })} exportName="google-analytics-page-weekdays" host={host} shown={weekdays.some((row) => row.views > 0)} collecting={story.live}
        csv={() => toCsv([t("weekdaysTitle"), t("views")], weekdays.map((row) => [row.label, row.views]))}>
        <SiteBarChart data={weekdays} series={[{ key: "views", name: t("views"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </StoryChart>
    </>
  );
}
