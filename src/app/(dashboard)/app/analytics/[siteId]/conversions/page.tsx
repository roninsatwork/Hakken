"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { EVENT_KINDS, type EventKind } from "@/convex/utils/analyticsEvents";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { ChangeCell } from "../../_components/AnalyticsCells";
import { HandCoins, MousePointerClick } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Change } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { AnalyticsGate, NothingCounted, countsAnything } from "../../_components/AnalyticsNotices";
import { BeforeLine } from "../../_components/AnalyticsFigures";
import { AnalyticsSees, eventList } from "../../_components/AnalyticsSees";
import { changeOf, formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";
import { ConversionsChart } from "../../_components/AnalyticsChart";
import { BeforeConvertingCard, ConversionFlowCard, ConversionsByKind, useFlowKindName } from "../../_components/ConversionParts";

/**
 * Conversions, with Events merged in (docs/plans/active/ga-conversions-visitors-plan.md
 * CV1, CV2; drawn and approved 2026-10-14): What Hakken sees; four figures —
 * conversions, value, conversion rate and the key events not counted (the
 * kinds that happened when every key event counts); Conversions over time
 * (GA35); how visits reached a conversion, by page classification;
 * conversions by page classification; what people did before converting;
 * then every event, the conversions first. A shop keeps its revenue,
 * purchases and average order first (GA7, board 8 as locked). Nothing
 * counted yet says how to choose, under its own box (screen 16), with every
 * event below it.
 */
export default function AnalyticsConversionsPage() {
  const t = useTranslations("googleAnalytics.conversions");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<HandCoins className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          {countsAnything(status) ? <ConversionsBody status={status} /> : <NothingCountedBody status={status} />}
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

/** Nothing counted yet (§15, screen 16): the visits are here, the key events the property does record, and every event (CV1). */
function NothingCountedBody({ status }: { status: AnalyticsStatus }) {
  const args = useAnalyticsArgs();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="conversions" seen={answer?.seen} currency={status.connection?.currency} />
      <NothingCounted status={status} siteId={args.siteId} />
      <EventsTable status={status} />
    </div>
  );
}

function ConversionsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.conversions");
  const tc = useTranslations("googleAnalytics.channelsPage.figures");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const nameOf = useEventName();
  const locale = useLocale();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, args);
  const currency = status.connection?.currency ?? null;
  const flow = answer?.flow ?? null;
  const kindName = useFlowKindName(flow?.kinds ?? []);
  // A classification's id in What Hakken sees read as its name; a channel's name left as it is.
  const flowKinds = new Set((flow?.kinds ?? []).map((kind) => kind.kind));
  const names = (value: string) => (flowKinds.has(value) ? kindName(value) : null);
  const kinds = [...(answer?.kinds ?? [])].sort((left, right) => right.count - left.count);
  const shop = answer?.shop ?? null;
  const total = kinds.reduce((sum, kind) => sum + kind.count, 0);
  const totalBefore = answer?.kinds.every((kind) => kind.countBefore !== null) ? answer.kinds.reduce((sum, kind) => sum + (kind.countBefore ?? 0), 0) : null;
  const value = kinds.reduce((sum, kind) => sum + (kind.value ?? 0), 0);
  const valueBefore = answer?.kinds.every((kind) => kind.setIn === null || kind.valueBefore !== null)
    ? answer.kinds.reduce((sum, kind) => sum + (kind.valueBefore ?? 0), 0)
    : null;
  const rate = answer && answer.visits > 0 ? total / answer.visits : null;
  const rateBefore = answer?.visitsBefore && totalBefore !== null ? totalBefore / answer.visitsBefore : null;
  const happened = kinds.filter((kind) => kind.count > 0);
  const others = kinds.filter((kind) => kind.setIn !== "REVENUE");
  const sales = shop !== null && shop.purchases > 0;
  const fired = answer?.fired ?? [];
  const firedCount = fired.reduce((sum, event) => sum + event.count, 0);
  const happenedLine = happened.length === 0 ? t("noKind")
    : happened.length === kinds.length && kinds.length > 1 ? t("everyKind")
      : eventList(happened.map((kind) => kind.eventName).join(","), nameOf, locale);

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="conversions" seen={answer?.seen} currency={currency} names={names} />

      {answer ? (
        sales && shop ? (
          <FigureRow>
            <Figure label={t("revenue")} emphasis value={formatMoney(shop.revenue, currency)} detail={<BeforeLine now={shop.revenue} before={shop.revenueBefore} />} />
            <Figure label={t("purchases")} value={formatNumber(shop.purchases)} detail={<BeforeLine now={shop.purchases} before={shop.purchasesBefore} />} />
            <Figure
              label={t("averageOrder")}
              value={formatMoney(Math.round(shop.revenue / shop.purchases), currency)}
              detail={<BeforeLine now={shop.revenue / shop.purchases} before={shop.purchasesBefore ? (shop.revenueBefore ?? 0) / shop.purchasesBefore : null} />}
            />
            {others[0] ? (
              <Figure
                label={nameOf(others[0].eventName)}
                value={formatNumber(others[0].count)}
                detail={<span className="text-[12px] text-secondary">{formatMoney(others[0].value, currency)} · <Change by={changeOf(others[0].count, others[0].countBefore) === null ? null : Math.round(changeOf(others[0].count, others[0].countBefore)! * 1000) / 10} format={(by) => `${by.toFixed(1)}%`} /></span>}
              />
            ) : <Figure label={t("conversionRate")} value={formatPercent(rate)} detail={t("ofVisits", { visits: formatNumber(answer.visits) })} />}
          </FigureRow>
        ) : (
          <FigureRow>
            <Figure label={t("conversions")} value={formatNumber(total)} detail={<BeforeLine now={total} before={totalBefore} />} />
            <Figure label={t("value")} emphasis value={formatMoney(value, currency)} detail={<BeforeLine now={value} before={answer.visitsBefore === null ? null : valueBefore} />} />
            <Figure
              label={t("conversionRate")}
              value={formatPercent(rate)}
              detail={(
                <span className="text-[12px] text-secondary">
                  {rateBefore !== null
                    ? t("rateBefore", { rate: formatPercent(rateBefore), before: tf(`before.${period}`) })
                    : t("ofVisits", { visits: formatNumber(answer.visits) })}
                </span>
              )}
            />
            {/* The key events not counted, as Channels names them (CV2); the kinds that happened when every key event counts. */}
            {fired.length > 0 ? (
              <Figure
                label={tc("uncounted")}
                value={formatNumber(firedCount)}
                detail={<span className="text-[12px] text-secondary">{tc("uncountedDetail", { events: eventList(fired.map((event) => event.eventName).join(","), nameOf, locale), count: fired.length })}</span>}
              />
            ) : (
              <Figure
                label={t("kindsHappened")}
                value={t("kindsOf", { happened: happened.length, counted: kinds.length })}
                detail={<span className="text-[12px] text-secondary">{happened.length === 1 ? t("onlyKind", { name: happenedLine }) : happenedLine}</span>}
              />
            )}
          </FigureRow>
        )
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      {/* Its chart, agreed on 9 Oct and kept (GA35; Anthony, 2026-10-14: "keep the Conversions over time chart"). */}
      <ConversionsChart
        days={chart?.points ?? []}
        events={chart?.events ?? []}
        names={nameOf}
        host={status.host}
        from={answer?.from ?? null}
        to={answer?.to ?? null}
        currency={currency}
      />
      <ConversionFlowCard flow={flow} currency={currency} />
      <ConversionsByKind flow={flow} />
      <BeforeConvertingCard before={answer?.before ?? null} />
      <EventsTable status={status} />
    </div>
  );
}

type EventRow = NonNullable<FunctionReturnType<typeof api.googleAnalyticsEventReads.analyticsEvents>>["rows"][number];

/** A row's place in the opening order: the conversions, then the key events not counted, then the rest (CV5). */
const rankOf = (row: EventRow) => (row.counted ? 2 : row.keyEvent ? 1 : 0);

const SORTS: SiteSortColumns<EventRow & { name: string }, "name" | "times" | "people" | "conversion" | "change"> = {
  name: { value: (row) => row.name, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  people: { value: (row) => row.people, first: "desc" },
  // The conversions first, the busiest of each first.
  conversion: { value: (row) => rankOf(row) * 1e12 + row.times, first: "desc" },
  change: { value: (row) => changeOf(row.times, row.timesBefore), first: "desc" },
};
const nameOfRow = (row: { name: string }) => row.name;

/**
 * Every event Google Analytics recorded, on Conversions
 * (docs/plans/active/ga-conversions-visitors-plan.md CV5; Events joined
 * Conversions, CV1): by its own name and Google's, its times and people,
 * whether it counts as a conversion — "Not counted" for a key event that does
 * not — and the change, opening with the conversions first. A Kind filter and
 * the search box above it; each row opens the event's own screen.
 */
function EventsTable({ status }: { status: AnalyticsStatus }) {
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
  const named = answer?.rows.map((row) => ({ ...row, name: nameOf(row.eventName) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = named?.filter((row) => (!kind || row.kind === kind) && (!matches || matches(row.name) || matches(row.eventName)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "conversion", name: nameOfRow });
  const pager = useSitePager(sorted, { isLoading: answer === undefined || (answer?.live ?? false) });
  const bar = [tf(`periods.${period}`), tf(`devices.${device}`).toLowerCase(), t("bar")].join(" · ");
  const href = (row: EventRow) => hrefFor("events/event", { key: row.eventName });

  return (
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
        {
          key: "conversion",
          header: t("columns.conversion"),
          sortable: true,
          cell: (row) => (row.counted ? <StatusLabel tone="success">{t("counts")}</StatusLabel>
            : row.keyEvent ? <StatusLabel tone="warning">{t("notCounted")}</StatusLabel>
              : <span className="text-[12px] text-muted">–</span>),
        },
        { key: "change", header: <span title={t("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={changeOf(row.times, row.timesBefore)} /> },
      ]}
    />
  );
}
