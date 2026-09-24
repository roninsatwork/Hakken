"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link as LinkIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useSite, useSiteId } from "../../_components/useSite";

type Measure = "referringDomains" | "backlinks" | "domainRank";
const MEASURES: Measure[] = ["referringDomains", "backlinks", "domainRank"];

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border-dim bg-card/40 px-5 py-4">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
      {note ? <div className="mt-1 text-[12px] text-muted">{note}</div> : null}
    </div>
  );
}

/**
 * Backlinks › Summary: the site's domain rank, backlinks and linking websites
 * as they stand, and over the dates chosen, with tick boxes for the chart.
 */
export default function SiteBacklinksPage() {
  const t = useTranslations("sites.backlinks");
  const tm = useTranslations("sites.measures");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const [shown, setShown] = useState<Record<Measure, boolean>>({ referringDomains: true, backlinks: false, domainRank: true });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = (series?.[0]?.points ?? []).filter((point) => point.referringDomains !== undefined || point.backlinks !== undefined);
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const chosen = MEASURES.filter((measure) => shown[measure]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LinkIcon className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Figure label={t("domainRank")} value={formatNumber(latest?.domainRank)} note={t("rankScale")} />
        <Figure label={t("backlinks")} value={formatNumber(latest?.backlinks)} />
        <Figure label={t("referringDomains")} value={formatNumber(latest?.referringDomains ?? site?.counts.referringDomains)} />
        <Figure label={t("broken")} value={formatNumber(latest?.brokenBacklinks ?? site?.counts.brokenBacklinks)} />
      </div>

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        exportName={`${site?.host ?? "site"}-backlinks-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...chosen.map((measure) => tm(measure))], points.map((point) => [point.day, ...chosen.map((measure) => point[measure] ?? null)]))}
        enoughData={points.length > 0 && chosen.length > 0}
        controls={
          <div className="flex flex-wrap gap-4">
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
      >
        <SiteLineChart
          data={points.map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(MEASURES.map((measure) => [measure, point[measure] ?? null])) }))}
          series={chosen.map((measure) => ({ key: measure, name: tm(measure), colour: SITE_SERIES_COLOURS[MEASURES.indexOf(measure) + 1] }))}
        />
      </SiteChartCard>
    </div>
  );
}
