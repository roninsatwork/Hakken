"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarClock, ExternalLink } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SiteSchedule } from "../SiteSchedule";
import { TrackedPairing } from "../TrackedPairing";
import { siteBase } from "../siteView";

/**
 * One website's Schedules (docs/plans/active/websites-section-menu-plan.md):
 * how often and from where it is collected — its own sites, and a competitor
 * watched on its own — and which of the company's sites a competitor is
 * watched against. How much of it is kept is its Limits page since
 * 2026-09-28 (docs/plans/active/platform-limits-plan.md; Anthony: "This should
 * be two screens / Schedules / Limits").
 */
export default function CompanySiteSchedulesPage() {
  const t = useTranslations("admin.siteView.schedulesPage");
  const tPaired = useTranslations("admin.siteView.paired");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;
  const owned = header.relationship === "OWNED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<CalendarClock className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t(owned ? "subtitle" : "subtitleCompetitor", { host: header.displayHost })}
      />
      {owned ? null : (
        <>
          <TrackedPairing
            companyId={companyId}
            companyWebsiteId={companyWebsiteId}
            pairedWith={header.pairedWith ? { ...header.pairedWith, locationLabel: header.placeLabel } : null}
            nextRunAt={header.schedule.nextRunAt}
          />
          {header.pairedWith ? (
            <Link
              href={`${siteBase(companyId, header.pairedWith.companyWebsiteId)}/competitors`}
              className="flex w-fit items-center gap-2 text-[13px] text-brand hover:underline"
            >
              {tPaired("compare", { host: header.pairedWith.displayHost })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="text-[13px] text-secondary">{tPaired("alone")}</p>
          )}
        </>
      )}
      {/* A paired competitor's day and place are its pair's: it has none to set. */}
      {header.pairedWith ? null : <SiteSchedule companyWebsiteId={companyWebsiteId} host={header.displayHost} />}
      <Link
        href={`/admin/websites/${header.websiteId}`}
        className="flex w-fit items-center gap-1.5 text-[13px] text-secondary transition-colors hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t("record", { host: header.displayHost })}
      </Link>
    </div>
  );
}
