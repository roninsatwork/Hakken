"use client";

import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import { useHealthWords } from "./useHealthWords";
import { useAnalyticsHref, useAnalyticsSiteId, type AnalyticsStatus } from "./useAnalytics";

/**
 * Overview's line from the tracking health checks (§5, §6; §11 board 2):
 * how many need a look, and what, with the way to Tracking health. Nothing
 * while every check passes.
 */
export function TrackingHealthLine({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const router = useRouter();
  const hrefFor = useAnalyticsHref(useAnalyticsSiteId());
  const words = useHealthWords(status);
  const checks = status.connection?.health?.checks ?? [];
  const failing = checks.filter((check) => !check.passing);
  if (failing.length === 0) return null;
  return (
    <Notice
      tone="warning"
      action={<Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("tracking-health"))}>{t("see")}</Button>}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
        {t("lineTitle", { failing: failing.length, total: checks.length })}
      </span>
      <span className="block">{failing.map((check) => words(check).short).join(" ")}</span>
    </Notice>
  );
}
