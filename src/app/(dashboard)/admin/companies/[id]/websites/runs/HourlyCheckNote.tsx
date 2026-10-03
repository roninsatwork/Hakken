"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { Notice } from "@/src/ui/components/screens/Notice";
import { useRunFormat } from "./runFormat";

/**
 * How the collection's hourly check last went (collection reliability plan,
 * V3): the housekeeping between runs — fetching answers whose pingback never
 * came, filing what was never filed, closing finished runs, clearing old
 * data. Its result was on Admin → Health alone, so a check failing every hour
 * went unseen from the collection's own screens; on 2026-09-25 that hid a
 * stalled Korda collection for seventeen hours.
 */
export function HourlyCheckNote() {
  const t = useTranslations("admin.collectionRuns.hourlyCheck");
  const check = useQuery(api.seoRunReports.readHourlyCheck, {});
  const { when } = useRunFormat();
  if (check === undefined) return null;

  const trouble = check !== null && (!check.ok || check.overdue);
  const text = check === null
    ? t("never")
    : check.overdue
      ? t("overdue", { time: when(check.lastRanAt) })
      : check.ok
        ? t("ok", { time: when(check.lastRanAt) })
        : t("failed", { time: when(check.lastRanAt), count: check.failuresInARow, error: check.error ?? "" });

  return (
    <Notice tone={trouble ? "warning" : "info"}>
      <span className="block text-[13px] font-medium text-foreground">{t("title")}</span>
      <span className="block">{text}</span>
    </Notice>
  );
}
