"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable, type DataTableSort } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../../../app/sites/_components/siteFormat";
import { TopicSelect, topicNameIn, useTopicChoices } from "../../_components/TopicSelect";
import { AnalyticsSection } from "../_components/AnalyticsSection";
import { TrendLine } from "../_components/TrendLine";
import { count } from "../_components/measures";
import { usePeriod } from "../_components/usePeriod";

type Answer = FunctionReturnType<typeof api.readingAnalytics.analyticsPeople>;
type SortKey = "name" | "articles" | "views" | "reads" | "readRate" | "clicks" | "answers";

/**
 * Admin → Content → Analytics → People (content-people-knowledge-plan.md,
 * board 10): everyone in Who to follow, by how much clients read them in the
 * period — how many articles they brought, views, reads, read rate, clicks to
 * their originals and channels, uses in answers, and their views by day.
 * Narrowed by topic and sorted by any heading on the server; a row opens the
 * person's own page in Who to follow.
 */
export default function AnalyticsPeoplePage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsSection>
        <PeopleScreen />
      </AnalyticsSection>
    </Suspense>
  );
}

function PeopleScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const router = useRouter();
  const convex = useConvex();
  const topicChoices = useTopicChoices();
  const [period] = usePeriod();
  const downloader = useAdminAction({ scope: "admin-analytics-people-download" });
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "views", direction: "desc" });
  const [page, setPage] = useState(1);
  const args = { period, ...(topic ? { topic } : {}), sort: sort.key, direction: sort.direction };
  const listKey = JSON.stringify(args);
  const answer = useQuery(api.readingAnalytics.analyticsPeople, { ...args, page, rows: TABLE_PAGE_SIZE });
  const [held, setHeld] = useState<{ listKey: string; result: Answer } | null>(null);
  if (answer !== undefined && (held?.result !== answer || held.listKey !== listKey)) setHeld({ listKey, result: answer });
  const shown = answer ?? (held?.listKey === listKey ? held.result : undefined);
  const tableSort: DataTableSort = {
    key: sort.key,
    direction: sort.direction,
    onSort: (pressed) => {
      const key = pressed as SortKey;
      setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" });
      setPage(1);
    },
  };
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;

  const download = () => void downloader.run(async () => {
    const all = await convex.query(api.readingAnalytics.analyticsPeople, { ...args, page: 1, rows: TABLE_PAGE_SIZE, all: true });
    saveTextFile(toCsv(
      [t("columns.person"), t("columns.topic"), t("columns.articles"), t("measures.views"), t("measures.reads"), t("columns.readRate"), t("measures.clicks"), t("measures.answers")],
      all.page.rows.map((row) => [row.name, topicNameIn(topicChoices, row.topic ?? undefined) ?? "", row.articles, row.views, row.reads, row.readRate, row.clicks, row.answers]),
    ), `content-analytics-people-${period}-days.csv`);
  }, { fallbackMessage: t("errors.downloadFailed") });

  return (
    <>
      <PageHeader icon={<Users className="h-6 w-6 text-brand" />} title={t("people.title")} description={t("people.subtitle")} />
      <DataTable
        rows={shown?.page.rows}
        rowKey={(row) => row.followId}
        onRowClick={(row) => router.push(`/admin/content/who-to-follow/${row.followId}`)}
        sort={tableSort}
        filters={<TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={(value) => { setTopic(value); setPage(1); }} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />}
        cardHeader={
          <TableBar
            footer={{ isLoading: shown === undefined, totalCount: shown?.page.total ?? 0 }}
            noun="people"
            actions={<DownloadButton label={t("download")} busyLabel={t("downloading")} busy={downloader.isBusy()} disabled={!shown?.page.total} onClick={download} />}
          />
        }
        empty={{ icon: <Users className="h-8 w-8 text-muted/30" />, label: topic ? t("people.noMatch") : t("people.empty") }}
        footer={{
          mode: "paged",
          page: shown?.page.page ?? page,
          totalPages: shown?.page.pages ?? 1,
          totalCount: shown?.page.total ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: answer === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "name",
            header: t("columns.person"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.name}</span>
                <span className="text-[12px] text-secondary">
                  {[topicNameIn(topicChoices, row.topic ?? undefined), row.picked ? t("people.pick") : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          { key: "articles", header: t("columns.articles"), align: "right", sortable: true, cell: (row) => number(row.articles) },
          { key: "views", header: t("measures.views"), align: "right", sortable: true, cell: (row) => number(row.views) },
          { key: "reads", header: t("measures.reads"), align: "right", sortable: true, cell: (row) => number(row.reads) },
          { key: "readRate", header: t("columns.readRate"), align: "right", sortable: true, cell: (row) => (row.readRate === null ? <NoFigure /> : <span className="font-mono text-[12px] tabular-nums">{row.readRate}%</span>) },
          { key: "clicks", header: t("measures.clicks"), align: "right", sortable: true, cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
          { key: "answers", header: t("measures.answers"), align: "right", sortable: true, cell: (row) => (row.answers ? number(row.answers) : <NoFigure />) },
          { key: "trend", header: t("columns.trend"), cell: (row) => (shown ? <TrendLine days={row.trend} range={shown.range} label={t("columns.trendLabel", { title: row.name })} /> : null) },
        ]}
      />
    </>
  );
}
