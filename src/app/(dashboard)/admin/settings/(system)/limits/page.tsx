"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Gauge, Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LimitsScreen } from "../../../_components/limits/LimitsScreen";

/**
 * The platform's limits — where every company starts (docs/plans/active/
 * platform-limits-plan.md). Anthony, 2026-09-28: "the platform defaults should
 * be another option on the system settings menu", and a company "can inherit
 * the platform default but we can override". A company's Limits and a
 * website's are the same screen one level down.
 */
export default function PlatformLimitsPage() {
  const t = useTranslations("admin.limits");
  const limits = useQuery(api.platformLimits.getPlatformLimits, {});
  const save = useMutation(api.platformLimits.setPlatformLimits);

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader icon={<Gauge className="h-6 w-6 text-brand" />} title={t("platformTitle")} description={t("platformSubtitle")} />
      {limits === undefined ? (
        <div className="flex h-[30vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <LimitsScreen
          level="platform"
          keys={Object.keys(limits.values)}
          own={limits.values}
          choices={limits.choices}
          others={limits.others}
          otherHref={(companyId) => `/admin/companies/${companyId}/websites/limits`}
          onSave={async (changes) => {
            // The platform always has a number: its page offers no "use the level above".
            const numbers = Object.fromEntries(Object.entries(changes).flatMap(([key, value]) => (value === null ? [] : [[key, value]])));
            await save({ limits: numbers });
          }}
        />
      )}
    </div>
  );
}
