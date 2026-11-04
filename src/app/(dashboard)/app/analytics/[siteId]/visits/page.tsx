"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { NO_PAGE_KIND, OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen, type ListPageAnswer, type VisitorList } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { useFlowKindName } from "../../_components/ConversionParts";
import { useVisitorName } from "../../_components/useVisitorName";
import { BeforeLine, PerVisitLine } from "../../_components/AnalyticsFigures";
import { formatPerVisit } from "../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus } from "../../_components/useAnalytics";
import { PageKindsCard, VisitsLineCard, WhoVisitsCard, eyeName, useSpanWords } from "../../_components/VisitsCharts";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";

/** The table's lists, in the order the switch offers them (§18.2 board 15). */
const VIEWS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const satisfies readonly VisitorList[];
/** The bars' By, in the order drawn on board 2 (visits-redo-plan-2026-11-03.md): the same six, the table's choice. */
const BARS = ["visitorType", "age", "gender", "browser", "system", "interest"] as const satisfies readonly VisitorList[];

/** Each list's count in its table bar. */
const NOUNS = { visitorType: "groups", browser: "browsers", system: "systems", age: "ageGroups", gender: "groups", interest: "interests" } as const;

/** Codes a rule's page group can be sent as, named in the reader's words; any other is a page group's own name. */
const KIND_CODES: readonly string[] = [NOT_SORTED_KIND, NO_PAGE_KIND, OTHER_KIND];

/**
 * Visits (docs/plans/active/visits-redo-plan-2026-11-03.md; board 2 of the canvas "Hakken — Visitors, redo",
 * `docs/plans/assets/visits-redo/Visits.dc.html`, approved 3 November 2026: "ok bjuidl it"). Called Visitors until
 * then, at `/visitors`, which forwards here. Every figure is visits or views, never people (Anthony: "lets stick with
 * visits and change the page to visits"). Top to bottom: What Hakken sees; four boxes, each against the span before
 * by its name; new and returning visits by day, with the span before to compare; what people looked at, by kind of
 * page; who visits the website, by the table's choice; the table, switching between the six lists. Nothing is asked of
 * Google.
 */
export default function AnalyticsVisitsPage() {
  const t = useTranslations("googleAnalytics.visitors");
  const [view, setView] = useSiteParam<VisitorList>("view", "visitorType", VIEWS);
  const nameOf = useVisitorName();
  const kindName = useFlowKindName([]);
  return (
    <AnalyticsListScreen
      header={{ icon: <Users className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(list) => <VisitsHead view={view} onView={setView} list={list} />}
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

type VisitsAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsVisitorReads.analyticsVisitors>>;

/** What the eye reads from the page's own read: the boxes as visits now and before. The days, bars and treemap hand theirs. */
function seesData(answer: VisitsAnswer | null | undefined, list: ListPageAnswer | undefined, names: { new: string; returning: string; website: string }) {
  if (!answer?.figures) return answer === undefined ? undefined : null;
  const { figures } = answer;
  return {
    // Named as the eye says it: "The whole website: visits up 6.8%".
    visits: { name: names.website, visits: figures.visits, visitsBefore: figures.visitsBefore },
    newAndReturning: [
      { name: names.new, visits: figures.newVisits, visitsBefore: figures.newVisitsBefore },
      { name: names.returning, visits: figures.returningVisits, visitsBefore: figures.returningVisitsBefore },
    ],
    visitsAPerson: figures.people > 0 ? Math.round((figures.visits / figures.people) * 10) / 10 : null,
    ...(list ? { table: list } : {}),
  };
}

function VisitsHead({ view, onView, list }: { view: VisitorList; onView: (next: VisitorList) => void; list: ListPageAnswer | undefined }) {
  const t = useTranslations("googleAnalytics.visitors");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const kindName = useFlowKindName([]);
  const answer = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitors, status?.connection?.newestDay ? args : "skip");
  const figures = answer?.figures ?? null;
  const spans = useSpanWords(answer?.span ?? null, answer?.spanBefore ?? null);
  const perPerson = (visits: number | null, people: number | null) => (visits !== null && people ? visits / people : null);
  const newName = t("newVisits");
  const returningName = t("returningVisits");
  const websiteName = t("eyeWebsite");
  const data = useMemo(() => seesData(answer, list, { new: newName, returning: returningName, website: websiteName }), [answer, list, newName, returningName, websiteName]);
  // Every list the page can show, each group's visits now and before, so the eye can find what moved in any of them.
  const groups = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitorGroups, status?.connection?.newestDay ? args : "skip");
  const tn = useTranslations("googleAnalytics.visitors.names");
  // New, returning, male and female in the reader's words, so the eye's findings name them as the page does.
  const seenGroups = useMemo(() => (groups ? Object.fromEntries(groups.map((one) => [one.list, one.rows.map((row) => ({
    name: (one.list === "visitorType" || one.list === "gender") && tn.has(row.key.toLowerCase()) ? tn(row.key.toLowerCase()) : eyeName(one.list, row.key),
    visits: row.visits, visitsBefore: row.visitsBefore, engaged: row.engaged,
  }))])) : null), [groups, tn]);
  useSeesPart("visitorGroups", seenGroups);
  // Where the team's "Do first" steps may send the reader: the screens where what the eye finds is looked into.
  const hrefFor = useAnalyticsHref(args.siteId);
  const tm = useTranslations("googleAnalytics.menu");
  const links = useMemo(() => [
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("conversions"), href: hrefFor("conversions") },
  ], [hrefFor, tm]);
  const host = status?.host ?? "";
  // Said whichever list is shown, as drawn: three of the six are empty.
  const signalsOff = answer?.signals === "off";
  return (
    <>
      <AnalyticsSees screen="visitors" seen={answer?.seen} currency={status?.connection?.currency} names={(value) => (KIND_CODES.includes(value) ? kindName(value) : null)} data={data} links={links} />
      {answer?.preparing ? <Notice>{t("preparing")}</Notice> : null}
      {figures ? (
        <FigureRow columns={4}>
          <Figure label={t("visits")} value={formatNumber(figures.visits)} detail={<BeforeLine now={figures.visits} before={figures.visitsBefore} named={spans.before} />} />
          <Figure label={t("newVisits")} value={formatNumber(figures.newVisits)} detail={<BeforeLine now={figures.newVisits} before={figures.newVisitsBefore} named={spans.before} />} />
          <Figure label={t("returningVisits")} value={formatNumber(figures.returningVisits)} detail={<BeforeLine now={figures.returningVisits} before={figures.returningVisitsBefore} named={spans.before} />} />
          <Figure
            label={t("visitsAPerson")}
            value={formatPerVisit(perPerson(figures.visits, figures.people))}
            detail={<PerVisitLine now={perPerson(figures.visits, figures.people)} before={perPerson(figures.visitsBefore, figures.peopleBefore)} format={(value) => formatPerVisit(value)} named={spans.before} />}
          />
        </FigureRow>
      ) : null}
      <VisitsLineCard spans={spans} host={host} />
      <PageKindsCard host={host} />
      <WhoVisitsCard view={view} onView={onView} views={BARS} spans={spans} host={host} />
      {signalsOff ? <Notice>{t("signalsOff", { host })}</Notice> : null}
    </>
  );
}
