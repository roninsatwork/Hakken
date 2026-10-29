"use client";

import { useTranslations } from "next-intl";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Change, ChangeLine } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../sites/_components/siteFormat";
import { changeOf, formatMoney, formatPercent, formatPerVisit, formatTime } from "./analyticsFormat";
import { usePeriod, periodWord } from "./useAnalytics";

type Figures = {
  visits: number;
  engaged: number;
  views: number;
  people: number;
  newPeople: number;
  /** Seconds the visits lasted, all told. */
  length: number;
  conversions: number;
  value: number;
};

/** The change on the span before, its arrow in the words ("up 8.4% on the 30 days before"), or nothing to compare. */
export function BeforeLine({ now, before }: { now: number; before: number | null | undefined }) {
  const t = useTranslations("googleAnalytics.figures");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const change = changeOf(now, before);
  if (change === null) return <span className="text-[12px] text-muted">{t("nothingBefore")}</span>;
  return (
    <ChangeLine by={change}>
      {t(change > 0 ? "onBeforeUp" : change < 0 ? "onBeforeDown" : "onBeforeSame", { change: formatPercent(Math.abs(change)), before: tf(`before.${periodWord(period)}`) })}
    </ChangeLine>
  );
}

/** A figure a visit — pages, seconds — on the span before, as its own move (up 0.1 on the 30 days before); a rate in points. Visitors' visits a person too. */
export function PerVisitLine({ now, before, format, points = false, lowerIsBetter = false }: {
  now: number | null;
  before: number | null;
  format: (value: number) => string;
  points?: boolean;
  lowerIsBetter?: boolean;
}) {
  const t = useTranslations("googleAnalytics.figures");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  if (now === null || before === null) return <span className="text-[12px] text-muted">{t("nothingBefore")}</span>;
  const by = Math.round((now - before) * (points ? 1000 : 10)) / (points ? 1000 : 10);
  const words = { change: format(Math.abs(by)), before: tf(`before.${periodWord(period)}`) };
  const key = by === 0 ? "onBeforeSame" : points ? (by > 0 ? "pointsUp" : "pointsDown") : by > 0 ? "onBeforeUp" : "onBeforeDown";
  return <ChangeLine by={lowerIsBetter ? -by : by}>{t(key, words)}</ChangeLine>;
}

const perVisit = (total: number, visits: number) => (visits > 0 ? total / visits : null);

/**
 * Overview's figures (§5; §18.2 board 13): page views before money (GA26) —
 * visits, page views, people and engaged visits; then visit length, pages a
 * visit and bounce rate (GA25); and conversions, their value a line beneath,
 * leading to the Conversions page. Each against the span before.
 */
export function AnalyticsFigures({ now, before, currency, conversionsHref, counting }: {
  now: Figures;
  before: Figures | null;
  currency: string | null;
  conversionsHref: string;
  /** Whether anything counts as a conversion: without, conversions say so. */
  counting: boolean;
}) {
  const t = useTranslations("googleAnalytics.figures");
  const engagedRate = now.visits > 0 ? now.engaged / now.visits : null;
  const engagedChange = changeOf(now.engaged, before?.engaged);
  const viewsChange = changeOf(now.views, before?.views);
  const peopleChange = changeOf(now.people, before?.people);
  const bounce = (figures: Figures | null) => (figures && figures.visits > 0 ? 1 - figures.engaged / figures.visits : null);
  const share = (by: number | null) => (by !== null ? <> · <Change by={Math.round(by * 1000) / 10} format={(value) => `${value.toFixed(1)}%`} /></> : null);
  return (
    <FigureRow>
      <Figure label={t("visits")} value={formatNumber(now.visits)} detail={<BeforeLine now={now.visits} before={before?.visits} />} />
      <Figure
        label={t("views")}
        value={formatNumber(now.views)}
        detail={<span className="text-[12px] text-secondary">{t("viewsLine")}{share(viewsChange)}</span>}
      />
      <Figure
        label={t("people")}
        value={formatNumber(now.people)}
        detail={<span className="text-[12px] text-secondary">{t("newShare", { rate: formatPercent(now.people > 0 ? now.newPeople / now.people : null) })}{share(peopleChange)}</span>}
      />
      <Figure
        label={t("engaged")}
        value={formatNumber(now.engaged)}
        detail={<span className="text-[12px] text-secondary">{t("ofVisits", { rate: formatPercent(engagedRate) })}{share(engagedChange)}</span>}
      />
      <Figure
        label={t("length")}
        value={formatTime(perVisit(now.length, now.visits))}
        detail={<PerVisitLine now={perVisit(now.length, now.visits)} before={before ? perVisit(before.length, before.visits) : null} format={formatTime} />}
      />
      <Figure
        label={t("pagesPerVisit")}
        value={formatPerVisit(perVisit(now.views, now.visits))}
        detail={<PerVisitLine now={perVisit(now.views, now.visits)} before={before ? perVisit(before.views, before.visits) : null} format={(value) => value.toFixed(1)} />}
      />
      <Figure
        label={t("bounce")}
        value={formatPercent(bounce(now))}
        detail={(
          <span className="text-[12px] text-secondary">
            {t("bounceLine")} · <PerVisitLine now={bounce(now)} before={bounce(before)} format={(value) => (value * 100).toFixed(1)} points lowerIsBetter />
          </span>
        )}
      />
      <Figure
        label={t("conversions")}
        href={conversionsHref}
        value={counting ? formatNumber(now.conversions) : "–"}
        detail={counting ? (
          <>
            <span className="block text-[12px] text-secondary">{t("ofValue", { value: formatMoney(now.value, currency) })}</span>
            <BeforeLine now={now.conversions} before={before?.conversions} />
          </>
        ) : <span className="text-[12px] text-muted">{t("nothingCounted")}</span>}
      />
    </FigureRow>
  );
}
