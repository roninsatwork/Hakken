"use client";

import { useTranslations } from "next-intl";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { PERIODS, usePeriod } from "./usePeriod";

/** Last 7, 30 or 90 days, or 12 months: the period every Analytics screen reads. */
export function PeriodChoice() {
  const t = useTranslations("admin.contentAnalytics.periods");
  const [period, choose] = usePeriod();
  return (
    <SegmentedChoice
      size="compact"
      label={t("label")}
      value={period}
      options={PERIODS.map((value) => ({ value, label: t(value) }))}
      onChange={choose}
    />
  );
}
