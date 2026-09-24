"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const KEYS = ["newBacklinks", "lostBacklinks", "newReferringDomains", "lostReferringDomains"] as const;

/**
 * New and lost links: links and linking websites gained and lost in the
 * dates chosen, per step, from DataForSEO's daily count. Gained and lost sit
 * side by side in blue and amber — never red beside green — and the arrows
 * in their names carry the direction.
 */
export default function SiteLinksNewLostPage() {
  const t = useTranslations("sites.backlinksNewLost");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const points = useQuery(api.siteLinkLists.linkChanges, { siteId, from: range.from, to: range.to, step: range.step });
  const [measure, setMeasure] = useSiteParam<"backlinks" | "domains">("show", "backlinks", ["backlinks", "domains"]);
  const [page, setPage] = useState(1);

  const shownKeys = measure === "backlinks" ? (["newBacklinks", "lostBacklinks"] as const) : (["newReferringDomains", "lostReferringDomains"] as const);
  const newestFirst = [...(points ?? [])].reverse();
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / TABLE_PAGE_SIZE));
  const rows = points === undefined ? undefined : newestFirst.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ArrowLeftRight className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        controls={
          <div className="max-w-xs">
            <Select aria-label={t("measureLabel")} value={measure} onChange={(value) => setMeasure(value as "backlinks" | "domains")}>
              <option value="backlinks">{t("measures.backlinks")}</option>
              <option value="domains">{t("measures.domains")}</option>
            </Select>
          </div>
        }
        exportName={`${site?.host ?? "site"}-links-gained-lost-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...KEYS.map((key) => t(`series.${key}`))], (points ?? []).map((point) => [point.day, ...KEYS.map((key) => point[key])]))}
        enoughData={(points?.length ?? 0) > 0}
      >
        <SiteBarChart
          height={260}
          data={(points ?? []).map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(shownKeys.map((key) => [key, point[key]])) }))}
          series={shownKeys.map((key, index) => ({ key, name: t(`series.${key}`), colour: index === 0 ? SITE_SERIES_COLOURS[1] : SITE_SERIES_COLOURS[3] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={rows}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[720px]"
filters={<ListDownload fileName={`${site?.host ?? "site"}-links-gained-lost`} rows={newestFirst} columns={[{ header: t("columns.day"), value: (row) => row.day }, ...KEYS.map((key) => ({ header: t(`columns.${key}`), value: (row: NonNullable<typeof points>[number]) => row[key] }))]} />}
        empty={{ icon: <ArrowLeftRight className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: newestFirst.length,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: points === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "day", header: t("columns.day"), cell: (row) => <CheckedCell day={row.day} /> },
          ...KEYS.map((key) => ({
            key,
            header: t(`columns.${key}`),
            align: "right" as const,
            cell: (row: NonNullable<typeof points>[number]) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row[key])}</span>,
          })),
        ]}
      />
    </div>
  );
}
