"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { LiveProblem, type LiveProblemKind } from "./SearchConsoleNotices";
import { formatPosition, formatRate } from "./searchConsoleFormat";
import { useLiveAsk } from "./searchConsoleRecords";
import {
  countryArg,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
  type ResultKind,
} from "./useSearchConsole";

type Figures = { clicks: number; impressions: number; ctr: number; position: number };
type Day = Figures & { day: string };

/** A website's figures for some dates: each day, the totals, the same days before (null when not held), and the clicks Google names (null when not known). */
export type SiteFigures = { days: Day[]; totals: Figures | null; previous: Figures | null; named: number | null };

const NO_FIGURES: SiteFigures = { days: [], totals: null, previous: null, named: null };

/**
 * A website's figures for some dates in the country chosen
 * (search-console-plan.md §16): read from what is kept — all countries', or
 * a country the website keeps ready — or, for any other country, asked of
 * Google (`searchConsoleLiveDays`), which names no clicks. Undefined while
 * loading; `problem` when Google could not answer, and `retry` to ask again.
 */
export function useSiteFiguresFor(ask: { siteId: Id<"companyWebsites">; searchType: ResultKind; from: string; to: string } | null): {
  figures: SiteFigures | undefined;
  problem: LiveProblemKind | null;
  retry: () => void;
} {
  const [country] = useSearchConsoleCountry();
  const kept = useQuery(api.searchConsoleReads.searchConsolePerformance, ask ? { ...ask, ...countryArg(country) } : "skip");
  const live = useLiveAsk(api.searchConsoleReads.searchConsoleLiveDays, ask && country && kept?.live ? { ...ask, country } : null);
  if (!kept?.live) return { figures: kept, problem: null, retry: live.retry };
  if (live.answer === undefined) return { figures: undefined, problem: null, retry: live.retry };
  if (!live.answer.ok) return { figures: NO_FIGURES, problem: live.answer.problem, retry: live.retry };
  return { figures: live.answer, problem: null, retry: live.retry };
}

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
 * from the website's day totals — the rare searches Google hides included —
 * in the country chosen.
 */
export function SearchConsoleSiteFigures() {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const { figures, problem, retry } = useSiteFiguresFor(status?.connection?.newestDay ? { siteId, searchType: kind, from: range.from, to: range.to } : null);
  if (problem) return <LiveProblem problem={problem} retry={retry} />;
  if (figures === undefined) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  return <SearchConsoleFigures totals={figures.totals} previous={figures.previous} days={range.days} />;
}

/**
 * A tracked list's four figures, for the keywords or pages it tracks
 * together (Tracked keywords, Tracked pages): their clicks against the same
 * days before — nothing claimed when those days aren't held — their
 * impressions, click-through rate and Google's average position, weighted by
 * impressions as Google's own. From the list's own summary, so a row unticked
 * leaves the figures as it leaves the table; "…" while it loads.
 */
export function TrackedFigures({ summary, days }: {
  summary: { clicks: number; impressions: number; previousClicks: number | null; position: number | null } | null;
  days: number;
}) {
  const t = useTranslations("searchConsole");
  const note = (text: string) => <span className="text-secondary">{text}</span>;
  return (
    <FigureRow>
      <Figure
        label={t("figures.clicks")}
        value={summary ? formatNumber(summary.clicks) : "…"}
        detail={summary ? <DaysBeforeChange by={summary.previousClicks === null ? null : summary.clicks - summary.previousClicks} days={days} write={formatNumber} /> : undefined}
      />
      <Figure label={t("figures.impressions")} value={summary ? formatNumber(summary.impressions) : "…"} detail={note(t("tracked.figures.shown"))} />
      <Figure label={t("figures.ctr")} value={summary ? formatRate(summary.impressions > 0 ? summary.clicks / summary.impressions : null) : "…"} detail={note(t("tracked.figures.ctr"))} />
      <Figure label={t("figures.position")} value={summary ? formatPosition(summary.position) : "…"} detail={note(t("tracked.figures.position"))} />
    </FigureRow>
  );
}
