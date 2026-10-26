"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatDateTime } from "@/src/lib/dates";
import { useInsightsSite } from "./useInsights";

/** The whole section's saved outcomes, independent of when its weekly brief was saved. */
export function InsightsRefreshNotice() {
  const t = usePlatformTranslations("insights.refresh");
  const site = useInsightsSite();
  const refresh = useQuery(api.insightsReads.sectionRefresh, site ? { siteId: site } : {});
  if (!refresh?.length) return null;
  return <>{refresh.map((run) => {
    const complete = run.stages.filter((stage) => stage.status === "SUCCESS").length;
    const moving = run.status === "RUNNING" || run.status === "QUEUED";
    const finished = run.recorded && run.stages.length > 0 && run.status === "SUCCESS" && complete === run.stages.length;
    const sections = run.stages.filter((stage) => stage.status !== "SUCCESS").map((stage) => t(`stages.${stage.stage}`)).join(", ");
    const message = moving
      ? t("updating", { host: run.host, complete, total: run.stages.length })
      : finished ? t("completed", { host: run.host, when: formatDateTime(run.updatedAt) })
      : run.recorded ? t("unfinished", { host: run.host, sections })
      : t("unrecorded", { host: run.host });
    return <Notice key={run.siteId} tone={moving || finished ? "info" : "warning"}>{message}</Notice>;
  })}</>;
}
