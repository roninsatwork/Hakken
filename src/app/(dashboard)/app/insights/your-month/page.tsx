"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { CalendarDays } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { ReportDownloadAction } from "../_components/ReportDownload";
import { ReportTop } from "../_components/ReportParts";
import { useInsightsSite } from "../_components/useInsights";

/**
 * Your month (docs/plans/active/insights-analyst-plan.md §4.1, drawn as the
 * Month board): the newest monthly report — what happened and why, what
 * Hakken did and what's next — written from the 4th of each month, and its
 * PDF.
 */
export default function InsightsYourMonthPage() {
  const t = usePlatformTranslations("insights.month");
  const tr = usePlatformTranslations("insights.reports");
  const site = useInsightsSite();
  const report = useQuery(api.insightsReads.insightsLatestReport, site ? { kind: "MONTHLY", siteId: site } : { kind: "MONTHLY" });
  const did = report?.body.did;
  const pages = useSitePager(did, { isLoading: report === undefined });

  const header = (
    <PageHeader
      icon={<CalendarDays className="h-5 w-5 text-brand" />}
      title={report ? t("title", { month: report.title.replace(/^[^:]*:\s*/, "") }) : t("titleNone")}
      description={t("description")}
      action={<ReportDownloadAction report={report} label={t("download")} />}
    />
  );
  if (report === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (report === null) return <>{header}<HakkenEmptyState icon={CalendarDays} title={t("noneTitle")} description={t("noneDescription")} /></>;
  return (
    <>
      {header}
      <ReportTop report={report} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.work}
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("didTitle")} actions={<ListDownload label={tr("download")} fileName={`${report.host}-work-${report.period}`} rows={did} columns={[{ header: t("work"), value: (row) => tr(`work.${row.work}`) }, { header: t("howMuch"), value: (row) => row.count }]} />} />}
        empty={{ icon: <CalendarDays className="h-8 w-8 text-muted/30" />, label: t("noWork") }}
        footer={pages.footer}
        columns={[
          { key: "work", header: t("work"), cell: (row) => <span className="text-[13px] text-foreground">{tr(`work.${row.work}`)}</span> },
          { key: "count", header: t("howMuch"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.count)}</span> },
        ]}
      />
    </>
  );
}
