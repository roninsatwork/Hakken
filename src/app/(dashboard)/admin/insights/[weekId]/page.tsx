"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { dollars } from "@/src/app/(dashboard)/admin/companies/[id]/websites/money";

/**
 * One website's week (insights-analyst-plan.md §4.3): the verdict, what was
 * read from each source and what could not be, the cost, and every finding —
 * the ones published in their order, then the ones the Editor sent back with
 * its reason (I21, I29), so the team's work can be checked.
 */
export default function InsightsWeekPage() {
  const t = useTranslations("admin.insights.week");
  const params = useParams();
  const weekId = params.weekId as Id<"insightWeeks">;
  const week = useQuery(api.insightsAdmin.insightWeekDetail, { weekId });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const back = { label: t("back"), href: "/admin/insights" };
  const icon = <Lightbulb className="h-6 w-6 text-brand" />;

  if (week === undefined) return null;
  if (week === null) {
    return (
      <div className="flex w-full flex-col gap-6 pb-12">
        <DetailHeader back={back} icon={icon} title={t("notFound")} />
      </div>
    );
  }
  const published = week.findings.filter((finding) => finding.status === "PUBLISHED").length;
  const term = search.trim().toLowerCase();
  const matching = week.findings.filter((finding) => !term || `${finding.headline} ${finding.pattern} ${finding.specialist}`.toLowerCase().includes(term));
  const totalPages = Math.max(1, Math.ceil(matching.length / TABLE_PAGE_SIZE));
  const empty = term ? t("noMatch") : t("empty");

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={back}
        icon={icon}
        title={t("title", { host: week.host, week: week.week })}
        description={week.verdict}
        pills={<TagLabel>{week.company}</TagLabel>}
      />
      <FigureRow>
        <Figure label={t("published")} value={String(published)} detail={<span className="text-secondary">{t("publishedDetail")}</span>} />
        <Figure label={t("sentBack")} value={String(week.findings.length - published)} detail={<span className="text-secondary">{t("sentBackDetail")}</span>} />
        <Figure label={t("facts")} value={week.sources.reduce((sum, source) => sum + source.facts, 0).toLocaleString("en-GB")} detail={<span className="text-secondary">{week.sources.map((source) => `${source.facts} ${t(`source.${source.source}`)}`).join(" · ")}</span>} />
        <Figure label={t("cost")} value={dollars(week.costUsd)} detail={<span className="text-secondary">{t("costDetail")}</span>} />
      </FigureRow>
      {week.problems.length > 0 ? <Notice tone="warning">{t("problems", { problems: week.problems.join("; ") })}</Notice> : null}
      <DataTable
        rows={matching.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE)}
        rowKey={(row) => row.findingId}
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: t("searchPlaceholder") }}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: empty }}
        footer={{ mode: "paged", page, totalPages, totalCount: matching.length, pageSize: TABLE_PAGE_SIZE, isLoading: false, onPageChange: setPage, labels: { empty } }}
        columns={[
          { key: "rank", header: t("rank"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.status === "PUBLISHED" ? row.rank : "–"}</span> },
          {
            key: "finding",
            header: t("finding"),
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-medium text-foreground">{row.headline}</span>
                <span className="text-[12px] leading-relaxed text-secondary">{row.story}</span>
                <span className="text-[12px] text-foreground">{t("action", { action: row.action })}</span>
                {row.editorNote ? <span className="text-[12px] text-warning">{t("editorNote", { note: row.editorNote })}</span> : null}
              </span>
            ),
          },
          {
            key: "who",
            header: t("who"),
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <TagLabel>{t(`specialist.${row.specialist}`)}</TagLabel>
                <span className="font-mono text-[11px] text-muted">{row.pattern}</span>
              </span>
            ),
          },
          {
            key: "status",
            header: t("status"),
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <StatusLabel tone={row.status === "PUBLISHED" ? "success" : "warning"}>{t(row.status === "PUBLISHED" ? "statusPublished" : "statusSentBack")}</StatusLabel>
                <TagLabel>{t(`sure.${row.sure}`)}</TagLabel>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
