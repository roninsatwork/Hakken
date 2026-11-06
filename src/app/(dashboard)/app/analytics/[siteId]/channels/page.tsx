"use client";

import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { useAnalyticsHref, useAnalyticsSiteId } from "../../_components/useAnalytics";
import { ChannelBoxes, ChannelDaysCard, ChannelSquaresCard, ChannelStepsCard, ChannelsSees, useChannels } from "./_components/ChannelsParts";

/**
 * Channels (docs/plans/active/channels-new-page-plan-2026-11-06.md; board "The new page so far" on the canvas "Hakken — Channels, three
 * ways"): where your visits came from, and where they started. Four boxes, each naming a channel; visits each day, by channel; the
 * squares; how far people got; then the table. Every row opens that channel's own page.
 */
export default function AnalyticsChannelsPage() {
  const t = useTranslations("googleAnalytics.channels");
  const hrefFor = useAnalyticsHref(useAnalyticsSiteId());
  const channels = useChannels();
  // No channel in these dates: the boxes say so, and the table, in place of charts with nothing on them.
  const nothing = channels.every?.total === 0;
  return (
    <AnalyticsListScreen
      header={{ icon: <Waypoints className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={() => (
        <>
          <ChannelsSees channels={channels} />
          <ChannelBoxes channels={channels} />
          {nothing ? null : (
            <>
              <ChannelDaysCard channels={channels} />
              <ChannelSquaresCard channels={channels} />
              <ChannelStepsCard channels={channels} />
            </>
          )}
        </>
      )}
      list="channel"
      noun="channels"
      opening="visits"
      searchPlaceholder={t("searchPlaceholder")}
      rowHref={(row) => hrefFor("channels/channel", { key: row.label })}
      leaveOutColumns={channels.sells ? ["conversions"] : ["basket", "checkout", "bought"]}
      emptyLabel={t("empty")}
    />
  );
}
