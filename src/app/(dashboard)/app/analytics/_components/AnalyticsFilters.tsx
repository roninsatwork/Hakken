"use client";

import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Select } from "@/src/ui/components/screens/Select";
import { countryName } from "../../search-console/_components/countries";
import { readerLanguage } from "../../search-console/_components/searchConsoleFormat";
import {
  DEVICES,
  PERIODS,
  STEPS,
  pageForPath,
  useAnalyticsCountry,
  useAnalyticsSiteId,
  useDevice,
  usePeriod,
  useStep,
  type Device,
  type Period,
  type Step,
} from "./useAnalytics";

/**
 * The home country, the device, the dates and the step, at the top of every
 * page (GA13, GA31; §11, §18.6.1): the website's home countries — Search
 * Console's own choice, opening on the main one — every device or one, the
 * ready-made periods (§4.3), and how the charts step. Each is kept in the
 * address, so it travels with the menu. Live counts every country, as
 * Google's own Realtime does (Anthony, 2026-10-13), so offers none (§18).
 */
export function AnalyticsFilters() {
  const t = useTranslations("googleAnalytics.filters");
  const siteId = useAnalyticsSiteId();
  const pathname = usePathname();
  const [device, setDevice] = useDevice();
  const [period, setPeriod] = usePeriod();
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
          <Select aria-label={t("period")} value={period} onChange={(next) => setPeriod(next as Period)}>
            {PERIODS.map((value) => <option key={value} value={value}>{t(`periods.${value}`)}</option>)}
          </Select>
          <Select aria-label={t("step")} value={step} onChange={(next) => setStep(next as Step)}>
            {STEPS.map((value) => <option key={value} value={value}>{t(`steps.${value}`)}</option>)}
          </Select>
        </>
      ) : null}
    </div>
  );
}
