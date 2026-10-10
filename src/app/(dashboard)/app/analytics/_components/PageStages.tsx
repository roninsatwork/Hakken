"use client";

import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { formatNumber } from "../../sites/_components/siteFormat";
import { changeOf, formatMoney, formatPercent } from "./analyticsFormat";

export type PageJourney = NonNullable<FunctionReturnType<typeof api.googleAnalyticsHeroes.analyticsHeroPage>["found"]>;

/** A share as a percentage: two decimals under 1%, where one would round a real rate to nothing. */
export function formatRate(share: number | null | undefined): string {
  if (share === null || share === undefined || Number.isNaN(share)) return "–";
  const percent = share * 100;
  return `${percent.toFixed(percent > 0 && percent < 1 ? 2 : 1)}%`;
}

/** The change on the 30 days before, its arrow in the words, or nothing to compare. */
function StageChange({ now, before }: { now: number | null; before: number | null | undefined }) {
  const t = useTranslations("googleAnalytics.heroes.stages");
  const change = now === null ? null : changeOf(now, before);
  if (change === null) return <span className="block text-[12px] text-muted">{t("nothingBefore")}</span>;
  if (Math.abs(change) < 0.005) return <span className="block text-[12px] text-muted">{t("same")}</span>;
  return <ChangeLine by={change}>{t(change > 0 ? "up" : "down", { change: formatPercent(Math.abs(change)) })}</ChangeLine>;
}

/**
 * One page's four stages from Google to money (docs/plans/active/
 * google-analytics-plan.md §13, §15 screen 7): Shown in Google, Clicked,
 * Visits and Conversions, each against the 30 days before, the stage where
 * it loses most marked as Overview's Value figure is. Google's figures are its
 * showings in Google's results; Analytics' are every visit that started on it.
 */
export function PageStages({ journey, currency, consoleConnected }: { journey: PageJourney; currency: string | null; consoleConnected: boolean }) {
  const t = useTranslations("googleAnalytics.heroes.stages");
  const google = journey.google;
  const before = journey.googleBefore;
  const visits = journey.visits;
  const was = journey.visitsBefore;
  return (
    <FigureRow>
      <Figure
        label={t("shown")}
        emphasis={journey.marked === 0}
        value={google ? formatNumber(google.shown) : "–"}
        detail={google ? (
          <>
            <span className="block text-secondary">
              {before ? t("positionFrom", { position: google.position.toFixed(1), before: before.position.toFixed(1) }) : t("position", { position: google.position.toFixed(1) })}
            </span>
            <StageChange now={google.shown} before={before?.shown} />
          </>
        ) : <span className="text-muted">{consoleConnected ? t("notInGoogle") : t("noConsole")}</span>}
      />
      <Figure
        label={t("clicked")}
        emphasis={journey.marked === 1}
        value={google ? formatNumber(google.clicks) : "–"}
        detail={google ? (
          <>
            <span className="block text-secondary">{t("ofShowings", { rate: formatRate(google.shown > 0 ? google.clicks / google.shown : null) })}</span>
            <StageChange now={google.clicks} before={before?.clicks} />
          </>
        ) : <span className="text-muted">{consoleConnected ? t("notInGoogle") : t("noConsole")}</span>}
      />
      <Figure
        label={t("visits")}
        emphasis={journey.marked === 2}
        value={formatNumber(visits?.visits ?? 0)}
        detail={visits && visits.visits > 0 ? (
          <>
            <span className="block text-secondary">{t("engaged", { rate: formatPercent(visits.engaged / visits.visits) })}</span>
            <StageChange now={visits.visits} before={was?.visits} />
          </>
        ) : <span className="text-muted">{t("noVisit")}</span>}
      />
      <Figure
        label={t("conversions")}
        emphasis={journey.marked === 3}
        value={formatNumber(visits?.conversions ?? 0)}
        detail={(
          <>
            <span className="block text-secondary">{visits && visits.value > 0 ? t("value", { money: formatMoney(visits.value, currency) }) : t("noValue")}</span>
            <StageChange now={visits?.conversions ?? 0} before={was?.conversions} />
          </>
        )}
      />
    </FigureRow>
  );
}
