"use client";

import { Suspense, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate } from "@/src/lib/dates";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
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

/**
 * One company in Analytics (content-people-knowledge-plan.md, board 12): how
 * its people read what Hakken publishes in the period — views beside the
 * period before, reads, clicks, how many of its people read — its days, and
 * each of its people who read, with the topic they read most and when.
 */
export default function AnalyticsCompanyPage() {
  return (
    <Suspense fallback={null}>
      <CompanyScreen />
    </Suspense>
  );
}

function CompanyScreen() {
  const t = useTranslations("admin.contentAnalytics");
  const { platformName } = useSystemSettings();
  const topicChoices = useTopicChoices();
  const params = useParams();
  const [period] = usePeriod();
  const [page, setPage] = useState(1);
  const company = useQuery(api.readingAnalytics.analyticsCompany, { companyId: params.companyId as Id<"companies">, period });
  const back = { label: t("back.companies"), page: t("back.companies"), href: withPeriod(`${ANALYTICS_BASE}/companies`, period) };
  const icon = <Building2 className="h-6 w-6 text-brand" />;

  if (company === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (company === null) {
    return (
      <div className="flex flex-col gap-5">
        <DetailHeader back={back} icon={icon} title={t("company.notFound")} />
        <HakkenEmptyState icon={Building2} title={t("company.notFound")} description={t("company.notFoundDescription")} />
      </div>
    );
  }

  const { figures } = company;
  const rate = figures.views > 0 ? Math.round((figures.reads / figures.views) * 100) : null;
  const notOpened = Math.max(0, figures.people - figures.readers);
  const shownPeople = paginateItems(company.people, page, TABLE_PAGE_SIZE);
  const number = (value: number) => <span className="font-mono text-[12px] tabular-nums">{count(value)}</span>;

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        back={back}
        icon={icon}
        title={company.name}
        description={company.lastAt
          ? t("company.subtitle", { name: company.name, platformName, date: formatDate(company.lastAt) })
          : t("company.subtitleNever", { name: company.name, platformName })}
        action={<PeriodChoice />}
      />
      <FigureRow>
        <Figure
          label={t("measures.views")}
          value={count(figures.views)}
          detail={<ViewsChange now={figures.views} before={figures.viewsBefore} days={company.range.days} />}
        />
        <Figure label={t("measures.reads")} value={count(figures.reads)} detail={<span className="text-secondary">{rate === null ? t("overview.noViews") : t("overview.readRate", { rate })}</span>} />
        <Figure label={t("measures.clicks")} value={count(figures.clicks)} detail={<span className="text-secondary">{t("overview.clicksDetail")}</span>} />
        <Figure label={t("measures.readers")} value={count(figures.readers)} detail={<span className="text-secondary">{t("company.ofPeople", { count: figures.people, name: company.name })}</span>} />
      </FigureRow>
      <ReadingChart
        title={t("chart.articleTitle")}
        hint={t("chart.companyHint", { name: company.name })}
        range={company.range}
        days={company.days}
        measures={[
          { key: "views", name: t("measures.views"), colour: MEASURE_COLOURS.views },
          { key: "reads", name: t("measures.reads"), colour: MEASURE_COLOURS.reads },
        ]}
        exportName="content-analytics-company"
      />
      <DataTable
        rows={shownPeople.items}
        rowKey={(row) => row.userId}
        cardHeader={
          <TableBar
            footer={{ isLoading: false, totalCount: company.people.length }}
            noun="peopleRead"
            actions={
              <DownloadButton
                label={t("download")}
                disabled={company.people.length === 0}
                onClick={() => saveTextFile(toCsv(
                  [t("columns.person"), t("measures.views"), t("measures.reads"), t("measures.clicks"), t("columns.readMost"), t("columns.lastActive")],
                  company.people.map((row) => [row.name, row.views, row.reads, row.clicks, topicNameIn(topicChoices, row.topMost ?? undefined) ?? "", new Date(row.lastAt).toISOString().slice(0, 10)]),
                ), "content-analytics-company-people.csv")}
              />
            }
          >
            {notOpened > 0 ? <span className="text-[12px] text-secondary">{t("company.notOpened", { count: notOpened, name: company.name, days: company.range.days })}</span> : null}
          </TableBar>
        }
        empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: t("company.noReaders", { days: company.range.days }) }}
        footer={{
          mode: "paged",
          page: shownPeople.page,
          totalPages: shownPeople.totalPages,
          totalCount: shownPeople.totalItems,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: false,
          onPageChange: setPage,
        }}
        columns={[
          { key: "person", header: t("columns.person"), cell: (row) => <span className="text-[13px] font-medium text-foreground">{row.name}</span> },
          { key: "views", header: t("measures.views"), align: "right", cell: (row) => number(row.views) },
          { key: "reads", header: t("measures.reads"), align: "right", cell: (row) => number(row.reads) },
          { key: "clicks", header: t("measures.clicks"), align: "right", cell: (row) => (row.clicks ? number(row.clicks) : <NoFigure />) },
          { key: "readMost", header: t("columns.readMost"), cell: (row) => (topicNameIn(topicChoices, row.topMost ?? undefined) ? <TagLabel>{topicNameIn(topicChoices, row.topMost ?? undefined)}</TagLabel> : <NoFigure />) },
          { key: "lastActive", header: t("columns.lastActive"), cell: (row) => <span className="text-[12px] text-secondary">{formatDate(row.lastAt)}</span> },
        ]}
      />
    </div>
  );
}
