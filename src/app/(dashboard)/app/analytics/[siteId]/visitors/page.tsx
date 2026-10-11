"use client";

import { useQuery } from "convex/react";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { isUnknownValue } from "@/convex/utils/analyticsUnknown";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen, useLiveAsk, type VisitorList } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ChannelsChart, ListTopBars } from "../../_components/AnalyticsChart";
import { BeforeLine, PerVisitLine } from "../../_components/AnalyticsFigures";
import { formatPercent, formatPerVisit } from "../../_components/analyticsFormat";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod } from "../../_components/useAnalytics";

/** The table's lists, in the order the switch offers them (§18.2 board 15). */
const VIEWS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const satisfies readonly VisitorList[];

/** Each list's count in its table bar. */
const NOUNS = { visitorType: "groups", browser: "browsers", system: "systems", age: "ageGroups", gender: "groups", interest: "interests" } as const;

/**
 * Visitors (GA24; §18.2 board 15): who visited — how many people, whether
 * they'd been before, what they used, and their age, gender and interests
 * where Google can tell. What Hakken sees, four figures, new and returning
 * people a day, the list chosen as bars, a note when Google signals is off,
 * and one table switching between the six lists. One device's lists are asked
 * of Google when the screen opens.
 */
export default function AnalyticsVisitorsPage() {
  const t = useTranslations("googleAnalytics.visitors");
  const [view, setView] = useSiteParam<VisitorList>("view", "browser", VIEWS);
  const nameOf = useVisitorName();
  return (
    <AnalyticsListScreen
      header={{ icon: <Users className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={() => <VisitorsHead view={view} />}
      list={view}
      noun={NOUNS[view]}
      searchPlaceholder={t(`find.${view}`)}
      filters={<SiteViewSwitch label={t("showing")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />}
      opening="visits"
      emptyLabel={t("empty")}
      nameOf={(row) => nameOf(row.label)}
    />
  );
}

/** A group's name in the reader's words: "New", "Female", "Unknown"; a browser or a system as Google names it. */
function useVisitorName(): (label: string) => string {
  const t = useTranslations("googleAnalytics.visitors.names");
  return (label) => {
    const key = label.trim().toLowerCase();
    // Google's words for not knowing, as the reader's "Unknown".
    if (isUnknownValue(label)) return t("unknown");
    return t.has(key) ? t(key) : label;
  };
}

function VisitorsHead({ view }: { view: VisitorList }) {
  const t = useTranslations("googleAnalytics.visitors");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const [period] = usePeriod();
  const nameOf = useVisitorName();
  const answer = useQuery(api.googleAnalyticsVisitorReads.analyticsVisitors, status?.connection?.newestDay ? args : "skip");
  const missing = new Set(answer?.missing ?? []);
  // One device's lists, each asked of Google once.
  const ask = (list: "visitorType" | "browser" | "age" | "gender" | "visitorSeries") => (missing.has(list) ? { ...args, pages: list } : null);
  useLiveAsk(ask("visitorType"));
  useLiveAsk(ask("browser"));
  useLiveAsk(ask("age"));
  useLiveAsk(ask("gender"));
  useLiveAsk(ask("visitorSeries"));
  const figures = answer?.figures ?? null;
  const share = (part: number) => (figures && figures.people > 0 ? formatPercent(Math.min(1, part / figures.people)) : "–");
  const perPerson = (visits: number, people: number | null) => (people ? visits / people : null);
  // Said whichever list is shown, as drawn: three of the six are empty.
  const signalsOff = answer?.signals === "off";
  return (
    <>
      <AnalyticsSees screen="visitors" seen={answer?.seen} currency={status?.connection?.currency} />
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
      <ChannelsChart
        channels={[t("new"), t("returningLine")]}
        rest={false}
        points={(answer?.points ?? []).map((point) => ({ day: point.day, visits: [point.new, point.returning] }))}
        host={status?.host ?? ""}
        from={null}
        to={null}
        exportName="google-analytics-new-and-returning"
        title={{ ...t.raw("chartTitle") as { day: string; week: string; month: string }, hint: t("chartHint", { period: tf(`periods.${period}`) }) }}
      />
      <ListTopBars list={view} sort="visits" bars={`visitors.${view}`} nameOf={nameOf} />
      {signalsOff ? (
        <Notice>{t("signalsOff", { host: status?.host ?? "" })}</Notice>
      ) : null}
    </>
  );
}
