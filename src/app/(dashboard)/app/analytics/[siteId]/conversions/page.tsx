"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { ChangeCell } from "../../_components/AnalyticsCells";
import { HandCoins, MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { AnalyticsGate, NothingCounted, countsAnything } from "../../_components/AnalyticsNotices";
import { BeforeLine } from "../../_components/AnalyticsFigures";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { changeOf, formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus, periodWord } from "../../_components/useAnalytics";
import { useFlowKindName } from "../../_components/ConversionParts";
import { ConversionsMapCard, ConversionsOverTimeCard } from "../../_components/ConversionsCards";
import { conversionsAsk } from "../../_components/seesAskFacts";

/** Google's own name for a shop's purchase and for a basket, as Analytics records them. */
const PURCHASE = "purchase";
const ADDED_TO_BASKET = "add_to_cart";

/**
 * Conversions, as drawn on the canvas "Conversions page, three ways" (board
 * "Main", approved 2026-10-30; docs/plans/active/conversions-and-agents-build-plan-2026-10-30.md,
 * phase 2): four figures, each against the month before — conversions, the
 * purchase (or the biggest conversion), the conversion rate, and added to
 * basket (or the next biggest); the visits it took for one purchase, day by
 * day; the map of conversions by page kind, channel, device or country; then
 * what counts as a conversion, a row an event, each opening the conversion's
 * own screen. What people did before converting, the flow and the lines by
 * kind left the page on the canvas ("we can remove this now"). Nothing
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
      <EventsTable status={status} worthOf={() => null} every />
    </div>
  );
}

function ConversionsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.conversions");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const nameOf = useEventName();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const currency = status.connection?.currency ?? null;
  const flow = answer?.flow ?? null;
  const kindName = useFlowKindName(flow?.kinds ?? []);
  // A classification's id in What Hakken sees read as its name; a channel's name left as it is.
  const flowKinds = new Set((flow?.kinds ?? []).map((kind) => kind.kind));
  const names = (value: string) => (flowKinds.has(value) ? kindName(value) : null);
  const kinds = [...(answer?.kinds ?? [])].sort((left, right) => right.count - left.count);
  const total = kinds.reduce((sum, kind) => sum + kind.count, 0);
  const totalBefore = answer?.kinds.every((kind) => kind.countBefore !== null) ? answer.kinds.reduce((sum, kind) => sum + (kind.countBefore ?? 0), 0) : null;
  // The second box: the shop's purchase, else the biggest conversion; the fourth: added to basket, else the next biggest.
  const shop = answer?.shop ?? null;
  const sells = shop !== null && shop.purchases > 0;
  const purchase = sells ? kinds.find((kind) => kind.eventName === PURCHASE) ?? null : null;
  // A shop's purchases are the orders Google counted (1,258 on the board), as the table says; the kind's count is the visits that bought.
  const second = purchase && shop
    ? { eventName: purchase.eventName, count: shop.purchases, countBefore: shop.purchasesBefore }
    : kinds[0] ?? null;
  const fourth = kinds.find((kind) => kind.eventName === ADDED_TO_BASKET && kind.eventName !== second?.eventName) ?? kinds.find((kind) => kind.eventName !== second?.eventName) ?? null;
  const worthOf = (eventName: string) => kinds.find((kind) => kind.eventName === eventName)?.value ?? null;
  // The conversion rate is the second box's conversion in every hundred visits (3.5% on the board: purchases over
  // visits), never every conversion over the visits, which counts a basket, a checkout and a purchase three times.
  const rate = answer && second && answer.visits > 0 ? second.count / answer.visits : null;
  const rateBefore = answer?.visitsBefore && second && second.countBefore !== null ? second.countBefore / answer.visitsBefore : null;
  const rateChange = rate !== null && rateBefore !== null ? rate - rateBefore : null;
  // What the eye hands the Insights team (sees-conversion-specialist-plan-2026-10-30.md): this page's figures and links.
  const hrefFor = useAnalyticsHref(args.siteId);
  const path = usePathname() ?? "";
  const tw = useTranslations("googleAnalytics.seesAsk");
  const tm = useTranslations("googleAnalytics.menu");
  const ask = answer ? conversionsAsk(
    { siteId: args.siteId, path, period: args.period, from: answer.from ?? null, to: answer.to ?? null, country: args.country ?? "", device: args.device, periodName: tf(`periods.${periodWord(period)}`).toLowerCase(), beforeName: tf(`before.${periodWord(period)}`) },
    (key, values) => tw(key, values),
    { funnel: tm("landingPages"), trackingHealth: tm("trackingHealth"), channels: tm("channels"), conversions: tm("conversions") },
    {
      visits: answer.visits, visitsBefore: answer.visitsBefore, total, totalBefore,
      // The shop's purchases as the page shows them (the orders Google counted), never the kind's visits that bought.
      kinds: kinds.map((kind) => (purchase && shop && kind.eventName === PURCHASE ? { ...kind, count: shop.purchases, countBefore: shop.purchasesBefore } : kind)),
      rateOf: second?.eventName ?? null, rate, rateBefore, currency, sells, nameOf, hrefFor,
    },
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="conversions" seen={answer?.seen} currency={currency} names={names} ask={ask} />

      {answer ? (
        <FigureRow>
          <Figure label={t("conversions")} emphasis value={formatNumber(total)} detail={<BeforeLine now={total} before={totalBefore} />} />
          {second ? <Figure label={purchase && shop ? t("purchases") : nameOf(second.eventName)} value={formatNumber(second.count)} detail={<BeforeLine now={second.count} before={second.countBefore} />} /> : null}
          <Figure
            label={t("conversionRate")}
            value={formatPercent(rate)}
            detail={
              rateBefore !== null && rateChange !== null ? (
                <ChangeLine by={rateChange}>
                  {t(rateChange > 0 ? "rateFromUp" : rateChange < 0 ? "rateFromDown" : "rateFromSame", { rate: formatPercent(rateBefore), before: tf(`before.${periodWord(period)}`) })}
                </ChangeLine>
              ) : (
                <span className="text-[12px] text-secondary">{t("ofVisits", { visits: formatNumber(answer.visits) })}</span>
              )
            }
          />
          {fourth ? <Figure label={nameOf(fourth.eventName)} value={formatNumber(fourth.count)} detail={<BeforeLine now={fourth.count} before={fourth.countBefore} />} /> : null}
        </FigureRow>
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      {/* The three shared parts (conversion-charts-plan.md, 2026-10-29), as the board keeps them: the line first, then the map. */}
      <ConversionsOverTimeCard opening={{ event: second?.eventName ?? null, show: "per" }} />
      <ConversionsMapCard />

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-foreground">{t("whatCountsTitle")}</h2>
          <p className="text-[12px] text-secondary">{t("whatCountsDescription")}</p>
        </div>
        <EventsTable status={status} worthOf={worthOf} />
      </div>
    </div>
  );
}

type EventRow = NonNullable<FunctionReturnType<typeof api.googleAnalyticsEventReads.analyticsEvents>>["rows"][number];
type NamedRow = EventRow & { name: string; worth: number | null };

const SORTS: SiteSortColumns<NamedRow, "name" | "times" | "visits" | "worth" | "change"> = {
  name: { value: (row) => row.name, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
  visits: { value: (row) => row.visits, first: "desc" },
  worth: { value: (row) => row.worth, first: "desc" },
  change: { value: (row) => changeOf(row.times, row.timesBefore), first: "desc" },
};
const nameOfRow = (row: { name: string }) => row.name;

/**
 * What counts as a conversion (board "Main", 2026-10-30): a row an event
 * this website counts, by its own name and Google's; how many times, the
 * visits that did it, what it was worth, and the change on the span before;
 * the busiest first, the search box above, "13 events" on its bar. Each row
 * opens the conversion's own screen. With `every`, on a website where
 * nothing counts yet, every event Google recorded instead (CV1).
 */
function EventsTable({ status, worthOf, every = false }: { status: AnalyticsStatus; worthOf: (eventName: string) => number | null; every?: boolean }) {
  const t = useTranslations("googleAnalytics.eventList");
  const tc = useTranslations("googleAnalytics.conversions");
  const router = useRouter();
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const currency = status.connection?.currency ?? null;
  const answer = useQuery(api.googleAnalyticsEventReads.analyticsEvents, args);
  const [search, setSearch, term] = useSiteSearch();
  const named: NamedRow[] | undefined = answer?.rows
    .filter((row) => every || row.counted)
    .map((row) => ({ ...row, name: nameOf(row.eventName), worth: worthOf(row.eventName) }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = named?.filter((row) => !matches || matches(row.name) || matches(row.eventName));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: nameOfRow });
  const pager = useSitePager(sorted, { isLoading: answer === undefined || (answer?.live ?? false) });
  const href = (row: EventRow) => hrefFor("events/event", { key: row.eventName });

  return (
    <DataTable
      rows={pager.pageRows}
      rowKey={(row) => row.eventName}
      onRowClick={(row) => router.push(href(row))}
      search={{ value: search, onChange: setSearch, placeholder: t("findEvent") }}
      cardHeader={
        <TableBar
          footer={pager.footer}
          noun="events"
          actions={sorted ? (
            <ListDownload
              label={t("download")}
              fileName={`${status.host}-google-analytics-conversions`}
              rows={sorted}
              columns={[
                { header: t("csv.event"), value: (row) => row.name },
                { header: t("csv.google"), value: (row) => row.eventName },
                { header: tc("columns.conversions"), value: (row) => row.times },
                { header: t("csv.visits"), value: (row) => row.visits },
                { header: tc("columns.worth"), value: (row) => (row.worth === null ? null : row.worth / 100) },
                { header: t("csv.change"), value: (row) => { const change = changeOf(row.times, row.timesBefore); return change === null ? null : Math.round(change * 1000) / 10; } },
              ]}
            />
          ) : undefined}
        >
          {/* The bar says the count alone, as drawn (board "Main"); only a list still being collected says so. */}
          {answer?.live ? <span className="text-[12px] text-secondary">{t("collecting")}</span> : null}
        </TableBar>
      }
      sort={tableSort}
      empty={{ icon: <MousePointerClick className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : answer?.preparing ? t("preparing") : every ? t("empty") : tc("empty") }}
      footer={pager.footer}
      columns={[
        {
          key: "name",
          header: t("columns.event"),
          sortable: true,
          className: CUT_COLUMN.first,
          cell: (row) => (
            // Its own name, then Google's ("Purchase · purchase", as drawn).
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0"><RecordLinkCell href={href(row)} cut>{row.name}</RecordLinkCell></span>
              <span className="shrink-0 font-mono text-[11px] text-muted">{row.eventName}</span>
            </span>
          ),
        },
        { key: "times", header: tc("columns.conversions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.times)}</span> },
        { key: "visits", header: tc("columns.visits"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.visits)}</span> },
        {
          key: "worth",
          header: tc("columns.worth"),
          align: "right",
          sortable: true,
          cell: (row) => (row.worth ? <span className="font-mono text-[12px] text-foreground">{formatMoney(row.worth, currency)}</span> : <span className="text-[12px] text-muted">–</span>),
        },
        { key: "change", header: <span title={tc("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={changeOf(row.times, row.timesBefore)} /> },
      ]}
    />
  );
}
