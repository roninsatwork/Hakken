"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Gauge } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LimitsScreen } from "../../../../../../_components/limits/LimitsScreen";

/**
 * One website's Limits: the platform's Limits screen two levels down, each
 * limit its company's until a number is picked here (docs/plans/active/
 * platform-limits-plan.md). A competitor shows only the limits a competitor
 * has — how many of its keywords and backlinks are kept — since it asks no
 * prompts of its own.
 */
export default function CompanySiteLimitsPage() {
  const t = useTranslations("admin.limits");
  const tSection = useTranslations("admin.websitesSection");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const limits = useQuery(api.platformLimits.getSiteLimits, { companyWebsiteId });
  const save = useMutation(api.platformLimits.setSiteLimits);

  if (limits === undefined) return null;
  if (limits === null) return <p className="text-[13px] text-destructive">{t("notFound")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Gauge className="h-6 w-6 text-brand" />}
        title={tSection("pages.limits")}
        description={t(limits.competitor ? "siteSubtitleCompetitor" : "siteSubtitle", { host: limits.host })}
      />
      <LimitsScreen
        level="website"
        keys={limits.keys}
        own={limits.own}
        above={limits.company}
        choices={limits.choices}
        companyHref={`/admin/companies/${companyId}/websites/limits`}
        onSave={async (changes) => {
          await save({ companyWebsiteId, limits: changes });
        }}
      />
    </div>
  );
}
