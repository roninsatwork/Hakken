"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/src/lib/dates";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { ANALYTICS_BASE, AnalyticsSection } from "./_components/AnalyticsSection";
import { ReadingChart } from "./_components/ReadingChart";
import { MEASURE_COLOURS, count } from "./_components/measures";
import { ViewsChange } from "./_components/ViewsChange";
import { usePeriod, withPeriod } from "./_components/usePeriod";

type Overview = FunctionReturnType<typeof api.readingAnalytics.analyticsOverview>;
const TOP_TABS = ["articles", "people", "companies", "users"] as const;
type TopTab = (typeof TOP_TABS)[number];

/**
 * Admin → Content → Analytics → Overview (content-people-knowledge-plan.md,
 * board 7): the period's views, reads, clicks and readers beside the period
 * before, every day of it, what each measure means, and the top five
 * articles, people, companies and users in tabs, each opening its full list.
 */
export default function AnalyticsOverviewPage() {
  // The period is read from the address.
  return (
    <Suspense fallback={null}>
      <AnalyticsSection>
        <OverviewScreen />
      </AnalyticsSection>
    </Suspense>
  );
}

function OverviewScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const [period] = usePeriod();
  const overview = useQuery(api.readingAnalytics.analyticsOverview, { period });
  if (!overview) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const { figures } = overview;
  const rate = figures.views > 0 ? Math.round((figures.reads / figures.views) * 100) : null;
  return (
    <>
      <PageHeader icon={<LayoutDashboard className="h-6 w-6 text-brand" />} title={t("overview.title")} description={t("overview.range", { from: formatDate(Date.parse(overview.range.from)), to: formatDate(Date.parse(overview.range.to)), days: overview.range.days })} />
      <FigureRow>
        <Figure
          label={t("measures.views")}
          value={count(figures.views)}
          detail={<ViewsChange now={figures.views} before={figures.viewsBefore} days={overview.range.days} />}
        />
        <Figure label={t("measures.reads")} value={count(figures.reads)} detail={<span className="text-secondary">{rate === null ? t("overview.noViews") : t("overview.readRate", { rate })}</span>} />
        <Figure label={t("measures.clicks")} value={count(figures.clicks)} detail={<span className="text-secondary">{t("overview.clicksDetail")}</span>} />
        <Figure
          label={t("measures.readers")}
          value={count(figures.readers)}
          href={withPeriod(`${ANALYTICS_BASE}/companies`, period)}
          detail={<span className="text-secondary">{t("overview.inCompanies", { count: figures.companies })}</span>}
        />
      </FigureRow>
      <ReadingChart
        title={t("chart.allTitle")}
        hint={t("chart.allHint")}
        range={overview.range}
        days={overview.days}
        measures={[
          { key: "views", name: t("measures.views"), colour: MEASURE_COLOURS.views },
          { key: "reads", name: t("measures.reads"), colour: MEASURE_COLOURS.reads },
          { key: "clicks", name: t("measures.clicks"), colour: MEASURE_COLOURS.clicks },
        ]}
        exportName="content-analytics"
      />
      <Notice>{t("definitions")}</Notice>
      <TopFive overview={overview} />
    </>
  );
}

/** "The top five" (board 7): the most read and most active of each, in tabs, each with its full list behind it. */
function TopFive({ overview }: { overview: Overview }) {
  const t = useTranslations("admin.contentAnalytics");
  const [period] = usePeriod();
  const [tab, setTab] = useState<TopTab>("articles");
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;
  const seeAll = (href: string, label: string, total: number) => (total === 0 ? null : (
    <Link href={withPeriod(href, period)} className="mt-2 inline-flex text-[12.5px] text-secondary underline decoration-foreground/25 underline-offset-4 hover:text-foreground">{label}</Link>
  ));
  return (
    <ChartCard
      title={t("top.title")}
      hint={t("top.hint", { days: overview.range.days })}
      controls={<SegmentedChoice size="compact" label={t("top.title")} value={tab} options={TOP_TABS.map((value) => ({ value, label: t(`top.tabs.${value}`) }))} onChange={setTab} />}
    >
      {tab === "articles" ? (
        <>
          <CompactList
            rows={overview.top.articles}
            rowKey={(row) => row.itemKey}
            empty={t("top.empty")}
            rowLink={{ href: (row) => withPeriod(`${ANALYTICS_BASE}/articles/${encodeURIComponent(row.itemKey)}`, period), label: (row) => row.title }}
            columns={[
              { key: "article", header: t("columns.article"), cell: (row) => <span className="text-[13px] text-foreground">{row.title}</span> },
              { key: "from", header: t("columns.from"), cell: (row) => <span className="text-[12px] text-secondary">{row.source === "OURS" ? t("from.ours") : row.fromName}</span> },
              { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
              { key: "reads", header: t("measures.reads"), align: "right", cell: (row) => number(row.reads) },
              { key: "clicks", header: t("measures.clicks"), align: "right", cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
            ]}
          />
          {seeAll(`${ANALYTICS_BASE}/articles`, t("top.seeArticles", { count: overview.counts.articles }), overview.counts.articles)}
        </>
      ) : tab === "people" ? (
        <>
          <CompactList
            rows={overview.top.people}
            rowKey={(row) => row.followId}
            empty={t("top.empty")}
            columns={[
              { key: "person", header: t("columns.person"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
              { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
              { key: "clicks", header: t("measures.clicks"), align: "right", cell: (row) => number(row.clicks) },
            ]}
          />
          {seeAll(`${ANALYTICS_BASE}/people`, t("top.seePeople", { count: overview.counts.people }), overview.counts.people)}
        </>
      ) : tab === "companies" ? (
        <>
          <CompactList
            rows={overview.top.companies}
            rowKey={(row) => row.companyId}
            empty={t("top.empty")}
            rowLink={{ href: (row) => withPeriod(`${ANALYTICS_BASE}/companies/${row.companyId}`, period), label: (row) => row.name }}
            columns={[
              { key: "company", header: t("columns.company"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
              { key: "readers", header: t("measures.readers"), align: "right", cell: (row) => number(row.readers) },
              { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
            ]}
          />
          {seeAll(`${ANALYTICS_BASE}/companies`, t("top.seeCompanies", { count: overview.counts.companies }), overview.counts.companies)}
        </>
      ) : (
        <CompactList
          rows={overview.top.users}
          rowKey={(row) => row.userId}
          empty={t("top.empty")}
          columns={[
            {
              key: "user",
              header: t("columns.user"),
              cell: (row) => (
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-foreground">{row.name}</span>
                  <span className="text-[12px] text-secondary">{row.companyName}</span>
                </span>
              ),
            },
            { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
          ]}
        />
      )}
    </ChartCard>
  );
}
