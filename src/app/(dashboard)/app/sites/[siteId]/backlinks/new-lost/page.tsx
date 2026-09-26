"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteBarChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteParam } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { dayOf, dayTableSorts, useSiteSortedList } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";

const KEYS = ["newBacklinks", "lostBacklinks", "newReferringDomains", "lostReferringDomains"] as const;
type Key = (typeof KEYS)[number];

/** The columns that sort: the week, newest first, and each count, the most first. */
const SORTS = dayTableSorts<{ day: string } & Record<Key, number | null>, Key>(KEYS, (row, key) => row[key]);

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

  const shownKeys = measure === "backlinks" ? (["newBacklinks", "lostBacklinks"] as const) : (["newReferringDomains", "lostReferringDomains"] as const);
  const newestFirst = [...(points ?? [])].reverse();
  const { rows: sorted, tableSort } = useSiteSortedList(newestFirst, SORTS, { opening: "day", name: dayOf });
  const pager = useSitePager(sorted, { isLoading: points === undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ArrowLeftRight className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        controls={
          <div className="max-w-xs">
            <Select chip={{ label: `${t("measureLabel")}: ${t(`measures.${measure}`)}` }} aria-label={t("measureLabel")} value={measure} onChange={(value) => setMeasure(value as "backlinks" | "domains")}>
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
        rows={pager.pageRows}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[720px]"
        cardHeader={<SiteTableBar footer={pager.footer} noun="weeks" actions={<ListDownload fileName={`${site?.host ?? "site"}-links-gained-lost`} rows={sorted} columns={[{ header: t("columns.day"), value: (row) => row.day }, ...KEYS.map((key) => ({ header: t(`columns.${key}`), value: (row: NonNullable<typeof points>[number]) => row[key] }))]} />} />}
        empty={{ icon: <ArrowLeftRight className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "day", header: t("columns.day"), sortable: true, cell: (row) => <CheckedCell day={row.day} /> },
          ...KEYS.map((key) => ({
            key,
            header: t(`columns.${key}`),
            align: "right" as const,
            sortable: true,
            cell: (row: NonNullable<typeof points>[number]) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row[key])}</span>,
          })),
        ]}
      />
    </div>
  );
}
