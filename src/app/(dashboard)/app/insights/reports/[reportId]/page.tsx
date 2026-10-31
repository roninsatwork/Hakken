"use client";

import { useEffect } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDay } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { ReportDownloadAction } from "../../_components/ReportDownload";
import { ReportTop, reportLines } from "../../_components/ReportParts";
import { useInsightsHref, useInsightsSite } from "../../_components/useInsights";

/**
 * One report, exactly as written (insights-analyst-plan.md §4.1, I6): its
 * summary and what's next, its figures and enquiries a month as they were
 * that day, and every section's words — and, for a monthly or board report,
 * its PDF. Opening it marks it read.
 */
export default function InsightsReportPage() {
  const params = useParams();
  const t = usePlatformTranslations("insights.reports");
  const href = useInsightsHref();
  const site = useInsightsSite();
  const report = useQuery(api.insightsReads.insightsReport, { reportId: params.reportId as Id<"insightReports"> });
  const markRead = useMutation(api.insightsReads.markInsightReportRead);
  const lines = report ? reportLines(report, t) : undefined;
  const pages = useSitePager(lines, { isLoading: report === undefined });
  // Opening a report marks it read, quietly: a failure is retried in the background and never interrupts the reader.
  const action = useAdminAction({ scope: "insight-report-read" });
  const { run } = action;
  useEffect(() => {
    if (report && report.status === "WRITTEN") void run(() => markRead({ reportId: report.reportId }), { key: `read:${report.reportId}`, backgroundRetry: true, suppressErrorToast: true });
  }, [report, markRead, run]);

  if (report === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (report === null) return <HakkenEmptyState icon={FileText} title={t("notFound")} description={t("notFoundDescription")} />;
  const written = formatDay(new Date(report.createdAt).toISOString().slice(0, 10));

  return (
    <>
      <DetailHeader
        back={{ label: t("back"), href: href("reports") }}
        icon={<FileText className="h-6 w-6 text-brand" />}
        title={report.title}
        description={t("about", { host: report.host, from: formatDay(report.from), to: formatDay(report.to), written })}
        pills={<TagLabel>{t(`kinds.${report.kind}`)}</TagLabel>}
        action={<ReportDownloadAction report={report} label={t("downloadPdf")} />}
      />
      <ReportTop report={report} page={{ screen: "insights.report", siteId: site, data: report }} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.key}
        cardHeader={<TableBar footer={pages.footer} noun="results" title={t("sectionsTitle")} actions={<ListDownload label={t("download")} fileName={`${report.host}-${report.kind.toLowerCase()}-${report.period}`} rows={lines} columns={[{ header: t("section"), value: (row) => row.section }, { header: t("words"), value: (row) => row.words }]} />} />}
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: t("noSections") }}
        footer={pages.footer}
        columns={[
          { key: "section", header: t("section"), cell: (row) => <TagLabel>{row.section}</TagLabel> },
          { key: "words", header: t("words"), cell: (row) => <span className="text-[13px] text-foreground">{row.words}</span> },
        ]}
      />
    </>
  );
}
