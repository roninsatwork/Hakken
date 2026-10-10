"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { BarChart3, Building2, FileText, LayoutDashboard, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { DetailLayout } from "@/src/ui/components/screens/DetailLayout";
import { PeriodChoice } from "./PeriodChoice";
import { usePeriod, withPeriod } from "./usePeriod";

export const ANALYTICS_BASE = "/admin/content/analytics";

/**
 * Admin → Content → Analytics (content-people-knowledge-plan.md, boards
 * 7, 8, 10, 11): a tabbed section — its title, the period on the right, then
 * Overview, Articles, People and Companies, each counted for the period.
 */
export function AnalyticsSection({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.contentAnalytics");
  const { platformName } = useSystemSettings();
  const [period] = usePeriod();
  const overview = useQuery(api.readingAnalytics.analyticsOverview, { period });
  const counted = (label: string, count: number | undefined) => (count === undefined ? label : `${label} ${count.toLocaleString("en-GB")}`);
  return (
    <DetailLayout
      leading={<BarChart3 className="h-6 w-6 text-brand" />}
      title={t("title")}
      description={t("subtitle", { platformName })}
      rootHref={ANALYTICS_BASE}
      actions={<PeriodChoice />}
      tabs={[
        { href: withPeriod(ANALYTICS_BASE, period), label: t("tabs.overview"), icon: LayoutDashboard },
        { href: withPeriod(`${ANALYTICS_BASE}/articles`, period), label: counted(t("tabs.articles"), overview?.counts.articles), icon: FileText },
        { href: withPeriod(`${ANALYTICS_BASE}/people`, period), label: counted(t("tabs.people"), overview?.counts.people), icon: Users },
        { href: withPeriod(`${ANALYTICS_BASE}/companies`, period), label: counted(t("tabs.companies"), overview?.counts.companies), icon: Building2 },
      ]}
    >
      <div className="flex flex-col gap-5">{children}</div>
    </DetailLayout>
  );
}
