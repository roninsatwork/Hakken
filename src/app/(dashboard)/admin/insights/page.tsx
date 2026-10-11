"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { dollars } from "@/src/app/(dashboard)/admin/companies/[id]/websites/money";

/**
 * Admin → Insights → Weekly runs (docs/plans/active/insights-analyst-plan.md
 * §4.3): each website's week as the team left it — its verdict, how many
 * findings the Editor passed and sent back, the facts read and what it cost —
 * newest first. A row opens the week's findings.
 */
export default function InsightsWeeklyRunsPage() {
  const t = useTranslations("admin.insights.runs");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounce(search, 300).trim().toLowerCase();
  const weeks = useQuery(api.insightsAdmin.insightWeeksList, {});

  const matching = (weeks ?? []).filter((row) => !term || `${row.company} ${row.host}`.toLowerCase().includes(term));
  const totalPages = Math.max(1, Math.ceil(matching.length / TABLE_PAGE_SIZE));
  const visible = matching.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const empty = search ? t("noMatch") : t("empty");

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider icon={<Lightbulb className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={weeks === undefined ? undefined : visible}
        rowKey={(row) => row.weekId}
        onRowClick={(row) => router.push(`/admin/insights/${row.weekId}`)}
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: t("searchPlaceholder") }}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: empty }}
        footer={{ mode: "paged", page, totalPages, totalCount: matching.length, pageSize: TABLE_PAGE_SIZE, isLoading: weeks === undefined, onPageChange: setPage, labels: { empty } }}
        columns={[
          {
            key: "website",
            header: t("website"),
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-foreground">{row.host}</span>
                <span className="truncate text-[12px] text-secondary">{row.company}</span>
              </span>
            ),
          },
          { key: "week", header: t("week"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.week}</span> },
          { key: "verdict", header: t("verdict"), cell: (row) => <span className="line-clamp-2 text-[12px] text-secondary">{row.verdict}</span> },
          {
            key: "found",
            header: t("found"),
            cell: (row) => (
              <span className="flex flex-col gap-1">
                <StatusLabel tone="success">{t("published", { count: row.published })}</StatusLabel>
                {row.sentBack > 0 ? <StatusLabel tone="warning">{t("sentBack", { count: row.sentBack })}</StatusLabel> : null}
              </span>
            ),
          },
          { key: "facts", header: t("facts"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.facts.toLocaleString("en-GB")}</span> },
          { key: "cost", header: t("cost"), align: "right", cell: (row) => <span className="font-mono text-[13px] text-foreground">{dollars(row.costUsd)}</span> },
        ]}
      />
    </div>
  );
}
