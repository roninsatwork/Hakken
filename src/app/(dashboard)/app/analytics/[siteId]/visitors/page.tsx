"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { FLOW_MORE } from "@/convex/utils/conversionFlow";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { SearchConsoleChartCard } from "../../../search-console/_components/SearchConsoleChartCard";
import { AnalyticsListScreen, type VisitorList } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ChannelsChart } from "../../_components/AnalyticsChart";
import { useFlowKindName } from "../../_components/ConversionParts";
import { useVisitorName } from "../../_components/useVisitorName";
import { BeforeLine, PerVisitLine } from "../../_components/AnalyticsFigures";
import { formatPercent, formatPerVisit } from "../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, periodWord } from "../../_components/useAnalytics";

/** The table's lists, in the order the switch offers them (§18.2 board 15). */
const VIEWS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const satisfies readonly VisitorList[];

/** Each list's count in its table bar. */
const NOUNS = { visitorType: "groups", browser: "browsers", system: "systems", age: "ageGroups", gender: "groups", interest: "interests" } as const;

/**
 * Visitors (GA24; §18.2 board 15; redrawn and approved 2026-10-14,
 * docs/plans/active/ga-conversions-visitors-plan.md CV7): who visited — how
 * many people, whether they'd been before, what they used, their age, gender
 * and interests where Google can tell, and what each kind of visitor reads.
 * What Hakken sees, four figures, new and returning people a day with a dot on
 * each day with a conversion, where each kind of visitor lands by page
 * classification (the list chosen), a note when Google signals is off, and
 * one table switching between the six lists, opening on new or returning,
 * each group with the classification it lands on most. Nothing is asked of
 * Google.
 */
export default function AnalyticsVisitorsPage() {
  const t = useTranslations("googleAnalytics.visitors");
  const [view, setView] = useSiteParam<VisitorList>("view", "visitorType", VIEWS);
  const nameOf = useVisitorName();
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const map = useQuery(api.googleAnalyticsConversionReads.analyticsVisitorMap, status?.connection?.newestDay ? { ...args, list: view } : "skip");
  const kindName = useFlowKindName(map?.kinds ?? []);
  return (
    <AnalyticsListScreen
      header={{ icon: <Users className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={() => <VisitorsHead map={map ?? null} kindName={kindName} />}
      list={view}
      noun={NOUNS[view]}
      searchPlaceholder={t(`find.${view}`)}
      filters={<SiteViewSwitch label={t("showing")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />}
      opening="visits"
      emptyLabel={t("empty")}
      nameOf={(row) => nameOf(row.label)}
      kindName={kindName}
    />
  );
}

type VisitorMap = NonNullable<FunctionReturnType<typeof api.googleAnalyticsConversionReads.analyticsVisitorMap>>;

function VisitorsHead({ map, kindName }: { map: VisitorMap | null; kindName: (kind: string) => string }) {
  const t = useTranslations("googleAnalytics.visitors");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const nameOf = useVisitorName();
  const answer = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitors, status?.connection?.newestDay ? args : "skip");
  const figures = answer?.figures ?? null;
  const share = (part: number) => (figures && figures.people > 0 ? formatPercent(Math.min(1, part / figures.people)) : "–");
  const perPerson = (visits: number, people: number | null) => (people ? visits / people : null);
  // Said whichever list is shown, as drawn: three of the six are empty.
  const signalsOff = answer?.signals === "off";
  return (
    <>
      <AnalyticsSees screen="visitors" seen={answer?.seen} currency={status?.connection?.currency} names={(value) => (map?.kinds.some((kind) => kind.kind === value) ? kindName(value) : null)} />
      {answer?.preparing ? <Notice>{t("preparing")}</Notice> : null}
      {figures ? (
        <FigureRow columns={4}>
          <Figure label={t("people")} value={formatNumber(figures.people)} detail={<BeforeLine now={figures.people} before={figures.peopleBefore} />} />
          <Figure label={t("newVisitors")} value={formatNumber(figures.newPeople)} detail={<span className="text-secondary">{t("ofPeople", { rate: share(figures.newPeople) })}</span>} />
          <Figure label={t("returning")} value={formatNumber(figures.returningPeople)} detail={<span className="text-secondary">{t("ofPeople", { rate: share(figures.returningPeople) })}</span>} />
          <Figure
            label={t("visitsAPerson")}
            value={formatPerVisit(perPerson(figures.visits, figures.people))}
            detail={<PerVisitLine now={perPerson(figures.visits, figures.people)} before={figures.visitsBefore === null ? null : perPerson(figures.visitsBefore, figures.peopleBefore)} format={(value) => formatPerVisit(value)} />}
          />
        </FigureRow>
      ) : null}
      {/* A dot on each day with a conversion, bigger for more (CV7), as Channels' chart draws them. */}
      <ChannelsChart
        channels={[t("new"), t("returningLine")]}
        rest={false}
        marked
        updateKey={false}
        points={(answer?.points ?? []).map((point) => ({ day: point.day, lastDay: point.lastDay, visits: [point.new, point.returning], conversions: [point.newConversions, point.returningConversions] }))}
        host={status?.host ?? ""}
        from={null}
        to={null}
        exportName="google-analytics-new-and-returning"
        title={{ ...t.raw("chartTitle") as { day: string; week: string; month: string }, hint: t("chartHint", { period: tf(`periods.${periodWord(period)}`) }) }}
      />
      <VisitorMapCard map={map} nameOf={nameOf} kindName={kindName} />
      {signalsOff ? (
        <Notice>{t("signalsOff", { host: status?.host ?? "" })}</Notice>
      ) : null}
    </>
  );
}

/**
 * "Where each kind of visitor lands, by page classification" (CV7, Channels'
 * map): the list chosen above the table down the side — its eight biggest
 * groups, then everything else — the website's classifications across, each
 * square the group's visits that started on that kind of page, brighter for a
 * bigger share of the group, with its conversions (none for interests, kept
 * without them: CV10).
 */
function VisitorMapCard({ map, nameOf, kindName }: { map: VisitorMap | null; nameOf: (label: string) => string; kindName: (kind: string) => string }) {
  const t = useTranslations("googleAnalytics.visitors.map");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const columns = (map?.kinds ?? []).map((kind) => kindName(kind.kind));
  const label = (key: string) => (key === FLOW_MORE ? t("everything") : nameOf(key));
  const rows: ChannelMapRow[] = (map?.rows ?? []).map((row) => ({
    key: row.key,
    label: label(row.key),
    total: t("visits", { count: row.visits }),
    cells: row.cells.map((cell, at) => ({
      visits: cell.visits,
      conversions: map?.conversions ? cell.conversions : 0,
      hover: map?.conversions
        ? t("hover", { group: label(row.key), kind: columns[at] ?? "", visits: cell.visits, conversions: cell.conversions })
        : t("hoverPlain", { group: label(row.key), kind: columns[at] ?? "", visits: cell.visits }),
    })),
  }));
  const visitsOf = new Map((map?.rows ?? []).map((row) => [row.key, row.visits]));
  const hint = `${t(map?.conversions === false ? "hintNoConversions" : "hint", { period: tf(`periods.${periodWord(period)}`) })}${map?.thresholded ? ` ${t("privacy")}` : ""}`;
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={hint}
      exportName="google-analytics-visitor-map"
      csv={() => toCsv(["group", ...columns], (map?.rows ?? []).map((row) => [label(row.key), ...row.cells.map((cell) => cell.visits)]))}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {map === null || map.collecting ? <p className="py-10 text-center text-[12px] text-muted">{t("collecting")}</p>
        : rows.length === 0 ? <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>
          : (
            <ChannelMap
              columns={columns}
              rows={rows}
              rowVisits={(row) => visitsOf.get(row.key) ?? 0}
              conversionsWord={(count) => t("conversions", { count })}
              legend={{ visits: t("legendVisits"), ...(map.conversions ? { conversions: t("legendConversions") } : {}), shades: t("legendShades"), empty: t("legendEmpty") }}
            />
          )}
    </SearchConsoleChartCard>
  );
}
