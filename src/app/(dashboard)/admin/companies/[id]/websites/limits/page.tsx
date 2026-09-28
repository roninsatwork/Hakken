"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Gauge, Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LimitsScreen } from "../../../../_components/limits/LimitsScreen";
import { siteBase } from "../site/[companyWebsiteId]/siteView";

/**
 * The company's Limits: how much Hakken buys, keeps and shows for its
 * websites, each limit the platform's until a number is picked here
 * (docs/plans/active/platform-limits-plan.md). Anthony, 2026-09-28: "This
 * should be two screens / Schedules / Limits", and "can you ensure the company
 * section has the same wording and options as the system settings" — so this
 * is System Settings → Limits one level down, not a screen of its own.
 */
export default function CompanyLimitsPage() {
  const t = useTranslations("admin.limits");
  const tSection = useTranslations("admin.websitesSection");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const limits = useQuery(api.platformLimits.getCompanyLimits, { companyId });
  const save = useMutation(api.platformLimits.setCompanyLimits);

  if (limits === undefined) {
    return (
      <div className="flex h-[30vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }
  if (limits === null) return <p className="text-[13px] text-destructive">{t("notFound")}</p>;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Gauge className="h-6 w-6 text-brand" />}
        title={tSection("pages.limits")}
        description={t("companySubtitle", { company: limits.companyName })}
      />
      <LimitsScreen
        level="company"
        keys={Object.keys(limits.own)}
        own={limits.own}
        above={limits.platform}
        choices={limits.choices}
        others={limits.others}
        otherHref={(companyWebsiteId) => `${siteBase(companyId, companyWebsiteId)}/limits`}
        shared={limits.shared}
        onSave={async (changes) => {
          await save({ companyId, limits: changes });
        }}
      />
    </div>
  );
}
