"use client";

import { useTranslations } from "next-intl";

import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";

/** A run is flagged when it costs this much more than the one before (`COST_WARNING_RATIO` in `seoRunReports.ts`). */
const COST_WARNING_RATIO = 1.25;

/** How much more a run cost than the one before, in whole percent, when that is worth a flag. */
export function costRise(totalUsd: number, previousTotalUsd: number | null): number | null {
  if (previousTotalUsd === null || previousTotalUsd <= 0) return null;
  return totalUsd >= previousTotalUsd * COST_WARNING_RATIO
    ? Math.round(((totalUsd - previousTotalUsd) / previousTotalUsd) * 100)
    : null;
}

/**
 * Where a collection run stands, as pills: dearer than the last run, still
 * waiting or being answered, failed, or complete. Shared by the runs list and
 * the run's own page so the two never say it differently.
 */
export function RunStatus({
  totalUsd,
  previousTotalUsd,
  waiting,
  answering,
  failed,
  final,
}: {
  totalUsd: number;
  previousTotalUsd: number | null;
  waiting: number;
  answering: number;
  failed: number;
  final: boolean;
}) {
  const t = useTranslations("admin.collectionRuns.status");
  const rise = costRise(totalUsd, previousTotalUsd);
  return (
    // Wrapping, so the runs table fits beside the menus (design-drift-plan D4).
    <span className="flex flex-wrap gap-1.5">
      {rise !== null ? <StatusLabel tone="warning" wrap>{t("costUp", { percent: rise })}</StatusLabel> : null}
      {waiting > 0 ? <StatusLabel tone="neutral" wrap>{t("waiting", { count: waiting })}</StatusLabel> : null}
      {answering > 0 ? <StatusLabel tone="info" wrap>{t("answering", { count: answering })}</StatusLabel> : null}
      {failed > 0 ? <StatusLabel tone="danger" wrap>{t("failed", { count: failed })}</StatusLabel> : null}
      {final && failed === 0 ? <StatusLabel tone="success" wrap>{t("complete")}</StatusLabel> : null}
    </span>
  );
}
