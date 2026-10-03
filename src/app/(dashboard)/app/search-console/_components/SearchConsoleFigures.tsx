"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPosition, formatRate } from "./searchConsoleFormat";
import { useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

type Figures = { clicks: number; impressions: number; ctr: number; position: number };

/**
 * A figure against the same number of days before, as every Search Console
 * hero box writes it: up 14 on the 30 days before (with its arrow), the same
 * as the 30 days before, or that those days are not held yet. The sentence
 * starts with its arrow; its colour is the kit's one rule (`ChangeLine`).
 *
 * `by` is now − before, or null when the days before are not held; `write`
 * writes the size of the move (a count, a per cent, points); a move smaller
 * than `still` reads as no move. `neutral` for a figure whose rise is not
 * good news; `isNew` for one Google did not show at all in the days before —
 * a rise from nothing.
 */
export function DaysBeforeChange({ by, days, write, neutral = false, still = 0, isNew = false }: {
  by: number | null;
  days: number;
  write: (change: number) => string;
  neutral?: boolean;
  still?: number;
  isNew?: boolean;
}) {
  const t = useTranslations("searchConsole.figures");
  if (isNew) return <ChangeLine by={1}>{t("new")}</ChangeLine>;
  if (by === null) return <ChangeLine by={null}>{t("noBefore")}</ChangeLine>;
  if (by === 0 || Math.abs(by) < still) return <ChangeLine by={0}>{t("same", { days })}</ChangeLine>;
  return <ChangeLine by={by} neutral={neutral}>{t(by > 0 ? "up" : "down", { change: write(Math.abs(by)), days })}</ChangeLine>;
}

/** A move too small to be one, after the sums of rates. */
const ROUNDING = 1e-9;

/**
 * The four headline figures of a website, a search or a page — clicks,
 * impressions, click-through rate and Google's average position — each
 * against the same number of days before when those days are held, the
 * arrow carrying the meaning and colour only repeating it.
 */
export function SearchConsoleFigures({ totals, previous, days, isNew = false }: {
  totals: Figures | null;
  previous: Figures | null;
  days: number;
  /** A search or page Google did not show at all in the days before. */
  isNew?: boolean;
}) {
  const t = useTranslations("searchConsole.figures");
  const growth = (before: number) => (change: number) => (before > 0 ? formatRate(change / before) : formatNumber(change));
  const against = (now: number, before: number | undefined) => (before === undefined ? null : now - before);
  const positionChange = () => {
    if (isNew) return <ChangeLine by={1}>{t("new")}</ChangeLine>;
    if (!previous || !totals) return <ChangeLine by={null}>{t("positionNote")}</ChangeLine>;
    // Lower is better: the change is how many places it rose.
    const change = previous.position - totals.position;
    if (Math.abs(change) < 0.05) return <ChangeLine by={0}>{t("same", { days })} · {t("positionNote")}</ChangeLine>;
    return (
      <ChangeLine by={change}>
        {t(change > 0 ? "better" : "worse", { change: formatPosition(Math.abs(change)), days })} · {t("positionNote")}
      </ChangeLine>
    );
  };
  return (
    <FigureRow>
      <Figure
        label={t("clicks")}
        value={formatNumber(totals?.clicks ?? 0)}
        detail={<DaysBeforeChange isNew={isNew} by={against(totals?.clicks ?? 0, previous?.clicks)} days={days} still={ROUNDING} write={growth(previous?.clicks ?? 0)} />}
      />
      <Figure
        label={t("impressions")}
        value={formatNumber(totals?.impressions ?? 0)}
        detail={<DaysBeforeChange isNew={isNew} by={against(totals?.impressions ?? 0, previous?.impressions)} days={days} still={ROUNDING} write={growth(previous?.impressions ?? 0)} />}
      />
      <Figure
        label={t("ctr")}
        value={formatRate(totals?.ctr ?? null)}
        detail={
          <DaysBeforeChange
            isNew={isNew}
            by={against((totals?.ctr ?? 0) * 100, previous ? previous.ctr * 100 : undefined)}
            days={days}
            still={ROUNDING}
            write={(change) => t("points", { change: formatPosition(change) })}
          />
        }
      />
      <Figure label={t("position")} value={formatPosition(totals?.position ?? null)} detail={positionChange()} />
    </FigureRow>
  );
}

/**
 * The website's four headline figures for the dates chosen, against the days
 * before: the hero boxes above the Keywords and Pages lists (§13.1). Read
 * from the website's day totals — the rare searches Google hides included.
 */
export function SearchConsoleSiteFigures() {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const performance = useQuery(
    api.searchConsoleReads.searchConsolePerformance,
    status?.connection?.newestDay ? { siteId, searchType: kind, from: range.from, to: range.to } : "skip",
  );
  if (performance === undefined) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  return <SearchConsoleFigures totals={performance.totals} previous={performance.previous} days={range.days} />;
}
