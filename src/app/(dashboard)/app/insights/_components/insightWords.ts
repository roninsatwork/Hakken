"use client";

import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { formatDay } from "../../sites/_components/siteFormat";

/**
 * The words Insights' screens put to the team's codes: a pattern's name, a
 * source's, how sure, and a finding's status. A pattern the words don't
 * name yet reads as its code made plain.
 */
export function useInsightWords() {
  const t = usePlatformTranslations("insights.words");
  const plain = (code: string) => {
    const spaced = code.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };
  return {
    pattern: (code: string) => (t.has(`patterns.${code}`) ? t(`patterns.${code}`) : plain(code)),
    source: (source: string) => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source),
    sure: (sure: string) => (t.has(`sure.${sure}`) ? t(`sure.${sure}`) : sure),
    specialist: (specialist: string) => (t.has(`specialists.${specialist}`) ? t(`specialists.${specialist}`) : specialist),
    status: (row: { isNew: boolean; outcome: string | null }) => (row.outcome === "RIGHT" ? t("status.right") : row.outcome === "WRONG" ? t("status.wrong") : row.isNew ? t("status.new") : t("status.open")),
    day: (when: number) => formatDay(new Date(when).toISOString().slice(0, 10)),
  };
}
