"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { stepOf } from "@/convex/utils/calendarPeriods";
import { DatesMenu } from "@/src/ui/components/screens/DatesMenu";
import { Select } from "@/src/ui/components/screens/Select";
import { parseSitePeriod, type SitePeriodRange } from "./siteRange";
import { CALENDAR_PERIOD_KEY, useOpeningPeriod } from "./useCalendarPeriod";
import { useSetSiteParams } from "./useSiteParam";

/**
 * The shared date menu and step control (D3, D11), writing the URL so every
 * page, link and refresh keeps what was chosen. Quiet grey controls: the
 * page's one orange action, where there is one, is never a picker.
 *
 * The seven periods of the kit's Dates menu (docs/plans/active/
 * sees-header-and-rolling-dates-plan.md, part two): Sites and Search Console
 * read the same. Sites' days are filed the day they are checked, so its
 * newest day is today.
 */
export function useSiteRange(): SitePeriodRange {
  const params = useSearchParams();
  return parseSitePeriod(params, new Date(), useOpeningPeriod());
}

export function SiteDateRange({ newest = null }: { newest?: string | null } = {}) {
  const t = useTranslations("sites.range");
  const setParams = useSetSiteParams();
  const range = useSiteRange();
  const opening = useOpeningPeriod();

  // A new period draws in its own step (rule 8): a step chosen for the last one is dropped.
  const choosePeriod = (next: string) => setParams({ [CALENDAR_PERIOD_KEY]: next === opening ? null : next, step: null });
  const chooseStep = (next: string) => setParams({ step: next === stepOf(range.period) ? null : next });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <DatesMenu value={{ period: range.period }} newest={newest} custom={false} onChange={(choice) => choosePeriod(choice.period)} />
      <Select aria-label={t("stepLabel")} value={range.step} onChange={chooseStep}>
        <option value="day">{t("daily")}</option>
        <option value="week">{t("weekly")}</option>
        <option value="month">{t("monthly")}</option>
      </Select>
    </div>
  );
}
