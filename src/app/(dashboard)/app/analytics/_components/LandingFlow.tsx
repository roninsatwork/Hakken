"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { MORE } from "@/convex/utils/landingFlow";
import { PageFlowChart, type PageFlowBand, type PageFlowNode } from "@/src/ui/components/screens/PageFlowChart";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../search-console/_components/SearchConsoleChartCard";
import { useAnalyticsArgs, useAnalyticsStatus } from "./useAnalytics";

/**
 * Landing pages' "How visits moved through your website"
 * (docs/plans/active/landing-pages-flow-plan.md LF1–LF3): the website's flow
 * as the last collection kept it, for the dates, device and home country
 * chosen, drawn by `PageFlowChart`. Nothing is asked of Google; a flow not
 * kept yet says it is still being collected.
 */
export function LandingFlowCard() {
  const t = useTranslations("googleAnalytics.chart.flow");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const flow = useQuery(api.googleAnalyticsFlowReads.analyticsLandingFlow, status?.connection?.newestDay ? args : "skip");
  const nameOf = (node: { page: string; path: string | null; more: number }) => (node.page === MORE ? t("more", { count: node.more }) : node.path ?? node.page);
  const byId = new Map((flow?.nodes ?? []).map((node) => [node.id, node]));
  const nodes: PageFlowNode[] = (flow?.nodes ?? []).map((node) => ({
    id: node.id,
    column: node.column,
    label: nameOf(node),
    visits: node.visits,
    left: node.left,
    conversions: node.conversions,
    hover: t(node.conversions > 0 ? "nodeHoverConverted" : "nodeHover", {
      page: nameOf(node), visits: formatNumber(node.visits), on: formatNumber(Math.max(0, node.visits - node.left)), left: formatNumber(node.left), conversions: node.conversions,
    }),
  }));
  const bands: PageFlowBand[] = (flow?.bands ?? []).map((band) => {
    const from = byId.get(band.from);
    const to = byId.get(band.to);
    return {
      ...band,
      // The landing pages whose visits took the route, as the chart's own boxes.
      landings: band.landings.map((page) => `0:${page}`),
      hover: t(band.conversions > 0 ? "bandHoverConverted" : "bandHover", {
        from: from ? nameOf(from) : band.from, to: to ? nameOf(to) : band.to, visits: formatNumber(band.visits), conversions: band.conversions,
      }),
    };
  });
  const columns = [t("landing"), t("next"), t("after")].map((title, index) => {
    const column = flow?.columns[index] ?? { visits: 0, left: 0, conversions: 0 };
    const words = { visits: formatNumber(column.visits), left: formatNumber(column.left), conversions: column.conversions };
    return { title, summary: t(column.conversions > 0 ? "summaryConverted" : "summary", words) };
  });
  const csv = () => toCsv([t("csvFrom"), t("csvTo"), t("csvVisits"), t("csvConversions")], bands.map((band) => {
    const from = byId.get(band.from);
    const to = byId.get(band.to);
    return [from ? nameOf(from) : band.from, to ? nameOf(to) : band.to, band.visits, band.conversions];
  }));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint", { period: tf(`periods.${args.period}`) })}
      exportName="google-analytics-landing-flow"
      csv={csv}
      host={status?.host ?? ""}
      from={flow?.from ?? null}
      to={flow?.to ?? null}
    >
      {flow === undefined ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("loading")}</p>
      ) : !flow.held ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("collecting")}</p>
      ) : nodes.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>
      ) : (
        <PageFlowChart
          columns={columns}
          nodes={nodes}
          bands={bands}
          legend={{ conversions: t("legendConversions"), left: t("legendLeft") }}
          figuresOf={(node) => (node.conversions > 0 ? t("figuresConverted", { visits: formatNumber(node.visits), conversions: node.conversions }) : formatNumber(node.visits))}
        />
      )}
    </SearchConsoleChartCard>
  );
}
