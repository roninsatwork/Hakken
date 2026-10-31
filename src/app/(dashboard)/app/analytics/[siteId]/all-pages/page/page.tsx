"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../../sites/_components/SiteCells";
import { ListDownload } from "../../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { PageLink } from "../../../_components/AnalyticsCells";
import { VisitsChart } from "../../../_components/AnalyticsChart";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { formatMoney, formatPercent, formatPerVisit, formatTime, pathOf } from "../../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, usePeriod, type AnalyticsStatus, periodWord } from "../../../_components/useAnalytics";
import { backTarget } from "../../../_components/analyticsBack";
import { PageStoryCharts, PageStoryFigures, PageStoryNotices, useStoryClicksTable, useStorySourcesTable } from "../../../_components/PageStory";
import { PageConversionsByChannel } from "../../../_components/ConversionParts";
import { ConversionExplorerCard } from "../../../_components/ConversionExplorer";
import { PageVisitorsCard } from "../../../_components/PageVisitors";

type Answer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsPageReads.analyticsPage>>;
type BeforeRow = Answer["before"][number];

const SORTS: SiteSortColumns<BeforeRow, "name" | "views" | "share"> = {
  name: { value: (row) => row.title ?? row.label, first: "asc" },
  views: { value: (row) => row.views, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
};

/**
 * A page's own screen from All pages (GA29; §18.2 board 21): What Hakken
 * sees, its views, people, time and the conversions made on it, its views a
 * day, and where visitors were just before — the website's own pages by
 * title and address, other websites by name, and "No page before" — as bars
 * and a table. Its days and the pages before are asked of Google when the
 * screen opens and held until the next collection (GA23).
 *
 * Its story, drawn and approved 2026-10-13
 * (docs/plans/active/analytics-page-screen-plan.md §2): the visits that
 * started on it and their conversions, named apart from those made here;
 * different pages a visit and how far it is read; each source on its own
 * line; where its views went next; who reads it; and its page group beside
 * it — asked of Google in a second ask, so the kept figures show at once.
 *
 * Under its views a day, Conversions' "Visits needed for one conversion" and
 * its squares for this page alone (Anthony, 2026-10-20): the visits that
 * started here for one conversion, by channel and kind of conversion, set
 * against the period before or a year before (page-conversion-explorer-plan.md), their
 * conversions by the channel they came from, and each channel's visits that
 * started here beside the website's.
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
  const tg = useTranslations("googleAnalytics.figures");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const pageHref = usePageHref();
  // Back to the screen this page was opened from, as it was (landing-pages-flow-plan.md LF9); else All pages.
  const back = backTarget(useSearchParams().get("from"));
  const tm = useTranslations("googleAnalytics.menu");
  const backLabel = (to: NonNullable<typeof back>) => to.screen === "page" ? t("backToPage")
    : to.screen === "conversionPages" ? t("backToConversionPages")
    : to.screen === "channel" ? to.name ?? tm("channels")
      : to.screen === "event" ? to.name ?? tm("events")
        : tm(to.screen);
  const page = useSearchParams().get("key") ?? "";
  const answer = useQuery(api.googleAnalyticsPageReads.analyticsPage, page ? { ...args, page } : "skip");
  const sourcesTable = useStorySourcesTable(answer?.story, status.host);
  const clicksTable = useStoryClicksTable(answer?.story, status.host);
  const [search, setSearch, term] = useSiteSearch();
  const currency = status.connection?.currency ?? null;
  const address = answer?.address ?? "";
  const row = answer?.row ?? null;
  const rows = answer?.before;
  const nameOf = (entry: BeforeRow) => entry.kind === "none" ? t("noPageBefore") : entry.kind === "other" ? t("otherBefore") : entry.title ?? (entry.kind === "page" ? pathOf(entry.label) : entry.label);
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((entry) => !matches || matches(nameOf(entry)) || matches(entry.kind === "page" ? pathOf(entry.label) : entry.key));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "views", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const named = { period: tf(`periods.${periodWord(period)}`) };
  const description = answer ? (answer.title
    ? (answer.group ? t("descriptionInGroupTitled", { title: answer.title, host: status.host, group: answer.group }) : t("descriptionTitled", { title: answer.title, host: status.host }))
    : (answer.group ? t("descriptionInGroup", { host: status.host, group: answer.group }) : t("description", { host: status.host }))) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back ? { label: backLabel(back), href: `/app/analytics/${args.siteId}/${back.path}` } : { label: t("back"), href: hrefFor("all-pages") }}
        icon={<FileText className="h-5 w-5 text-brand" />}
        title={answer ? pathOf(address) : "…"}
        description={description}
        action={/^https?:\/\//.test(address) ? (
          <a href={address} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-secondary hover:text-info">
            {t("openPage")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : undefined}
      />
      {answer === null ? <Notice>{t("notFound")}</Notice> : null}

      <AnalyticsSees screen="page" seen={answer && !answer.live ? answer.seen : undefined} currency={currency} data={answer} />

      {answer && !row ? <Notice>{t("noViews", { period: named.period.toLowerCase() })}</Notice> : null}
      {row ? (
        <FigureRow columns={4}>
          <Figure label={t("views")} value={formatNumber(row.views)} detail={<BeforeLine now={row.views} before={answer?.viewsBefore} />} />
          <Figure label={t("people")} value={formatNumber(row.people)} detail={<span className="text-secondary">{t("viewsEach", { views: formatPerVisit(row.people > 0 ? row.views / row.people : null) })}</span>} />
          <Figure label={t("time")} value={formatTime(row.timePerVisit)} detail={<span className="text-secondary">{t("timeLine")}</span>} />
          <Figure
            label={t("conversions")}
            value={formatNumber(row.conversions)}
            detail={(
              <span className="flex flex-col">
                <span className="text-secondary">{tg("ofValue", { value: formatMoney(row.value, currency) })}</span>
                {/* None made here, some from the visits that started here: said where they were made, so 0 and 1 never read as a contradiction. */}
                {row.conversions === 0 && (answer?.story.started?.conversions ?? 0) > 0
                  ? <span className="text-secondary">{t("madeElsewhere", { count: answer?.story.started?.conversions ?? 0 })}</span>
                  : null}
                {row.conversions === 0 && row.conversionsBefore === 0
                  ? <span className="text-[12px] text-muted">{t("noneEither", { before: tf(`before.${periodWord(period)}`) })}</span>
                  : <BeforeLine now={row.conversions} before={row.conversionsBefore} />}
              </span>
            )}
          />
        </FigureRow>
      ) : null}
      {answer ? <PageStoryFigures story={answer.story} currency={currency} /> : null}

      {answer ? <PageStoryNotices story={answer.story} /> : null}
      <VisitsChart days={answer && !answer.live ? answer.points : []} host={status.host} from={null} to={null} exportName="google-analytics-page" viewsOnly />
      {/* Conversions for this page alone (Anthony, 2026-10-20): configurable by channel and conversion
          (page-conversion-explorer-plan.md), then their conversions by channel. The earlier "Visits needed for one
          conversion" went once this covered it ("remove the redundant charts"). */}
      {answer ? <ConversionExplorerCard page={page} /> : null}
      {answer ? <PageConversionsByChannel page={page} /> : null}
      {/* Its visitors, one chart in place of five — by channel, source, first visit or back again, the place just
          before and the page next (page-visitors-explorer-plan.md). */}
      {answer ? <PageVisitorsCard page={page} story={answer.story} before={answer.before} /> : null}
      {answer ? <PageStoryCharts story={answer.story} host={status.host} /> : null}
      {answer ? <DataTable {...sourcesTable} /> : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(entry) => entry.key}
        search={{ value: search, onChange: setSearch, placeholder: t("findBefore") }}
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="pagesAndWebsites"
            title={t("beforeTitle")}
            description={t("beforeDescription", { page: pathOf(address) })}
            actions={rows ? (
              <ListDownload
                label={t("download")}
                fileName={`${status.host}-google-analytics-page-before`}
                rows={sorted ?? []}
                columns={[
                  { header: t("pageBefore"), value: (entry) => nameOf(entry) },
                  { header: t("address"), value: (entry) => entry.kind === "none" || entry.kind === "other" ? "" : entry.kind === "site" ? (entry.hosts ?? [entry.key]).join(", ") : entry.label },
                  { header: t("views"), value: (entry) => entry.views },
                  { header: `${t("share")} (%)`, value: (entry) => Math.round(entry.share * 1000) / 10 },
                ]}
              />
            ) : undefined}
          />
        }
        sort={tableSort}
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: answer?.live ? t("collecting") : term ? t("noMatch") : t("noBefore") }}
        footer={pager.footer}
        columns={[
          {
            key: "name",
            header: t("pageBefore"),
            sortable: true,
            className: CUT_COLUMN.first,
            // The page cell for all three: a page's title over its address, a website's name over its own, none over what it means.
            cell: (entry) => entry.kind === "page"
              ? <PageLink address={entry.label} href={pageHref(entry.key)} title={entry.title} />
              : <PageLink address={entry.kind === "none" ? t("noPageBeforeLine") : entry.kind === "other" ? t("otherBeforeLine") : (entry.hosts ?? [entry.key]).join(", ")} href={null} title={nameOf(entry)} />,
          },
          { key: "views", header: t("views"), align: "right", sortable: true, cell: (entry) => <span className="font-mono text-[12px] text-foreground">{formatNumber(entry.views)}</span> },
          { key: "share", header: t("share"), align: "right", sortable: true, cell: (entry) => <span className="font-mono text-[12px] text-secondary">{formatPercent(entry.share)}</span> },
        ]}
      />
      {answer ? <DataTable {...clicksTable} /> : null}
    </div>
  );
}
