"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChartTooltipRow, ChartTooltipSurface } from "@/src/ui/components/charts/ChartTooltip";
import { MouseReadout } from "@/src/ui/components/charts/MouseReadout";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";

/**
 * How visits moved through a website (docs/plans/active/funnel-way-1-plan-2026-11-05.md, step 3; first drawn in
 * landing-pages-flow-plan.md LF2): columns left to right, each page or group a box as tall as its visits, grey bands as
 * thick as the visits that went from one to the next, a red tail down a box's right edge for the visits that left there,
 * and an orange dot for conversions, on a route or inside a first-column box. Bigger for more.
 *
 * Roll over a box: an outline on it, its routes lit, the rest stepping back, and its figures beside the mouse, as on the
 * map of pages (Anthony, 2026-11-04: "remember the rollover states and hover states"; 2026-11-05: "we need better hover and
 * roll over states on the funnel too"). A route or a dot lights itself and the two boxes it joins. Click a box to keep it
 * followed, and again to let go. It opens with none followed. Every box is a button for the keyboard too, and a screen reader
 * is given the routes as a list.
 *
 * `compact` is one line a box, its name on the left and its figure on the right. `followOn` carries a followed box's routes
 * on through the later columns. `scale` and `mostHeight` set the size: a chart that changes with what's ticked keeps one scale.
 *
 * The owner is red/green colour blind: a tail is told by its place and the words beside it, a followed route by its outline
 * and the fading of the rest.
 *
 * Its last column may hold how visits ended instead of pages (ga-conversions-visitors-plan.md CV3, Conversions' flow): each
 * box's `ending` gives its edge, and the key a line for key events not counted. A grey edge also marks a group of pages.
 */

/** What a box or a route says on hover: the kit's panel. Left out, its `hover` words are said. */
export type FlowReadout = {
  heading: string;
  /** Under the heading, quieter: a page's address. */
  detail?: string | null;
  lines: ReadonlyArray<{ value: ReactNode; label: ReactNode; colour?: string }>;
};

export type PageFlowNode = {
  id: string;
  column: number;
  /** What the box says: a page's path, or the column's "(n more pages)". */
  label: string;
  visits: number;
  /** Visits that left the website there. */
  left: number;
  /** Conversions made on the page in this column: on a landing page itself, or after the route into it. */
  conversions: number;
  /** The hover's words, whole, for a screen reader, and the hover itself without a `readout`. */
  hover: string;
  readout?: FlowReadout;
  /**
   * How a visit ended, for a last column of endings rather than pages (ga-conversions-visitors-plan.md CV3): a counted
   * conversion (orange edge, its dot inside), a key event not counted or a group of pages (grey edge), a counted kind that
   * never happened (faded), or left without converting (red edge). Left out for a page.
   */
  ending?: "counted" | "uncounted" | "never" | "left";
};

export type PageFlowBand = {
  from: string;
  to: string;
  visits: number;
  conversions: number;
  /** The first-column boxes whose visits took this route: following one lights its routes further on. */
  landings: readonly string[];
  hover: string;
  readout?: FlowReadout;
};

const W = 860;
/** The most a box is drawn for each visit, on a small website. */
const MOST_SCALE = 0.45;
const dotRadius = (conversions: number) => 3.5 + Math.min(conversions, 3) * 1.3;

/** Where the columns stand. Three columns keep the place they were approved in. */
function layoutOf(columns: number, compact: boolean) {
  if (compact) {
    const nodeW = 138;
    return { nodeW, x: Array.from({ length: columns }, (_, at) => (at * (W - nodeW)) / Math.max(1, columns - 1)), minH: 22, gap: 6, mostH: 240 };
  }
  if (columns === 3) return { nodeW: 146, x: [0, 352, 702], minH: 30, gap: 14, mostH: 420 };
  const nodeW = 118;
  return { nodeW, x: Array.from({ length: columns }, (_, at) => (at * (W - nodeW - 6)) / Math.max(1, columns - 1)), minH: 30, gap: 14, mostH: 420 };
}

const bandKey = (band: Pick<PageFlowBand, "from" | "to">) => `${band.from}>${band.to}`;

/** What a box lights: its own routes, a first-column box's further on, and with `followOn` every route they lead to. */
function lightsOf(id: string, column: number | undefined, bands: readonly PageFlowBand[], followOn: boolean): { bands: Set<string>; boxes: Set<string> } {
  const lit = new Set<string>();
  const boxes = new Set<string>([id]);
  for (const band of bands) {
    if (band.from === id || band.to === id || (column === 0 && band.landings.includes(id))) {
      lit.add(bandKey(band));
      boxes.add(band.from);
      boxes.add(band.to);
    }
  }
  if (followOn) {
    const queue = bands.filter((band) => band.from === id).map((band) => band.to);
    const seen = new Set(queue);
    while (queue.length > 0) {
      const at = queue.pop();
      for (const band of bands) {
        if (band.from !== at) continue;
        lit.add(bandKey(band));
        boxes.add(band.to);
        if (!seen.has(band.to)) { seen.add(band.to); queue.push(band.to); }
      }
    }
  }
  return { bands: lit, boxes };
}

export function PageFlowChart({ columns, nodes, bands, legend, figuresOf, compact = false, followOn = false, scale: fixedScale, mostHeight }: {
  /** Each column's name and the line under it. */
  columns: ReadonlyArray<{ title: string; summary: ReactNode }>;
  nodes: readonly PageFlowNode[];
  bands: readonly PageFlowBand[];
  /** `uncounted`: the grey edge's words. `conversions` left out: a chart with no conversions has no dot in its key. */
  legend: { conversions?: string; left: string; uncounted?: string };
  /** A box's figures: its visits, and its conversions when it made any. */
  figuresOf: (node: PageFlowNode) => string;
  compact?: boolean;
  followOn?: boolean;
  scale?: number;
  mostHeight?: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [overBox, setOverBox] = useState<string | null>(null);
  const [overBand, setOverBand] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const { nodeW, x: X, minH, gap, mostH } = layoutOf(columns.length, compact);
  const byColumn = columns.map((_, column) => nodes.filter((node) => node.column === column));
  const tallest = Math.max(1, ...byColumn.map((column) => column.reduce((all, node) => all + node.visits, 0)));
  const scale = fixedScale ?? Math.min(MOST_SCALE, (mostHeight ?? mostH) / tallest);
  const placed = new Map<string, PageFlowNode & { x: number; y: number; h: number }>();
  let height = 0;
  byColumn.forEach((column, at) => {
    let y = 4;
    for (const node of column) {
      const h = Math.max(minH, node.visits * scale);
      placed.set(node.id, { ...node, x: X[at], y, h });
      y += h + gap;
    }
    height = Math.max(height, y);
  });
  height += 8;

  // Each band leaves its box in the order of the boxes it reaches and arrives in the order they came from, so few cross.
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  const ends = new Map<PageFlowBand, [number, number]>();
  for (const band of [...bands].sort((a, b) => (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) || (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0))) {
    const from = placed.get(band.from);
    if (!from) continue;
    const y = out.get(band.from) ?? from.y;
    ends.set(band, [y, 0]);
    out.set(band.from, y + band.visits * scale);
  }
  for (const band of [...bands].sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0) || (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0))) {
    const to = placed.get(band.to);
    const end = ends.get(band);
    if (!to || !end) continue;
    const y = into.get(band.to) ?? to.y;
    end[1] = y;
    into.set(band.to, y + band.visits * scale);
  }

  // What's lit: the box under the mouse, else the one followed; a route under the mouse lights itself and its two boxes.
  const chosen = overBox ?? picked;
  const chosenColumn = chosen ? placed.get(chosen)?.column : undefined;
  const lights = chosen ? lightsOf(chosen, chosenColumn, bands, followOn) : null;
  const hoveredBand = overBand ? bands.find((band) => bandKey(band) === overBand) ?? null : null;
  const anything = hoveredBand !== null || lights !== null;
  const bandLit = (band: PageFlowBand) => (hoveredBand ? hoveredBand === band : lights?.bands.has(bandKey(band)) ?? false);
  const boxLit = (id: string) => (hoveredBand ? hoveredBand.from === id || hoveredBand.to === id : lights?.boxes.has(id) ?? false);
  const pick = (id: string) => setPicked((now) => (now === id ? null : id));
  const onKey = (id: string) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pick(id);
  };

  const words = (hover: string, readout?: FlowReadout) => (readout ? (
    <ChartTooltipSurface wide heading={<span className="flex flex-col"><span className="text-foreground">{readout.heading}</span>{readout.detail ? <span className="truncate text-[12px] font-normal text-muted">{readout.detail}</span> : null}</span>}>
      {readout.lines.map((line, at) => <ChartTooltipRow key={at} value={line.value} label={line.label} colour={line.colour} />)}
    </ChartTooltipSurface>
  ) : <ChartTooltipSurface wide><span className="text-[13px] text-foreground">{hover}</span></ChartTooltipSurface>);
  const hoveredBox = overBox ? placed.get(overBox) : null;
  const panel = hoveredBand ? words(hoveredBand.hover, hoveredBand.readout) : hoveredBox ? words(hoveredBox.hover, hoveredBox.readout) : null;

  const cols = { gridTemplateColumns: columns.map((_, index) => (index === 0 ? `${nodeW}fr` : `${X[index] - X[index - 1] - nodeW}fr ${nodeW}fr`)).join(" ") };
  const fade = { transition: "fill-opacity 120ms ease-out, opacity 120ms ease-out" };
  return (
    <div ref={area} data-part="page-flow" className="relative flex flex-col gap-3">
      <div className="grid" style={cols}>
        {columns.flatMap((column, index) => [
          ...(index > 0 ? [<span key={`gap-${index}`} />] : []),
          <div key={column.title} className="flex flex-col">
            <span className="text-[13px] font-medium text-foreground">{column.title}</span>
            <span className="whitespace-nowrap text-[12px] text-secondary">{column.summary}</span>
          </div>,
        ])}
      </div>
      <svg role="img" aria-label={columns.map((column) => column.title).join(", then ")} viewBox={`0 0 ${W} ${height}`} width="100%" className="block">
        {[...ends.entries()].map(([band, [y1, y2]]) => {
          const from = placed.get(band.from);
          const to = placed.get(band.to);
          if (!from || !to) return null;
          const thick = band.visits * scale;
          const x1 = from.x + nodeW;
          const x2 = to.x;
          const xm = (x1 + x2) / 2;
          const on = bandLit(band);
          return (
            <path
              key={bandKey(band)}
              data-band={bandKey(band)}
              d={`M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2} L${x2},${y2 + thick} C${xm},${y2 + thick} ${xm},${y1 + thick} ${x1},${y1 + thick} Z`}
              fill={on ? CHART_SERIES_ORANGE : CHART_SERIES_SLATE}
              fillOpacity={!anything ? 0.22 : on ? (hoveredBand === band ? 0.75 : 0.5) : 0.04}
              style={fade}
              className="cursor-pointer"
              onMouseEnter={() => setOverBand(bandKey(band))}
              onMouseLeave={() => setOverBand(null)}
            />
          );
        })}
        {[...ends.entries()].filter(([band]) => band.conversions > 0).map(([band, [y1, y2]]) => {
          const from = placed.get(band.from);
          const to = placed.get(band.to);
          if (!from || !to) return null;
          return (
            <circle
              key={`dot-${bandKey(band)}`}
              data-dot={bandKey(band)}
              cx={(from.x + nodeW + to.x) / 2}
              cy={(y1 + y2) / 2 + (band.visits * scale) / 2}
              r={dotRadius(band.conversions)}
              fill={CHART_SERIES_ORANGE}
              stroke="currentColor"
              strokeWidth={1.5}
              className="cursor-pointer text-foreground"
              opacity={!anything || bandLit(band) ? 1 : 0.15}
              style={fade}
              onMouseEnter={() => setOverBand(bandKey(band))}
              onMouseLeave={() => setOverBand(null)}
            />
          );
        })}
        {[...placed.values()].map((node) => {
          const going = (node.visits - node.left) * scale;
          const figures = figuresOf(node);
          const room = compact ? Math.max(4, 18 - figures.length) : 22;
          const name = node.label.length > room ? `${node.label.slice(0, room - 1)}…` : node.label;
          const outlined = overBox === node.id || picked === node.id;
          return (
            <g
              key={node.id}
              data-node={node.id}
              role="button"
              tabIndex={0}
              aria-pressed={picked === node.id}
              aria-label={node.hover}
              className="cursor-pointer focus-visible:outline-none"
              opacity={(!anything || boxLit(node.id) ? 1 : 0.3) * (node.ending === "never" ? 0.45 : 1)}
              style={fade}
              onClick={() => pick(node.id)}
              onKeyDown={onKey(node.id)}
              onMouseEnter={() => setOverBox(node.id)}
              onMouseLeave={() => setOverBox(null)}
            >
              {node.left > 0 ? (
                <rect x={node.x + nodeW - 2} y={node.y + going} width={7} height={Math.max(3, node.left * scale)} rx={2} fill="currentColor" className="text-destructive" />
              ) : null}
              <rect
                x={node.x}
                y={node.y}
                width={nodeW - 2}
                height={node.h}
                rx={3}
                fill="currentColor"
                className="text-border-dim"
                stroke={outlined ? CHART_SERIES_ORANGE : "none"}
                strokeWidth={2}
                style={outlined ? { filter: "brightness(1.35)" } : undefined}
              />
              {node.ending === "left" ? (
                <rect x={node.x} y={node.y} width={4} height={node.h} rx={2} fill="currentColor" className="text-destructive" />
              ) : (
                <rect x={node.x} y={node.y} width={4} height={node.h} rx={2} fill={node.ending === "uncounted" ? CHART_SERIES_SLATE : CHART_SERIES_ORANGE} />
              )}
              <text x={node.x + 12} y={node.y + (compact ? 15 : 13)} fontSize={11} fill="currentColor" className="text-foreground">{name}</text>
              <text x={compact ? node.x + nodeW - 8 : node.x + 12} y={node.y + (compact ? 15 : 25)} textAnchor={compact ? "end" : undefined} fontSize={11} fill="currentColor" className="font-mono text-secondary">{figures}</text>
              {!compact && (node.column === 0 || node.ending === "counted") && node.conversions > 0 ? (
                <circle cx={node.x + nodeW - 16} cy={node.y + 12} r={dotRadius(node.conversions)} fill={CHART_SERIES_ORANGE} stroke="currentColor" strokeWidth={1.5} className="text-foreground" />
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="sr-only">
        {bands.map((band) => <li key={bandKey(band)}>{band.hover}</li>)}
      </ul>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-5 text-[12px] text-secondary">
        {legend.conversions ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill={CHART_SERIES_ORANGE} stroke="currentColor" strokeWidth="1.5" className="text-foreground" /></svg>
            {legend.conversions}
          </span>
        ) : null}
        {legend.uncounted ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><rect x="2" y="1" width="6" height="12" rx="2" fill={CHART_SERIES_SLATE} /></svg>
            {legend.uncounted}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><rect x="2" y="1" width="6" height="12" rx="2" fill="currentColor" className="text-destructive" /></svg>
          {legend.left}
        </span>
      </div>
      <MouseReadout area={area}>{panel}</MouseReadout>
    </div>
  );
}
