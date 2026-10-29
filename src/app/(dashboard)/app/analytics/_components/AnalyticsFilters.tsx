"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DatesMenu, type DateChoice } from "@/src/ui/components/screens/DatesMenu";
import { Select } from "@/src/ui/components/screens/Select";
import { countryName } from "../../search-console/_components/countries";
import { readerLanguage } from "../../search-console/_components/searchConsoleFormat";
import { useOpeningPeriod } from "../../sites/_components/useCalendarPeriod";
import { useSetSiteParams } from "../../sites/_components/useSiteParam";
import {
  DEVICES,
  PERIOD_KEY,
  STEPS,
  STEP_KEY,
  pageForPath,
  useAnalyticsCountry,
  useAnalyticsSiteId,
  useAnalyticsDates,
  useDevice,
  useStep,
  type Device,
  type Step,
  useAnalyticsStatus,
} from "./useAnalytics";

/**
 * The home country, the device, the dates and the step, at the top of every
 * page (GA13, GA31; §11, §18.6.1): the website's home countries — Search
 * Console's own choice, opening on the main one — every device or one, the
 * ready-made periods (§4.3) or custom dates, and how the charts step. Each is kept in the
 * address, so it travels with the menu. The dates are the seven calendar
 * periods every section shares (calendar-periods-plan.md, phase 6) and custom dates, whose
 * lists are asked of Google when first asked for (sees-header-and-rolling-dates-plan.md, part two). Live counts every country, as
 * Google's own Realtime does (Anthony, 2026-10-13), so offers none (§18).
 */
export function AnalyticsFilters() {
  const t = useTranslations("googleAnalytics.filters");
  const siteId = useAnalyticsSiteId();
  const pathname = usePathname();
  const [device, setDevice] = useDevice();
  const [choice] = useAnalyticsDates();
  const status = useAnalyticsStatus();
  const opening = useOpeningPeriod();
  const setParams = useSetSiteParams();
  // A new period draws in its own step (rule 8): a step chosen for the last one is dropped. Custom dates travel as from and to.
  const chooseDates = (next: DateChoice) => setParams(next.period === "custom"
    ? { [PERIOD_KEY]: "custom", from: next.from, to: next.to, [STEP_KEY]: null }
    : { [PERIOD_KEY]: next.period === opening ? null : next.period, from: null, to: null, [STEP_KEY]: null });
  const [step, setStep] = useStep();
  const [country, setCountry] = useAnalyticsCountry();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const language = readerLanguage();
  const name = (code: string) => countryName(code, language) ?? code.toUpperCase();
  const page = pageForPath(pathname, siteId);
  const countries = page !== "live";
  // Live is the last 30 minutes, minute by minute (GA34): no dates, no chart step.
  const dated = page !== "live";
  return (
    <div className="flex flex-wrap items-end gap-3">
      {countries ? (
        <Select aria-label={t("country")} value={country ?? ""} onChange={(next) => setCountry(next || null)}>
          <option value="">{choices ? name(choices.main) : ""}</option>
          {(choices?.ready ?? []).map((code) => <option key={code} value={code}>{name(code)}</option>)}
        </Select>
      ) : null}
      <Select aria-label={t("device")} value={device} onChange={(next) => setDevice(next as Device)}>
        {DEVICES.map((value) => <option key={value} value={value}>{t(`devices.${value}`)}</option>)}
      </Select>
      {dated ? (
        <>
          <DatesMenu value={choice} newest={status?.connection?.newestDay ?? null} onChange={chooseDates} />
          <Select aria-label={t("step")} value={step} onChange={(next) => setStep(next as Step)}>
            {STEPS.map((value) => <option key={value} value={value}>{t(`steps.${value}`)}</option>)}
          </Select>
        </>
      ) : null}
    </div>
  );
}
