"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import type { FunctionReturnType } from "convex/server";
import { HandCoins } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { formatNumber } from "../../sites/_components/siteFormat";
import { AnalyticsSees } from "./AnalyticsSees";
import { BeforeLine } from "./AnalyticsFigures";
import { ConversionsByHourCard, ConversionsByKindCard, ConversionsOverTimeCard } from "./ConversionsCards";
import { conversionAsk } from "./seesAskFacts";
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
  const tmap = useTranslations("googleAnalytics.conversionsMap");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  // What it was worth: the conversions' own read, which prices each kind (set in Analytics, in Hakken, or each order's own).
  const conversions = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const kind = conversions?.kinds.find((one) => one.eventName === event) ?? null;
  const currency = status.connection?.currency ?? null;
  const name = nameOf(event);
  // A shop's purchase reads as its sales do on the board ("Purchases", "Visits that bought"); every other conversion by its name.
  const isPurchase = event === "purchase" && (conversions?.shop?.purchases ?? 0) > 0;
  const label = isPurchase ? tc("purchases") : name;
  const figures = answer.figures;
  const periodName = tf(`periods.${periodWord(period)}`);
  const before = tf(`before.${periodWord(period)}`);
  const rate = figures.siteVisits > 0 ? figures.times / figures.siteVisits : null;
  const rateBefore = figures.siteVisitsBefore && figures.timesBefore !== null ? figures.timesBefore / figures.siteVisitsBefore : null;
  const rateChange = rate !== null && rateBefore !== null ? rate - rateBefore : null;
  // What the eye hands the Insights team (sees-conversion-specialist-plan-2026-10-30.md): this conversion's figures and links.
  const path = usePathname() ?? "";
  const tw = useTranslations("googleAnalytics.seesAsk");
  const tm = useTranslations("googleAnalytics.menu");
  const ask = conversionAsk(
    { siteId: args.siteId, path, period: args.period, from: conversions?.from ?? null, to: conversions?.to ?? null, country: args.country ?? "", device: args.device, periodName: periodName.toLowerCase(), beforeName: before },
    (key, values) => tw(key, values),
    { funnel: tm("landingPages"), trackingHealth: tm("trackingHealth"), channels: tm("channels"), conversions: tm("conversions") },
    {
      eventName: event, name, times: figures.times, timesBefore: figures.timesBefore, visits: figures.visits, visitsBefore: figures.visitsBefore,
      siteVisits: figures.siteVisits, siteVisitsBefore: figures.siteVisitsBefore, rate, rateBefore, worth: kind?.value ?? null, worthBefore: kind?.valueBefore ?? null,
      currency, sells: (conversions?.shop?.purchases ?? 0) > 0, hrefFor,
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("conversions") }}
        icon={<HandCoins className="h-5 w-5 text-brand" />}
        title={name}
        description={t("countedDescription", { google: event })}
      />
      <AnalyticsSees screen="event" seen={answer.seen} currency={currency} ask={ask} />

      <FigureRow columns={4}>
        <Figure label={label} emphasis value={formatNumber(figures.times)} detail={<BeforeLine now={figures.times} before={figures.timesBefore} />} />
        <Figure label={t(isPurchase ? "bought" : "didIt")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} />} />
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

      {/* As drawn (board "Conversion"): the share of each day's visits that did it, with Show and Compare; then a line per channel. */}
      <ConversionsOverTimeCard opening={{ event, show: "rate", pinned: true, title: t("dayByDay.day", { event: label }), hint: tmap(isPurchase ? "timeHintRateBought" : "timeHintRate", { before }) }} />
      <ConversionsByKindCard event={event} name={label} hint={tmap(isPurchase ? "linesHintBought" : "linesHintDid", { column: tmap("columnsLower.channel") })} />
      <ConversionsByHourCard event={event} />
    </div>
  );
}
