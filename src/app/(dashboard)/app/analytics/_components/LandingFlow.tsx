"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import { PageFlowChart } from "@/src/ui/components/screens/PageFlowChart";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../search-console/_components/SearchConsoleChartCard";
import { routesFrom, type FlowAnswer, type RouteWords } from "./funnelRoutes";
import { useAnalyticsStatus } from "./useAnalytics";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";

/**
 * Funnel's "Where people went next" (docs/plans/active/funnel-way-1-plan-2026-11-05.md, board Way 1): the website's flow as
 * the last collection kept it, for the dates, device and home country chosen, five pages deep. The pages ticked in the table
 * stand on their own in the first column, and every other page is in its group. Nothing is asked of Google. A flow not kept
 * yet says it's still being collected.
 */
export function LandingFlowCard({ flow, visits, month, before, nothingTicked = false, onSelectTop, most = 10 }: {
  flow: FlowAnswer | undefined;
  /** Every tick cleared: a short message and one button, in place of the whole website's busy chart (Anthony, 2026-11-05). */
  nothingTicked?: boolean;
  /** Ticks the pages the chart opens with. */
  onSelectTop?: () => void;
  /** How many it ticks. */
  most?: number;
  /** The website's own visits, as the box above says them. */
  visits: number | null;
  /** The dates, as the hint says them: "October". */
  month: string;
  /** The dates before, as a hover says them: "September". */
  before: string;
}) {
  const t = useTranslations("googleAnalytics.chart.flow");
  const tt = useTranslations("ui.tableTicks");
  const status = useAnalyticsStatus();
  const words: RouteWords = useMemo(() => ({
    shop: t("shop"),
    notSorted: t("notSorted"),
    otherPages: t("otherPages"),
    otherGroups: (count) => t("otherGroups", { count }),
    otherPagesOf: t("otherPagesOf"),
    pageNotKnown: t("pageNotKnown"),
    pagesNotTicked: t("pagesNotTicked"),
    pagesNotTickedLower: t("pagesNotTickedLower"),
    visits: t("visits"),
    visitsInBefore: t("visitsInBefore", { before }),
    wentOn: t("wentOn"),
    leftHere: t("leftHere"),
    mostWent: t("mostWent"),
    conversions: t("conversions"),
    ofVisitsOn: (name) => t("ofVisitsOn", { name }),
    conversionsAfter: t("conversionsAfter"),
    route: (from, to) => t("route", { from, to }),
  }), [t, before]);
  const built = useMemo(() => (flow?.held ? routesFrom(flow, words) : null), [flow, words]);
  // The eye reads every box and every route, with the figures the chart says: from the third page on, the fitted ones.
  const seen = useMemo(() => (built ? {
    picked: true,
    rows: built.boxes.map((box) => ({ name: box.name, step: box.column + 1, group: box.isGroup, visits: built.said(box), leftThere: built.saidLeft(box), conversions: box.conversions })),
    routes: built.routes.map((route) => ({ from: built.boxes.find((box) => box.id === route.from)?.name ?? "", to: built.boxes.find((box) => box.id === route.to)?.name ?? "", visits: built.saidRoute(route), conversions: route.conversions })),
  } : undefined), [built]);
  useSeesPart("flow", seen);
  const columns = [
    { title: t("first"), summary: <>{t("visitsCount", { visits: formatNumber(visits ?? (flow ? flow.onward + flow.left : 0)) })}<br />{t("leftCount", { left: formatNumber(flow?.left ?? 0) })}</> },
    { title: t("second"), summary: t("visitsCount", { visits: formatNumber(flow?.onward ?? 0) }) },
    ...[2, 3, 4].map((column) => ({ title: t(`column${column + 1}`), summary: t("visitsCount", { visits: formatNumber(Math.round(built?.columnVisits[column] ?? 0)) }) })),
  ];
  const csv = () => {
    const nameOf = new Map((built?.boxes ?? []).map((box) => [box.id, box.name]));
    return toCsv([t("csvFrom"), t("csvTo"), t("csvVisits"), t("csvConversions")], (built?.routes ?? []).map((route) => [nameOf.get(route.from) ?? "", nameOf.get(route.to) ?? "", built?.saidRoute(route) ?? route.visits, route.conversions] as [string, string, number, number]).sort((one, other) => other[2] - one[2]));
  };
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={t("hint", { month })}
      exportName="google-analytics-where-people-went"
      csv={csv}
      host={status?.host ?? ""}
      from={flow?.from ?? null}
      to={flow?.to ?? null}
    >
      {flow === undefined ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("loading")}</p>
      ) : !flow.held ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("collecting")}</p>
      ) : !built || built.nodes.length === 0 ? (
        <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>
      ) : nothingTicked ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[13px] text-secondary">{t("nothingTicked")}</p>
          {onSelectTop ? <Button variant="quiet" className="whitespace-nowrap px-3 py-2" onClick={onSelectTop}>{tt("selectTop", { most })}</Button> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PageFlowChart
            compact
            followOn
            scale={built.scale}
            columns={columns}
            nodes={built.nodes}
            bands={built.bands}
            legend={{ conversions: t("legendConversions"), left: t("legendLeft"), uncounted: t("legendGroup") }}
            figuresOf={(node) => built.figureOf(node.id)}
          />
          <p className="text-[12px] text-muted">{t("under")}</p>
        </div>
      )}
    </SearchConsoleChartCard>
  );
}
