"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar, type TableNoun } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../../sites/_components/SiteCells";
import { ListDownload } from "../../../../sites/_components/SiteDownloads";
import { SiteViewSwitch } from "../../../../sites/_components/SiteViewSwitch";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { ChangeCell, PageLink } from "../../../_components/AnalyticsCells";
import { ChannelsChart, TopBars } from "../../../_components/AnalyticsChart";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { useLiveAsk } from "../../../_components/AnalyticsListScreen";
import { formatPercent, pathOf } from "../../../_components/analyticsFormat";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, type AnalyticsStatus } from "../../../_components/useAnalytics";

type Answer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsEventReads.analyticsEvent>>;
/** A row of what it was about, or of its pages: a page carries its title. */
type AboutRow = Answer["pages"][number];
type Detail = NonNullable<Answer["detail"]>;
type Showing = Detail | "pages";

/** The bars' ten biggest, as drawn. */
const BARS = 10;

/** What each list counts, for its table's count. */
const NOUNS: Record<Showing, TableNoun> = { linkUrl: "links", fileName: "files", searchTerm: "searches", percentScrolled: "depths", videoTitle: "videos", pages: "pages" };

const SORTS: SiteSortColumns<AboutRow, "name" | "times" | "people" | "change"> = {
  name: { value: (row) => row.title ?? row.label, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  people: { value: (row) => row.people, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
};
const nameOfRow = (row: AboutRow) => row.title ?? row.label;

/**
 * An event's own screen (GA30; §18.2 board 23): What Hakken sees, its times,
 * people and visits with one against the span before and the website's, its
 * times a day, and what it was about — the links clicked, the files, the
 * words searched, how far people scrolled, the videos — as bars and a table
 * switching to the pages it happened on. What it was about and its pages are
 * asked of Google when the screen opens and held until the next collection.
 */
export default function AnalyticsEventScreen() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <EventBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function EventBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.eventScreen");
  const tl = useTranslations("googleAnalytics.eventList");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [device] = useDevice();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const event = useSearchParams().get("key") ?? "";
  const answer = useQuery(api.googleAnalyticsEventReads.analyticsEvent, event ? { ...args, event } : "skip");
  const asking = useLiveAsk(answer?.live ? { ...args, event } : null);
  // One device's times a day are asked with Events' own for that device.
  const askingDays = useLiveAsk(answer && args.device ? { ...args, pages: "eventSeries" } : null);
  const detail = answer?.detail ?? null;
  // Opened on what it was about, when Google records that for the event; else, and when switched, its pages.
  const [chosen, setChosen] = useSiteParam<"about" | "pages">("show", "about", ["about", "pages"]);
  const showing: Showing = detail && chosen === "about" ? detail : "pages";
  const [search, setSearch, term] = useSiteSearch();
  const currency = status.connection?.currency ?? null;
  const labelOf = (row: AboutRow) => (showing === "percentScrolled" ? t("scrolled", { percent: row.label }) : row.title ?? (showing === "pages" ? pathOf(row.label) : row.label));
  const rows: AboutRow[] | undefined = answer && !answer.live ? (showing === "pages" ? answer.pages : answer.about) : undefined;
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(labelOf(row)) || matches(row.label));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: nameOfRow });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const periodName = tf(`periods.${period}`);
  const bar = [periodName, tf(`devices.${device}`).toLowerCase()].join(" · ");
  const name = nameOf(event);
  const what = t.has(`what.${event}`) ? t(`what.${event}`, { host: status.host }) : null;
  const figures = answer?.figures ?? null;
  // The bars stay on what it was about, as drawn, whichever list the table shows.
  const opening: Showing = detail ?? "pages";

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("events") }}
        icon={<MousePointerClick className="h-5 w-5 text-brand" />}
        title={event ? name : "…"}
        description={what ? t("descriptionWhat", { google: event, what }) : t("description", { google: event })}
        pills={answer?.counted ? <StatusLabel tone="success">{t("countsAsConversion")}</StatusLabel> : undefined}
      />
      <AnalyticsSees screen="event" seen={answer?.seen} currency={currency} />

      {figures ? (
        <FigureRow columns={4}>
          <Figure label={t("times")} value={formatNumber(figures.times)} detail={<BeforeLine now={figures.times} before={figures.timesBefore} />} />
          <Figure label={t("people")} value={formatNumber(figures.people)} detail={<span className="text-secondary">{figures.peopleShare === null ? "–" : t("peopleShare", { rate: formatPercent(figures.peopleShare) })}</span>} />
          <Figure label={t("visits")} value={formatNumber(figures.visits)} detail={<span className="text-secondary">{figures.visitsShare === null ? "–" : t("visitsShare", { rate: formatPercent(figures.visitsShare) })}</span>} />
          {/* People, not visits: Google cannot join an event to conversions in the same visit (Anthony, 2026-10-11). */}
          <Figure
            label={t("after")}
            value={answer?.after ? formatNumber(answer.after.converted) : "–"}
            detail={(
              <span className="text-secondary">
                {!answer?.counting ? t("afterNothingCounts") : answer.after ? t("afterOf", { did: answer.after.did }) : answer.live ? t("asking") : t("afterUnknown")}
              </span>
            )}
          />
        </FigureRow>
      ) : null}

      {(answer?.live && asking === "FAILED") || askingDays === "FAILED" ? <Notice tone="warning">{t("askFailed")}</Notice> : null}
      <ChannelsChart
        channels={[t("times")]}
        rest={false}
        points={(answer?.points ?? []).map((point) => ({ day: point.day, visits: [point.times] }))}
        host={status.host}
        from={null}
        to={null}
        exportName={`google-analytics-event-${event}`}
        title={{ ...t.raw("chartTitle") as { day: string; week: string; month: string }, hint: t("chartHint", { period: periodName }) }}
      />
      <TopBars
        title={t(`about.${opening}`)}
        hint={t("barsHint", { period: periodName })}
        rows={answer && !answer.live ? (opening === "pages" ? answer.pages : answer.about).slice(0, BARS).map((row) => ({
          label: opening === "percentScrolled" ? t("scrolled", { percent: row.label }) : opening === "pages" ? pathOf(row.label) : row.label,
          value: row.times,
        })) : undefined}
        measure={tl("times")}
        exportName={`google-analytics-event-${event}-bars`}
        host={status.host}
        from={null}
        to={null}
      />

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: t(`find.${showing}`) }}
        filters={detail ? (
          <SiteViewSwitch
            label={t("showing")}
            options={[{ value: detail, label: t(`about.${detail}`) }, { value: "pages", label: t("about.pages") }]}
            value={showing}
            onChange={(next) => setChosen(next === "pages" ? "pages" : "about")}
          />
        ) : undefined}
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun={NOUNS[showing]}
            actions={sorted ? (
              <ListDownload
                label={t("download")}
                fileName={`${status.host}-google-analytics-${event}-${showing}`}
                rows={sorted}
                columns={[
                  { header: t(`column.${showing}`), value: (row) => labelOf(row) },
                  ...(showing === "pages" ? [{ header: t("column.pages"), value: (row: AboutRow) => row.label }] : []),
                  { header: tl("columns.times"), value: (row) => row.times },
                  { header: tl("columns.people"), value: (row) => row.people },
                  { header: tl("csv.change"), value: (row) => (row.change === null ? null : Math.round(row.change * 1000) / 10) },
                ]}
              />
            ) : undefined}
          >
            <span className="text-[12px] text-secondary">{answer?.live ? t("asking") : bar}</span>
          </TableBar>
        }
        sort={tableSort}
        empty={{ icon: <MousePointerClick className="h-8 w-8 text-muted/30" />, label: answer?.live ? t("asking") : term ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        columns={[
          {
            key: "name",
            header: t(`column.${showing}`),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => showing === "pages"
              ? <PageLink address={row.label} href={row.key.startsWith("~") ? hrefFor("all-pages/page", { key: row.key }) : null} title={row.title} />
              : showing === "linkUrl" && /^https?:\/\//.test(row.key)
                ? <a href={row.key} target="_blank" rel="noopener noreferrer" title={row.key} className="block truncate text-[13px] text-info hover:underline">{row.label}</a>
                : <span className="block truncate text-[13px] text-foreground" title={labelOf(row)}>{labelOf(row)}</span>,
          },
          { key: "times", header: tl("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> },
          { key: "people", header: tl("columns.people"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.people)}</span> },
          { key: "change", header: <span title={tl("columns.changeTitle")}>{tl("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={row.change} /> },
        ]}
      />
    </div>
  );
}
