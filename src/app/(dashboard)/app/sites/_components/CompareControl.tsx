"use client";

import { useTranslations } from "next-intl";
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
 */
export function CompareControl({ days }: { days: string[] }) {
  const t = useTranslations("sites.compare");
  const setParams = useSetSiteParams();
  const chosen = useCompareDay();
  // The newest check is what the table shows; comparing with it says nothing.
  const offered = days.slice(1);

  const choose = (value: string) => setParams({ compare: value || null });

  return (
    <Select aria-label={t("label")} value={chosen ?? ""} onChange={choose}>
      <option value="">{t("previousCheck")}</option>
      {offered.map((day) => (
        <option key={day} value={day}>{t("vs", { day: formatDay(day) })}</option>
      ))}
    </Select>
  );
}
