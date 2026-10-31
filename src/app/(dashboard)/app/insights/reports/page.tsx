"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsHref, useInsightsSite } from "../_components/useInsights";

/**
 * Reports (docs/plans/active/insights-analyst-plan.md §4.1, drawn as the
 * Reports board): every brief, monthly report and board report Hakken has
 * written, exactly as written, newest first, kept two years (I7). A row
 * opens the report.
 */
export default function InsightsReportsPage() {
  const t = usePlatformTranslations("insights.reports");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const rows = useQuery(api.insightsReads.insightsReports, site ? { siteId: site } : {});
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<string>("kind", "");
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!kind || row.kind === kind) && (!matches || matches(row.title)));
  const pages = useSitePager(shown, { isLoading: rows === undefined });
  const covers = (row: { from: string; to: string }) => `${formatDay(row.from)} – ${formatDay(row.to)}`;

  return (
    <>
      <PageHeader icon={<FileText className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <HakkenSees says={[]} steps={[]} page={{ screen: "insights.reports", siteId: site, data: rows }} />
      <DataTable
        rows={pages.pageRows}
        rowKey={(row) => row.reportId}
        onRowClick={(row) => router.push(href(`reports/${row.reportId}`))}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("kind"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={setKind} aria-label={t("kind")}>
            <option value="">{t("everyKind")}</option>
            {(["WEEKLY", "MONTHLY", "BOARD"] as const).map((value) => <option key={value} value={value}>{t(`kinds.${value}`)}</option>)}
          </Select>
        }
        cardHeader={
          <TableBar
            footer={pages.footer}
            noun="results"
            actions={<ListDownload label={t("download")} fileName="insights-reports" rows={shown} columns={[{ header: t("report"), value: (row) => row.title }, { header: t("kind"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("covers"), value: covers }, { header: t("written"), value: (row) => formatDay(new Date(row.createdAt).toISOString().slice(0, 10)) }]} />}
          />
        }
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term || kind ? t("noMatch") : t("empty") }}
        footer={pages.footer}
        columns={[
          { key: "title", header: t("report"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-foreground">{row.title}</span><span className="text-[12px] text-secondary">{row.host}</span></span> },
          { key: "kind", header: t("kind"), cell: (row) => <TagLabel>{t(`kinds.${row.kind}`)}</TagLabel> },
          { key: "covers", header: t("covers"), cell: (row) => <span className="text-[12px] text-secondary">{covers(row)}</span> },
          { key: "written", header: t("written"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatDay(new Date(row.createdAt).toISOString().slice(0, 10))}</span> },
          { key: "status", header: t("status"), cell: (row) => <StatusLabel tone={row.status === "READ" ? "neutral" : "info"}>{t(`statuses.${row.status}`)}</StatusLabel> },
        ]}
      />
      <Notice>{t("frozen")}</Notice>
    </>
  );
}
