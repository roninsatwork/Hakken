"use client";

import { useSearchParams } from "next/navigation";
import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { AI_ASSISTANTS_CHANNEL, DESCRIBED_CHANNELS } from "@/convex/utils/aiAssistants";
import { ENGAGEMENT_GAP } from "@/convex/utils/sees/analytics";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { AnalyticsListScreen, type ListPageAnswer } from "../../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { BeforeLine } from "../../../_components/AnalyticsFigures";
import { formatMoney, formatPercent } from "../../../_components/analyticsFormat";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod } from "../../../_components/useAnalytics";

/**
 * A channel's own screen (GA22; §11 boards 4 and 16; §15 screen 5): the
 * websites behind Referral, the search engines behind Organic Search — and AI
 * assistants' visits by assistant (§4.4) — each with what it brought. Under
 * What Hakken sees, four figures above the list: its visits, its engagement
 * rate against the whole website's, its conversions and their value.
 */
export default function AnalyticsChannelPage() {
  const t = useTranslations("googleAnalytics.channel");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const [period] = usePeriod();
  const channel = useSearchParams().get("key") ?? "";
  const assistants = channel === AI_ASSISTANTS_CHANNEL;
  const known = DESCRIBED_CHANNELS.includes(channel) || assistants;
  const currency = status?.connection?.currency ?? null;
  return (
    <AnalyticsListScreen
      header={{
        back: { label: t("back"), href: hrefFor("channels") },
        icon: <Waypoints className="h-5 w-5 text-brand" />,
        title: assistants ? t("assistantsTitle") : channel,
        description: t(known ? `description.${channel.replace(/\s+/g, "")}` : "description.other", { host: status?.host ?? "", before: tf(`before.${period}`) }),
      }}
      head={(answer) => (
        <>
          <AnalyticsSees screen="channel" seen={answer?.seen} currency={currency} />
          <ChannelFigures figures={answer?.figures ?? null} currency={currency} />
        </>
      )}
      list="source"
      channel={channel}
      noun={assistants ? "assistants" : "sources"}
      searchPlaceholder={assistants ? t("findAssistant") : t("findSource")}
      emptyLabel={t("empty")}
    />
  );
}

/**
 * The channel's four figures (§15, screen 5): visits, engagement rate against
 * the whole website's, conversions and value, each against the span before.
 * The eye lands on engagement when its visitors leave sooner than the
 * website's, on value otherwise.
 */
function ChannelFigures({ figures, currency }: { figures: ListPageAnswer["figures"]; currency: string | null }) {
  const t = useTranslations("googleAnalytics.channel.figures");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  if (!figures) return null;
  const rate = figures.visits > 0 ? figures.engaged / figures.visits : null;
  const siteRate = figures.siteVisits > 0 ? figures.siteEngaged / figures.siteVisits : null;
  const leaves = rate !== null && siteRate !== null && rate < siteRate - ENGAGEMENT_GAP;
  const quiet = (words: string) => <span className="text-[12px] text-secondary">{words}</span>;
  return (
    <FigureRow>
      <Figure label={t("visits")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} />} />
      <Figure label={t("engagement")} emphasis={leaves} value={formatPercent(rate)} detail={quiet(t("siteRate", { rate: formatPercent(siteRate) }))} />
      <Figure
        label={t("conversions")}
        value={formatNumber(figures.conversions)}
        detail={figures.conversions === 0 && figures.conversionsBefore === 0
          ? quiet(t("noneBefore", { before: tf(`before.${period}`) }))
          : <BeforeLine now={figures.conversions} before={figures.conversionsBefore} />}
      />
      <Figure
        label={t("value")}
        emphasis={!leaves}
        value={figures.value > 0 ? formatMoney(figures.value, currency) : "–"}
        detail={figures.conversions === 0 ? quiet(t("noConversions")) : <BeforeLine now={figures.value} before={figures.valueBefore} />}
      />
    </FigureRow>
  );
}
