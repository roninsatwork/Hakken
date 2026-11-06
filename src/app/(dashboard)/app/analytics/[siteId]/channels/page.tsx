"use client";

import { useMemo } from "react";
import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { channelBoxes } from "@/convex/utils/channelBoxes";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus } from "../../_components/useAnalytics";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { useEyeNames, useWebsiteForEye } from "../../_components/useEyeFigures";
import { boxRowsOf, ChannelBoxes, ChannelDaysCard, ChannelSquaresCard, ChannelStepsCard, useChannels, type Channels } from "./_components/ChannelsParts";

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

/**
 * The page's eye: every channel with its boxes' rule's picks, the whole website's own figures and each part's own (`useSeesPart`), whatever
 * the menus show (channels-new-page-plan-2026-11-06.md, step 8). "Do first" may send the reader to where these figures are looked into.
 */
function ChannelsSees({ channels }: { channels: Channels }) {
  const tm = useTranslations("googleAnalytics.menu");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const hrefFor = useAnalyticsHref(args.siteId);
  const eyeNames = useEyeNames();
  const website = useWebsiteForEye();
  const { every, overview, sells } = channels;
  const data = useMemo(() => {
    if (!every) return undefined;
    const now = overview?.now;
    const boxes = channelBoxes(boxRowsOf(channels), { visits: now?.visits ?? null, done: now ? (sells ? now.purchases : now.conversions) : null });
    return {
      names: eyeNames,
      sells,
      boxes,
      rows: every.rows.map((row) => ({
        name: row.label, visits: row.visits, visitsBefore: row.visitsBefore ?? null,
        purchases: row.purchases, purchasesBefore: row.purchasesBefore ?? null,
        conversions: row.conversions, conversionsBefore: row.conversionsBefore,
        bounceRate: row.bounceRate, engaged: row.engaged ?? null,
        addedToBasket: row.basketVisits ?? null, startedCheckout: row.checkoutVisits ?? null,
      })),
      ...(every.gone && every.gone.length > 0 ? { gone: every.gone.map((one) => ({ name: one.key, visits: 0, visitsBefore: one.visitsBefore, purchases: 0, purchasesBefore: one.purchasesBefore, conversions: 0, conversionsBefore: one.conversionsBefore })) } : {}),
      ...(website ? { website: { ...website, bought: overview?.now?.purchases ?? 0, boughtBefore: overview?.before?.purchases ?? null } } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `channels` is new each draw; these decide.
  }, [every, overview, sells, eyeNames, website]);
  const links = useMemo(() => [
    { label: tm("campaigns"), href: hrefFor("campaigns") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor is new each draw; the dates, device and country decide.
  ], [tm, args.period, args.device, args.country]);
  // No visits in these dates: nothing to write about, and a press would only say so, minutes later.
  return <AnalyticsSees screen="channelsPage" seen={null} keep={false} currency={status?.connection?.currency ?? null} data={data} links={links} writes={every?.total !== 0} />;
}
