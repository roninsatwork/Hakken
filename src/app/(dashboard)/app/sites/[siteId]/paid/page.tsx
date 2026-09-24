"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SiteChartCard } from "../../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../_components/SiteCharts";
import { useSiteRange } from "../../_components/SiteDateRange";
import { formatDay, formatNumber, formatShortDay, toCsv } from "../../_components/siteFormat";
import { useSite, useSiteId } from "../../_components/useSite";

const MEASURES = ["paidKeywords", "paidTraffic", "paidTrafficCost"] as const;
type Measure = (typeof MEASURES)[number];

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-dim bg-card/40 px-5 py-4">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

/**
 * Paid search: whether the site buys Google adverts, on how many searches,
 * the visits and their estimated monthly cost, now and over the dates chosen
 * — from the ranked-keywords answers already collected, so nothing is bought.
 */
export default function SitePaidPage() {
  const t = useTranslations("sites.paid");
  const tm = useTranslations("sites.measures");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const series = useQuery(api.siteCharts.siteSeries, { siteId, from: range.from, to: range.to, step: range.step });
  const [shown, setShown] = useState<Record<Measure, boolean>>({ paidKeywords: true, paidTraffic: true, paidTrafficCost: false });

  const points = (series?.[0]?.points ?? []).filter((point) => point.paidKeywords !== undefined);
  const latest = points.length > 0 ? points[points.length - 1] : null;
  const chosen = MEASURES.filter((measure) => shown[measure]);
  const advertising = (latest?.paidKeywords ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Megaphone className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description")}
        pills={latest ? <span className="text-[12px] text-secondary">{t("asOf", { day: formatDay(latest.lastDay) })}</span> : null}
      />

      {series !== undefined && !advertising ? (
        <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("notAdvertising")}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label={t("keywords")} value={formatNumber(latest?.paidKeywords)} />
        <Figure label={t("traffic")} value={formatNumber(latest?.paidTraffic)} />
        <Figure label={t("spend")} value={latest?.paidTrafficCost === undefined ? "–" : `$${formatNumber(latest.paidTrafficCost)}`} />
      </div>

      <SiteChartCard
        title={t("chartTitle")}
        hint={t("chartHint")}
        controls={
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {MEASURES.map((measure) => (
              <Checkbox key={measure} label={tm(measure)} checked={shown[measure]} onChange={(next) => setShown((current) => ({ ...current, [measure]: next }))} />
            ))}
          </div>
        }
        exportName={`${site?.host ?? "site"}-paid-search-${range.from}-to-${range.to}`}
        csv={() => toCsv(["day", ...chosen.map((measure) => tm(measure))], points.map((point) => [point.day, ...chosen.map((measure) => point[measure] ?? null)]))}
        enoughData={points.length > 0 && chosen.length > 0}
      >
        <SiteLineChart
          data={points.map((point) => ({ label: formatShortDay(point.day), ...Object.fromEntries(chosen.map((measure) => [measure, point[measure] ?? null])) }))}
          series={chosen.map((measure) => ({ key: measure, name: tm(measure), colour: SITE_SERIES_COLOURS[MEASURES.indexOf(measure) + 1] }))}
        />
      </SiteChartCard>
    </div>
  );
}
