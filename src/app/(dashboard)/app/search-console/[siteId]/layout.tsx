"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TitleSwitch } from "@/src/ui/components/screens/TitleSwitch";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { SiteDateRange } from "../../sites/_components/SiteDateRange";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteMark } from "../../sites/_components/SiteMark";
import { sharedSiteQuery } from "../../sites/_components/useSiteParam";
import { SearchConsoleCountryPicker } from "../_components/SearchConsoleCountryPicker";
import { SearchConsoleMenu } from "../_components/SearchConsoleMenu";
import { ConnectionBanner } from "../_components/SearchConsoleNotices";
import { searchConsoleQuery, useSearchConsoleSiteId, useSearchConsoleStatus } from "../_components/useSearchConsole";

/**
 * One website in the Search Console section: its header, the switch between
 * the company's own websites, the country choice beside the shared date range
 * (search-console-plan.md §16), the menu, and the page.
 * A website opens on top of the section's list, so it wears the record-level
 * header with the way back (docs/developer/screen-kit.md, "Headers"): the
 * compact one, as Google Analytics', approved for Search Console on
 * 2026-10-15 (docs/plans/active/ga-header-plan.md) — the website's name is
 * the switch, the country and dates share its row, and how fresh Google's
 * figures are ends the line under it. Read through the caller's own hold:
 * another company's website answers exactly as a missing one does.
 */
export default function SearchConsoleSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("searchConsole.site");
  const ts = useTranslations("searchConsole.status");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();

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
  const shown = connection?.property && state !== "CHOOSING" ? connection.property : null;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          layout="compact"
          back={{ label: t("back"), href: `/app/search-console${sharedSiteQuery(params)}` }}
          // The website's mark, as Sites' lists draw it: its letter until `searchConsoleStatus` sends its icon.
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={
            status.ownSites.length > 1 ? (
              <TitleSwitch
                label={status.host}
                aria-label={t("switch")}
                value={siteId}
                onChange={(next) => router.push(`/app/search-console/${next}${searchConsoleQuery(params)}`)}
              >
                {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
              </TitleSwitch>
            ) : status.host
          }
          description={shown ? t("withProperty", { property: shown }) : t("yourWebsite")}
          pills={
            state === "CONNECTED" && connection?.lastCollectedAt ? (
              <StatusLabel tone="success">{t("updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            ) : (
              <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : state === "CONNECTED" ? "success" : "neutral"}>{ts(state)}</StatusLabel>
            )
          }
          action={
            <div className="flex flex-wrap items-end gap-3">
              <SearchConsoleCountryPicker />
              {/* As far back as Google keeps, sixteen months (insights-intelligence-plan.md phase 9). */}
              <SiteDateRange oldest={status.historyFrom} />
            </div>
          }
          note={connection?.newestDay && state !== "CHOOSING" ? t("figuresTo", { day: formatDay(connection.newestDay) }) : null}
        />

        <ConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SearchConsoleMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {children}
          </section>
        </div>
      </div>
    </>
  );
}
