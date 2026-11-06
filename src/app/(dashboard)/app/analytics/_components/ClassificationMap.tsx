"use client";

import { useTranslations } from "next-intl";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { SiteTreemap } from "../../sites/_components/SiteTreemap";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";

/** A page group too small to label in the treemap: under this share of views, named in a line under it. */
const SMALL_SHARE = 0.02;

export type ClassificationBox = { kind: string; label: string; views: number; pages: number };

/**
 * A website's page views by Classification (Anthony, 2026-11-03: "this is pages visited by type no where they start"): the kit's
 * treemap, each box a page group sized by its views, Not sorted among them, and the groups too small to label named in a line under
 * it. Visits' map, for the dates chosen, and Live's, for the last 30 minutes. It's given what to show and reads nothing.
 */
export function ClassificationMap({ boxes, title, hint, exportName, host, loading = false, message = null, colour, height }: {
  boxes: readonly ClassificationBox[];
  title: string;
  hint: string;
  exportName: string;
  host: string;
  loading?: boolean;
  message?: string | null;
  colour?: string;
  height?: number;
}) {
  const t = useTranslations("googleAnalytics.visitors.kinds");
  const placed = boxes.reduce((sum, kind) => sum + kind.views, 0);
  const most = Math.max(1, ...boxes.map((kind) => kind.views));
  const share = (views: number) => `${Math.round((views / Math.max(1, placed)) * 100)}%`;
  const small = boxes.filter((kind) => kind.views / Math.max(1, placed) < SMALL_SHARE);
  return (
    <MapCard
      title={title}
      hint={hint}
      exportName={exportName}
      csv={() => toCsv(["kind", "views", "pages"], boxes.map((kind) => [kind.label, kind.views, kind.pages]))}
      host={host}
      loading={loading}
      message={message}
      under={small.length > 0 ? <p className="text-[12px] text-secondary">{t("also", { list: small.map((kind) => t("alsoOne", { name: kind.label, count: kind.views, views: formatNumber(kind.views) })).join(" · ") })}</p> : null}
    >
      <SiteTreemap
        {...(height !== undefined ? { height } : {})}
        items={boxes.map((kind) => ({
          id: kind.kind,
          name: kind.label,
          value: kind.views,
          shade: kind.views / most,
          ...(colour ? { colour } : {}),
          caption: t("caption", { count: kind.views, views: formatNumber(kind.views), share: share(kind.views) }),
          readout: [{ value: formatNumber(kind.views), label: t("views", { count: kind.views }) }, { value: share(kind.views), label: t("ofViews") }, { value: formatNumber(kind.pages), label: t("pages", { count: kind.pages }) }],
        }))}
      />
    </MapCard>
  );
}
