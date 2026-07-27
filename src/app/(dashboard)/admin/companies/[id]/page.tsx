"use client";

import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";

/**
 * The company dashboard, deliberately empty for now.
 *
 * What lived here was an AI usage report — tokens, quota, provider spend,
 * knowledge vectors — under the heading "Dashboard". It has moved to the AI
 * menu, where a reader looking for AI usage would actually go, leaving the
 * landing screen free to become a summary of the company rather than a summary
 * of its model spend.
 *
 * This stays the default route so opening a company still lands here.
 */
export default function CompanyDashboardPage() {
  const t = useTranslations("admin.companyDetails");

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <AdminPageHeader
        icon={<LayoutDashboard className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("dashboardSubtitle")}
      />

      <div className="flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border-dim py-24 text-center">
        <LayoutDashboard className="h-8 w-8 text-muted/30" />
        <p className="text-[15px] font-medium text-foreground">{t("dashboardEmpty")}</p>
        <p className="max-w-md text-[13px] leading-relaxed text-secondary">
          {t("dashboardEmptyHint")}
        </p>
      </div>
    </div>
  );
}
