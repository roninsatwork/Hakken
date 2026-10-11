"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Change } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatMoney, formatPercent, pathOf } from "./analyticsFormat";

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

export function MoneyCell({ value, currency }: { value: number | null; currency: string | null }) {
  if (!value) return <NoFigure />;
  return <span className="font-mono text-[12px] text-secondary">{formatMoney(value, currency)}</span>;
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

/** The conversions made on a page, with their value beside them ("4 · £80"; All pages, §15): a page with none is quiet. */
export function ConversionsHereCell({ conversions, value, currency }: { conversions: number; value: number; currency: string | null }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={`font-mono text-[12px] ${conversions > 0 ? "text-foreground" : "text-muted"}`}>{formatNumber(conversions)}</span>
      {value > 0 ? <span className="font-mono text-[12px] text-secondary">· {formatMoney(value, currency)}</span> : null}
    </span>
  );
}

export function ChangeCell({ change }: { change: number | null }) {
  return <Change by={change === null ? null : Math.round(change * 1000) / 10} format={(value) => `${value.toFixed(1)}%`} />;
}

/** A page's address as a link to its own screen (GA22): the path, the whole address on hover. */
export function PageLink({ address, href, title }: {
  address: string;
  href: string | null;
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
        {href ? (
          <Link href={href} className="block truncate text-[12px] text-info hover:underline" title={address} onClick={(event) => event.stopPropagation()}>{path}</Link>
        ) : <span className="block truncate text-[12px] text-secondary" title={address}>{path}</span>}
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
