"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass, ExternalLink, Globe, Link2, ListChecks, Search, Settings2, Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { DetailTabs, type DetailTab } from "@/src/ui/components/screens/DetailTabs";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDateTime } from "@/src/lib/dates";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import { formatMonthly, siteBase } from "./siteView";

const loadSettings = () => import("./SiteSettingsSheet");
const SiteSettingsSheet = lazy(() =>
  loadSettings().then((module) => ({ default: module.SiteSettingsSheet })),
);

/** The three results views, which the Results tab stands for. */
const RESULT_ROUTES = ["citations", "fan-out", "keywords"] as const;

/**
 * One of a company's websites, as a record with tabs rather than one scroll.
 *
 * Anthony, 2026-09-22, on the page this replaces: *"too dense with information
 * and as a user i have no idea what to do."* It was a schedule, a place, two
 * tables and three links down one page. Now the header says what is happening
 * — how often it is collected, from where, what it tracks and what that costs
 * a month — and the tabs split the rest by what somebody came to do:
 *
 * - **Brief** — how it is doing, at a glance.
 * - **Tracking** — the searches, questions and rivals, each judged and priced.
 * - **Results** — what came back: AI answers, what the engines searched, rankings.
 *
 * A tracked site is somebody else's and has no Brief or Tracking of its own —
 * it is compared on the lists of the site it is watched against — so it gets
 * an overview of its pairing and its rankings, and nothing it cannot use.
 *
 * The header's query is the cheap one: every tab draws it, so it reads list
 * lengths and prices and never a summary. The settings sheet loads its own
 * data, and only once opened.
 */
export default function CompanySiteLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.siteView");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const scheduleSummary = useScheduleSummary();
  const [settingsRequested, setSettingsRequested] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (header === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (header === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  const base = siteBase(companyId, companyWebsiteId);
  const owned = header.relationship === "OWNED";
  const unknown = t("priceUnknown");

  const inResults = (pathname: string) =>
    RESULT_ROUTES.some((route) => pathname === `${base}/${route}` || pathname.startsWith(`${base}/${route}/`));

  const tabs: DetailTab[] = owned
    ? [
      { href: base, icon: Compass, label: t("tabs.brief") },
      { href: `${base}/tracking`, icon: ListChecks, label: t("tabs.tracking") },
      { href: `${base}/citations`, icon: Sparkles, label: t("tabs.results"), matches: inResults },
    ]
    : [
      { href: base, icon: Link2, label: t("tabs.overview") },
      { href: `${base}/keywords`, icon: Search, label: t("tabs.rankings") },
    ];

  const tracking = t("tracking", {
    searches: header.counts.searches,
    questions: header.counts.questions,
    rivals: header.counts.rivals,
  });
  const description = owned
    ? [
      t("watchedFrom", { place: header.placeLabel }),
      tracking,
      header.monthly.total === null
        ? unknown
        : t("perMonth", { cost: formatMonthly(header.monthly.total, unknown) }),
    ].join(" · ")
    : header.pairedWith
      ? t("trackedPaired", { host: header.pairedWith.displayHost })
      : t("trackedAlone", { place: header.placeLabel });

  const pill = header.pairedWith
    ? <StatusPill tone="info">{t("collectedWith", { host: header.pairedWith.displayHost })}</StatusPill>
    : header.schedule.active && header.schedule.intervalStr
      ? (
        <StatusPill tone="success">
          {header.schedule.nextRunAt
            ? t("collectingNext", {
              schedule: scheduleSummary(header.schedule.intervalStr),
              when: formatDateTime(header.schedule.nextRunAt),
            })
            : scheduleSummary(header.schedule.intervalStr)}
        </StatusPill>
      )
      : <StatusPill tone="neutral">{t("notCollecting")}</StatusPill>;

  const openSettings = () => {
    void loadSettings();
    setSettingsRequested(true);
    setIsSettingsOpen(true);
  };

  return (
    <div className="flex w-full flex-col gap-4 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: `/admin/companies/${companyId}/websites` }}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={header.displayHost}
        description={description}
        pills={pill}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* A paired site's day and place are its pair's; it has none to set. */}
            {header.pairedWith ? null : (
              <Button variant="quiet" onClick={openSettings} className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                {t("settings")}
              </Button>
            )}
            <Link
              href={`/admin/websites/${header.websiteId}`}
              className="flex items-center gap-1.5 rounded-[8px] border border-border-dim px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:text-foreground"
            >
              {t("record")}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      <DetailTabs tabs={tabs} rootHref={base} />

      <div className="flex flex-col gap-6 pt-2">{children}</div>

      {settingsRequested ? (
        <Suspense fallback={null}>
          <SiteSettingsSheet
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            companyWebsiteId={companyWebsiteId}
            host={header.displayHost}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
