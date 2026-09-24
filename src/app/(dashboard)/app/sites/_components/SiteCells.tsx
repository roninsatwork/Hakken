"use client";

import { useTranslations } from "next-intl";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { formatDay, movement, movementClass } from "./siteFormat";

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

export function IntentPill({ intent }: { intent: string | null }) {
  const t = useTranslations("sites.common.intents");
  const key = intent ?? "UNJUDGED";
  return <StatusPill tone={INTENT_TONES[key] ?? "neutral"}>{t(key in INTENT_TONES ? key : "OTHER")}</StatusPill>;
}

/** A position, or "not on page one" when there is none. */
export function PositionCell({ position }: { position: number | null }) {
  const t = useTranslations("sites.common");
  if (position === null) return <span className="text-[12px] text-muted">{t("notOnPageOne")}</span>;
  return <span className="font-mono text-[13px] text-foreground">{position}</span>;
}

/** Places moved, with an arrow that carries the meaning without the colour. */
export function ChangeCell({ change }: { change: number }) {
  const moved = movement(change);
  return <span className={`font-mono text-[12px] ${movementClass(moved.tone)}`}>{moved.text}</span>;
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

/**
 * A search's last year of monthly searches as a small line, drawn in the
 * theme's ink. Plain SVG rather than a chart per row: a table of fifteen
 * charts would load the chart library fifteen times over for a squiggle.
 */
export function TrendCell({ trend, label }: { trend: number[]; label: string }) {
  if (trend.length < 2) return <span className="text-muted">–</span>;
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
  if (features.length === 0) return <span className="text-muted">–</span>;
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

/** What kind of page a page is, or "not sorted yet". */
export function PageTypePill({ type }: { type: string }) {
  const t = useTranslations("sites.common.pageTypes");
  return <StatusPill tone={PAGE_TYPE_TONES[type] ?? "neutral"}>{t.has(type) ? t(type) : t("OTHER")}</StatusPill>;
}

const LINK_STATUS_TONES: Record<string, StatusTone> = { LIVE: "neutral", NEW: "info", LOST: "warning" };

/** Whether a link, linking website, anchor or server is live, new or lost — in words, not colour alone. */
export function LinkStatusPill({ status }: { status: "LIVE" | "NEW" | "LOST" }) {
  const t = useTranslations("sites.linkLists.statuses");
  return <StatusPill tone={LINK_STATUS_TONES[status] ?? "neutral"}>{t(status)}</StatusPill>;
}

/** A page on another website, as a link a person can follow, never one a search engine should. */
export function ExternalUrlCell({ url, label }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[12px] text-info hover:underline">
      {label ?? url}
    </a>
  );
}
