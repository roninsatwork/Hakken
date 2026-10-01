"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import {
  DefaultLegendContent,
  DefaultZIndexes,
  ZIndexLayer,
  useChartWidth,
  usePlotArea,
  useXAxisScale,
  type DefaultLegendContentProps,
  type LegendPayload,
} from "recharts";
import { api } from "@/convex/_generated/api";
import { LAYER } from "@/src/ui/lib/layers";
import { GoogleMark } from "./GoogleMark";
import { chartDates } from "./datedRows";
import { formatDay } from "./siteFormat";

/**
 * Google's updates on every Sites chart that runs over dates (docs/plans/
 * active/knowledge-news-and-digest-plan.md, "Google updates on the Sites
 * charts", approved 2026-09-30): a dashed line on the day each started, the
 * Google "G" on the x-axis line at its foot, and the update's title, dates and
 * description on hover. The one part that draws them — the dated chart parts
 * each read the updates with `useGoogleUpdates` and draw this, so a new page
 * on a dated chart gets them without doing anything.
 */

export type GoogleUpdate = FunctionReturnType<typeof api.googleUpdates.listGoogleUpdatesBetween>[number];

/**
 * The approved look, in numbers. It is binding: change the plan's table first,
 * with a date, then these — the look test holds every one.
 */
export const GOOGLE_UPDATE_LOOK = {
  line: { width: 1, dash: "4 4", opacity: 0.55 },
  /** The "G" on its circle, the circle's centre on the x-axis line. */
  logo: 14,
  circle: 22,
  circleEdgeOpacity: 0.2,
  /** Logos closer than this push the later one right; lines stay at their dates. */
  apart: 24,
  card: { width: 300, radius: 12, paddingX: 14, paddingY: 12, gap: 8 },
  cardLogo: 16,
  keyLogo: 12,
  /** The axis's dates stand this far below the line when markers are on it, clear of the circles. */
  tickMargin: 14,
  axisHeight: 42,
} as const;

/** Above the chart's areas, lines and bars, its axes and the hover's dots. */
const MARKER_LAYER = DefaultZIndexes.activeDot + 100;

const time = (day: string) => Date.parse(`${day}T00:00:00Z`);

export type MarkerAnchor = { day: string; x: number };

/**
 * Where a day falls along the axis: between the two plotted points either
 * side of it, at its true place in time — 13 March on a monthly chart about
 * two-fifths of the way from March to April, never on a point. A day inside
 * the last point's week or month goes on from it at the same pace, never past
 * the plot's right edge. Null before the first point.
 */
export function dayX(day: string, anchors: readonly MarkerAnchor[], right: number): number | null {
  if (anchors.length === 0) return null;
  const at = time(day);
  if (at < time(anchors[0].day)) return null;
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const from = anchors[index];
    const to = anchors[index + 1];
    if (at < time(to.day)) return from.x + ((to.x - from.x) * (at - time(from.day))) / (time(to.day) - time(from.day));
  }
  const last = anchors[anchors.length - 1];
  if (anchors.length === 1) return last.x;
  const before = anchors[anchors.length - 2];
  const along = (at - time(last.day)) / (time(last.day) - time(before.day));
  return Math.min(right, last.x + (last.x - before.x) * along);
}

/**
 * Each update's line at its start date and its logo at the line's foot —
 * the later of two logos closer than 24px moved right to 24px from the
 * earlier, so they never overlap, and drawn back in from the right edge when
 * that pushes them past it.
 */
export function placeMarkers<Update extends { startedOn: string }>(
  updates: readonly Update[],
  anchors: readonly MarkerAnchor[],
  bounds: { left: number; right: number },
): Array<{ update: Update; lineX: number; logoX: number }> {
  const { apart } = GOOGLE_UPDATE_LOOK;
  const placed = updates
    .flatMap((update) => {
      const x = dayX(update.startedOn, anchors, bounds.right);
      return x === null ? [] : [{ update, lineX: x, logoX: x }];
    })
    .sort((one, other) => one.lineX - other.lineX);
  for (let index = 1; index < placed.length; index += 1) {
    placed[index].logoX = Math.max(placed[index].logoX, placed[index - 1].logoX + apart);
  }
  const last = placed.length - 1;
  if (last >= 0 && placed[last].logoX > bounds.right) {
    placed[last].logoX = bounds.right;
    for (let index = last - 1; index >= 0; index -= 1) {
      placed[index].logoX = Math.min(placed[index].logoX, placed[index + 1].logoX - apart);
    }
  }
  return placed;
}

type OpenMarker = { update: GoogleUpdate; x: number; y: number; width: number };

/**
 * The Google updates inside a chart's dates, read once by the chart part that
 * draws it, and what that chart needs to show them: the x-axis on each row's
 * `day` (named on screen by its label), room under the axis for the logos,
 * the key, and which marker's card is open. A chart of named things, or one
 * whose rows are not dated, reads nothing and changes nothing.
 */
export function useGoogleUpdates(rows: ReadonlyArray<Record<string, unknown>>, { dated = true }: { dated?: boolean } = {}) {
  const t = useTranslations("sites.googleUpdates");
  const language = useLocale();
  const dates = dated ? chartDates(rows) : null;
  const found = useQuery(api.googleUpdates.listGoogleUpdatesBetween, dates ? { from: dates.from, to: dates.to, language } : "skip");
  const updates = dates ? found ?? [] : [];
  const [open, setOpen] = useState<OpenMarker | null>(null);
  const labels = new Map(rows.map((row) => [String(row.day), String(row.label ?? row.day)]));
  const labelOf = (day: unknown) => labels.get(String(day)) ?? String(day ?? "");
  const shown = updates.length > 0;
  return {
    dates,
    updates,
    shown,
    open: open && updates.some((update) => update._id === open.update._id) ? open : null,
    setOpen,
    keyLabel: t("legend"),
    markerLabel: (update: GoogleUpdate) => t("open", { title: update.title }),
    /**
     * The x-axis's own props: on a dated chart it runs over each row's `day`
     * — one place per row, where two months' "1 Mar" would share one — and
     * names it by the row's label.
     */
    axis: (xKey: string) => (dates
      ? {
        dataKey: "day",
        tickFormatter: labelOf,
        ...(shown ? { tickMargin: GOOGLE_UPDATE_LOOK.tickMargin, height: GOOGLE_UPDATE_LOOK.axisHeight } : {}),
      }
      : { dataKey: xKey }),
    /** The hover readout's heading: the row's label rather than its day. */
    readoutTitle: dates ? (label: string) => labelOf(label) : undefined,
  };
}

export type GoogleUpdates = ReturnType<typeof useGoogleUpdates>;

/**
 * The lines and logos, drawn inside a chart from its own scale. A chart part
 * places this among its chart's children.
 */
export function GoogleUpdateMarkers({ google }: { google: GoogleUpdates }) {
  const xScale = useXAxisScale();
  const area = usePlotArea();
  const width = useChartWidth();
  if (!google.dates || !google.shown || !xScale || !area || !width) return null;
  const anchors = google.dates.days.flatMap((day) => {
    const x = xScale(day, { position: "middle" });
    return x === undefined ? [] : [{ day, x }];
  });
  const marks = placeMarkers(google.updates, anchors, { left: area.x, right: area.x + area.width });
  return (
    <ZIndexLayer zIndex={MARKER_LAYER}>
      <GoogleUpdateMarks
        marks={marks}
        top={area.y}
        axis={area.y + area.height}
        openId={google.open?.update._id ?? null}
        label={google.markerLabel}
        onOpen={(mark) => google.setOpen({ update: mark.update, x: mark.logoX, y: area.y + area.height, width })}
        onClose={() => google.setOpen(null)}
      />
    </ZIndexLayer>
  );
}

type Mark = { update: GoogleUpdate; lineX: number; logoX: number };

/**
 * The marks themselves, given where they go: each line from the plot's top to
 * the x-axis line, then each logo on its circle, centred on that line. The
 * card opens on hover, on focus and on a tap, and closes when the pointer or
 * focus leaves, or on Escape.
 */
export function GoogleUpdateMarks({ marks, top, axis, openId, label, onOpen, onClose }: {
  marks: Mark[];
  top: number;
  axis: number;
  openId: string | null;
  label: (update: GoogleUpdate) => string;
  onOpen: (mark: Mark) => void;
  onClose: () => void;
}) {
  const { line, logo, circle, circleEdgeOpacity } = GOOGLE_UPDATE_LOOK;
  const byMouse = (event: { pointerType: string }) => event.pointerType === "mouse";
  return (
    <g className="google-update-markers">
      <g className="text-foreground" pointerEvents="none">
        {marks.map((mark) => (
          <line
            key={mark.update._id}
            data-google-update-line=""
            x1={mark.lineX}
            x2={mark.lineX}
            y1={top}
            y2={axis}
            stroke="currentColor"
            strokeWidth={line.width}
            strokeDasharray={line.dash}
            strokeOpacity={line.opacity}
          />
        ))}
      </g>
      {marks.map((mark) => (
        <g
          key={mark.update._id}
          role="button"
          tabIndex={0}
          aria-label={label(mark.update)}
          aria-expanded={openId === mark.update._id}
          className="cursor-pointer outline-none"
          onPointerEnter={(event) => (byMouse(event) ? onOpen(mark) : undefined)}
          onPointerLeave={(event) => (byMouse(event) ? onClose() : undefined)}
          onFocus={() => onOpen(mark)}
          onBlur={onClose}
          onClick={() => onOpen(mark)}
          onKeyDown={(event) => (event.key === "Escape" ? onClose() : undefined)}
        >
          <circle
            data-google-update-logo=""
            cx={mark.logoX}
            cy={axis}
            r={circle / 2}
            fill="var(--color-card)"
            stroke="currentColor"
            strokeWidth={1}
            strokeOpacity={circleEdgeOpacity}
            className="text-foreground"
          />
          <GoogleMark size={logo} x={mark.logoX - logo / 2} y={axis - logo / 2} />
        </g>
      ))}
    </g>
  );
}

/**
 * The open marker's card: the "G" and the title, when it started and
 * finished (or that it is still rolling out), and the description entered in
 * Admin — nothing else. Above the logo, kept inside the chart's edges.
 */
export function GoogleUpdateCard({ update, x, y, width: chartWidth }: OpenMarker) {
  const t = useTranslations("sites.googleUpdates");
  const { card, circle, cardLogo } = GOOGLE_UPDATE_LOOK;
  const width = Math.min(card.width, chartWidth);
  const left = Math.max(0, Math.min(x - width / 2, chartWidth - width));
  const dates = [
    t("started", { date: formatDay(update.startedOn) }),
    update.finishedOn ? t("finished", { date: formatDay(update.finishedOn) }) : t("rollingOut"),
  ].join(" · ");
  return (
    <div
      role="tooltip"
      data-google-update-card=""
      className={`pointer-events-none absolute ${LAYER.RAISED} -translate-y-full rounded-[12px] border border-border-dim bg-card shadow-lg`}
      style={{ left, top: y - circle / 2 - card.gap, width, padding: `${card.paddingY}px ${card.paddingX}px` }}
    >
      <div className="flex items-center gap-2">
        <GoogleMark size={cardLogo} />
        <span className="text-[13px] font-medium text-foreground">{update.title}</span>
      </div>
      <p className="mt-1 text-[12px] text-secondary">{dates}</p>
      <p className="mt-2 text-[12px] text-foreground">{update.description}</p>
    </div>
  );
}

/**
 * Where a dated chart sits: its drawing, and over it the open marker's card.
 * Each dated chart part wraps its chart in this.
 */
export function GoogleUpdateFrame({ google, children }: { google: GoogleUpdates; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      {google.open ? <GoogleUpdateCard {...google.open} /> : null}
    </div>
  );
}

/** The key's "G": 12px, inside the legend's own 14px swatch drawn on a 32-unit grid. */
function KeyMark() {
  const { keyLogo } = GOOGLE_UPDATE_LOOK;
  const size = (32 * keyLogo) / 14;
  return <GoogleMark size={size} x={(32 - size) / 2} y={(32 - size) / 2} />;
}

/** The key's entry, after the chart's own series. */
export function googleKeyEntry(label: string): LegendPayload {
  return { value: label, color: "var(--color-secondary)", dataKey: "google-update", legendIcon: <KeyMark /> as unknown as LegendPayload["legendIcon"] };
}

function GoogleUpdateLegend({ keyLabel, seriesShown, ...props }: DefaultLegendContentProps & { keyLabel: string; seriesShown: boolean }) {
  return <DefaultLegendContent {...props} payload={[...(seriesShown ? props.payload ?? [] : []), googleKeyEntry(keyLabel)]} />;
}

/**
 * The chart's legend with "Google update" at its end when a marker is on the
 * chart; without the chart's own series when it shows no legend of its own.
 */
export function googleLegend(google: GoogleUpdates, { seriesShown = true }: { seriesShown?: boolean } = {}) {
  return google.shown ? <GoogleUpdateLegend keyLabel={google.keyLabel} seriesShown={seriesShown} /> : undefined;
}

/** The key's entry drawn as the gains chart draws its own key, outside the chart. */
export function GoogleUpdateKey({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <GoogleMark size={GOOGLE_UPDATE_LOOK.keyLogo} />
      {label}
    </span>
  );
}
