"use client";

import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod } from "../../_components/useAnalytics";

/**
 * Channels (§5; §11 board 3; §15 screen 4): where the visits came from, in
 * Google's own channels with AI assistants their own (GA10, §4.4), and what
 * each brought, under What Hakken sees. Every channel opens into its sources
 * (GA22).
 */
export default function AnalyticsChannelsPage() {
  const t = useTranslations("googleAnalytics.channels");
  const tf = useTranslations("googleAnalytics.filters");
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const currency = useAnalyticsStatus()?.connection?.currency ?? null;
  const [period] = usePeriod();
  return (
    <AnalyticsListScreen
      header={{ icon: <Waypoints className="h-5 w-5 text-brand" />, title: t("title"), description: t("description", { before: tf(`before.${period}`) }) }}
      head={(answer) => <AnalyticsSees screen="channels" seen={answer?.seen} currency={currency} />}
      list="channel"
      noun="channels"
      searchPlaceholder={t("searchPlaceholder")}
      rowHref={(row) => hrefFor("channels/channel", { key: row.label })}
      emptyLabel={t("empty")}
    />
  );
}
