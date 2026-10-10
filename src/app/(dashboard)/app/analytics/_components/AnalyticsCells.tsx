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

export function ConversionsCell({ conversions, rate, fewVisits }: { conversions: number; rate: number | null; fewVisits: boolean }) {
  const t = useTranslations("googleAnalytics.table");
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

export function ChangeCell({ change }: { change: number | null }) {
  return <Change by={change === null ? null : Math.round(change * 1000) / 10} format={(value) => `${value.toFixed(1)}%`} />;
}

/** A page's address as a link to its own screen (GA22): the path, the whole address on hover. */
export function PageLink({ address, href }: { address: string; href: string | null }) {
  const path = pathOf(address);
  if (!href) return <span className="break-all text-[13px] text-foreground" title={address}>{path}</span>;
  return (
    <Link href={href} className="break-all text-[13px] text-info hover:underline" title={address} onClick={(event) => event.stopPropagation()}>
      {path}
    </Link>
  );
}
