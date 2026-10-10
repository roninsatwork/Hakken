"use client";

import { useSearchParams } from "next/navigation";
import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { AI_ASSISTANTS_CHANNEL } from "@/convex/utils/aiAssistants";
import { AnalyticsListScreen } from "../../../_components/AnalyticsListScreen";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod } from "../../../_components/useAnalytics";

/**
 * A channel's own screen (GA22; §11 boards 4 and 16): the websites behind
 * Referral, the search engines behind Organic Search — and AI assistants'
 * visits by assistant (§4.4) — each with what it brought.
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
  const known = ["Referral", "Organic Search", "Organic Social", "Paid Search", "Email", "Direct", AI_ASSISTANTS_CHANNEL].includes(channel);
  return (
    <AnalyticsListScreen
      header={{
        back: { label: t("back"), href: hrefFor("channels") },
        icon: <Waypoints className="h-5 w-5 text-brand" />,
        title: assistants ? t("assistantsTitle") : channel,
        description: t(known ? `description.${channel.replace(/\s+/g, "")}` : "description.other", { host: status?.host ?? "", before: tf(`before.${period}`) }),
      }}
      list="source"
      channel={channel}
      noun={assistants ? "assistants" : "sources"}
      searchPlaceholder={assistants ? t("findAssistant") : t("findSource")}
      emptyLabel={t("empty")}
    />
  );
}
