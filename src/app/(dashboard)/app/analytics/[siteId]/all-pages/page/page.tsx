"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, FileText } from "lucide-react";
import type { PageStory } from "@/convex/googleAnalyticsPageStory";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { pageSees, pageStoryFacts } from "@/convex/utils/sees/analytics";
import type { Seen } from "@/convex/utils/hakkenSees";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CUT_COLUMN } from "../../../../sites/_components/SiteCells";
import { ListDownload } from "../../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../sites/_components/useSiteSort";
import { TextFigure } from "../../../_components/AnalyticsCells";
import { Notice } from "@/src/ui/components/screens/Notice";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { VisitsChart } from "../../../_components/AnalyticsChart";
import { formatPercent, formatPerVisit, formatTime, pathOf } from "../../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus, periodWord } from "../../../_components/useAnalytics";
import { backTarget } from "../../../_components/analyticsBack";
import { useEyeNames } from "../../../_components/useEyeFigures";
import { PageStoryCharts, useSourceName } from "../../../_components/PageStory";
import { PageBoxes, type PageAnswer } from "../../../_components/PageBoxes";
import { ConversionExplorerCard } from "../../../_components/ConversionExplorer";
import { PageVisitorsCard } from "../../../_components/PageVisitors";


/**
 * What the eye reads of the page (page-screen-redo-plan-2026-11-03.md, step 2): only what the screen shows — no money,
 * people, time, page before or links clicked, which the screen no longer draws. Rows carry a `name` so code can find
 * figures in them. The boxes and the charts that read their own figures hand theirs over as parts.
 */
/** Names as people say them, for the eye's figures (Anthony, 2026-11-03: a reading age of 14). */
// As the screen names them: Google's own device names (Anthony, 2026-11-03: "the words the supplier uses").
const DEVICE_NAMES: Record<string, string> = { mobile: "Mobile", desktop: "Desktop", tablet: "Tablet" };
const GENDER_NAMES: Record<string, string> = { female: "Female", male: "Male" };

function seesDataOf(answer: PageAnswer) {
  const story = answer.story;
  let country: Intl.DisplayNames | null = null;
  try {
    country = new Intl.DisplayNames(["en-GB"], { type: "region" });
  } catch {
    country = null;
  }
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    days: answer.points.map((point) => ({ day: point.day, views: point.views })),
    sources: story.sources.map((row) => ({ name: row.name ?? (row.source === "(direct)" ? "Typed in or a bookmark" : "Not known"), channel: row.channel, visits: row.visits, pagesPerVisit: row.pages, scrolledToBottomRate: row.read, cameBackRate: row.back })),
    devices: story.devices.map((row) => ({ name: DEVICE_NAMES[row.device] ?? row.device, viewsShare: row.share, websiteViewsShare: row.websiteShare })),
    countries: story.countries.map((row) => ({ name: country?.of(row.code) ?? row.code, people: row.people })),
    ages: story.ages.rows.map((row) => ({ name: `Aged ${row.key.replace("-", " to ")}`, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    genders: story.genders.rows.map((row) => ({ name: GENDER_NAMES[row.key] ?? row.key, peopleShare: row.share, websitePeopleShare: row.websiteShare })),
    weekdays: story.weekdays.map((row) => ({ name: days[Number(row.day)] ?? row.day, views: row.views })),
  };
}

/** A phrase worked out again on the screen keeps the server's names for it (a page by its title, not its number). */
function withNames(fresh: Seen, named: Seen): Seen {
  const nameOf = <Phrase extends { code: string }>(phrase: Phrase, from: ReadonlyArray<{ code: string }>): Phrase => ({ ...phrase, ...(from.find((one) => one.code === phrase.code) ?? {}) }) as Phrase;
  return { says: fresh.says.map((phrase) => nameOf(phrase, named.says)), steps: fresh.steps.map((step) => nameOf(step, named.steps)) };
}

/**
 * A page's own screen from All pages, redone (page-screen-redo-plan-2026-11-03.md; boards 2 and 3 of the canvas
 * "Hakken — A page's own screen, redo", approved by Anthony on 3 November 2026). Top to bottom:
 *
 * - its web address as the title, smaller, and "Open the page" on its own line; no line under the title;
 * - four boxes (`PageBoxes`): a product's page counts its items added and bought, any other page its visitors who
 *   bought and how far it is scrolled;
 * - its views each day; its visitors each day, a line for each channel (the configurable chart, opening on Visits);
 * - the websites that sent visitors (the bars, opening on Source);
 * - who looks at it, by device, country, age or gender, against the whole website; its busiest days of the week;
 * - where its visitors came from, a row for each source.
 *
 * Gone, at Anthony's word: People, Time, pages a visit, money, the privacy notice, the conversions squares, the page
 * before table and the links clicked. Every word for a reading age of 14; Google's own channel names kept, as the
 * supplier's words.
 */
export default function AnalyticsPageScreen() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <PageBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function PageBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.page");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  // Back to the screen this page was opened from, as it was (landing-pages-flow-plan.md LF9); else All pages.
  const back = backTarget(useSearchParams().get("from"));
  const tm = useTranslations("googleAnalytics.menu");
  const backLabel = (to: NonNullable<typeof back>) => to.screen === "page" ? t("backToPage")
    : to.screen === "conversionPages" ? t("backToConversionPages")
    : to.screen === "channel" ? to.name ?? tm("channels")
      : to.screen === "event" ? to.name ?? tm("events")
        : tm(to.screen);
  const page = useSearchParams().get("key") ?? "";
  // Its own figures and its story are two reads, each with Convex's second to itself; the screen shows them together.
  const main = useQuery(api.googleAnalyticsPageReads.analyticsPage, page ? { ...args, page } : "skip");
  const told = useQuery(api.googleAnalyticsPageReads.analyticsPageStory, page ? { ...args, page } : "skip");
  const answer = useMemo<PageAnswer | null | undefined>(() => (main === null || told === null ? null : main && told ? { ...main, ...told } : undefined), [main, told]);
  // The rules again with the boxes' items and sale, which are their own read (the page's read would pass a second with
  // them): the same rules as the server's, names kept from its words (page-screen-redo-plan-2026-11-03.md, step 2).
  const boxes = useQuery(api.googleAnalyticsPageBoxes.analyticsPageBoxes, answer && page ? { ...args, page } : "skip");
  const seen = useMemo(() => (answer && !answer.live && boxes ? withNames(pageSees(page, answer.address, Boolean(answer.row), pageStoryFacts(answer.story, boxes)), answer.seen) : answer?.seen), [answer, boxes, page]);
  const currency = status.connection?.currency ?? null;
  const address = answer?.address ?? "";
  // With the names its own findings use ("This page", "The whole website"), in the reader's words.
  const eyeNames = useEyeNames();
  const seesData = useMemo(() => (answer ? { ...seesDataOf(answer), names: eyeNames } : undefined), [answer, eyeNames]);
  const named = { period: tf(`periods.${periodWord(period)}`) };
  // Where the team's "Do first" steps may send the reader, beside the rules' own links.
  const seesLinks = useMemo(() => [
    ...(status.connection?.shop ? [{ label: tm("products"), href: hrefFor("products") }] : []),
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("allPages"), href: hrefFor("all-pages") },
  ], [status.connection?.shop, hrefFor, tm]);

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back ? { label: backLabel(back), href: `/app/analytics/${args.siteId}/${back.path}` } : { label: t("back"), href: hrefFor("all-pages") }}
        icon={<FileText className="h-5 w-5 text-brand" />}
        title={answer ? pathOf(address) : "…"}
        size="small"
        link={/^https?:\/\//.test(address) ? (
          <a href={address} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-secondary hover:text-info">
            {t("openPage")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : undefined}
      />
      {answer === null ? <Notice>{t("notFound")}</Notice> : null}

      <AnalyticsSees screen="page" seen={answer && !answer.live ? seen : undefined} currency={currency} data={seesData} links={seesLinks} />

      {answer && !answer.row ? <Notice>{t("noViews", { period: named.period.toLowerCase() })}</Notice> : null}
      {answer ? <PageBoxes answer={answer} page={page} /> : null}

      <VisitsChart days={answer && !answer.live ? answer.points : []} host={status.host} from={null} to={null} exportName="google-analytics-page" viewsOnly />
      {answer ? <ConversionExplorerCard page={page} opening="visits" /> : null}
      {answer ? <PageVisitorsCard story={answer.story} before={answer.before} /> : null}
      {answer ? <PageStoryCharts story={answer.story} host={status.host} /> : null}
      {answer ? <PageSourcesTable story={answer.story} host={status.host} /> : null}
    </div>
  );
}

type Source = PageStory["sources"][number];

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
 * conversions they went on to make, under its own top bar.
 */
function PageSourcesTable({ story, host }: { story: PageStory | undefined; host: string }) {
  const t = useTranslations("googleAnalytics.page.story");
  const sourceName = useSourceName();
  const [search, setSearch, term] = useSiteSearch("qs", "sources");
  const rows = story?.sources.map((row) => ({ ...row, label: sourceName(row) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.label) || matches(row.channel));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SOURCE_SORTS, { opening: "visits", name: (row) => row.label, table: "sources" });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, table: "sources" });
  const header = (words: string, title: string) => <span title={title}>{words}</span>;
  return (
    <DataTable<SourceRow>
      rows={pager.pageRows}
      rowKey={(row) => row.key}
      search={{ value: search, onChange: setSearch, placeholder: t("findSource") }}
      cardHeader={<TableBar
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
      />}
      sort={tableSort}
      empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: story?.live ? t("collecting") : term ? t("noMatch") : t("noSources") }}
      footer={pager.footer}
      columns={[
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
          cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.conversions)}</span>,
        },
      ]}
    />
  );
}
