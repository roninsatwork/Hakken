"use client";

import { useTranslations } from "next-intl";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Change, ChangeLine } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../sites/_components/siteFormat";
import { changeOf, formatMoney, formatPercent } from "./analyticsFormat";
import { usePeriod } from "./useAnalytics";

type Figures = { visits: number; engaged: number; conversions: number; value: number };

/** The change on the span before, its arrow in the words ("up 8.4% on the 30 days before"), or nothing to compare. */
export function BeforeLine({ now, before }: { now: number; before: number | null | undefined }) {
  const t = useTranslations("googleAnalytics.figures");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const change = changeOf(now, before);
  if (change === null) return <span className="text-[12px] text-muted">{t("nothingBefore")}</span>;
  return (
    <ChangeLine by={change}>
      {t(change > 0 ? "onBeforeUp" : change < 0 ? "onBeforeDown" : "onBeforeSame", { change: formatPercent(Math.abs(change)), before: tf(`before.${period}`) })}
    </ChangeLine>
  );
}

/**
 * Overview's figures (§5; §11 board 2): visits, engaged visits, conversions
 * and their value, each against the span before; conversions and value lead
 * to the Conversions page. Value is the figure the page leads with.
 */
export function AnalyticsFigures({ now, before, currency, conversionsHref, counting }: {
  now: Figures;
  before: Figures | null;
  currency: string | null;
  conversionsHref: string;
  /** Whether anything counts as a conversion: without, conversions and value say so. */
  counting: boolean;
}) {
  const t = useTranslations("googleAnalytics.figures");
  const engagedRate = now.visits > 0 ? now.engaged / now.visits : null;
  const engagedChange = changeOf(now.engaged, before?.engaged);
  return (
    <FigureRow>
      <Figure label={t("visits")} value={formatNumber(now.visits)} detail={<BeforeLine now={now.visits} before={before?.visits} />} />
      <Figure
        label={t("engaged")}
        value={formatNumber(now.engaged)}
        detail={(
          <span className="text-[12px] text-secondary">
            {t("ofVisits", { rate: formatPercent(engagedRate) })}
            {engagedChange !== null ? <> · <Change by={Math.round(engagedChange * 1000) / 10} format={(value) => `${value.toFixed(1)}%`} /></> : null}
          </span>
        )}
      />
      <Figure
        label={t("conversions")}
        href={conversionsHref}
        value={counting ? formatNumber(now.conversions) : "–"}
        detail={counting ? <BeforeLine now={now.conversions} before={before?.conversions} /> : <span className="text-[12px] text-muted">{t("nothingCounted")}</span>}
      />
      <Figure
        label={t("value")}
        href={conversionsHref}
        emphasis
        value={counting ? formatMoney(now.value, currency) : "–"}
        detail={counting ? <BeforeLine now={now.value} before={before?.value} /> : <span className="text-[12px] text-muted">{t("nothingCounted")}</span>}
      />
    </FigureRow>
  );
}
