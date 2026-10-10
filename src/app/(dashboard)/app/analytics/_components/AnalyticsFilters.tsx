"use client";

import { useTranslations } from "next-intl";
import { Select } from "@/src/ui/components/screens/Select";
import { DEVICES, PERIODS, STEPS, useDevice, usePeriod, useStep, type Device, type Period, type Step } from "./useAnalytics";

/**
 * The device, the dates and the step, at the top of every page (GA13; §11):
 * every device or one, the ready-made periods (§4.3), and how the charts step.
 * Each is kept in the address, so it travels with the menu.
 */
export function AnalyticsFilters() {
  const t = useTranslations("googleAnalytics.filters");
  const [device, setDevice] = useDevice();
  const [period, setPeriod] = usePeriod();
  const [step, setStep] = useStep();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select aria-label={t("device")} value={device} onChange={(next) => setDevice(next as Device)}>
        {DEVICES.map((value) => <option key={value} value={value}>{t(`devices.${value}`)}</option>)}
      </Select>
      <Select aria-label={t("period")} value={period} onChange={(next) => setPeriod(next as Period)}>
        {PERIODS.map((value) => <option key={value} value={value}>{t(`periods.${value}`)}</option>)}
      </Select>
      <Select aria-label={t("step")} value={step} onChange={(next) => setStep(next as Step)}>
        {STEPS.map((value) => <option key={value} value={value}>{t(`steps.${value}`)}</option>)}
      </Select>
    </div>
  );
}
