"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteMark } from "../../sites/_components/SiteMark";
import { AnalyticsFilters } from "../_components/AnalyticsFilters";
import { AnalyticsMenu } from "../_components/AnalyticsMenu";
import { AnalyticsConnectionBanner } from "../_components/AnalyticsNotices";
import { analyticsQuery, useAnalyticsSiteId, useAnalyticsStatus } from "../_components/useAnalytics";

/**
 * One website in the Google Analytics section (docs/plans/active/google-analytics-plan.md
 * §5, §11): its header with the way back, the switch between the company's own
 * websites, the device, dates and step every page reads, the menu, and the
 * page. Read through the caller's own hold: another company's website answers
 * exactly as a missing one does.
 */
export default function AnalyticsSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("googleAnalytics.site");
  const ts = useTranslations("googleAnalytics.status");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useAnalyticsSiteId();
  const status = useAnalyticsStatus();

  if (status === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }
  if (status === null) {
    return (
      <>
        <Header />
        <HakkenEmptyState icon={Globe} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </>
    );
  }
  if (!status.owned) {
    return (
      <>
        <Header />
        <HakkenEmptyState icon={Globe} title={t("notOwnedTitle")} description={t("notOwnedDescription")} />
      </>
    );
  }

  const connection = status.connection;
  const state = !connection || connection.status === "CONNECTING" ? "NOT_CONNECTED" : connection.status;
  const property = connection?.property && connection.propertyName && state !== "CHOOSING"
    ? t("withProperty", { name: connection.propertyName, id: connection.property.replace(/^properties\//, "") })
    : t("yourWebsite");
  const firstComing = state === "CONNECTED" && !connection?.historyDone;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: `/app/analytics${analyticsQuery(params)}` }}
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={status.host}
          description={property}
          pills={
            state === "CONNECTED" && connection?.lastCollectedAt && !firstComing ? (
              <StatusLabel tone="success">{t("updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            ) : firstComing ? (
              <StatusLabel tone="neutral">{t("collectingFirst")}</StatusLabel>
            ) : (
              <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : state === "CONNECTED" ? "success" : "neutral"}>{ts(state)}</StatusLabel>
            )
          }
          action={
            <div className="flex flex-wrap items-end gap-3">
              {status.ownSites.length > 1 ? (
                <Select
                  aria-label={t("switch")}
                  value={siteId}
                  onChange={(next) => router.push(`/app/analytics/${next}${analyticsQuery(params)}`)}
                >
                  {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
                </Select>
              ) : null}
              <AnalyticsFilters />
            </div>
          }
        />

        <AnalyticsConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <AnalyticsMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {connection?.newestDay && state !== "CHOOSING" && state !== "COUNTING" ? (
              <p className="text-[12px] text-muted">{t("figuresTo", { day: formatDay(connection.newestDay) })}</p>
            ) : null}
            {children}
          </section>
        </div>
      </div>
    </>
  );
}
