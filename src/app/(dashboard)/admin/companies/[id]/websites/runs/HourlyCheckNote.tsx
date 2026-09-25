"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
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
  const Icon = trouble ? AlertTriangle : CheckCircle2;

  return (
    <div className="flex items-start gap-4 rounded-[12px] border border-border-dim/50 bg-foreground/[0.015] p-4 text-secondary">
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${trouble ? "text-warning" : "text-success"}`} />
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-medium tracking-wide text-foreground">{t("title")}</h3>
        <p className="text-[12.5px] leading-relaxed tracking-wide text-secondary">{text}</p>
      </div>
    </div>
  );
}
