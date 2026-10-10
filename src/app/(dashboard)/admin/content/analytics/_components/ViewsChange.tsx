"use client";

import { useTranslations } from "next-intl";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { changeOn } from "./measures";

/** Views beside the period before, as a figure's sentence: up, down, the same, or nothing to compare. */
export function ViewsChange({ now, before, days }: { now: number; before: number; days: number }) {
  const t = useTranslations("admin.contentAnalytics.overview");
  const change = changeOn(now, before);
  if (change === null) return <ChangeLine by={null}>{t("nothingBefore")}</ChangeLine>;
  if (change === 0) return <ChangeLine by={0}>{t("same", { days })}</ChangeLine>;
  return <ChangeLine by={change}>{t(change > 0 ? "up" : "down", { amount: Math.abs(change), days })}</ChangeLine>;
}
