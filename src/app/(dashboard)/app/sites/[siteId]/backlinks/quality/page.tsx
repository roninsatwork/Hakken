"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { SiteFigure } from "../../../_components/SiteFigure";
import { useSiteListHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { dayOf, dayTableSorts, useSiteSortedList } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";

const MEASURES = ["spamScore", "brokenBacklinks", "brokenPages"] as const;
type Measure = (typeof MEASURES)[number];

/** The columns that sort: the day, newest first, and each measure, the most first. */
const SORTS = dayTableSorts<{ day: string } & Partial<Record<Measure, number>>, Measure>(MEASURES, (row, measure) => row[measure]);


/**
 * Link quality: DataForSEO's spam score for the links, links pointing at
 * pages here that no longer work, and broken pages here that others link to —
 * the newest summary's figures, and each over the dates chosen.
 */
export default function SiteLinkQualityPage() {
  const t = useTranslations("sites.linkQuality");
  const tm = useTranslations("sites.measures");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const range = useSiteRange();
  const profile = useQuery(api.siteLinks.linkProfile, { siteId });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [shown, setShown] = useState<Record<Measure, boolean>>({ spamScore: true, brokenBacklinks: true, brokenPages: true });

  const points = (series?.[0]?.points ?? []).filter((point) => MEASURES.some((measure) => point[measure] !== undefined));
  const chosen = MEASURES.filter((measure) => shown[measure]);
  const newestFirst = [...points].reverse();
  const { rows: sorted, tableSort } = useSiteSortedList(newestFirst, SORTS, { opening: "day", name: dayOf });
  const pager = useSitePager(sorted, { isLoading: series === undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={profile ? <span className="text-[12px] text-secondary">{t("asOf", { day: formatDay(profile.day) })}</span> : null}
      />

      {profile === null ? (
        <p className="rounded-2xl border border-border-dim bg-card/40 px-5 py-10 text-center text-[13px] text-secondary">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SiteFigure label={t("spamScore")} value={formatNumber(profile?.spamScore)} detail={<span className="text-muted">{t("spamScale")}</span>} />
          <SiteFigure label={t("brokenBacklinks")} value={formatNumber(profile?.brokenBacklinks)} detail={<span className="text-muted">{t("brokenBacklinksHint")}</span>} href={listHref("backlinks/broken")} />
          <SiteFigure label={t("brokenPages")} value={formatNumber(profile?.brokenPages)} detail={<span className="text-muted">{t("brokenPagesHint")}</span>} href={listHref("backlinks/broken")} />
          <SiteFigure label={t("nofollow")} value={formatNumber(profile?.nofollowReferringDomains)} detail={<span className="text-muted">{t("nofollowHint")}</span>} href={listHref("backlinks/all", { follow: "NOFOLLOW" })} />
        </div>
      )}

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        controls={
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {MEASURES.map((measure) => (
              <Checkbox
                key={measure}
                label={tm(measure)}
                checked={shown[measure]}
                onChange={(next) => setShown((current) => ({ ...current, [measure]: next }))}
              />
            ))}
          </div>
        }
        exportName={`${site?.host ?? "site"}-link-quality-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...chosen.map((measure) => tm(measure))], points.map((point) => [point.day, ...chosen.map((measure) => point[measure] ?? null)]))}
        enoughData={points.length > 0 && chosen.length > 0}
      >
        <SiteLineChart
          data={points.map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(chosen.map((measure) => [measure, point[measure] ?? null])) }))}
          series={chosen.map((measure) => ({ key: measure, name: tm(measure), colour: SITE_SERIES_COLOURS[MEASURES.indexOf(measure) + 1] }))}
        />
      </SiteChartCard>

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[560px]"
        cardHeader={<SiteTableBar footer={pager.footer} noun="checks" actions={<ListDownload fileName={`${site?.host ?? "site"}-link-quality`} rows={sorted} columns={[{ header: tc("lastChecked"), value: (row) => row.day }, ...MEASURES.map((measure) => ({ header: tm(measure), value: (row: (typeof points)[number]) => row[measure] }))]} />} />}
        empty={{ icon: <ShieldCheck className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "day", header: tc("lastChecked"), sortable: true, cell: (row) => <CheckedCell day={row.day} /> },
          ...MEASURES.map((measure) => ({
            key: measure,
            header: tm(measure),
            align: "right" as const,
            sortable: true,
            cell: (row: (typeof points)[number]) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row[measure])}</span>,
          })),
        ]}
      />
    </div>
  );
}
