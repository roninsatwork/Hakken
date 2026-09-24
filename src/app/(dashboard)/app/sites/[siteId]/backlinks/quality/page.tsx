"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { CheckedCell } from "../../../_components/SiteCells";
import { SiteChartCard } from "../../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../_components/SiteCharts";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { ListDownload } from "../../../_components/SiteDownloads";

const MEASURES = ["spamScore", "brokenBacklinks", "brokenPages"] as const;
type Measure = (typeof MEASURES)[number];

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border-dim bg-card/40 px-5 py-4">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[12px] text-muted">{hint}</div>
    </div>
  );
}

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
  const site = useSite();
  const range = useSiteRange();
  const profile = useQuery(api.siteLinks.linkProfile, { siteId });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [shown, setShown] = useState<Record<Measure, boolean>>({ spamScore: true, brokenBacklinks: true, brokenPages: true });
  const [page, setPage] = useState(1);

  const points = (series?.[0]?.points ?? []).filter((point) => MEASURES.some((measure) => point[measure] !== undefined));
  const chosen = MEASURES.filter((measure) => shown[measure]);
  const newestFirst = [...points].reverse();
  const totalPages = Math.max(1, Math.ceil(newestFirst.length / TABLE_PAGE_SIZE));
  const rows = series === undefined ? undefined : newestFirst.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

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
          <Figure label={t("spamScore")} value={formatNumber(profile?.spamScore)} hint={t("spamScale")} />
          <Figure label={t("brokenBacklinks")} value={formatNumber(profile?.brokenBacklinks)} hint={t("brokenBacklinksHint")} />
          <Figure label={t("brokenPages")} value={formatNumber(profile?.brokenPages)} hint={t("brokenPagesHint")} />
          <Figure label={t("nofollow")} value={formatNumber(profile?.nofollowReferringDomains)} hint={t("nofollowHint")} />
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
        rows={rows}
        rowKey={(row) => row.day}
        minWidthClassName="min-w-[560px]"
filters={<ListDownload fileName={`${site?.host ?? "site"}-link-quality`} rows={newestFirst} columns={[{ header: tc("lastChecked"), value: (row) => row.day }, ...MEASURES.map((measure) => ({ header: tm(measure), value: (row: (typeof points)[number]) => row[measure] }))]} />}
        empty={{ icon: <ShieldCheck className="h-8 w-8 text-muted/30" />, label: t("empty") }}
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
          { key: "day", header: tc("lastChecked"), cell: (row) => <CheckedCell day={row.day} /> },
          ...MEASURES.map((measure) => ({
            key: measure,
            header: tm(measure),
            align: "right" as const,
            cell: (row: (typeof points)[number]) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row[measure])}</span>,
          })),
        ]}
      />
    </div>
  );
}
