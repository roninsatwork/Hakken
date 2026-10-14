"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { CHART_SERIES_ORANGE, CHART_SERIES_SLATE } from "@/src/ui/components/charts/chartPalette";

/**
 * How visits moved through a website (docs/plans/active/landing-pages-flow-plan.md
 * LF2, drawn and approved 2026-10-14): three columns left to right — landing
 * pages, the next page, the page after — each page a box as tall as its
 * visits, grey bands as thick as the visits that went from one page to the
 * next, a red tail down a box's right edge for the visits that left there,
 * and an orange dot for conversions: on a route, halfway along its band; on a
 * landing page itself, inside its box. Bigger for more.
 *
 * Click a box to follow it: it takes an orange outline, its routes in and out
 * turn orange — a landing page's two steps on — the pages at their other ends
 * stay, the rest fade. Click it again to see every route. It opens with none
 * followed. Every box is a button for the keyboard too, and a screen reader is
 * given the routes as a list.
 *
 * The owner is red/green colour blind: a tail is told by its place and the ▼
 * words, a followed route by its outline and the fading of the rest.
 */

export type PageFlowNode = {
  id: string;
  column: 0 | 1 | 2;
  /** What the box says: a page's path, or the column's "(n more pages)". */
  label: string;
  visits: number;
  /** Visits that left the website there. */
  left: number;
  /** Conversions made on the page in this column: on a landing page itself, or after the route into it. */
  conversions: number;
  /** The hover's words, whole. */
  hover: string;
};

export type PageFlowBand = {
  from: string;
  to: string;
  visits: number;
  conversions: number;
  /** The column-0 boxes whose visits took this route: following a landing page lights its routes two steps on. */
  landings: readonly string[];
  hover: string;
};

const W = 860;
const NODE_W = 146;
const X = [0, 352, 702] as const;
const GAP = 14;
const MIN_H = 30;
/** The tallest a column is drawn; a busier website is drawn to the same height. */
const MOST_H = 420;
const MOST_SCALE = 0.45;
const cut = (words: string, most = 22) => (words.length > most ? `${words.slice(0, most - 1)}…` : words);
const dotRadius = (conversions: number) => 3.5 + Math.min(conversions, 3) * 1.3;

type Placed = PageFlowNode & { x: number; y: number; h: number };

export function PageFlowChart({ columns, nodes, bands, legend, figuresOf }: {
  /** Each column's name and the line under it ("709 visits · ▼ 296 left · ● 3"). */
  columns: ReadonlyArray<{ title: string; summary: ReactNode }>;
  nodes: readonly PageFlowNode[];
  bands: readonly PageFlowBand[];
  legend: { conversions: string; left: string };
  /** A box's second line: its visits, and its conversions when it made any. */
  figuresOf: (node: PageFlowNode) => string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const byColumn = [0, 1, 2].map((column) => nodes.filter((node) => node.column === column));
  const tallest = Math.max(1, ...byColumn.map((column) => column.reduce((all, node) => all + node.visits, 0)));
  const scale = Math.min(MOST_SCALE, MOST_H / tallest);
  const placed = new Map<string, Placed>();
  let height = 0;
  byColumn.forEach((column, at) => {
    let y = 4;
    for (const node of column) {
      const h = Math.max(MIN_H, node.visits * scale);
      placed.set(node.id, { ...node, x: X[at], y, h });
      y += h + GAP;
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

  const pickedNode = picked ? placed.get(picked) ?? null : null;
  const lit = (band: PageFlowBand) => pickedNode !== null && (band.from === pickedNode.id || band.to === pickedNode.id
    || (pickedNode.column === 0 && band.landings.includes(pickedNode.id)));
  const near = new Set<string>(pickedNode ? [pickedNode.id] : []);
  if (pickedNode) for (const band of bands) if (lit(band)) { near.add(band.from); near.add(band.to); }
  const pick = (id: string) => setPicked((now) => (now === id ? null : id));
  const onKey = (id: string) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pick(id);
  };

  const cols = { gridTemplateColumns: `${NODE_W}fr ${X[1] - NODE_W}fr ${NODE_W}fr ${X[2] - X[1] - NODE_W}fr ${NODE_W}fr` };
  return (
    <div data-part="page-flow" className="flex flex-col gap-3">
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
          const from = placed.get(band.from)!;
          const to = placed.get(band.to)!;
          const thick = band.visits * scale;
          const x1 = from.x + NODE_W;
          const x2 = to.x;
          const xm = (x1 + x2) / 2;
          const on = lit(band);
          return (
            <path
              key={`${band.from}>${band.to}`}
              data-band={`${band.from}>${band.to}`}
              d={`M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2} L${x2},${y2 + thick} C${xm},${y2 + thick} ${xm},${y1 + thick} ${x1},${y1 + thick} Z`}
              fill={on ? CHART_SERIES_ORANGE : CHART_SERIES_SLATE}
              fillOpacity={pickedNode === null ? 0.22 : on ? 0.5 : 0.04}
            >
              <title>{band.hover}</title>
            </path>
          );
        })}
        {[...ends.entries()].filter(([band]) => band.conversions > 0).map(([band, [y1, y2]]) => {
          const from = placed.get(band.from)!;
          const to = placed.get(band.to)!;
          return (
            <circle
              key={`dot-${band.from}>${band.to}`}
              cx={(from.x + NODE_W + to.x) / 2}
              cy={(y1 + y2) / 2 + (band.visits * scale) / 2}
              r={dotRadius(band.conversions)}
              fill={CHART_SERIES_ORANGE}
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-foreground"
              opacity={pickedNode === null || lit(band) ? 1 : 0.15}
            >
              <title>{band.hover}</title>
            </circle>
          );
        })}
        {[...placed.values()].map((node) => {
          const going = (node.visits - node.left) * scale;
          return (
            <g
              key={node.id}
              data-node={node.id}
              role="button"
              tabIndex={0}
              aria-pressed={picked === node.id}
              aria-label={node.hover}
              className="cursor-pointer focus-visible:outline-none"
              opacity={pickedNode === null || near.has(node.id) ? 1 : 0.3}
              onClick={() => pick(node.id)}
              onKeyDown={onKey(node.id)}
            >
              <title>{node.hover}</title>
              {node.left > 0 ? (
                <rect x={node.x + NODE_W - 2} y={node.y + going} width={7} height={Math.max(3, node.left * scale)} rx={2} fill="currentColor" className="text-destructive" />
              ) : null}
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W - 2}
                height={node.h}
                rx={3}
                fill="currentColor"
                className="text-border-dim"
                stroke={picked === node.id ? CHART_SERIES_ORANGE : "none"}
                strokeWidth={2}
              />
              <rect x={node.x} y={node.y} width={4} height={node.h} rx={2} fill={CHART_SERIES_ORANGE} />
              <text x={node.x + 12} y={node.y + 13} fontSize={11} fill="currentColor" className="text-foreground">{cut(node.label)}</text>
              <text x={node.x + 12} y={node.y + 25} fontSize={11} fill="currentColor" className="font-mono text-secondary">{figuresOf(node)}</text>
              {node.column === 0 && node.conversions > 0 ? (
                <circle cx={node.x + NODE_W - 16} cy={node.y + 12} r={dotRadius(node.conversions)} fill={CHART_SERIES_ORANGE} stroke="currentColor" strokeWidth={1.5} className="text-foreground" />
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="sr-only">
        {bands.map((band) => <li key={`${band.from}>${band.to}`}>{band.hover}</li>)}
      </ul>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-5 text-[12px] text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill={CHART_SERIES_ORANGE} stroke="currentColor" strokeWidth="1.5" className="text-foreground" /></svg>
          {legend.conversions}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><rect x="2" y="1" width="6" height="12" rx="2" fill="currentColor" className="text-destructive" /></svg>
          {legend.left}
        </span>
      </div>
    </div>
  );
}
