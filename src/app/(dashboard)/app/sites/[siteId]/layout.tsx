"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { BackRow, DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { SiteDateRange } from "../_components/SiteDateRange";
import { formatDay } from "../_components/siteFormat";
import { SiteMenu } from "../_components/SiteMenu";
import { isSiteMenuPath, setupMet, sitePageForPath } from "../_components/sitePages";
import { useListBack } from "../_components/siteRecordLinks";
import { useSite, useSiteId } from "../_components/useSite";
import { sharedSiteQuery } from "../_components/useSiteParam";

/**
 * One site: the header every page draws, the site switcher, the shared date
 * range, the side menu, and the page itself on the right.
 *
 * A site opens on top of the Sites list, so it wears the record-level header
 * (`DetailHeader`, docs/developer/screen-kit.md "Headers") with a way back to
 * the list. The site is read through the caller's own hold: a hold that is not
 * the company's answers "not found", and this shows the same for a missing one.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("sites.site");
  const ts = useTranslations("sites.setup");
  const router = useRouter();
  const search = useSearchParams();
  const siteId = useSiteId();
  const site = useSite();
  const pathname = usePathname();
  // A menu page opened from a link on another page leads back to it; a
  // record's screen draws its own back row in its header.
  const listBack = useListBack();
  const pageBack = listBack && isSiteMenuPath(pathname, siteId) ? listBack : null;
  // A page with nothing set up for it says so once, in place of an empty screen.
  const reading = sitePageForPath(pathname, siteId);

  // The dates travel with a switch; a page's own filters do not.
  const query = sharedSiteQuery(search);
  const switchTo = (nextId: string) => {
    router.push(`/app/sites/${nextId}${query}`);
  };

  if (site === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }

  // The same view for a missing hold and one that is another company's.
  if (site === null) {
    return (
      <>
        <Header />
        <HakkenEmptyState icon={Globe} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: "/app/sites" }}
          icon={<Globe className="h-6 w-6 text-brand" />}
          title={site.host}
          description={
            site.relationship === "OWNED"
              ? t("ownedFrom", { place: site.placeLabel })
              : site.ofHost
                ? t("competitorOfFrom", { host: site.ofHost, place: site.placeLabel })
                : t("competitorFrom", { place: site.placeLabel })
          }
          pills={
            <>
              {site.checked && site.lastCheckedAt ? (
                <StatusPill tone="success">{t("lastChecked", { when: formatDateTime(site.lastCheckedAt) })}</StatusPill>
              ) : site.checked && site.latestDay ? (
                <StatusPill tone="success">{t("lastCheckedDay", { day: formatDay(site.latestDay) })}</StatusPill>
              ) : site.nextRunAt ? (
                <StatusPill tone="warning">{t("firstCheck", { when: formatDateTime(site.nextRunAt) })}</StatusPill>
              ) : (
                <StatusPill tone="neutral">{t("notChecked")}</StatusPill>
              )}
              <StatusPill tone="neutral">{t("rivals", { count: site.rivals.length })}</StatusPill>
            </>
          }
          action={
            <div className="flex flex-wrap items-end gap-3">
              {site.holds.length > 1 ? (
                <Select aria-label={t("switch")} value={site.siteId} onChange={switchTo}>
                  {site.holds.map((hold) => (
                    <option key={hold.siteId} value={hold.siteId}>
                      {hold.relationship === "OWNED" ? hold.host : t("switchCompetitor", { host: hold.host })}
                    </option>
                  ))}
                </Select>
              ) : null}
              <SiteDateRange />
            </div>
          }
        />

        {!site.checked && (
          <p className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-secondary">
            {t("notCheckedYet")}
          </p>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SiteMenu siteId={siteId} counts={site.counts} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {pageBack ? <BackRow {...pageBack} /> : null}
            {!setupMet(reading, site.counts) && reading.needs ? (
              <HakkenEmptyState
                icon={reading.needs === "questions" ? Sparkles : Search}
                title={ts(`${reading.needs}.title`)}
                description={ts(`${reading.needs}.body`)}
              />
            ) : children}
          </section>
        </div>
      </div>
    </>
  );
}
