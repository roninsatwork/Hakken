"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";

/**
 * One of a company's websites, inside the Websites section
 * (docs/plans/active/websites-section-menu-plan.md). The section's menu names
 * the website — its chooser — and holds its pages, so this draws no header
 * and no tabs of its own: until 2026-09-28 it drew both, with a Results
 * switcher under them, three rows of navigation on one screen. It only says
 * so when the website cannot be found.
 */
export default function CompanySiteLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.siteView");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });

  if (header === undefined) {
    return <div role="status" aria-busy="true" aria-label={t("loading")} className="h-24 animate-pulse rounded-2xl bg-sidebar/30" />;
  }
  if (header === null) {
    return <HakkenEmptyState icon={Globe} title={t("notFoundTitle")} description={t("notFound")} />;
  }
  return <div className="flex w-full flex-col gap-6 pb-12">{children}</div>;
}
