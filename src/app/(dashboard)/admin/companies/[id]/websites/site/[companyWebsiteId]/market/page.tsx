"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SECTION_ICONS } from "../../../_components/websitesSection";
import { SiteMarket } from "./SiteMarket";

/**
 * One website's Market (docs/plans/active/search-console-plan.md §16): where
 * it trades, for Search Console, and where it is watched from — set only
 * here, for this company only. A page inside the Websites section, so its
 * header has no rule of its own.
 */
export default function CompanySiteMarketPage() {
  const t = useTranslations("admin.siteView.market");
  const tSection = useTranslations("admin.websitesSection");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;
  const Icon = SECTION_ICONS.market;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Icon className="h-6 w-6 text-brand" />}
        title={tSection("pages.market")}
        description={t(header.relationship === "OWNED" ? "description" : "descriptionCompetitor", { host: header.displayHost })}
      />
      <SiteMarket companyId={companyId} companyWebsiteId={companyWebsiteId} host={header.displayHost} />
    </div>
  );
}
