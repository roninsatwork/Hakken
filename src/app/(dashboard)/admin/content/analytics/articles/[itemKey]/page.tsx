"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate } from "@/src/lib/dates";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { paginateItems, TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { toCsv } from "../../../../../app/sites/_components/siteFormat";
import { topicNameIn, useTopicChoices } from "../../../_components/TopicSelect";
import { ANALYTICS_BASE } from "../../_components/AnalyticsSection";
import { PeriodChoice } from "../../_components/PeriodChoice";
import { ReadingChart } from "../../_components/ReadingChart";
import { MEASURE_COLOURS, count } from "../../_components/measures";
import { ViewsChange } from "../../_components/ViewsChange";
import { usePeriod, withPeriod } from "../../_components/usePeriod";

/** The site an address is on, without its "www.". */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * One article or story in Analytics (content-people-knowledge-plan.md,
 * board 9): who it is from and where it is, its views, reads, clicks to the
 * original and uses in answers for the period, its days, and each company
 * that read it — how many of its people, what they did, and when last.
 */
export default function AnalyticsArticlePage() {
  return (
    <Suspense fallback={null}>
      <ArticleScreen />
    </Suspense>
  );
}

function ArticleScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const topicChoices = useTopicChoices();
  const params = useParams();
  const itemKey = decodeURIComponent(String(params.itemKey));
  const [period] = usePeriod();
  const [page, setPage] = useState(1);
  const article = useQuery(api.readingAnalytics.analyticsArticle, { itemKey, period });
  const back = { label: t("back.articles"), page: t("back.articles"), href: withPeriod(`${ANALYTICS_BASE}/articles`, period) };
  const icon = <FileText className="h-6 w-6 text-brand" />;

  if (article === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (article === null) {
    return (
      <div className="flex flex-col gap-5">
        <DetailHeader back={back} icon={icon} title={t("article.notFound")} />
        <HakkenEmptyState icon={FileText} title={t("article.notFound")} description={t("article.notFoundDescription")} />
      </div>
    );
  }

  const { item, figures } = article;
  const rate = figures.views > 0 ? Math.round((figures.reads / figures.views) * 100) : null;
  const site = item.url ? siteOf(item.url) : null;
  const facts = [
    item.fromName || t("from.ours"),
    site,
    item.publishedAt ? t("article.published", { date: formatDate(item.publishedAt) }) : null,
    item.keptAt ? t("article.keptSince", { date: formatDate(item.keptAt) }) : null,
  ].filter(Boolean).join(" · ");
  const shownCompanies = paginateItems(article.companies, page, TABLE_PAGE_SIZE);
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        back={back}
        icon={icon}
        title={item.title}
        description={facts}
        pills={
          <>
            {item.where === "KNOWLEDGE" ? <StatusLabel tone="success">{t("where.KNOWLEDGE")}</StatusLabel> : <StatusLabel tone="neutral">{t("where.NEWS")}</StatusLabel>}
            {topicNameIn(topicChoices, item.topic ?? undefined) ? <TagLabel>{topicNameIn(topicChoices, item.topic ?? undefined)}</TagLabel> : null}
          </>
        }
        action={<PeriodChoice />}
      />
      <FigureRow>
        <Figure
          label={t("measures.views")}
          value={count(figures.views)}
          detail={<ViewsChange now={figures.views} before={figures.viewsBefore} days={article.range.days} />}
        />
        <Figure label={t("measures.reads")} value={count(figures.reads)} detail={<span className="text-secondary">{rate === null ? t("overview.noViews") : t("overview.readRate", { rate })}</span>} />
        <Figure label={t("article.clicks")} value={count(figures.clicks)} detail={<span className="text-secondary">{site ? t("article.clicksOn", { site }) : t("article.noOriginal")}</span>} />
        <Figure label={t("measures.answers")} value={count(figures.answers)} detail={<span className="text-secondary">{t("article.answersDetail", { platformName })}</span>} />
      </FigureRow>
      <ReadingChart
        title={t("chart.articleTitle")}
        hint={t("chart.articleHint")}
        range={article.range}
        days={article.days}
        measures={[
          { key: "views", name: t("measures.views"), colour: MEASURE_COLOURS.views },
          { key: "reads", name: t("measures.reads"), colour: MEASURE_COLOURS.reads },
        ]}
        exportName="content-analytics-article"
      />
      <DataTable
        rows={shownCompanies.items}
        rowKey={(row) => row.companyId}
        onRowClick={(row) => router.push(withPeriod(`${ANALYTICS_BASE}/companies/${row.companyId}`, period))}
        cardHeader={
          <TableBar
            footer={{ isLoading: false, totalCount: article.companies.length }}
            noun="companies"
            actions={
              <DownloadButton
                label={t("download")}
                disabled={article.companies.length === 0}
                onClick={() => saveTextFile(toCsv(
                  [t("columns.company"), t("measures.readers"), t("measures.views"), t("measures.reads"), t("measures.clicks"), t("columns.lastRead")],
                  article.companies.map((row) => [row.name, row.readers, row.views, row.reads, row.clicks, new Date(row.lastAt).toISOString().slice(0, 10)]),
                ), "content-analytics-article-companies.csv")}
              />
            }
          >
            <span className="text-[12px] text-secondary">{t("article.readersBetween", { count: article.readers })}</span>
          </TableBar>
        }
        empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: t("article.noCompanies", { days: article.range.days }) }}
        footer={{
          mode: "paged",
          page: shownCompanies.page,
          totalPages: shownCompanies.totalPages,
          totalCount: shownCompanies.totalItems,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: false,
          onPageChange: setPage,
        }}
        columns={[
          { key: "company", header: t("columns.company"), cell: (row) => <span className="text-[13px] font-medium text-foreground">{row.name}</span> },
          { key: "readers", header: t("measures.readers"), align: "right", cell: (row) => number(row.readers) },
          { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
          { key: "reads", header: t("measures.reads"), align: "right", cell: (row) => number(row.reads) },
          { key: "clicks", header: t("measures.clicks"), align: "right", cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
          { key: "lastRead", header: t("columns.lastRead"), cell: (row) => <span className="text-[12px] text-secondary">{formatDate(row.lastAt)}</span> },
        ]}
      />
    </div>
  );
}
