"use client";

import { useQuery } from "convex/react";
import { HandCoins, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Change } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsGate, NothingCounted, countsAnything } from "../../_components/AnalyticsNotices";
import { BeforeLine } from "../../_components/AnalyticsFigures";
import { AnalyticsPanel, TopList } from "../../_components/AnalyticsPanels";
import { AnalyticsSees, eventList } from "../../_components/AnalyticsSees";
import { changeOf, formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";
import { ConversionsChart, ListTopBars } from "../../_components/AnalyticsChart";

/** Where the conversions came from: their landing pages, or their channels (§15, screen 9). */
const SOURCES = ["landing", "channel"] as const;
type Source = (typeof SOURCES)[number];

/**
 * Conversions (§5; §11 boards 7 and 8; §15 screen 9, signed off 2026-10-10):
 * What Hakken sees; four figures — conversions, value, conversion rate and
 * the kinds that happened ("1 of 4"); What counts, each kind with how many,
 * its value and change; then Where they came from, one list switching between
 * landing pages and channels. The chart is left off (§15). A shop keeps its
 * revenue, purchases and average order first (GA7, board 8 as locked).
 * Nothing counted yet says how to choose, under its own box (screen 16).
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

/** Nothing counted yet (§15, screen 16): the visits are here, and the key events the property does record. */
function NothingCountedBody({ status }: { status: AnalyticsStatus }) {
  const args = useAnalyticsArgs();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="conversions" seen={answer?.seen} currency={status.connection?.currency} />
      <NothingCounted status={status} siteId={args.siteId} />
    </div>
  );
}

function ConversionsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.conversions");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, args);
  const [source, setSource] = useSiteParam<Source>("from", "landing", SOURCES);
  const where = useQuery(api.googleAnalyticsReads.analyticsTopList, { ...args, list: source });
  const currency = status.connection?.currency ?? null;
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
  // "Every one is worth £20, set in Hakken" when every kind carries the same value set here.
  const each = kinds.every((kind) => kind.setIn === "HAKKEN" && kind.each === kinds[0]?.each) && kinds.length > 0 ? kinds[0].each : null;
  const page = (row: { key: string }) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null);
  const happenedLine = happened.length === 0 ? t("noKind")
    : happened.length === kinds.length && kinds.length > 1 ? t("everyKind")
      : eventList(happened.map((kind) => kind.eventName).join(","), nameOf, locale);

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="conversions" seen={answer?.seen} currency={currency} />

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
            <Figure
              label={t("kindsHappened")}
              value={t("kindsOf", { happened: happened.length, counted: kinds.length })}
              detail={<span className="text-[12px] text-secondary">{happened.length === 1 ? t("onlyKind", { name: happenedLine }) : happenedLine}</span>}
            />
          </FigureRow>
        )
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      {/* Its chart, agreed on 9 Oct and back (GA35): each kind of conversion a line, value ticked on its own scale. */}
      <ConversionsChart
        days={chart?.points ?? []}
        events={chart?.events ?? []}
        names={nameOf}
        host={status.host}
        from={answer?.from ?? null}
        to={answer?.to ?? null}
        currency={currency}
      />
      <ListTopBars list="landing" sort="conversions" bars="conversions" />

      <AnalyticsPanel
        title={t("whatCountsTitle")}
        description={each !== null ? t("whatCountsSameValue", { value: formatMoney(each, currency), platformName }) : t("whatCountsDescription")}
      >
        <CompactList
          rows={answer ? kinds : undefined}
          rowKey={(row) => row.eventName}
          empty={t("empty")}
          columns={[
            {
              key: "event",
              header: t("columns.event"),
              cell: (row) => (
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] text-foreground">{nameOf(row.eventName)}</span>
                  <span className="font-mono text-[11px] text-muted">{row.eventName}</span>
                </span>
              ),
            },
            { key: "count", header: t("columns.howMany"), align: "right", cell: (row) => <span className={`font-mono text-[12px] ${row.count > 0 ? "text-foreground" : "text-muted"}`}>{formatNumber(row.count)}</span> },
            {
              key: "value",
              header: t("columns.value"),
              align: "right",
              cell: (row) => (row.setIn === null && row.count > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-secondary"><TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />{t("noValue")}</span>
              ) : row.value ? <span className="font-mono text-[12px] text-secondary">{formatMoney(row.value, currency)}</span> : <NoFigure />),
            },
            { key: "change", header: t("columns.change"), align: "right", cell: (row) => <Change by={row.countBefore === null ? null : row.count - row.countBefore} same /> },
          ]}
        />
      </AnalyticsPanel>

      <AnalyticsPanel
        title={sales ? t("whereSalesTitle") : t("whereTitle")}
        description={sales ? t("whereSalesDescription") : t("whereDescription")}
        controls={<SiteViewSwitch label={t("show")} options={SOURCES.map((value) => ({ value, label: t(`sources.${value}`) }))} value={source} onChange={setSource} />}
      >
        <TopList
          rows={where?.rows}
          kind={source === "landing" ? "page" : "channel"}
          currency={currency}
          pageHref={page}
          channelHref={(row) => hrefFor("channels/channel", { key: row.label })}
          showVisits={false}
          sales={sales}
          empty={where?.live ? t("landingCollecting") : t("noneBrought")}
        />
      </AnalyticsPanel>
    </div>
  );
}
