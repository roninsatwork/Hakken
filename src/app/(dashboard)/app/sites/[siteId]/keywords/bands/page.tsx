"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;

/**
 * Position bands: how many of the searches the site ranks for sit in each
 * band of Google's results, step by step through the dates chosen. DataForSEO's
 * count across everything the site ranks for where it has one, and the listed
 * keywords' own bands for a day filed before that was read out.
 */
export default function SiteBandsPage() {
  const t = useTranslations("sites.bands");
  const tb = useTranslations("sites.overview.bands");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [page, setPage] = useSiteTablePage();
  const listHref = useSiteListHref(siteId);

  const points = (series?.[0]?.points ?? []).flatMap((point) => {
    const bands = point.allBands ?? point.bands;
    return bands ? [{ day: point.day, ...bands, total: BANDS.reduce((sum, band) => sum + bands[band], 0) }] : [];
  });
  const newestFirst = [...points].reverse();
  // Only the newest check's keywords are kept one by one, so only its counts
  // open the keywords behind them (docs/plans/active/sites-ux-updates-plan.md §4).
  const newestDay = newestFirst[0]?.day ?? null;
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / TABLE_PAGE_SIZE));
  const shown = series === undefined ? undefined : newestFirst.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Layers className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-position-bands-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...BANDS.map((band) => tb(band)), t("columns.total")], points.map((point) => [point.day, ...BANDS.map((band) => point[band]), point.total]))}
        enoughData={points.length > 0}
      >
        <SiteBarChart
          stacked
          height={280}
          data={points.map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(BANDS.map((band) => [band, point[band]])) }))}
          series={BANDS.map((band, index) => ({ key: band, name: tb(band), colour: SITE_SERIES_COLOURS[index] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={shown}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[760px]"
filters={<ListDownload fileName={`${site?.host ?? "site"}-position-bands`} rows={newestFirst} columns={[{ header: t("columns.day"), value: (row) => row.day }, ...BANDS.map((band) => ({ header: tb(band), value: (row: (typeof points)[number]) => row[band] })), { header: t("columns.total"), value: (row) => row.total }]} />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("empty") }}
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
          ...BANDS.map((band) => ({
            key: band,
            header: tb(band),
            align: "right" as const,
            cell: (row: (typeof points)[number]) => row.day === newestDay && row[band] > 0
              ? <RecordLinkCell href={listHref("keywords", { band })} className="font-mono text-[12px] text-info">{formatNumber(row[band])}</RecordLinkCell>
              : <span className="font-mono text-[12px] text-secondary">{formatNumber(row[band])}</span>,
          })),
          { key: "pageOne", header: t("columns.pageOne"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.p01_03 + row.p04_10)}</span> },
          { key: "total", header: t("columns.total"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.total)}</span> },
        ]}
      />
    </div>
  );
}
