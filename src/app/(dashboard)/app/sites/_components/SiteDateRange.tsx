"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { stepOf } from "@/convex/utils/calendarPeriods";
import { Select } from "@/src/ui/components/screens/Select";
import { parseSitePeriod, type SitePeriodRange } from "./siteRange";
import { CALENDAR_PERIOD_KEY, useCalendarPeriodChoices, useOpeningPeriod } from "./useCalendarPeriod";
import { useSetSiteParams } from "./useSiteParam";

/**
 * The shared date menu and step control (D3, D11), writing the URL so every
 * page, link and refresh keeps what was chosen. Quiet grey controls: the
 * page's one orange action, where there is one, is never a picker.
 *
 * The seven calendar periods, and no dates of its own (docs/plans/active/
 * calendar-periods-plan.md): Sites and Search Console read the same.
 */
export function useSiteRange(): SitePeriodRange {
  const params = useSearchParams();
  return parseSitePeriod(params, new Date(), useOpeningPeriod());
}

export function SiteDateRange() {
  const t = useTranslations("sites.range");
  const tp = useTranslations("common.periods");
  const setParams = useSetSiteParams();
  const range = useSiteRange();
  const choices = useCalendarPeriodChoices();
  const opening = useOpeningPeriod();

  // A new period draws in its own step (rule 8): a step chosen for the last one is dropped.
  const choosePeriod = (next: string) => setParams({ [CALENDAR_PERIOD_KEY]: next === opening ? null : next, step: null });
  const chooseStep = (next: string) => setParams({ step: next === stepOf(range.period) ? null : next });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select aria-label={tp("label")} value={range.period} onChange={choosePeriod}>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>{choice.label}</option>
        ))}
      </Select>
      <Select aria-label={t("stepLabel")} value={range.step} onChange={chooseStep}>
        <option value="day">{t("daily")}</option>
        <option value="week">{t("weekly")}</option>
        <option value="month">{t("monthly")}</option>
      </Select>
    </div>
  );
}
