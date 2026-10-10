"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { kindTone, type PageKindsView } from "../../_components/usePageKinds";
import { formatDay } from "./siteFormat";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

/**
 * The cells the Sites tables share, so a keyword's intent, a position and a
 * move read the same on every page.
 */

const INTENT_TONES: Record<string, StatusTone> = {
  BUYING: "success",
  RESEARCHING: "info",
  BRANDED: "neutral",
  IRRELEVANT: "neutral",
  OTHER: "neutral",
  UNJUDGED: "neutral",
};

export function IntentLabel({ intent, size }: { intent: string | null; size?: "sm" | "md" }) {
  const t = useTranslations("sites.common.intents");
  const key = intent ?? "UNJUDGED";
  return <StatusLabel tone={INTENT_TONES[key] ?? "neutral"} size={size}>{t(key in INTENT_TONES ? key : "OTHER")}</StatusLabel>;
}

/**
 * What the searcher wants as plain words, for a row's second line where a
 * label's icon would crowd it: a kind, so the kit's `TagLabel` (2026-10-03
 * clean-up), not words coloured by hand.
 */
export function IntentText({ intent }: { intent: string | null }) {
  const t = useTranslations("sites.common.intents");
  const key = intent ?? "UNJUDGED";
  return <TagLabel>{t(key in INTENT_TONES ? key : "OTHER")}</TagLabel>;
}

/** A position, or "not on page one" when there is none. */
export function PositionCell({ position }: { position: number | null }) {
  const t = useTranslations("sites.common");
  if (position === null) return <span className="whitespace-nowrap text-[12px] text-muted">{t("notOnPageOne")}</span>;
  return <span className="font-mono text-[13px] text-foreground">{position}</span>;
}

/** The day a row was last checked, in its own column on every table (D12). */
export function CheckedCell({ day }: { day: string | null }) {
  return <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(day)}</span>;
}

/** A page path, readable and not a link: the page is the site's own. */
export function PageCell({ page, was }: { page: string; was?: string | null }) {
  const t = useTranslations("sites.keywords");
  return (
    <span className="flex flex-col">
      <span className="break-all text-[12px] text-info">{page || "/"}</span>
      {was && was !== page ? <span className="break-all text-[11px] text-muted line-through">{t("wasPage", { page: was })}</span> : null}
    </span>
  );
}

/** A ranking page as a link to its own screen, with the page it ranked with before when that changed. */
export function PageLinkCell({ href, page, was }: { href: string; page: string; was?: string | null }) {
  const t = useTranslations("sites.keywords");
  const before = was && was !== page ? t("wasPage", { page: was }) : null;
  return (
    // Cut short on one line each, the whole address on hover (`CUT_COLUMN`).
    <span className="flex min-w-0 flex-col">
      <RecordLinkCell href={href} cut className="text-[12px] text-info">{page || "/"}</RecordLinkCell>
      {before ? <span title={before} className="truncate text-[11px] text-muted line-through">{before}</span> : null}
    </span>
  );
}

/**
 * A search's last year of monthly searches as a small line, drawn in the
 * theme's ink. Plain SVG rather than a chart per row: a table of fifteen
 * charts would load the chart library fifteen times over for a squiggle.
 */
export function TrendCell({ trend, label }: { trend: number[]; label: string }) {
  if (trend.length < 2) return <NoFigure />;
  const width = 64;
  const height = 18;
  const top = Math.max(...trend);
  const bottom = Math.min(...trend);
  const spread = top - bottom || 1;
  const points = trend
    .map((value, index) => `${(index / (trend.length - 1)) * width},${height - ((value - bottom) / spread) * (height - 2) - 1}`)
    .join(" ");
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-info">
      <title>{label}</title>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A results-page feature's name: ours where we have one, else DataForSEO's own, made readable. */
export function useFeatureLabel(): (feature: string) => string {
  const t = useTranslations("sites.common.features");
  return (feature) => (t.has(feature) ? t(feature) : feature.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()));
}

/** The features on a search's results page: how many, and which, on hover and for a screen reader. */
export function FeaturesCell({ features }: { features: string[] }) {
  const t = useTranslations("sites.keywords");
  const label = useFeatureLabel();
  if (features.length === 0) return <NoFigure />;
  const names = features.map(label).join(", ");
  return (
    <span className="text-[12px] text-secondary" title={names}>
      {t("featuresCount", { count: features.length })}
      <span className="sr-only">: {names}</span>
    </span>
  );
}

const PAGE_TYPE_TONES: Record<string, StatusTone> = {
  HOME: "info",
  SERVICE: "success",
  PRODUCT: "success",
  CATEGORY: "neutral",
  ARTICLE: "info",
  CASE_STUDY: "info",
  LOCATION: "success",
};

/**
 * What kind of page a page is, or "not sorted yet". Extended for a company's
 * own classifications (page-groups-plan.md, decision 2): given the website's
 * `kinds`, a classification reads as its own name, toned by its type, and a
 * page none catches as Not sorted.
 */
export function PageTypeLabel({ type, size, kinds }: { type: string; size?: "sm" | "md"; kinds?: PageKindsView }) {
  const t = useTranslations("sites.common.pageTypes");
  if (kinds?.isOwn(type)) return <StatusLabel tone={kindTone(kinds.typeOf(type))} size={size}>{kinds.label(type)}</StatusLabel>;
  return <StatusLabel tone={PAGE_TYPE_TONES[type] ?? "neutral"} size={size}>{t.has(type) ? t(type) : t("OTHER")}</StatusLabel>;
}

/**
 * What kind of page a page is, as plain words — a kind, so the kit's
 * `TagLabel`, as `IntentText` is for intent. For a page on someone else's
 * website, where the kind is read from its address alone: Keyword research's
 * Google results, drawn as grey words (keyword-research-plan.md, boards 2 and
 * 3). A page the address says nothing about is Other.
 */
export function PageTypeText({ type }: { type: string | null }) {
  const t = useTranslations("sites.common.pageTypes");
  return <TagLabel>{type && t.has(type) ? t(type) : t("OTHER")}</TagLabel>;
}

const LINK_STATUS_TONES: Record<string, StatusTone> = { LIVE: "neutral", NEW: "info", LOST: "warning" };

/** Whether a link, linking website, anchor or server is live, new or lost — in words, not colour alone. */
export function LinkStatusLabel({ status, size }: { status: "LIVE" | "NEW" | "LOST"; size?: "sm" | "md" }) {
  const t = useTranslations("sites.linkLists.statuses");
  return <StatusLabel tone={LINK_STATUS_TONES[status] ?? "neutral"} size={size}>{t(status)}</StatusLabel>;
}

/** A page on another website, as a link a person can follow, never one a search engine should. */
export function ExternalUrlCell({ url, label, cut = false }: { url: string; label?: string; cut?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={cut ? url : undefined}
      // A page elsewhere opens in its own tab; the row it sits in stays where it is.
      onClick={(event) => event.stopPropagation()}
      className={`${cut ? "block truncate" : "break-all"} text-[12px] text-info hover:underline`}
    >
      {label ?? url}
    </a>
  );
}

/**
 * The name of a row that opens its own screen, as a real link: it can be
 * opened in a new tab, reached with the keyboard, and read out as a link. A
 * click anywhere else on the row opens the same screen through the table's
 * `onRowClick`; this one stops there so the screen is not opened twice.
 */
export function RecordLinkCell({ href, children, className = "text-[13px] text-foreground", cut = false }: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Cut short with "…" on one line, the whole of it on hover — in a `CUT_COLUMN`. */
  cut?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      title={cut && typeof children === "string" ? children : undefined}
      className={`${cut ? "block truncate " : ""}${className} hover:underline`}
    >
      {children}
    </Link>
  );
}

/**
 * The columns of a Sites table whose words are cut short with "…" rather than
 * wrapped onto a second line — keywords, searches, questions and page
 * addresses — the whole of each on hover (Anthony, 2026-09-26). `max-w-0` lets
 * the column give way to the figures beside it however long its words are;
 * the width is the share of the table it keeps. Pair with `cut` on the cell.
 * No column takes all the width: the figures and labels beside it were
 * squeezed until they wrapped a word to a line (docs/plans/active/
 * sites-audit-fixes-plan.md, 1.5).
 */
export const CUT_COLUMN = {
  /** A table's column of words: a keyword or search, alone or beside a page address or other text. */
  first: "w-[36%] max-w-0",
  /** The second of two: the page address. */
  second: "w-[28%] max-w-0",
} as const;
