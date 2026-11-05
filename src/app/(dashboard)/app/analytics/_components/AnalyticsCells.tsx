"use client";

import Link from "next/link";
import { pageName } from "@/convex/utils/pageNames";
import { useTranslations } from "next-intl";
import { Change } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPercent, pathOf } from "./analyticsFormat";
import { MOVE_VIEWS } from "@/convex/utils/pageMoves";

/**
 * The cells every Google Analytics table shares (§5, §11): figures in
 * JetBrains Mono, right-aligned; a conversion rate under its count as
 * "1.0% of visits", greyed from fewer than 100 visits with the reason on
 * hover (GA22); a change as an arrow and its percentage, never colour alone.
 */

export function FigureCell({ value, quiet = false }: { value: number | null; quiet?: boolean }) {
  if (value === null) return <NoFigure />;
  return <span className={`font-mono text-[12px] ${quiet ? "text-secondary" : "text-foreground"}`}>{formatNumber(value)}</span>;
}

export function TextFigure({ text, quiet = true }: { text: string; quiet?: boolean }) {
  if (text === "–") return <NoFigure />;
  return <span className={`font-mono text-[12px] ${quiet ? "text-secondary" : "text-foreground"}`}>{text}</span>;
}

/**
 * A row's conversions with their rate: under the count ("1.0% of visits"), or
 * on Landing pages beside it on the row's one line ("4 · 2.8%", §15).
 */
export function ConversionsCell({ conversions, rate, fewVisits, oneLine = false }: { conversions: number; rate: number | null; fewVisits: boolean; oneLine?: boolean }) {
  const t = useTranslations("googleAnalytics.table");
  if (oneLine) {
    return (
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="font-mono text-[12px] text-foreground">{formatNumber(conversions)}</span>
        {rate !== null ? (
          <span className={`font-mono text-[12px] ${fewVisits ? "text-muted" : "text-secondary"}`} title={fewVisits ? t("fewVisits") : undefined}>
            · {formatPercent(rate)}
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="font-mono text-[12px] text-foreground">{formatNumber(conversions)}</span>
      {rate !== null ? (
        <span className={`font-mono text-[11.5px] ${fewVisits ? "text-muted" : "text-secondary"}`} title={fewVisits ? t("fewVisits") : undefined}>
          {t("ofVisits", { rate: formatPercent(rate) })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A count with its share of the row's visits on one line, as Landing pages' funnel draws it
 * (landing-pages-flow-plan.md LF4): the visits that left with the kit's down arrow, "46 · 28.9%", and those that went on, "113 · 71.1%".
 * The share greyed from fewer than 100 visits, as every rate here is; nothing kept yet, a dash.
 */
export function ShareCell({ count, visits, fewVisits, left = false }: { count: number | null | undefined; visits: number; fewVisits: boolean; left?: boolean }) {
  const t = useTranslations("googleAnalytics.table");
  if (count == null) return <NoFigure />;
  return (
    <span className="inline-flex flex-col items-end whitespace-nowrap leading-tight">
      {left && count > 0
        // The visits that left, as every fall here is drawn: the kit's arrow, down.
        ? <Change by={-count} arrow="down" format={formatNumber} />
        : <span className="font-mono text-[12px] text-foreground">{formatNumber(count)}</span>}
      {visits > 0 ? (
        <span className={`font-mono text-[12px] ${fewVisits ? "text-muted" : "text-secondary"}`} title={fewVisits ? t("fewVisits") : undefined}>
          {formatPercent(count / visits)}
        </span>
      ) : null}
    </span>
  );
}

/** The page most of a row's visits opened next, by its path, and its share of them: "/ai-agency/ · 34%". */
export function NextPageCell({ next }: { next: { page: string; share: number } | null | undefined }) {
  if (!next) return <NoFigure />;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-[12px]" title={next.page}>
      <span className="truncate text-secondary">{pageName(next.page)}</span>
      <span className="shrink-0 font-mono text-secondary">· {Math.round(next.share * 100)}%</span>
    </span>
  );
}

/**
 * A rate as "per 100 visits": whole from 10 up, to one decimal under it. It counts times, not visits, so a page people
 * pass through more than once a visit can go over 100 ("302 per 100 visits"), which still makes sense said this way.
 */
export function formatPer100(rate: number): string {
  const per100 = rate * 100;
  return per100 >= 10 ? formatNumber(Math.round(per100)) : per100.toFixed(1);
}

/**
 * The conversions made on a page (All pages), never their money: the count, with the rate under it, greyed from fewer
 * than 100 visits with the reason on hover. A page with none is quiet and says nothing under it.
 */
export function ConversionsHereCell({ conversions, rate, fewVisits }: { conversions: number; rate: number | null; fewVisits: boolean }) {
  const t = useTranslations("googleAnalytics.table");
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={`font-mono text-[12px] ${conversions > 0 ? "text-foreground" : "text-muted"}`}>{formatNumber(conversions)}</span>
      {conversions > 0 && rate !== null ? (
        <span className={`text-right text-[11.5px] ${fewVisits ? "text-muted" : "text-secondary"}`} title={fewVisits ? t("fewVisits") : undefined}>
          {t.rich("per100Visits", { rate: formatPer100(rate), figure: (chunks) => <span className="font-mono">{chunks}</span> })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * How many more or fewer than the dates before, with the percentage under it (docs/plans/active/campaigns-new-page-plan-2026-11-05.md):
 * a table that shows both figures doesn't need telling the move twice on two lines of its own. New, where there was nothing before.
 */
export function UpOrDownCell({ now, before }: { now: number; before: number | null }) {
  if (before === null) return <NoFigure />;
  if (before === 0) return <Change by={now} isNew={now > 0} />;
  return (
    <span className="flex flex-col items-end leading-tight">
      <Change by={now - before} format={formatNumber} />
      {now !== before ? <span className="font-mono text-[11.5px] text-secondary">{formatPercent(Math.abs(now - before) / before)}</span> : null}
    </span>
  );
}

export function ChangeCell({ change }: { change: number | null }) {
  return <Change by={change === null ? null : Math.round(change * 1000) / 10} format={(value) => `${value.toFixed(1)}%`} />;
}

/** A conversion rate on its own (All pages, all-pages-rethink-plan.md AP4): greyed from fewer than 100 visits, with the reason on hover (GA22). */
export function RateCell({ rate, fewVisits }: { rate: number | null; fewVisits: boolean }) {
  const t = useTranslations("googleAnalytics.table");
  if (rate === null) return <NoFigure />;
  return <span className={`font-mono text-[12px] ${fewVisits ? "text-muted" : "text-secondary"}`} title={fewVisits ? t("fewVisits") : undefined}>{formatPercent(rate)}</span>;
}

/**
 * A page's views against the span before, as a count (AP4): "New" with none
 * before, "The same" within a gain or drop's few views, a dash with none
 * either way, a fall to none whatever its size, and the share it moved by on
 * hover.
 */
export function ViewsChangeCell({ views, before }: { views: number; before: number | null }) {
  const t = useTranslations("googleAnalytics.table");
  if (before === null || (views === 0 && before === 0)) return <NoFigure />;
  if (before === 0) return <Change by={null} isNew />;
  const by = views - before;
  // A page nobody viewed shows all it fell by, however few: never "The same".
  if (views > 0 && Math.abs(by) < MOVE_VIEWS) return <Change by={0} same />;
  const words = t(by > 0 ? "viewsUp" : "viewsDown", { rate: formatPercent(Math.abs(by) / before), before: formatNumber(before) });
  return <span title={words}><Change by={by} /></span>;
}

/** The conversions made on a page against the span before, as a count (AP4): a dash when none moved. */
export function ConversionsChangeCell({ conversions, before }: { conversions: number; before: number | null }) {
  return <Change by={before === null ? null : conversions - before} />;
}

/** A page's address as a link to its own screen (GA22): the path, the whole address on hover. */
export function PageLink({ address, href, title, kind }: {
  address: string;
  href: string | null;
  /** Words after the address: a channel's landing page's classification ("/ai-agency/ · Service", ga-channel-pages-plan.md CH7). */
  kind?: string;
  /**
   * The page's title (GA27, §18.2 boards 18 and 20): given, it is the row's
   * name over its address — Sites' page cell, its two lines each cut to one
   * with "…" and whole on hover, the address the link.
   */
  title?: string;
}) {
  const path = pathOf(address);
  if (title) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="block truncate text-[13px] text-foreground" title={title}>{title}</span>
        <span className="flex min-w-0 items-baseline gap-1 text-[12px]">
          {href ? (
            <Link href={href} className="truncate text-info hover:underline" title={address} onClick={(event) => event.stopPropagation()}>{path}</Link>
          ) : <span className="truncate text-secondary" title={address}>{path}</span>}
          {kind ? <span className="shrink-0 text-muted">· {kind}</span> : null}
        </span>
      </span>
    );
  }
  if (kind) {
    return (
      <span className="flex min-w-0 items-baseline gap-1">
        {href ? (
          <Link href={href} className="truncate text-[13px] text-info hover:underline" title={address} onClick={(event) => event.stopPropagation()}>{path}</Link>
        ) : <span className="truncate text-[13px] text-foreground" title={address}>{path}</span>}
        <span className="shrink-0 text-[12px] text-muted">· {kind}</span>
      </span>
    );
  }
  if (!href) return <span className="break-all text-[13px] text-foreground" title={address}>{path}</span>;
  return (
    <Link href={href} className="break-all text-[13px] text-info hover:underline" title={address} onClick={(event) => event.stopPropagation()}>
      {path}
    </Link>
  );
}
