"use client";

import { useQuery } from "convex/react";
import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsTable } from "../../_components/AnalyticsListScreen";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ChannelsDailyChart } from "../../_components/AnalyticsChart";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, periodWord } from "../../_components/useAnalytics";
import { useKindName } from "./_components/ChannelParts";
import { ChannelsFigures, ChannelsMap, ChannelsWorth } from "./_components/ChannelsParts";

const EVERY = "all";

/**
 * Channels (docs/plans/active/ga-channel-pages-plan.md CH9): where the visits
 * came from, in Google's own channels with AI assistants their own (GA10),
 * under What Hakken sees comparing them — four figures, the channels a day
 * with a dot on each day with a conversion, each channel by page
 * classification, what a visit is worth by channel over 12 months, then the
 * table with its "Lands most on" filter. Every channel opens its own page.
 */
export default function AnalyticsChannelsPage() {
  const t = useTranslations("googleAnalytics.channels");
  const tc = useTranslations("googleAnalytics.channelsPage");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const args = useAnalyticsArgs();
  const currency = status?.connection?.currency ?? null;
  const [period] = usePeriod();
  const top = useQuery(api.googleAnalyticsChannelReads.analyticsChannelsTop, status?.connection?.newestDay ? args : "skip");
  const kindName = useKindName(top?.map.kinds);
  const kinds = (top?.map.kinds ?? []).filter((kind) => kind.kind !== OTHER_KIND);
  const [group, setGroup] = useSiteParam<string>("group", EVERY);
  const chosen = group !== EVERY && kinds.some((kind) => kind.kind === group) ? group : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Waypoints className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { before: tf(`before.${periodWord(period)}`) })} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <div className="flex flex-col gap-4">
            <AnalyticsSees screen="channelsPage" seen={top?.seen} currency={currency} data={top} />
            <ChannelsFigures figures={top?.figures} />
            <ChannelsDailyChart />
            <ChannelsMap top={top} kindName={kindName} />
            <ChannelsWorth top={top} />
            <AnalyticsTable
              list="channel"
              seesPart="channelsTable"
              {...(chosen ? { group: chosen } : {})}
              kindName={kindName}
              noun="channels"
              opening="visits"
              searchPlaceholder={t("searchPlaceholder")}
              rowHref={(row) => hrefFor("channels/channel", { key: row.label })}
              filters={kinds.length > 0 ? (
                <Select aria-label={tc("landsMost")} value={chosen ?? EVERY} onChange={setGroup} chip={{ label: tc("landsMost"), choice: chosen ? kindName(chosen) : null }}>
                  <option value={EVERY}>{tc("everyClassification")}</option>
                  {kinds.map((kind) => <option key={kind.kind} value={kind.kind}>{kindName(kind.kind)}</option>)}
                </Select>
              ) : null}
              emptyLabel={t("empty")}
            />
          </div>
        </AnalyticsGate>
      ) : null}
    </div>
  );
}
