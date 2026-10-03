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
import { datedRow } from "../../_components/datedRows";
import { formatNumber, toCsv } from "../../_components/siteFormat";
import { Figure } from "@/src/ui/components/screens/Figure";
import { useSiteListHref } from "../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../_components/useSite";
import { newestOfEach } from "../newestOfEach";

type Measure = "referringDomains" | "backlinks" | "domainRank";
const MEASURES: Measure[] = ["referringDomains", "backlinks", "domainRank"];

/**
 * Backlinks › Summary: the site's domain rank, backlinks and linking websites
 * as they stand, and over the dates chosen, with tick boxes for the chart.
 *
 * All four figures by one rule (docs/plans/active/sites-audit-fixes-plan.md,
 * 4.12): as each stood at the end of the dates — the newest in them, else the
 * newest before them. Two used to fall back to today's while two showed "–".
 */
export default function SiteBacklinksPage() {
  const t = useTranslations("sites.backlinks");
  const tm = useTranslations("sites.measures");
  const siteId = useSiteId();
  const listHref = useSiteListHref(siteId);
  const site = useSite();
  const range = useSiteRange();
  const [shown, setShown] = useState<Record<Measure, boolean>>({ referringDomains: true, backlinks: false, domainRank: true });
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const points = (series?.[0]?.points ?? []).filter((point) => point.referringDomains !== undefined || point.backlinks !== undefined);
  const before = series?.[0]?.before ?? null;
  const latest = newestOfEach(before ? [before, ...points] : points);
  const chosen = MEASURES.filter((measure) => shown[measure]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LinkIcon className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Figure label={t("domainRank")} value={formatNumber(latest?.domainRank)} detail={<span className="text-muted">{t("rankScale")}</span>} />
        <Figure label={t("backlinks")} value={formatNumber(latest?.backlinks)} href={listHref("backlinks/all", { links: "every" })} />
        <Figure label={t("referringDomains")} value={formatNumber(latest?.referringDomains)} href={listHref("backlinks/domains")} />
        <Figure label={t("broken")} value={formatNumber(latest?.brokenBacklinks)} href={listHref("backlinks/broken")} />
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
          data={points.map((point) => datedRow(point, Object.fromEntries(MEASURES.map((measure) => [measure, point[measure] ?? null]))))}
          series={chosen.map((measure) => ({ key: measure, name: tm(measure), colour: SITE_SERIES_COLOURS[MEASURES.indexOf(measure) + 1] }))}
        />
      </SiteChartCard>
    </div>
  );
}
