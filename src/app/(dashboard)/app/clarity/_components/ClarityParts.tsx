"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, PlayCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { CLARITY_FEW_VISITS, type ClarityMeasures } from "@/convex/utils/clarityRows";
import { assistantOf } from "@/convex/utils/aiAssistants";
import { Change, ChangeLine } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatDateTime } from "@/src/lib/dates";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { useClarityStatus } from "./useClarity";
import { unitOf, type CalendarPeriod } from "@/convex/utils/calendarPeriods";

/**
 * The small parts every Clarity screen shares (docs/plans/active/agents-and-clarity-plan.md,
 * Part 4, drawn on "Hakken — Microsoft Clarity"): figures written one way,
 * a figure from too few visits greyed with its reason (CS9), a change in
 * points or seconds, the links into Clarity (CS8), and the days a figure
 * covers said honestly (CF3).
 */

/** A share or a scroll depth, to a tenth: "21.3%". */
export const percent = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${value.toFixed(1)}%`);

/** Seconds as a visit's time: "44s", "1m 02s". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "–";
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m ${rest}s`;
}

export const mono = (text: string, tone = "text-foreground") => <span className={`whitespace-nowrap font-mono text-[12px] ${tone}`}>{text}</span>;
export const quiet = (text: ReactNode) => <span className="text-[12.5px] text-secondary">{text}</span>;

/** Too few visits to judge: fewer than ten (CS9). */
export const tooFew = (visits: number) => visits < CLARITY_FEW_VISITS;

/** A figure from a row's visits, greyed with the reason on hover when they are too few to judge. */
export function Judged({ text, visits, tone = "text-secondary" }: { text: string; visits: number; tone?: string }) {
  const t = useTranslations("clarity.common");
  const few = tooFew(visits);
  return <span className={`whitespace-nowrap font-mono text-[12px] ${few ? "text-muted" : tone}`} title={few ? t("tooFew") : undefined}>{text}</span>;
}

/** How far a scroll depth or a share moved, in points, through the kit's Change; greyed when the visits are too few to judge. */
export function Points({ now, before, visits }: { now: number | null; before: number | null; visits: number }) {
  if (now === null || before === null) return <NoFigure />;
  const by = Math.round((now - before) * 10) / 10;
  if (tooFew(visits)) return <Judged text={`${by.toFixed(1)} pts`} visits={visits} />;
  return <Change by={by} format={(value) => `${value.toFixed(1)} pts`} />;
}

/**
 * A figure's change line under it, coloured by whether up is good; `neutral`
 * where up is bad news to read, not cheer. Its words start with their own
 * arrow, as every change line's do: give them `way` (`wayOf`).
 */
export function Moved({ by, children, neutral = false }: { by: number | null; children: ReactNode; neutral?: boolean }) {
  if (by === null) return null;
  return <ChangeLine by={by} neutral={neutral}>{children}</ChangeLine>;
}

/** Which way a change went, for its words' arrow. */
export const wayOf = (by: number | null) => (by === null || by === 0 ? "same" : by > 0 ? "up" : "down");

/** A device as Clarity names it, in words a person uses. */
export function useDeviceName(): (device: string) => string {
  const t = useTranslations("clarity.devices");
  // "Any": a large website's page asked for without its devices ("Large websites").
  return (device) => (device === "PC" || device === "Mobile" || device === "Tablet" || device === "Any" ? t(device) : t("Other"));
}

/**
 * A source as Clarity names it: "google" and "bing" as Google and Bing, an AI
 * assistant by its name, the website's own address as visits between its
 * pages, and no source as a direct visit. Each its own line, never grouped.
 */
export function useSourceName(): (source: string) => string {
  const t = useTranslations("clarity.sources");
  const status = useClarityStatus();
  const own = (status?.host ?? "").replace(/^www\./, "").toLowerCase();
  return (source) => {
    const host = source.trim().toLowerCase().replace(/^www\./, "");
    if (!host || host === "direct" || host === "(direct)") return t("direct");
    if (own && (host === own || host.endsWith(`.${own}`))) return t("own");
    const assistant = assistantOf(host);
    if (assistant) return assistant;
    return /^[a-z]+$/.test(host) ? host[0].toUpperCase() + host.slice(1) : host;
  };
}

/**
 * A page's heatmap in Clarity, as Clarity's own heatmaps list opens one
 * (checked in Clarity, 2026-10-16): the page's address, and a filter matching
 * it with or without a query (`URL=2;6;^address(\?.*)?$`).
 */
export function clarityHeatmapHref(projectId: string, address: string): string {
  const pattern = `2;6;^${address.replace(/[.*+?^${}()|[\]\\/]/g, (mark) => (mark === "/" ? "/" : `\\${mark}`))}(\\?.*)?$`;
  return `https://clarity.microsoft.com/projects/view/${projectId}/heatmaps?heatmapType=0&url=${encodeURIComponent(address)}&URL=${encodeURIComponent(pattern)}`;
}

/** Clarity's project, and a page's heatmap in it: links that open where they say (CS8), or Clarity itself while the project's id is not yet known. */
export function useClarityLinks(): { project: string; heatmap: (page: string) => string } {
  const status = useClarityStatus();
  const projectId = status?.connection?.projectId ?? null;
  const origin = status?.connection?.origin ?? (status?.host ? `https://${status.host}` : null);
  const project = projectId ? `https://clarity.microsoft.com/projects/view/${projectId}/dashboard` : "https://clarity.microsoft.com/";
  return {
    project,
    heatmap: (page) => (projectId && origin ? clarityHeatmapHref(projectId, `${origin}${page}`) : project),
  };
}

export function OutLink({ href, children, icon = "arrow" }: { href: string; children: ReactNode; icon?: "arrow" | "play" }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-secondary hover:text-info" onClick={(event) => event.stopPropagation()}>
      {icon === "play" ? <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
      {icon === "arrow" ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
    </a>
  );
}

export function HeatmapLink({ page, label }: { page: string; label?: string }) {
  const t = useTranslations("clarity.common");
  const links = useClarityLinks();
  return <OutLink href={links.heatmap(page)}>{label ?? t("heatmap")}</OutLink>;
}

export function WatchLink({ href, label }: { href: string; label?: string }) {
  const t = useTranslations("clarity.common");
  return <OutLink href={href} icon="play">{label ?? t("watch")}</OutLink>;
}

/** A link within the section, quiet until hovered, with its arrow. */
export function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 self-start text-[12.5px] text-secondary hover:text-info">
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * The days a screen covers, said honestly (CF3): "last month" only when its
 * days are all held (`expected`, to Clarity's newest); "4 days so far, since
 * 16 Oct" until then; and Clarity's newest day while it has sent none of the
 * period (`waiting`, calendar-periods-plan.md rule 9).
 */
export type ClarityPeriod = {
  now: { from: string; to: string; days: number } | null;
  before: { from: string; to: string; days: number } | null;
  firstDay: string | null;
  countedFrom?: string | null;
  pages?: { days: number; from: string | null } | null;
  cutDays?: number;
  expected: number;
  waiting: boolean;
  newest: string | null;
};

/** A moment as the section says it: the day and the time, once, without seconds (CF5). */
export const formatWhen = (at: number) => formatDateTime(at, { options: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } });

export function usePeriodWords(): (period: ClarityPeriod | undefined, chosen: CalendarPeriod, of?: "pages") => string {
  const t = useTranslations("clarity.common");
  const tp = useTranslations("common.periods");
  return (period, chosen, of) => {
    // A page's own figures can start later than the website's (`period.pages`).
    const pages = of === "pages" ? period?.pages ?? null : null;
    const held = pages ? pages.days : period?.now?.days ?? 0;
    if (period && held > 0 && held >= period.expected) return tp(`inline.${chosen}`);
    return t("soFar", { count: held, since: formatDay(pages?.from ?? period?.now?.from ?? period?.firstDay ?? null) });
  };
}

/** What the chosen period is set against, in words (rule 4): "the month before", "the same days last month"; with a capital for a chart's line. */
export function useBeforeName(): (chosen: CalendarPeriod, capital?: boolean) => string {
  const tp = useTranslations("common.periods");
  return (chosen, capital = false) => {
    const words = tp(`before.${chosen}`);
    return capital ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : words;
  };
}

/** Clarity has sent none of the period yet (rule 9): one line, with its newest day, in place of empty figures. */
export function useWaitingWords(): (period: ClarityPeriod | undefined, chosen: CalendarPeriod) => string | null {
  const tp = useTranslations("common.periods");
  return (period, chosen) => (period?.waiting && period.newest ? tp("noDaysYet", { source: "Microsoft Clarity", unit: unitOf(chosen), day: formatDay(period.newest) }) : null);
}

/**
 * The days errors are counted over, in words: the days shown, or — where the
 * first of them were kept before errors were read (`countedFrom`) — the days
 * since, never "none in 4 days" of one.
 */
export function useCountedWords(): (period: ClarityPeriod | undefined, chosen: CalendarPeriod, byDay: ReadonlyArray<{ visits: number; errors: number | null }>) => string {
  const t = useTranslations("clarity.common");
  const periodWords = usePeriodWords();
  return (period, chosen, byDay) => {
    if (!period?.countedFrom) return periodWords(period, chosen);
    return t("soFar", { count: byDay.filter((day) => day.errors !== null && day.visits > 0).length, since: formatDay(period.countedFrom) });
  };
}

/**
 * A figure's comparison with what the period is set against, in words, or why
 * there is none: Clarity was connected after those days began.
 */
export function useBeforeWords(): (period: ClarityPeriod | undefined, chosen: CalendarPeriod) => string {
  const t = useTranslations("clarity.common");
  const tp = useTranslations("common.periods");
  return (period, chosen) => (period?.before && period.before.days > 0 ? tp(`versus.${chosen}`) : t("noBefore", { since: formatDay(period?.firstDay ?? null) }));
}

/** A whole number's change against the days before, as a figure's line says it. */
export const changeOf = (now: number | null, before: number | null | undefined): number | null => (now === null || before === null || before === undefined ? null : Math.round((now - before) * 10) / 10);

/** A count's change as a share of what it was: "16.2%". */
export const growthOf = (now: number, before: number | null | undefined): number | null => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);

export const visitsOf = (measures: ClarityMeasures | null | undefined) => formatNumber(measures?.visits ?? 0);
