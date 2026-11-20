"use client";

import { useTranslations } from "next-intl";
import type { CurvePoint } from "@/convex/utils/searchConsoleViews";
import { BarsCard } from "@/src/ui/components/screens/BarsCard";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { formatPer100 } from "./searchConsoleFormat";

/**
 * Click rate by position, as Anthony chose it on the canvas (20 November 2026: "lets go with way 3 on % click rate";
 * search-console-breakdowns-plan-2026-11-20.md): three boxes, one for each group of positions against the period before, and
 * the click-through rate at each position on mobile and on desktop, side by side. Shared parts only: `Figure` boxes with
 * `ChangeLine`, and `BarsCard` stood up, as Products' and Visits'.
 */

export const POSITION_GROUPS = [["top3", 1, 3], ["first", 4, 10], ["second", 11, 20]] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number][0];

/** A group of positions' clicks for every one impression: null with none shown there. */
export function groupRate(points: readonly CurvePoint[] | null | undefined, from: number, to: number): number | null {
  if (!points) return null;
  const within = points.filter((point) => point.position >= from && point.position <= to);
  const impressions = within.reduce((sum, point) => sum + point.impressions, 0);
  return impressions > 0 ? within.reduce((sum, point) => sum + point.clicks, 0) / impressions : null;
}

export function CurveBoxes({ points, before, against }: { points: readonly CurvePoint[] | undefined; before: readonly CurvePoint[] | null; against: string }) {
  const t = useTranslations("searchConsole.ctrCurve.boxes");
  const tp = useTranslations("searchConsole.places.boxes");
  if (!points) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  return (
    <FigureRow columns={3}>
      {POSITION_GROUPS.map(([key, from, to]) => {
        const now = groupRate(points, from, to);
        const then = groupRate(before, from, to);
        // Compared as the box writes them, two decimals, so the line never says a move the figures don't show.
        const by = now !== null && then !== null ? Math.round((now - then) * 10_000) / 100 : null;
        return (
          <Figure
            key={key}
            label={t(key)}
            value={formatPer100(now)}
            detail={(
              <>
                <span className="block text-secondary">{t("per100")}</span>
                {by === null ? (
                  <ChangeLine by={null}>{tp("nothingBefore", { before: against })}</ChangeLine>
                ) : by === 0 ? (
                  <ChangeLine by={0}>{tp("same", { before: against })}</ChangeLine>
                ) : (
                  <ChangeLine by={by}>{tp(by > 0 ? "more" : "fewer", { change: formatPer100(Math.abs(by) / 100), before: against })}</ChangeLine>
                )}
              </>
            )}
          />
        );
      })}
    </FigureRow>
  );
}

const SHOWS = ["first", "second"] as const;
type Show = (typeof SHOWS)[number];

/**
 * The click-through rate at each position on mobile and on desktop: a pair of bars a position, 1 at the top of Google.
 * Show: Positions 1 to 10, or 11 to 20. `devices` undefined while on its way; `problem` when Google didn't answer.
 */
export function CurveDevicesCard({ devices, problem, host, exportName }: {
  /** `cut`: the most pairs of a keyword and a page Google gives, when it gave as many for a device: said once in the hint. */
  devices: { mobile: readonly CurvePoint[]; desktop: readonly CurvePoint[]; cut?: number | null } | null | undefined;
  problem: boolean;
  host: string;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.ctrCurve.chart");
  const td = useTranslations("searchConsole.places.deviceNames");
  const tt = useTranslations("searchConsole.table");
  const [show, setShow] = useSiteParam<Show>("show", "first", SHOWS);
  const [from, to] = show === "first" ? [1, 10] : [11, 20];
  const at = (points: readonly CurvePoint[] | undefined, position: number) => points?.find((point) => point.position === position);
  const rows = Array.from({ length: to - from + 1 }, (_, index) => from + index).map((position) => {
    const mobile = at(devices?.mobile, position);
    const desktop = at(devices?.desktop, position);
    return {
      label: String(position),
      mobile: mobile && mobile.impressions > 0 ? Math.round(mobile.ctr * 10_000) / 100 : 0,
      desktop: desktop && desktop.impressions > 0 ? Math.round(desktop.ctr * 10_000) / 100 : 0,
    };
  });
  const anything = rows.some((row) => row.mobile > 0 || row.desktop > 0);
  return (
    <BarsCard
      title={t("title")}
      hint={devices?.cut ? `${t("hint")} ${tt("pairsCut", { most: formatNumber(devices.cut) })}` : t("hint")}
      exportName={exportName}
      csvHeading={t("position")}
      csv={() => toCsv([t("position"), `${td("MOBILE")} (%)`, `${td("DESKTOP")} (%)`], (devices?.mobile ?? []).map((point) => [point.position, Math.round(point.ctr * 10_000) / 100, Math.round((at(devices?.desktop, point.position)?.ctr ?? 0) * 10_000) / 100]))}
      host={host}
      waiting={problem ? t("failed") : devices === undefined ? undefined : null}
      controls={[{ kind: "select", key: "show", label: t("show"), value: show, options: SHOWS.map((value) => ({ value, label: t(value) })), onChange: (next) => setShow(next as Show) }]}
      rows={rows}
      series={[{ key: "mobile", name: td("MOBILE"), colour: CHART_SERIES_ORANGE }, { key: "desktop", name: td("DESKTOP"), colour: CHART_SERIES_BLUE }]}
      figure={t("figure")}
      upright
      labels={(value) => (value > 0 ? formatPer100(value / 100) : null)}
      anything={anything}
      empty={t("empty")}
    />
  );
}
