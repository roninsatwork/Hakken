"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { sharedSiteQuery, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const KINDS = ["new", "up", "down", "lost"] as const;

/**
 * New and lost keywords: DataForSEO's counts, at each check, of the searches
 * the site newly ranks for, moved up or down on, and lost — across everything
 * it ranks for. The arrows carry the direction; colour only repeats it, and
 * no red sits beside green (the owner cannot tell them apart).
 */
export default function SiteNewLostPage() {
  const t = useTranslations("sites.newLost");
  const siteId = useSiteId();
  const site = useSite();
  const params = useSearchParams();
  const range = useSiteRange();
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [page, setPage] = useSiteTablePage();
  const listHref = useSiteListHref(siteId);

  const points = (series?.[0]?.points ?? []).flatMap((point) =>
    point.keywordsNew === undefined && point.keywordsLost === undefined
      ? []
      : [{
        day: point.day,
        new: point.keywordsNew ?? 0,
        up: point.keywordsUp ?? 0,
        down: point.keywordsDown ?? 0,
        lost: point.keywordsLost ?? 0,
      }]);
  const newestFirst = [...points].reverse();
  // The newest check's counts open the keywords behind them on Wins and losses;
  // an older check's keywords are not kept one by one.
  const newestDay = newestFirst[0]?.day ?? null;
  const DIRECTION_OF = { new: "NEW", up: "UP", down: "DOWN", lost: "LOST" } as const;
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / TABLE_PAGE_SIZE));
  const shown = series === undefined ? undefined : newestFirst.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  const colours = { new: SITE_SERIES_COLOURS[1], up: SITE_SERIES_COLOURS[4], down: SITE_SERIES_COLOURS[3], lost: SITE_SERIES_COLOURS[5] };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ArrowUpDown className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={
          <Link href={`/app/sites/${siteId}/google/moves${sharedSiteQuery(params)}`} className="text-[13px] text-info hover:underline">
            {t("seeKeywords")} →
          </Link>
        }
      />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-new-and-lost-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...KINDS.map((kind) => t(`series.${kind}`))], points.map((point) => [point.day, ...KINDS.map((kind) => point[kind])]))}
        enoughData={points.length > 0}
      >
        <SiteBarChart
          height={280}
          data={points.map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(KINDS.map((kind) => [kind, point[kind]])) }))}
          series={KINDS.map((kind) => ({ key: kind, name: t(`series.${kind}`), colour: colours[kind] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[640px]"
filters={<ListDownload fileName={`${site?.host ?? "site"}-new-and-lost`} rows={newestFirst} columns={[{ header: t("columns.day"), value: (row) => row.day }, ...KINDS.map((kind) => ({ header: t(`columns.${kind}`), value: (row: (typeof points)[number]) => row[kind] }))]} />}
        empty={{ icon: <ArrowUpDown className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: newestFirst.length,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: series === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "day", header: t("columns.day"), cell: (row) => <CheckedCell day={row.day} /> },
          ...KINDS.map((kind) => ({
            key: kind,
            header: t(`columns.${kind}`),
            align: "right" as const,
            cell: (row: (typeof points)[number]) => row.day === newestDay && row[kind] > 0
              ? <RecordLinkCell href={listHref("google/moves", { direction: DIRECTION_OF[kind] })} className="font-mono text-[12px] text-info">{formatNumber(row[kind])}</RecordLinkCell>
              : <span className="font-mono text-[12px] text-foreground">{formatNumber(row[kind])}</span>,
          })),
        ]}
      />
    </div>
  );
}
