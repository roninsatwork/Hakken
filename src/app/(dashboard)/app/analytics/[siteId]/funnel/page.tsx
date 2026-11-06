"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { funnelFigures } from "@/convex/utils/landingFlowFigures";
import { pageName } from "@/convex/utils/pageNames";
import { AnalyticsListScreen, type ListPageAnswer } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ClassificationSelect, useClassificationChoice } from "../../_components/AllPagesParts";
import { FunnelBoxes, LeftEachDayCard, useFunnelFlow } from "../../_components/FunnelParts";
import { LandingFlowCard } from "../../_components/LandingFlow";
import type { FlowAnswer } from "../../_components/funnelRoutes";
import { useIsShop } from "../../_components/useIsShop";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus, usePageHref } from "../../_components/useAnalytics";
import { useEyeNames, useWebsiteForEye } from "../../_components/useEyeFigures";
import { spansOfList, useSpanInWords } from "../../_components/VisitsCharts";

/**
 * Funnel, as Way 1 (docs/plans/active/funnel-way-1-plan-2026-11-05.md; board "Way 1" on the canvas "Hakken — Funnel, three
 * ways"). Four boxes, People who left straight away each day, the route chart five pages deep, then the table of the pages
 * people started on. Ticks in the table choose which pages stand on their own in the route chart. Every page opens its own screen.
 */
export default function AnalyticsFunnelPage() {
  const t = useTranslations("googleAnalytics.landing");
  const pageHref = usePageHref();
  const currency = useAnalyticsStatus()?.connection?.currency ?? null;
  const choice = useClassificationChoice();
  const { flow, ticks } = useFunnelFlow(choice);
  const shop = useIsShop();
  const tt = useTranslations("googleAnalytics.table.columns");
  return (
    <AnalyticsListScreen
      header={{ icon: <LogIn className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(answer) => (
        <>
          <FunnelSees answer={answer} currency={currency} flow={flow} />
          <FunnelBoxes answer={answer} />
          <LeftEachDayCard answer={answer} />
          <FunnelFlow answer={answer} flow={flow} nothingTicked={ticks.keys.length === 0} most={ticks.most} onSelectTop={() => ticks.set([...(flow?.starts ?? [])])} />
        </>
      )}
      list="landing"
      headings={shop ? undefined : { conversions: tt("events") }}
      group={choice.group}
      leaveOut={choice.leaveOut}
      ticks={ticks}
      noun="pages"
      opening="visits"
      searchPlaceholder={t("findPage")}
      rowHref={(row) => (row.key.startsWith("~") ? pageHref(row.key) : null)}
      filters={<ClassificationSelect choice={choice} />}
      emptyLabel={t("empty")}
    />
  );
}

/** The route chart, told the dates in words. */
function FunnelFlow({ answer, flow, nothingTicked, most, onSelectTop }: { answer: ListPageAnswer | undefined; flow: Parameters<typeof LandingFlowCard>[0]["flow"]; nothingTicked: boolean; most: number; onSelectTop: () => void }) {
  const inWords = useSpanInWords(...spansOfList(answer));
  return <LandingFlowCard flow={flow} month={inWords.now} before={inWords.before} nothingTicked={nothingTicked} most={most} onSelectTop={onSelectTop} />;
}

/**
 * The page's eye: the table's page as shown, the whole website's figures (`website`) to set each landing page beside, and the
 * share of every landing page's visits that left without seeing another page (`landingAll`, Overview's own figure), as no one
 * page of the table holds every landing page (ask-hakken-every-chart-page-plan-2026-11-03.md).
 */
function FunnelSees({ answer, currency, flow }: { answer: ListPageAnswer | undefined; currency: string | null; flow: FlowAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.chart.flow");
  const tm = useTranslations("googleAnalytics.menu");
  const pageHref = usePageHref();
  const hrefFor = useAnalyticsHref(useAnalyticsArgs().siteId);
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const names = useEyeNames();
  const website = useWebsiteForEye();
  const panels = useQuery(api.googleAnalyticsOverviewReads.analyticsOverviewPagePanels, status?.connection?.newestDay ? args : "skip");
  const left = panels?.landing?.left ?? null;
  // The chart's figures, whatever is ticked: the same read Ask Hakken has.
  const funnel = useMemo(() => (flow?.held ? funnelFigures(flow, { shop: t("shop"), notSorted: t("notSorted"), otherPages: t("otherPages"), otherGroups: (count) => t("otherGroups", { count }), pageNotKnown: t("pageNotKnown") }) : null), [flow, t]);
  const data = useMemo(() => (answer ? {
    ...answer, names, ...(website ? { website } : {}),
    // As a percentage already, so `pageData.ts` turns it round once only.
    ...(left !== null ? { landingAll: { leftPercent: Math.round(left * 1000) / 10 } } : {}),
    ...(funnel ? { funnel } : {}),
  } : answer), [answer, names, website, left, funnel]);
  // Where "Do first" may send the reader: the pages people leave most, and where their figures are looked into.
  const worst = flow?.busy?.top ?? [];
  const links = useMemo(() => [
    ...worst.slice(0, 3).filter((page) => page.key.startsWith("~")).map((page) => ({ label: pageName(page.address), href: pageHref(page.key) })),
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pageHref and hrefFor are new each draw; the pages and the dates decide.
  ], [worst, tm, args.period, args.device, args.country]);
  return <AnalyticsSees screen="landing" seen={answer?.seen} currency={currency} data={data} links={links} />;
}
