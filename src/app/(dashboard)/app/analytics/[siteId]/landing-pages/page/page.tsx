"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowUpRight, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { landingPageSees } from "@/convex/utils/sees/analyticsHeroes";
import { formatDay } from "../../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsPanel, TopList } from "../../../_components/AnalyticsPanels";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { useLiveAsk } from "../../../_components/AnalyticsListScreen";
import { PageStages } from "../../../_components/PageStages";
import { pathOf } from "../../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod, type AnalyticsStatus } from "../../../_components/useAnalytics";

/**
 * A landing page's own screen (GA22; §11 board 15, redrawn as §15 screen 7):
 * What Hakken sees, then its four stages from Google to money — Shown in
 * Google, Clicked, Visits and Conversions, Search Console joined to Analytics
 * as Heroes and attention joins them (§13) — and where its visits came from,
 * asked of Google when the screen opens and held until the next collection
 * (GA23). Its chart and what its visits converted into were left off.
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
  const th = useTranslations("googleAnalytics.heroes");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const hrefFor = useAnalyticsHref(args.siteId);
  const page = useSearchParams().get("key") ?? "";
  const answer = useQuery(api.googleAnalyticsPageReads.analyticsLandingPage, page ? { ...args, page } : "skip");
  const journey = useQuery(api.googleAnalyticsHeroes.analyticsHeroPage, page ? { siteId: args.siteId, page } : "skip");
  const asking = useLiveAsk(answer?.live ? { siteId: args.siteId, period: args.period, device: args.device, country: args.country, page: { ref: page, path: answer.path } } : null);
  const currency = status.connection?.currency ?? null;
  const found = journey?.found ?? null;
  const address = answer?.address ?? "";
  const consoleHref = found?.consoleAddress ? `/app/search-console/${args.siteId}/pages/page?key=${encodeURIComponent(found.consoleAddress)}` : null;
  const seen = found
    ? landingPageSees(found, answer && !answer.live ? answer.channels.map((row) => ({ label: row.label, visits: row.visits, conversions: row.conversions })) : null, { console: consoleHref, page: address })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("landing-pages") }}
        icon={<LogIn className="h-5 w-5 text-brand" />}
        title={answer ? pathOf(address) : "…"}
        description={answer ? (answer.title
          ? (answer.group ? t("descriptionInGroupTitled", { title: answer.title, host: status.host, group: answer.group }) : t("descriptionTitled", { title: answer.title, host: status.host }))
          : (answer.group ? t("descriptionInGroup", { host: status.host, group: answer.group }) : t("description", { host: status.host }))) : undefined}
        pills={found?.hero ? <StatusLabel tone="success">{th("kinds.hero")}</StatusLabel> : undefined}
        action={/^https?:\/\//.test(address) ? (
          <a href={address} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-secondary hover:text-info">
            {t("openPage")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : undefined}
      />
      {journey?.analyticsTo ? (
        <p className="text-[12px] text-muted">
          {journey.consoleTo
            ? th("figuresTo", { console: formatDay(journey.consoleTo), analytics: formatDay(journey.analyticsTo) })
            : th("figuresToAnalytics", { analytics: formatDay(journey.analyticsTo) })}
        </p>
      ) : null}
      {answer === null ? <Notice>{t("notFound")}</Notice> : null}

      <AnalyticsSees screen="landingPage" seen={seen} currency={currency} />

      {found && journey ? (
        <PageStages journey={found} currency={currency} consoleConnected={journey.consoleConnected} />
      ) : answer && !answer.row ? (
        <Notice>{t("noVisits", { period: tf(`periods.${period}`).toLowerCase() })}</Notice>
      ) : null}

      {answer?.live && asking === "FAILED" ? <Notice tone="warning">{t("askFailed")}</Notice> : null}
      <AnalyticsPanel title={t("channelsTitle")} description={t("channelsDescription")}>
        <TopList rows={answer?.channels} kind="channel" currency={currency} channelHref={(channel) => hrefFor("channels/channel", { key: channel.label })} empty={answer?.live ? t("asking") : t("noChannels")} />
      </AnalyticsPanel>
    </div>
  );
}
