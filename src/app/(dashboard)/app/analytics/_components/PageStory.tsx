"use client";

import { useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import type { PageStory } from "@/convex/googleAnalyticsPageStory";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { CUT_COLUMN } from "../../sites/_components/SiteCells";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { SearchConsoleChartCard } from "../../search-console/_components/SearchConsoleChartCard";
import { ConversionsCell, PageLink, TextFigure } from "./AnalyticsCells";
import { BeforeLine } from "./AnalyticsFigures";
import { formatMoney, formatPercent, formatPerVisit, formatTime, pathOf } from "./analyticsFormat";
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
type Click = PageStory["clicks"][number];

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

/**
 * The second row of figures (§2, section 3): visits that started here,
 * against the website's and the span before; the conversions they went on to
 * make, with visits for one against the website's; different pages a visit,
 * with the count Google gives; and how far its views are read, against its
 * page group's.
 */
export function PageStoryFigures({ story, currency }: { story: PageStory; currency: string | null }) {
  const { t } = useStoryWords();
  const started = story.started;
  if (!started) return null;
  const quiet = (words: string) => <span className="block text-muted">{words}</span>;
  const line = (words: string) => <span className="block text-secondary">{words}</span>;
  return (
    <FigureRow columns={4}>
      <Figure
        label={t("startedVisits")}
        value={formatNumber(started.visits)}
        detail={<>{line(t("startedShare", { share: formatPercent(started.websiteVisits > 0 ? started.visits / started.websiteVisits : null), total: formatNumber(started.websiteVisits) }))}<BeforeLine now={started.visits} before={started.visitsBefore} /></>}
      />
      <Figure
        label={t("startedConversions")}
        value={formatNumber(started.conversions)}
        emphasis
        detail={<>
          {line(started.conversions > 0
            ? t("conversionsLine", { money: formatMoney(started.value, currency), visits: formatNumber(Math.round(started.visitsPerConversion ?? 0)) })
            : t("conversionsNone", { visits: formatNumber(started.visits) }))}
          {started.websiteVisitsPerConversion !== null ? quiet(t("websitePerConversion", { visits: formatNumber(Math.round(started.websiteVisitsPerConversion)) })) : null}
        </>}
      />
      <Figure
        label={t("differentPages")}
        value={story.live && story.differentPages === null ? "…" : formatPerVisit(story.differentPages)}
        detail={<>
          {started.countedPages !== null ? line(t("countedAs", { pages: formatPerVisit(started.countedPages) })) : null}
          {started.websiteCountedPages !== null ? quiet(t("websiteCounted", { pages: formatPerVisit(started.websiteCountedPages) })) : null}
        </>}
      />
      <Figure
        label={t("readToEnd")}
        value={story.live && story.read === null ? "…" : story.read === null ? "–" : formatPercent(story.read)}
        detail={story.read === null && !story.live ? quiet(t("notCounting")) : <>
          {line(t("ofViews"))}
          {story.group && story.groupRead !== null ? quiet(`${story.group}: ${formatPercent(story.groupRead)}`) : null}
        </>}
      />
    </FigureRow>
  );
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


/**
 * The story's charts (§2, sections 6–12), each full width with its figures
 * written on its bars: the visits that started here by source, where its
 * views went next, first visit or back again, devices, countries, age and
 * gender with their conversions, the days of the week, and its page group's
 * busiest pages, this one in orange.
 */
export function PageStoryCharts({ story, host }: { story: PageStory; host: string }) {
  const { t, period } = useStoryWords();
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const waiting = story.live;
  const countries = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale === "en" ? "en-GB" : locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { weekday: "short", timeZone: "UTC" }), [locale]);
  // 2024-01-07 was a Sunday: Google's day 0.
  const dayName = (day: string) => weekday.format(new Date(Date.UTC(2024, 0, 7 + Number(day))));
  const percent = (value: number) => `${Math.round(value)}%`;

  const devices = story.devices.map((row) => ({ label: tf(`devices.${row.device}`), page: row.share * 100, website: (row.websiteShare ?? 0) * 100 }));
  const countryRows = story.countries.map((row) => ({ label: countries?.of(row.code) ?? row.code, value: row.people }));
  const who = (rows: PageStory["ages"]["rows"], name: (key: string) => string) => rows.map((row) => ({ label: name(row.key), page: row.share * 100, website: (row.websiteShare ?? 0) * 100, conversions: row.conversions }));
  const ages = who(story.ages.rows, (key) => key.replace("-", "–"));
  const genders = who(story.genders.rows, (key) => (key === "female" ? t("female") : key === "male" ? t("male") : key));
  const weekdays = story.weekdays.map((row) => ({ label: dayName(row.day), views: row.views }));
  const whoLabels = (value: number, key: string, row: Record<string, unknown>) => (key === "page" && Number(row.conversions) > 0
    ? t("shareConversions", { share: percent(value), conversions: Number(row.conversions) })
    : percent(value));
  const pairSeries = [{ key: "page", name: t("thisPage"), colour: CHART_SERIES_ORANGE }, { key: "website", name: t("yourWebsite"), colour: CHART_SERIES_SLATE }];

  return (
    <>
      <StoryChart title={t("devicesTitle")} hint={t("devicesHint", { period })} exportName="google-analytics-page-devices" host={host} shown={devices.length > 0} collecting={waiting}
        csv={() => toCsv([t("devicesTitle"), t("thisPage"), t("yourWebsite")], devices.map((row) => [row.label, Math.round(row.page), Math.round(row.website)]))}>
        <SiteBarChart horizontal data={devices} series={pairSeries} labels={(value) => percent(value)} formatScale={percent} />
      </StoryChart>

      <StoryChart title={t("countriesTitle")} hint={t("countriesHint", { period })} exportName="google-analytics-page-countries" host={host} shown={countryRows.length > 0} collecting={waiting}
        csv={() => toCsv([t("countriesTitle"), t("people")], countryRows.map((row) => [row.label, row.value]))}>
        <SiteBarChart horizontal data={countryRows} series={[{ key: "value", name: t("people"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </StoryChart>

      <StoryChart title={t("ageTitle")} exportName="google-analytics-page-age" host={host} shown={ages.length > 0} collecting={waiting}
        hint={t("ageHint", { period, placed: formatNumber(story.ages.readersPlaced), readers: formatNumber(story.ages.readers), conversionsPlaced: formatNumber(story.ages.conversionsPlaced), conversions: story.ages.conversions })}
        csv={() => toCsv([t("ageTitle"), t("thisPage"), t("yourWebsite"), t("conversions")], ages.map((row) => [row.label, Math.round(row.page), Math.round(row.website), row.conversions]))}>
        <SiteBarChart horizontal data={ages} series={pairSeries} labels={whoLabels} formatScale={percent} />
      </StoryChart>

      <StoryChart title={t("genderTitle")} exportName="google-analytics-page-gender" host={host} shown={genders.length > 0} collecting={waiting}
        hint={t("genderHint", { period, placed: formatNumber(story.genders.readersPlaced), readers: formatNumber(story.genders.readers), conversionsPlaced: formatNumber(story.genders.conversionsPlaced), conversions: story.genders.conversions })}
        csv={() => toCsv([t("genderTitle"), t("thisPage"), t("yourWebsite"), t("conversions")], genders.map((row) => [row.label, Math.round(row.page), Math.round(row.website), row.conversions]))}>
        <SiteBarChart horizontal data={genders} series={pairSeries} labels={whoLabels} formatScale={percent} />
      </StoryChart>

      <StoryChart title={t("weekdaysTitle")} hint={t("weekdaysHint", { period })} exportName="google-analytics-page-weekdays" host={host} shown={weekdays.some((row) => row.views > 0)} collecting={waiting}
        csv={() => toCsv([t("weekdaysTitle"), t("views")], weekdays.map((row) => [row.label, row.views]))}>
        <SiteBarChart data={weekdays} series={[{ key: "views", name: t("views"), colour: CHART_SERIES_ORANGE }]} labels={(value) => formatNumber(value)} />
      </StoryChart>

    </>
  );
}

const SOURCE_SORTS: SiteSortColumns<Source & { label: string }, "name" | "visits" | "pages" | "time" | "read" | "back" | "conversions"> = {
  name: { value: (row) => row.label, first: "asc" },
  visits: { value: (row) => row.visits, first: "desc" },
  pages: { value: (row) => row.pages, first: "desc" },
  time: { value: (row) => row.time, first: "desc" },
  read: { value: (row) => row.read, first: "desc" },
  back: { value: (row) => row.back, first: "desc" },
  conversions: { value: (row) => row.conversions, first: "desc" },
};

type SourceRow = Source & { label: string };

/**
 * Each source's visits (§2, section 13): one line a source — never a group
 * of them (PS2) — with the different pages its visits saw, the time they
 * gave, how far they read this page, how many came back, and the
 * conversions they went on to make. The table's settings: the screen draws
 * it under its own header.
 */
export function useStorySourcesTable(story: PageStory | undefined, host: string): Parameters<typeof DataTable<SourceRow>>[0] {
  const { t } = useStoryWords();
  const sourceName = useSourceName();
  const [search, setSearch, term] = useSiteSearch("qs", "sources");
  const rows = story?.sources.map((row) => ({ ...row, label: sourceName(row) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.label) || matches(row.channel));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SOURCE_SORTS, { opening: "visits", name: (row) => row.label, table: "sources" });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, table: "sources" });
  const header = (words: string, title: string) => <span title={title}>{words}</span>;
  return {
    rows: pager.pageRows,
    rowKey: (row) => row.key,
    search: { value: search, onChange: setSearch, placeholder: t("findSource") },
    cardHeader: (
      <TableBar
        footer={pager.footer}
        noun="results"
        title={t("sourcesTable")}
        description={t("sourcesTableDescription")}
        actions={rows ? (
          <ListDownload
            label={t("download")}
            fileName={`${host}-google-analytics-page-sources`}
            rows={sorted ?? []}
            columns={[
              { header: t("source"), value: (row) => row.label },
              { header: t("kind"), value: (row) => row.channel },
              { header: t("visits"), value: (row) => row.visits },
              { header: t("pages"), value: (row) => formatPerVisit(row.pages) },
              { header: t("time"), value: (row) => formatTime(row.time) },
              { header: t("readEnd"), value: (row) => formatPercent(row.read) },
              { header: t("back"), value: (row) => formatPercent(row.back) },
              { header: t("conversions"), value: (row) => row.conversions },
            ]}
          />
        ) : undefined}
      />
    ),
    sort: tableSort,
    empty: { icon: <FileText className="h-8 w-8 text-muted/30" />, label: story?.live ? t("collecting") : term ? t("noMatch") : t("noSources") },
    footer: pager.footer,
    columns: [
        { key: "name", header: t("source"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="text-[13px] text-foreground">{row.label}</span> },
        { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{row.channel}</TagLabel> },
        { key: "visits", header: t("visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.visits)}</span> },
        { key: "pages", header: header(t("pages"), t("pagesTitle")), align: "right", sortable: true, cell: (row) => <TextFigure text={formatPerVisit(row.pages)} /> },
        { key: "time", header: header(t("time"), t("timeTitle")), align: "right", sortable: true, cell: (row) => <TextFigure text={formatTime(row.time)} /> },
        { key: "read", header: header(t("readEnd"), t("readEndTitle")), align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(row.read)} /> },
        { key: "back", header: header(t("back"), t("backTitle")), align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(row.back)} /> },
        {
          key: "conversions",
          header: header(t("conversions"), t("conversionsTitle")),
          align: "right",
          sortable: true,
          cell: (row) => <ConversionsCell conversions={row.conversions} rate={row.visits > 0 ? row.conversions / row.visits : null} fewVisits={row.fewVisits} />,
        },
    ],
  };
}

/** A link's website, as people read it: its address without `www.`. */
function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(url);
  return match ? match[1].replace(/^www\./, "") : url;
}

const CLICK_SORTS: SiteSortColumns<Click, "link" | "clicks"> = {
  link: { value: (row) => row.url, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
};

/**
 * What its readers clicked (§2, section 15): the links out of the website and
 * the downloads — Google counts no click between the website's own pages,
 * which show under Where visitors went next (§3). The table's settings: the
 * screen draws it under its own header.
 */
export function useStoryClicksTable(story: PageStory | undefined, host: string): Parameters<typeof DataTable<Click>>[0] {
  const { t } = useStoryWords();
  const [search, setSearch, term] = useSiteSearch("qc", "clicks");
  const rows = story?.clicks;
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.url) || matches(pathOf(row.url)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, CLICK_SORTS, { opening: "clicks", name: (row) => row.url, table: "clicks" });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, table: "clicks" });
  return {
    rows: pager.pageRows,
    rowKey: (row) => `${row.kind}|${row.url}`,
    search: { value: search, onChange: setSearch, placeholder: t("findLink") },
    cardHeader: (
      <TableBar
        footer={pager.footer}
        noun="links"
        title={t("clicksTitle")}
        description={t("clicksDescription")}
        actions={rows ? (
          <ListDownload
            label={t("download")}
            fileName={`${host}-google-analytics-page-clicks`}
            rows={sorted ?? []}
            columns={[
              { header: t("link"), value: (row) => row.url },
              { header: t("kind"), value: (row) => (row.kind === "download" ? t("fileDownloaded") : t("linkOut")) },
              { header: t("clicks"), value: (row) => row.clicks },
            ]}
          />
        ) : undefined}
      />
    ),
    sort: tableSort,
    empty: { icon: <FileText className="h-8 w-8 text-muted/30" />, label: story?.live ? t("collecting") : term ? t("noMatch") : t("noClicks") },
    footer: pager.footer,
    columns: [
        { key: "link", header: t("link"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <PageLink address={row.url} href={null} title={hostOf(row.url)} /> },
        { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{row.kind === "download" ? t("fileDownloaded") : t("linkOut")}</TagLabel> },
        { key: "clicks", header: t("clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
    ],
  };
}

/** Why Google held some of the story back. */
export function PageStoryNotices({ story }: { story: PageStory }) {
  const { t } = useStoryWords();
  return !story.live && story.thresholded ? <Notice>{t("heldBack")}</Notice> : null;
}
