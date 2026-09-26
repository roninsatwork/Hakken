"use client";

import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Select } from "@/src/ui/components/screens/Select";
import { formatDay } from "./siteFormat";
import { useCompareDay } from "./useSite";
import { useSetSiteParams } from "./useSiteParam";

/**
 * "Compare with" (D12): the date a table's change column is measured against.
 *
 * The default is the check before each row's latest, which every row already
 * carries. Choosing a day adds that day's position beside each row on screen —
 * fetched for those rows alone, so comparing never reads a whole day. The
 * choice lives in the address with the date range, so a link keeps it.
 *
 * A compact chip in the table's own top bar, "vs the check before" (Anthony,
 * 2026-09-26); the list it opens still says "Compare with" in full.
 */
export function CompareControl({ days }: { days: string[] }) {
  const t = useTranslations("sites.compare");
  const setParams = useSetSiteParams();
  const chosen = useCompareDay();
  // The newest check is what the table shows; comparing with it says nothing.
  const offered = days.slice(1);

  const choose = (value: string) => setParams({ compare: value || null });

  return (
    <Select
      aria-label={t("label")}
      value={chosen ?? ""}
      onChange={choose}
      // The top bar's size, beside its download button.
      className="h-8 text-[12px]"
      chip={{
        label: chosen ? t("chipDay", { day: formatDay(chosen) }) : t("chipPrevious"),
        icon: <CalendarDays className="pointer-events-none h-3.5 w-3.5 text-muted" aria-hidden="true" />,
      }}
    >
      <option value="">{t("previousCheck")}</option>
      {offered.map((day) => (
        <option key={day} value={day}>{t("vs", { day: formatDay(day) })}</option>
      ))}
    </Select>
  );
}
