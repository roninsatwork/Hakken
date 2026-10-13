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
import { BingMenu } from "../_components/BingMenu";
import { BingConnectionBanner } from "../_components/BingNotices";
import { PERIODS, STEPS, bingQuery, usePeriod, useStep, useBingSiteId, useBingStatus } from "../_components/useBing";

/**
 * One website in the Bing Webmaster section (docs/plans/active/bing-webmaster-plan.md
 * §5, as drawn on 12 Oct): its header with the way back, the switch between
 * the company's own websites, the dates and step every page reads, the menu,
 * and the page. Read through the caller's own hold: another company's website
 * answers exactly as a missing one does.
 */
export default function BingSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("bingWebmaster.site");
  const ts = useTranslations("bingWebmaster.status");
  const tf = useTranslations("bingWebmaster.filters");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useBingSiteId();
  const status = useBingStatus();
  const [period, setPeriod] = usePeriod();
  const [step, setStep] = useStep();

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
  const firstComing = state === "CONNECTED" && !connection?.newestDay;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: `/app/bing-webmaster${bingQuery(params)}` }}
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={status.host}
          description={connection?.site && state !== "CHOOSING" ? t("withSite", { site: connection.site }) : t("yourWebsite")}
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
                <Select aria-label={t("switch")} value={siteId} onChange={(next) => router.push(`/app/bing-webmaster/${next}${bingQuery(params)}`)}>
                  {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
                </Select>
              ) : null}
              <Select aria-label={tf("period")} value={period} onChange={(next) => setPeriod(next as typeof period)} className="w-[160px]">
                {PERIODS.map((entry) => <option key={entry} value={entry}>{tf(`periods.${entry}`)}</option>)}
              </Select>
              <Select aria-label={tf("step")} value={step} onChange={(next) => setStep(next as typeof step)} className="w-[140px]">
                {STEPS.map((entry) => <option key={entry} value={entry}>{tf(`steps.${entry}`)}</option>)}
              </Select>
            </div>
          }
        />

        <BingConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <BingMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {connection?.newestDay && state !== "CHOOSING" ? (
              <p className="text-[12px] text-muted">{t("figuresTo", { day: formatDay(connection.newestDay) })}</p>
            ) : null}
            {children}
          </section>
        </div>
      </div>
    </>
  );
}
