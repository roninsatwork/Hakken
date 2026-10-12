"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { ListChecks } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { isFindingSection, sectionOf } from "@/convex/utils/insightSections";
import { useFindingsTable } from "../../../_components/FindingsTable";
import { useInsightsHref, useInsightsSite } from "../../../_components/useInsights";

/**
 * One section of Findings (insights-intelligence-plan.md phase 7): the
 * findings filed under it — Enquiries and pages, Search and content, AI
 * answers, Rivals, links and reviews, or Technical and measurement — its
 * biggest first in a line, then every one, each opening its whole case.
 */
export default function InsightsFindingsSectionPage() {
  const t = usePlatformTranslations("insights.findings");
  const params = useParams();
  const raw = typeof params.section === "string" ? params.section : "";
  const section = isFindingSection(raw) ? raw : "enquiries";
  const href = useInsightsHref();
  const site = useInsightsSite();
  const all = useQuery(api.insightsReads.insightsAllFindings, site ? { siteId: site } : {});
  const rows = all?.filter((row) => sectionOf(row) === section);
  const table = useFindingsTable({ rows, when: "found", opening: "week" });
  const top = [...(rows ?? [])].sort((a, b) => (b.atStake ?? 0) - (a.atStake ?? 0) || b.week.localeCompare(a.week) || a.rank - b.rank)[0];
  return (
    <>
      <PageHeader icon={<ListChecks className="h-5 w-5 text-brand" />} title={t(`sections.${section}.title`)} description={t(`sections.${section}.description`)} />
      {rows && rows.length === 0 ? <HakkenEmptyState icon={ListChecks} title={t("sections.emptyTitle")} description={t("sections.emptyDescription")} /> : null}
      {top ? <HakkenSees says={[t("sections.sees", { count: rows?.length ?? 0 })]} steps={[{ words: top.headline, link: t("overview.see"), href: href(`findings/${top.findingId}`) }]} /> : null}
      {rows && rows.length > 0 ? <DataTable {...table} footer={table.footer} /> : null}
    </>
  );
}
