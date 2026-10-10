"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Notice } from "@/src/ui/components/screens/Notice";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { AnalyticsChart } from "../../../_components/AnalyticsChart";
import { AnalyticsPanel, TopList } from "../../../_components/AnalyticsPanels";
import { useLiveAsk } from "../../../_components/AnalyticsListScreen";
import { formatMoney, formatPercent, pathOf } from "../../../_components/analyticsFormat";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus } from "../../../_components/useAnalytics";

/**
 * A landing page's own screen (GA22; §11 board 15): its figures against the
 * span before, its chart, where its visits came from and what they converted
 * into. The chart and channels are asked of Google when the screen opens, and
 * held until the next collection (GA23).
 */
export default function AnalyticsLandingPage() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <LandingPageBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function LandingPageBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.landingPage");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const page = useSearchParams().get("key") ?? "";
  const answer = useQuery(api.googleAnalyticsReads.analyticsLandingPage, page ? { ...args, page } : "skip");
  const asking = useLiveAsk(answer?.live ? { siteId: args.siteId, period: args.period, device: args.device, page: { ref: page, path: answer.path } } : null);
  const currency = status.connection?.currency ?? null;
  const row = answer?.row ?? null;
  const address = answer?.address ?? "";

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("landing-pages") }}
        icon={<LogIn className="h-5 w-5 text-brand" />}
        title={answer ? pathOf(address) : "…"}
        description={answer ? (answer.group ? t("descriptionInGroup", { host: status.host, group: answer.group }) : t("description", { host: status.host })) : undefined}
        action={/^https?:\/\//.test(address) ? (
          <a href={address} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-secondary hover:text-info">
            {t("openPage")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : undefined}
      />
      {answer === null ? <Notice>{t("notFound")}</Notice> : null}
      {answer && !row ? <Notice>{t("noVisits", { period: tf(`periods.${period}`).toLowerCase() })}</Notice> : null}
      {answer && row ? (
        <FigureRow>
          <Figure label={t("visits")} value={formatNumber(row.visits)} detail={<BeforeLine now={row.visits} before={row.change === null ? null : row.visits / (1 + row.change)} />} />
          <Figure
            label={t("engagementRate")}
            value={formatPercent(row.engagementRate)}
            detail={<span className="text-[12px] text-secondary">{t("wholeWebsite", { rate: formatPercent(answer.siteEngagementRate) })}</span>}
          />
          <Figure
            label={t("conversions")}
            value={formatNumber(row.conversions)}
            detail={row.conversionsBefore === null ? <NoFigure /> : (
              <ChangeLine by={row.conversions - row.conversionsBefore}>
                {t(byWord(row.conversions - row.conversionsBefore), { by: formatNumber(Math.abs(row.conversions - row.conversionsBefore)), before: tf(`before.${period}`) })}
              </ChangeLine>
            )}
          />
          <Figure
            label={t("value")}
            emphasis
            value={formatMoney(row.value, currency)}
            detail={row.valueBefore === null ? <NoFigure /> : (
              <ChangeLine by={row.value - row.valueBefore}>
                {t(byWord(row.value - row.valueBefore), { by: formatMoney(Math.abs(row.value - row.valueBefore), currency), before: tf(`before.${period}`) })}
              </ChangeLine>
            )}
          />
        </FigureRow>
      ) : null}

      {answer?.live && asking === "FAILED" ? <Notice tone="warning">{t("askFailed")}</Notice> : null}
      <AnalyticsChart
        days={answer?.points ?? []}
        host={status.host}
        from={null}
        to={status.connection?.newestDay ?? null}
        currency={currency}
        exportName="google-analytics-landing-page"
      />

      <AnalyticsPanel title={t("channelsTitle")} description={t("channelsDescription")}>
        <TopList rows={answer?.channels} kind="channel" currency={currency} channelHref={(channel) => hrefFor("channels/channel", { key: channel.label })} empty={answer?.live ? t("asking") : t("noChannels")} />
      </AnalyticsPanel>

      <AnalyticsPanel title={t("convertedTitle")} description={t("convertedDescription")}>
        <CompactList
          rows={answer?.conversions}
          rowKey={(entry) => entry.eventName}
          empty={t("nothingConverted")}
          columns={[
            { key: "name", header: t("conversion"), cell: (entry) => <span className="text-[13px] text-foreground">{nameOf(entry.eventName)}</span> },
            { key: "count", header: t("howMany"), align: "right", cell: (entry) => <span className="font-mono text-[12px] text-foreground">{formatNumber(entry.count)}</span> },
            { key: "each", header: t("valueEach"), align: "right", cell: (entry) => (entry.each !== null && entry.count > 0 ? <span className="font-mono text-[12px] text-secondary">{formatMoney(entry.each, currency)}</span> : <NoFigure />) },
            { key: "value", header: t("value"), align: "right", cell: (entry) => (entry.value ? <span className="font-mono text-[12px] text-secondary">{formatMoney(entry.value, currency)}</span> : <NoFigure />) },
          ]}
        />
      </AnalyticsPanel>
    </div>
  );
}

/** The words of a change, by which way it went: the arrow is in the words, never colour alone. */
function byWord(by: number): "byBeforeUp" | "byBeforeDown" | "byBeforeSame" {
  return by > 0 ? "byBeforeUp" : by < 0 ? "byBeforeDown" : "byBeforeSame";
}
