"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { EVENT_KINDS, type EventKind } from "@/convex/utils/analyticsEvents";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ChangeCell } from "../../_components/AnalyticsCells";
import { ChannelsChart, TopBars } from "../../_components/AnalyticsChart";
import { changeOf } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";

type EventRow = NonNullable<FunctionReturnType<typeof api.googleAnalyticsEventReads.analyticsEvents>>["rows"][number];

/** The bars' ten busiest, as drawn. */
const BARS = 10;

const SORTS: SiteSortColumns<EventRow & { name: string }, "name" | "times" | "people" | "conversion" | "change"> = {
  name: { value: (row) => row.name, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  people: { value: (row) => row.people, first: "desc" },
  conversion: { value: (row) => (row.counted ? 1 : 0), first: "desc" },
  change: { value: (row) => changeOf(row.times, row.timesBefore), first: "desc" },
};
const nameOfRow = (row: { name: string }) => row.name;

/**
 * Events (GA30; §18.2 board 22): everything Google Analytics recorded people
 * doing on the website, not only the conversions — What Hakken sees, scrolls
 * and link clicks a day, the times each event happened as bars, and every
 * event by its own name and Google's, with its times, people, whether it
 * counts as a conversion and the change, a Kind filter above. Each opens its
 * own screen. A device chosen is asked of Google when the screen opens.
 */
export default function AnalyticsEventsPage() {
  const t = useTranslations("googleAnalytics.eventList");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const [period] = usePeriod();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MousePointerClick className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { before: tf(`before.${period}`) })} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <EventsBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function EventsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.eventList");
  const tf = useTranslations("googleAnalytics.filters");
  const router = useRouter();
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [device] = useDevice();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const answer = useQuery(api.googleAnalyticsEventReads.analyticsEvents, args);
  const [kind, setKind] = useSiteParam<EventKind | "">("kind", "", ["", ...EVENT_KINDS]);
  const [search, setSearch, term] = useSiteSearch();
  const currency = status.connection?.currency ?? null;
  const named = answer?.rows.map((row) => ({ ...row, name: nameOf(row.eventName) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = named?.filter((row) => (!kind || row.kind === kind) && (!matches || matches(row.name) || matches(row.eventName)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: nameOfRow });
  const pager = useSitePager(sorted, { isLoading: answer === undefined || (answer?.live ?? false) });
  const periodName = tf(`periods.${period}`);
  const bar = [periodName, tf(`devices.${device}`).toLowerCase()].join(" · ");
  const href = (row: EventRow) => hrefFor("events/event", { key: row.eventName });

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="events" seen={answer?.seen} currency={currency} />
      {answer?.preparing ? <Notice>{t("preparing")}</Notice> : null}
      <ChannelsChart
        channels={[nameOf("scroll"), nameOf("click")]}
        rest={false}
        points={(answer && !answer.live ? answer.points : []).map((point) => ({ day: point.day, lastDay: point.lastDay, visits: [point.scroll, point.click] }))}
        host={status.host}
        from={null}
        to={null}
        exportName="google-analytics-scrolls-and-clicks"
        title={{ ...t.raw("chartTitle") as { day: string; week: string; month: string }, hint: t("chartHint", { period: periodName }) }}
      />
      <TopBars
        title={t("barsTitle")}
        hint={t("barsHint", { period: periodName })}
        rows={answer && !answer.live ? named?.slice(0, BARS).map((row) => ({ label: row.name, value: row.times })) : undefined}
        measure={t("times")}
        exportName="google-analytics-events"
        host={status.host}
        from={null}
        to={null}
      />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.eventName}
        onRowClick={(row) => router.push(href(row))}
        search={{ value: search, onChange: setSearch, placeholder: t("findEvent") }}
        filters={
          <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as EventKind | "")}>
            <option value="">{t("everyKind")}</option>
            {EVENT_KINDS.map((entry) => <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="events"
            actions={sorted ? (
              <ListDownload
                label={t("download")}
                fileName={`${status.host}-google-analytics-events`}
                rows={sorted}
                columns={[
                  { header: t("csv.event"), value: (row) => row.name },
                  { header: t("csv.google"), value: (row) => row.eventName },
                  { header: t("csv.times"), value: (row) => row.times },
                  { header: t("csv.people"), value: (row) => row.people },
                  { header: t("csv.visits"), value: (row) => row.visits },
                  { header: t("csv.counts"), value: (row) => (row.counted ? t("csv.yes") : t("csv.no")) },
                  { header: t("csv.change"), value: (row) => { const change = changeOf(row.times, row.timesBefore); return change === null ? null : Math.round(change * 1000) / 10; } },
                ]}
              />
            ) : undefined}
          >
            <span className="text-[12px] text-secondary">{answer?.live ? t("collecting") : bar}</span>
          </TableBar>
        }
        sort={tableSort}
        empty={{ icon: <MousePointerClick className="h-8 w-8 text-muted/30" />, label: term || kind ? t("noMatch") : answer?.preparing ? t("preparing") : t("empty") }}
        footer={pager.footer}
        columns={[
          {
            key: "name",
            header: t("columns.event"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => (
              // Its own name, then Google's ("Page viewed · page_view", as drawn).
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="min-w-0"><RecordLinkCell href={href(row)} cut>{row.name}</RecordLinkCell></span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{row.eventName}</span>
              </span>
            ),
          },
          { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> },
          { key: "people", header: t("columns.people"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.people)}</span> },
          { key: "conversion", header: t("columns.conversion"), sortable: true, cell: (row) => (row.counted ? <StatusLabel tone="success">{t("counts")}</StatusLabel> : <span className="text-[12px] text-muted">–</span>) },
          { key: "change", header: <span title={t("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={changeOf(row.times, row.timesBefore)} /> },
        ]}
      />
    </div>
  );
}
