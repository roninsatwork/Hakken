"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ListChecks } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { useFindingsTable } from "../_components/FindingsTable";
import { useInsightsSite } from "../_components/useInsights";

/**
 * All findings (docs/plans/active/insights-analyst-plan.md §4.1, drawn as
 * the Findings board): every finding Hakken has written for the company,
 * newest first, each a story across its sources with what to do and how
 * we'll know. Kept two years (I7).
 */
export default function InsightsAllFindingsPage() {
  const t = usePlatformTranslations("insights.findings");
  const site = useInsightsSite();
  const rows = useQuery(api.insightsReads.insightsAllFindings, site ? { siteId: site } : {});
  const table = useFindingsTable({ rows, when: "found", opening: "week" });
  return (
    <>
      <PageHeader icon={<ListChecks className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable {...table} footer={table.footer} />
    </>
  );
}
