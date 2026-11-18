"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "../../sites/_components/siteFormat";
import { usePerformanceDates } from "./PerformanceParts";

/**
 * A list asked of Google that stopped at Google's most an ask (`GOOGLE_MOST_ROWS`, 50,000), its fewest clicks left out:
 * said once, in the table's bar beside its count, as the keyword-and-page pairs' cut is (review fixes, 18 November 2026).
 * `noun` is what the list holds. Nothing when the list is whole.
 */
export function GoogleCutLine({ most, noun }: { most: number | null | undefined; noun: "pages" | "countries" | "devices" }) {
  const t = useTranslations("searchConsole.table");
  const { inNow } = usePerformanceDates();
  if (!most) return null;
  return <span className="text-[12px] text-secondary">{t(`${noun}Cut`, { most: formatNumber(most), when: inNow })}</span>;
}
