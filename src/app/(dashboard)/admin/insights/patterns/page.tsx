"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";

/**
 * Admin → Insights → Patterns (insights-analyst-plan.md §3, §4.3, I15): each
 * pattern the specialists' checklists know, by specialist — how often it
 * fired, on how many websites, how many the Editor passed or sent back, and
 * how those checked turned out. The AI's proposed patterns wait here for a
 * yes once the team proposes any; none is proposed yet.
 */
export default function InsightsPatternsPage() {
  const t = useTranslations("admin.insights.patterns");
  const tWeek = useTranslations("admin.insights.week");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebounce(search, 300).trim().toLowerCase();
  const patterns = useQuery(api.insightsAdmin.insightPatterns, {});

  const matching = (patterns ?? []).filter((row) => !term || `${row.pattern} ${row.specialist}`.toLowerCase().includes(term));
  const totalPages = Math.max(1, Math.ceil(matching.length / TABLE_PAGE_SIZE));
  const visible = matching.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const empty = search ? t("noMatch") : t("empty");
  const figure = (value: number) => <span className="font-mono text-[12px] text-secondary">{value}</span>;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider icon={<Lightbulb className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <Notice>{t("proposed")}</Notice>
      <DataTable
        rows={patterns === undefined ? undefined : visible}
        rowKey={(row) => `${row.specialist}:${row.pattern}`}
        search={{ value: search, onChange: (value) => { setSearch(value); setPage(1); }, placeholder: t("searchPlaceholder") }}
        empty={{ icon: <Lightbulb className="h-8 w-8 text-muted/30" />, label: empty }}
        footer={{ mode: "paged", page, totalPages, totalCount: matching.length, pageSize: TABLE_PAGE_SIZE, isLoading: patterns === undefined, onPageChange: setPage, labels: { empty } }}
        columns={[
          { key: "pattern", header: t("pattern"), cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.pattern}</span> },
          { key: "specialist", header: t("specialist"), cell: (row) => <TagLabel>{tWeek(`specialist.${row.specialist}`)}</TagLabel> },
          { key: "fired", header: t("fired"), align: "right", cell: (row) => figure(row.fired) },
          { key: "websites", header: t("websites"), align: "right", cell: (row) => figure(row.websites) },
          { key: "published", header: t("published"), align: "right", cell: (row) => figure(row.published) },
          { key: "sentBack", header: t("sentBack"), align: "right", cell: (row) => figure(row.sentBack) },
          { key: "held", header: t("held"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.right + row.wrong === 0 ? "–" : `${row.right} / ${row.right + row.wrong}`}</span> },
          { key: "last", header: t("last"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.lastWeek}</span> },
        ]}
      />
    </div>
  );
}
