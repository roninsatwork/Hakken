"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PlatformFeaturesContent } from "./PlatformFeaturesContent";

/**
 * System Settings → Features (docs/plans/active/features-switches-plan-2026-11-21.md;
 * Anthony, 2026-11-21: "configurable in the admin to globally turn them on and
 * off as well as by company"). One page, so no dropdown on its tab, like Limits
 * and Classification. Changing it is a platform administrator's job, as on a
 * company's Features tab.
 */
export default function PlatformFeaturesPage() {
  const t = useTranslations("admin.features");
  const currentUser = useQuery(api.users.getMe);
  const switches = useQuery(api.featureSwitches.getFeatureSwitches, {});

  if (currentUser === undefined) return null;
  if (currentUser?.role !== "SUPER_ADMIN") {
    return <p className="text-[13px] text-secondary">{t("onlyPlatform")}</p>;
  }
  if (switches === undefined) {
    return (
      <div className="flex h-[30vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }
  return <PlatformFeaturesContent offForEveryone={switches.offForEveryone} companies={switches.companies} ticked={switches.ticked} />;
}
