"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { OPENING_PERIOD, stepOf } from "@/convex/utils/calendarPeriods";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import {
  CUSTOM_RANGE_KEY,
  SITE_PRESETS,
  defaultStep,
  parseSitePeriod,
  parseSiteRange,
  presetRange,
  siteRangeQuery,
  type SitePeriodRange,
  type SitePreset,
  type SiteRange,
  type SiteStep,
} from "./siteRange";
import { CALENDAR_PERIOD_KEY, useCalendarPeriodChoices } from "./useCalendarPeriod";
import { useSetSiteParams } from "./useSiteParam";

/**
 * The shared date menu and step control (D3, D11), writing the URL so every
 * page, link and refresh keeps what was chosen. Quiet grey controls: the
 * page's one orange action, where there is one, is never a picker.
 *
 * Sites reads the calendar periods (`calendar`, docs/plans/active/
 * calendar-periods-plan.md); Search Console keeps its days and custom range
 * until its phase moves it, and then this keeps only the periods.
 */
export function useSiteRange(): SitePeriodRange {
  const params = useSearchParams();
  return parseSitePeriod(params);
}

/** Search Console's days, until its phase moves it to the calendar periods. */
export function useDaysRange(): SiteRange {
  const params = useSearchParams();
  return parseSiteRange(params);
}

export function SiteDateRange({ oldest, calendar = false }: { oldest?: string; calendar?: boolean } = {}) {
  return calendar ? <PeriodMenu /> : <DaysMenu oldest={oldest} />;
}

function PeriodMenu() {
  const t = useTranslations("sites.range");
  const tp = useTranslations("common.periods");
  const setParams = useSetSiteParams();
  const range = useSiteRange();
  const choices = useCalendarPeriodChoices();

  // A new period draws in its own step (rule 8): a step chosen for the last one is dropped.
  const choosePeriod = (next: string) => setParams({ [CALENDAR_PERIOD_KEY]: next === OPENING_PERIOD ? null : next, step: null });
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

function DaysMenu({ oldest }: { oldest?: string }) {
  const t = useTranslations("sites.range");
  const setParams = useSetSiteParams();
  const range = useDaysRange();

  // The range's own keys are rewritten; a page's filters and "compare with" stay.
  const apply = (next: SiteRange) => {
    const written = new URLSearchParams(siteRangeQuery(next).replace(/^\?/, ""));
    setParams(Object.fromEntries(["from", "to", "step", CUSTOM_RANGE_KEY].map((key) => [key, written.get(key)])));
  };

  const setPreset = (value: string) => {
    if ((SITE_PRESETS as readonly string[]).includes(value)) apply(presetRange(value as SitePreset));
    else apply({ ...range, preset: "custom" });
  };

  const setDay = (which: "from" | "to", value: string) => {
    if (!value) return;
    // A day before the oldest the screens hold can't be chosen (Search Console: Google's sixteen months).
    const from = which === "from" ? (oldest && value < oldest ? oldest : value) : range.from;
    const to = which === "to" ? value : range.to;
    apply({ from, to, step: defaultStep(from, to), preset: "custom" });
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select aria-label={t("label")} value={range.preset} onChange={setPreset}>
        <option value="7">{t("last7")}</option>
        <option value="30">{t("last30")}</option>
        <option value="90">{t("last90")}</option>
        <option value="365">{t("last365")}</option>
        <option value="730">{t("last730")}</option>
        <option value="custom">{t("custom")}</option>
      </Select>
      {range.preset === "custom" && (
        <>
          <Field label={t("from")} labelHidden type="date" value={range.from} min={oldest} max={range.to} onChange={(event) => setDay("from", event.target.value)} />
          <Field label={t("to")} labelHidden type="date" value={range.to} min={range.from} onChange={(event) => setDay("to", event.target.value)} />
        </>
      )}
      <Select aria-label={t("stepLabel")} value={range.step} onChange={(value) => apply({ ...range, step: value as SiteStep })}>
        <option value="day">{t("daily")}</option>
        <option value="week">{t("weekly")}</option>
        <option value="month">{t("monthly")}</option>
      </Select>
    </div>
  );
}
