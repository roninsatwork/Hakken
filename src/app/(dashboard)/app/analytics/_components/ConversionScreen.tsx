"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { HandCoins } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { formatNumber } from "../../sites/_components/siteFormat";
import { AnalyticsSees } from "./AnalyticsSees";
import { ChannelsChart } from "./AnalyticsChart";
import { BeforeLine } from "./AnalyticsFigures";
import { ConversionsByHourCard, ConversionsByKindCard } from "./ConversionsCards";
import { formatMoney, formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import { periodWord, useAnalyticsArgs, useAnalyticsHref, usePeriod, type AnalyticsStatus } from "./useAnalytics";

type EventAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsEventReads.analyticsEvent>>;

/**
 * A conversion's own screen, opened from a row of What counts as a conversion
 * (the canvas "Conversions page, three ways", board "Conversion", approved
 * 2026-10-30; conversions-and-agents-build-plan-2026-10-30.md, phase 3): the
 * way back and the conversion's name, with Google's own name under it; four
 * figures against the month before — how many, the visits that did it, its
 * rate in every hundred visits, what it was worth; its times day by day; a
 * line per channel; and when people convert, by hour and day of the week.
 * An event that does not count keeps the event screen (`EventBody`).
 */
export function ConversionScreen({ status, event, answer }: { status: AnalyticsStatus; event: string; answer: EventAnswer }) {
  const t = useTranslations("googleAnalytics.eventScreen");
  const tc = useTranslations("googleAnalytics.conversions");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  // What it was worth: the conversions' own read, which prices each kind (set in Analytics, in Hakken, or each order's own).
  const conversions = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const kind = conversions?.kinds.find((one) => one.eventName === event) ?? null;
  const currency = status.connection?.currency ?? null;
  const name = nameOf(event);
  const figures = answer.figures;
  const periodName = tf(`periods.${periodWord(period)}`);
  const before = tf(`before.${periodWord(period)}`);
  const rate = figures.siteVisits > 0 ? figures.times / figures.siteVisits : null;
  const rateBefore = figures.siteVisitsBefore && figures.timesBefore !== null ? figures.timesBefore / figures.siteVisitsBefore : null;
  const rateChange = rate !== null && rateBefore !== null ? rate - rateBefore : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("conversions") }}
        icon={<HandCoins className="h-5 w-5 text-brand" />}
        title={name}
        description={t("countedDescription", { google: event })}
      />
      <AnalyticsSees screen="event" seen={answer.seen} currency={currency} />

      <FigureRow columns={4}>
        <Figure label={name} emphasis value={formatNumber(figures.times)} detail={<BeforeLine now={figures.times} before={figures.timesBefore} />} />
        <Figure label={t("didIt")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} />} />
        <Figure
          label={t("rate")}
          value={formatPercent(rate)}
          detail={
            rateBefore !== null && rateChange !== null ? (
              <ChangeLine by={rateChange}>
                {tc(rateChange > 0 ? "rateFromUp" : rateChange < 0 ? "rateFromDown" : "rateFromSame", { rate: formatPercent(rateBefore), before })}
              </ChangeLine>
            ) : (
              <span className="text-[12px] text-secondary">{t("ofSiteVisits", { visits: formatNumber(figures.siteVisits) })}</span>
            )
          }
        />
        <Figure
          label={t("worth")}
          value={kind?.value ? formatMoney(kind.value, currency) : "–"}
          detail={kind?.value ? <BeforeLine now={kind.value} before={kind.valueBefore} /> : <span className="text-[12px] text-secondary">{t("noWorth")}</span>}
        />
      </FigureRow>

      <ChannelsChart
        channels={[name]}
        rest={false}
        points={answer.points.map((point) => ({ day: point.day, lastDay: point.lastDay, visits: [point.times] }))}
        host={status.host}
        from={null}
        to={null}
        exportName={`google-analytics-${event}`}
        title={{ day: t("dayByDay.day", { event: name }), week: t("dayByDay.week", { event: name }), month: t("dayByDay.month", { event: name }), hint: t("dayByDayHint", { period: periodName }) }}
      />
      <ConversionsByKindCard event={event} />
      <ConversionsByHourCard event={event} />
    </div>
  );
}
