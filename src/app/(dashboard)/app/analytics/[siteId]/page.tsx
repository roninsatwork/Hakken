"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Change } from "@/src/ui/components/screens/Change";
import { AnalyticsGate, countsAnything } from "../_components/AnalyticsNotices";
import { AnalyticsFigures } from "../_components/AnalyticsFigures";
import { AnalyticsChart } from "../_components/AnalyticsChart";
import { AnalyticsPanel, TopList } from "../_components/AnalyticsPanels";
import { PageLink } from "../_components/AnalyticsCells";
import { formatMoney } from "../_components/analyticsFormat";
import { TrackingHealthLine } from "../_components/TrackingHealthLine";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus } from "../_components/useAnalytics";

/**
 * Overview (§5; §11 board 2): visits, engaged visits, conversions and value,
 * each against the span before; what changed most (GA22); one line on
 * cookies (§10, Q6); the chart; the channels and landing pages that made the
 * most; and the tracking health line (§6).
 */
export default function AnalyticsOverviewPage() {
  const t = useTranslations("googleAnalytics.overview");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <OverviewBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function OverviewBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, args);
  const chart = useQuery(api.googleAnalyticsReads.analyticsChart, args);
  const channels = useQuery(api.googleAnalyticsReads.analyticsTopList, { ...args, list: "channel" });
  const landing = useQuery(api.googleAnalyticsReads.analyticsTopList, { ...args, list: "landing" });
  const currency = status.connection?.currency ?? null;
  const counting = countsAnything(status);
  const pageHref = (row: { key: string }) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null);

  if (overview?.preparing) {
    return <Notice>{t("preparing")}</Notice>;
  }
  return (
    <div className="flex flex-col gap-6">
      {overview?.now ? (
        <AnalyticsFigures now={overview.now} before={overview.before} currency={currency} conversionsHref={hrefFor("conversions")} counting={counting} />
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      {counting ? (
        <AnalyticsPanel title={t("changedTitle")} description={t("changedDescription", { before: tf(`before.${period}`) })}>
          <CompactList
            rows={overview?.changedMost}
            rowKey={(row) => `${row.kind}:${row.key}`}
            empty={t("changedEmpty")}
            columns={[
              {
                key: "name",
                header: t("pageOrChannel"),
                cell: (row) => (row.kind === "landing"
                  ? <PageLink address={row.label} href={pageHref(row)} />
                  : <Link href={hrefFor("channels/channel", { key: row.label })} className="text-[13px] text-foreground hover:text-info">{row.label}</Link>),
              },
              { key: "kind", header: t("kind"), cell: (row) => <span className="text-[12.5px] text-secondary">{t(`kinds.${row.kind}`)}</span> },
              { key: "conversions", header: t("conversions"), align: "right", cell: (row) => <Change by={row.conversions} arrow={row.conversions >= 0 ? "up" : "down"} /> },
              { key: "value", header: t("value"), align: "right", cell: (row) => <Change by={row.value} arrow={row.value >= 0 ? "up" : "down"} format={(value) => formatMoney(value, currency)} /> },
            ]}
          />
        </AnalyticsPanel>
      ) : null}

      <Notice>{t("cookies", { host: status.host })}</Notice>

      <AnalyticsChart
        days={chart?.points ?? []}
        host={status.host}
        from={overview?.from ?? null}
        to={overview?.to ?? null}
        currency={currency}
        exportName="google-analytics-overview"
      />

      <AnalyticsPanel
        title={t("channelsTitle")}
        description={t("channelsDescription")}
        seeAll={channels && channels.total > 0 ? { href: hrefFor("channels"), label: t("seeAll", { count: channels.total }) } : null}
      >
        <TopList rows={channels?.rows} kind="channel" currency={currency} channelHref={(row) => hrefFor("channels/channel", { key: row.label })} empty={t("noChannels")} />
      </AnalyticsPanel>

      <AnalyticsPanel
        title={t("landingTitle")}
        description={landing?.live ? t("landingLive") : t("landingDescription")}
        seeAll={landing && landing.total > 0 ? { href: hrefFor("landing-pages"), label: t("seeAll", { count: landing.total }) } : null}
      >
        <TopList rows={landing?.rows} kind="page" currency={currency} pageHref={pageHref} empty={landing?.live ? t("landingLive") : t("noPages")} />
      </AnalyticsPanel>

      <TrackingHealthLine status={status} />
    </div>
  );
}
