"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";
import { SiteLineChart } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { formatPosition } from "../../search-console/_components/searchConsoleFormat";
import { useClarityDays, useClaritySiteId, useClarityStatus } from "../_components/useClarity";

/**
 * Clarity's Overview (docs/plans/active/insights-analyst-plan.md I24, phase
 * 15, drawn as the ClarityOverview board): how visitors behave across the
 * website — visits, how far they scroll, how many click something that does
 * nothing or leave within seconds — and the share with a frustration, day by
 * day, from the figures Hakken keeps each morning.
 */
export default function ClarityOverviewPage() {
  const t = useTranslations("clarity.overview");
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const days = useClarityDays();
  const pages = useQuery(api.clarity.clarityFigures, { siteId, by: "PAGE", days });
  const devices = useQuery(api.clarity.clarityFigures, { siteId, by: "DEVICE", days });
  const header = <PageHeader icon={<MousePointerClick className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />;
  if (status?.connection?.status !== "CONNECTED" && !status?.connection?.newestDay) {
    return <>{header}<HakkenEmptyState icon={MousePointerClick} title={t("notConnectedTitle")} description={t("notConnectedDescription")} action={<Link href={`/app/clarity/${siteId}/connection`} className="text-[13px] text-info hover:underline">{t("connect")}</Link>} /></>;
  }
  if (pages === undefined || devices === undefined) return <>{header}<div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  const whole = devices.rows.reduce((sum, row) => sum + row.sessions, 0);
  const weighted = (field: "scroll" | "dead" | "quickBack" | "rage") => (whole > 0 ? Math.round((devices.rows.reduce((sum, row) => sum + (row[field] ?? 0) * row.sessions, 0) / whole) * 10) / 10 : null);
  const worstScroll = pages.rows.filter((row) => row.sessions >= 20 && row.scroll !== null).sort((a, b) => (a.scroll ?? 0) - (b.scroll ?? 0))[0];
  const worstDead = pages.rows.filter((row) => row.sessions >= 20 && row.dead !== null).sort((a, b) => (b.dead ?? 0) - (a.dead ?? 0))[0];
  const says = [
    worstScroll ? t("sees.scroll", { page: worstScroll.key, scroll: formatPosition(worstScroll.scroll) }) : t("sees.noPages"),
    ...(worstDead && (worstDead.dead ?? 0) > 0 ? [t("sees.dead", { page: worstDead.key, dead: formatPosition(worstDead.dead) })] : []),
  ];
  const steps = [{ words: t("do"), link: t("seeReviews"), href: "/app/insights/page-reviews" }];
  const rows = pages.byDay.map((day) => datedRow({ day: day.day }, { dead: day.dead, rage: day.rage }));
  const csv = () => toCsv(["day", t("chart.dead"), t("chart.rage")], pages.byDay.map((day) => [day.day, day.dead, day.rage]));
  return (
    <>
      {header}
      <HakkenSees says={says} steps={steps} />
      <FigureRow>
        <Figure label={t("figures.visits")} value={formatNumber(whole)} detail={<span className="text-secondary">{t("figures.lastDays", { days })}</span>} />
        <Figure label={t("figures.scroll")} value={weighted("scroll") === null ? "–" : `${formatPosition(weighted("scroll"))}%`} detail={<span className="text-secondary">{t("figures.scrollDetail")}</span>} />
        <Figure label={t("figures.dead")} value={weighted("dead") === null ? "–" : `${formatPosition(weighted("dead"))}%`} detail={<span className="text-secondary">{t("figures.deadDetail")}</span>} />
        <Figure label={t("figures.quickBack")} value={weighted("quickBack") === null ? "–" : `${formatPosition(weighted("quickBack"))}%`} detail={<span className="text-secondary">{t("figures.quickBackDetail")}</span>} />
      </FigureRow>
      <ChartCard title={t("chart.title")} hint={t("chart.hint")} exportName={`${status?.host ?? "site"}-clarity-frustration`} csv={csv} enoughData={rows.length > 1}>
        <SiteLineChart data={rows} sharedScale series={[{ key: "dead", name: t("chart.dead"), colour: CHART_SERIES_ORANGE }, { key: "rage", name: t("chart.rage"), colour: CHART_SERIES_SLATE }]} />
      </ChartCard>
      <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("seeInsights")}</Link>
    </>
  );
}
