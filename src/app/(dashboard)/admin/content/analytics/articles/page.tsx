"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable, type DataTableSort } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../../../app/sites/_components/siteFormat";
import { TopicSelect, topicNameIn, useTopicChoices } from "../../_components/TopicSelect";
import { ANALYTICS_BASE, AnalyticsSection } from "../_components/AnalyticsSection";
import { ReadingChart } from "../_components/ReadingChart";
import { TrendLine } from "../_components/TrendLine";
import { MEASURE_COLOURS, count } from "../_components/measures";
import { usePeriod, withPeriod } from "../_components/usePeriod";

type Answer = FunctionReturnType<typeof api.readingAnalytics.analyticsArticles>;
type Row = Answer["page"]["rows"][number];
type SortKey = "title" | "views" | "reads" | "readRate" | "clicks" | "answers";

/**
 * Admin → Content → Analytics → Articles (content-people-knowledge-plan.md,
 * board 8): every article and story clients read in the period — views,
 * reads, read rate, clicks, how often Ask Hakken drew on it and its views by
 * day — narrowed by who it is from, where it is and its topic, sorted by any
 * heading over the whole list, on the server. The chart follows the filters;
 * a row opens the article's own page.
 */
export default function AnalyticsArticlesPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsSection>
        <ArticlesScreen />
      </AnalyticsSection>
    </Suspense>
  );
}

function ArticlesScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const router = useRouter();
  const convex = useConvex();
  const topicChoices = useTopicChoices();
  const [period] = usePeriod();
  const downloader = useAdminAction({ scope: "admin-analytics-articles-download" });
  const [from, setFrom] = useState("");
  const [where, setWhere] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "views", direction: "desc" });
  const [page, setPage] = useState(1);
  const args = {
    period,
    ...(from ? { from } : {}),
    ...(where ? { where: where as "KNOWLEDGE" | "NEWS" } : {}),
    ...(topic ? { topic } : {}),
    sort: sort.key,
    direction: sort.direction,
  };
  const listKey = JSON.stringify(args);
  const answer = useQuery(api.readingAnalytics.analyticsArticles, { ...args, page, rows: TABLE_PAGE_SIZE });
  // While the next page or order loads, the last one stays on screen.
  const [held, setHeld] = useState<{ listKey: string; result: Answer } | null>(null);
  if (answer !== undefined && (held?.result !== answer || held.listKey !== listKey)) setHeld({ listKey, result: answer });
  const shown = answer ?? (held?.listKey === listKey ? held.result : undefined);

  const narrow = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };
  const tableSort: DataTableSort = {
    key: sort.key,
    direction: sort.direction,
    onSort: (pressed) => {
      const key = pressed as SortKey;
      setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "title" ? "asc" : "desc" });
      setPage(1);
    },
  };
  const fromChoice = from === "OURS" ? t("from.ours") : from === "GOOGLE" ? t("from.google") : shown?.people.find((person) => person.followId === from)?.name ?? null;
  const fromLine = (row: Row) => `${row.source === "OURS" ? t("from.ours") : row.fromName} · ${t(`where.${row.where}`)}`;
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;

  const download = () => void downloader.run(async () => {
    const all = await convex.query(api.readingAnalytics.analyticsArticles, { ...args, page: 1, rows: TABLE_PAGE_SIZE, all: true });
    saveTextFile(toCsv(
      [t("columns.article"), t("columns.from"), t("columns.where"), t("columns.topic"), t("measures.views"), t("measures.reads"), t("columns.readRate"), t("measures.clicks"), t("measures.answers")],
      all.page.rows.map((row) => [row.title, row.source === "OURS" ? t("from.ours") : row.fromName, t(`where.${row.where}`), topicNameIn(topicChoices, row.topic ?? undefined) ?? "", row.views, row.reads, row.readRate, row.clicks, row.answers]),
    ), `content-analytics-articles-${period}-days.csv`);
  }, { fallbackMessage: t("errors.downloadFailed") });

  return (
    <>
      <PageHeader icon={<FileText className="h-6 w-6 text-brand" />} title={t("articles.title")} description={t("articles.subtitle", { days: Number(period) })} />
      {shown ? (
        <ReadingChart
          title={t("chart.allTitle")}
          hint={shown.daysCut ? t("chart.narrowedCut") : from || where || topic ? t("chart.narrowedHint") : t("chart.articlesHint")}
          range={shown.range}
          days={shown.days}
          measures={[
            { key: "views", name: t("measures.views"), colour: MEASURE_COLOURS.views },
            { key: "reads", name: t("measures.reads"), colour: MEASURE_COLOURS.reads },
            { key: "clicks", name: t("measures.clicks"), colour: MEASURE_COLOURS.clicks },
          ]}
          exportName="content-analytics-articles"
        />
      ) : null}
      <DataTable
        rows={shown?.page.rows}
        rowKey={(row) => row.itemKey}
        onRowClick={(row) => router.push(withPeriod(`${ANALYTICS_BASE}/articles/${encodeURIComponent(row.itemKey)}`, period))}
        sort={tableSort}
        filters={
          <>
            <Select chip={{ label: t("filters.from"), choice: from ? fromChoice : null }} value={from} onChange={narrow(setFrom)} aria-label={t("filters.from")}>
              <option value="">{t("filters.everyone")}</option>
              <option value="OURS">{t("from.ours")}</option>
              <option value="GOOGLE">{t("from.google")}</option>
              {(shown?.people ?? []).map((person) => <option key={person.followId} value={person.followId}>{person.name}</option>)}
            </Select>
            <Select chip={{ label: t("filters.where"), choice: where ? t(`where.${where}`) : null }} value={where} onChange={narrow(setWhere)} aria-label={t("filters.where")}>
              <option value="">{t("filters.everywhere")}</option>
              <option value="KNOWLEDGE">{t("where.KNOWLEDGE")}</option>
              <option value="NEWS">{t("where.NEWS")}</option>
            </Select>
            <TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={narrow(setTopic)} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />
          </>
        }
        cardHeader={
          <TableBar
            footer={{ isLoading: shown === undefined, totalCount: shown?.page.total ?? 0 }}
            noun="articlesAndStories"
            actions={<DownloadButton label={t("download")} busyLabel={t("downloading")} busy={downloader.isBusy()} disabled={!shown?.page.total} onClick={download} />}
          />
        }
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: from || where || topic ? t("articles.noMatch") : t("articles.empty") }}
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
            key: "title",
            header: t("columns.article"),
            sortable: true,
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{row.title}</span>
                <span className="text-[12px] text-secondary">{fromLine(row)}</span>
              </span>
            ),
          },
          { key: "views", header: t("measures.views"), align: "right", sortable: true, cell: (row) => number(row.views) },
          { key: "reads", header: t("measures.reads"), align: "right", sortable: true, cell: (row) => number(row.reads) },
          { key: "readRate", header: t("columns.readRate"), align: "right", sortable: true, cell: (row) => (row.readRate === null ? <NoFigure /> : <span className="font-mono text-[12px] tabular-nums">{row.readRate}%</span>) },
          { key: "clicks", header: t("measures.clicks"), align: "right", sortable: true, cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
          { key: "answers", header: t("measures.answers"), align: "right", sortable: true, cell: (row) => (row.answers ? number(row.answers) : <NoFigure />) },
          { key: "trend", header: t("columns.trend"), cell: (row) => (shown ? <TrendLine days={row.trend} range={shown.range} label={t("columns.trendLabel", { title: row.title })} /> : null) },
        ]}
      />
    </>
  );
}
