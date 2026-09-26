"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Compass, ExternalLink, Globe, Link2, Search, Settings2, Sparkles, Swords } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { DetailTabs, type DetailTab } from "@/src/ui/components/screens/DetailTabs";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDateTime } from "@/src/lib/dates";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import { siteBase } from "./siteView";

const loadSettings = () => import("./SiteSettingsSheet");
const SiteSettingsSheet = lazy(() =>
  loadSettings().then((module) => ({ default: module.SiteSettingsSheet })),
);

/** The company's lists and the results views, which the Results tab stands for. */
const RESULT_ROUTES = ["searches", "questions", "citations", "fan-out", "keywords"] as const;

/**
 * One of a company's websites, as a record with tabs rather than one scroll.
 *
 * Anthony, 2026-09-23, on the version before this: *"super complex — I don't
 * understand them at all."* A company's site keeps what is the company's own
 * choice, and what came back. The searches and questions are its own since
 * 2026-09-26 (docs/plans/active/private-tracking-lists-plan.md, V4), so they
 * are set here; the brand names are the website's, set on its record:
 *
 * - **Overview** — how it is doing, and what to do next.
 * - **Competitors** — the rivals this company chose to compare it with.
 * - **Results** — its searches and questions, and what came back: rankings,
 *   AI answers, what the AI searched.
 *
 * A tracked site is somebody else's, compared on the lists of the site it is
 * watched against, so it gets an overview of that pairing and its rankings.
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

  const inResults = (pathname: string) =>
    RESULT_ROUTES.some((route) => pathname === `${base}/${route}` || pathname.startsWith(`${base}/${route}/`));

  const tabs: DetailTab[] = owned
    ? [
      { href: base, icon: Compass, label: t("tabs.overview") },
      { href: `${base}/competitors`, icon: Swords, label: t("tabs.competitors") },
      { href: `${base}/searches`, icon: Sparkles, label: t("tabs.results"), matches: inResults },
    ]
    : [
      { href: base, icon: Link2, label: t("tabs.overview") },
      { href: `${base}/keywords`, icon: Search, label: t("tabs.rankings") },
    ];

  const description = header.pairedWith
    ? t("trackedPaired", { host: header.pairedWith.displayHost })
    : t("watchedFrom", { place: header.placeLabel });

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
