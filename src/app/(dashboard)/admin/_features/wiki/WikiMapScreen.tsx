"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Minus, Network, Plus, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * The map, Obsidian-grade (Anthony's steer, 2026-08-15): the shape comes
 * from the links, hubs sit at cluster centres, labels arrive as you zoom in
 * or hover, and pointing at a page lights it and its neighbourhood while
 * the rest falls back. Wheel or buttons to zoom, drag to pan, click to open
 * a page. Colour never carries the meaning alone: the legend spells each
 * kind out in words, and every node's name is a hover away.
 *
 * Deterministic throughout — positions are seeded from page ids, so the
 * same wiki draws the same map every visit.
 */

const KIND_CLASS: Record<string, string> = {
  CUSTOMER: "text-brand",
  PRODUCT: "text-info",
  POLICY: "text-warning",
  ISSUE: "text-secondary",
  SOURCE: "text-muted",
};

const MAX_NODES = 400;
const WIDTH = 1000;
const HEIGHT = 700;
const PADDING = 70;
const SIMULATION_STEPS = 320;

/** Deterministic per-id jitter so layout is stable across visits. */
function hashToUnit(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

type LayoutNode = {
  pageId: string;
  kind: string;
  title: string;
  subjectKey: string;
  degree: number;
  x: number;
  y: number;
};

function runForceLayout(
  rows: Array<{ pageId: string; kind: string; title: string; subjectKey: string; links: string[] }>
): { nodes: LayoutNode[]; edges: Array<[LayoutNode, LayoutNode]> } {
  const pages = rows.slice(0, MAX_NODES);
  const byKey = new Map(pages.map((page) => [`${page.kind}:${page.subjectKey}`, page.pageId]));
  const index = new Map(pages.map((page, i) => [page.pageId, i]));

  const edgePairs: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const link of page.links) {
      const targetId = byKey.get(link);
      if (!targetId) continue;
      const a = index.get(page.pageId)!;
      const b = index.get(targetId)!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (a === b || seen.has(key)) continue;
      seen.add(key);
      edgePairs.push([a, b]);
    }
  }

  const degree = pages.map(() => 0);
  for (const [a, b] of edgePairs) {
    degree[a] += 1;
    degree[b] += 1;
  }

  // Fruchterman–Reingold, small and honest: repulsion everywhere, springs
  // along links, gentle gravity so lonely pages don't drift off the sheet.
  const xs = pages.map((page) => (hashToUnit(page.pageId, 1) - 0.5) * WIDTH);
  const ys = pages.map((page) => (hashToUnit(page.pageId, 2) - 0.5) * HEIGHT);
  const count = Math.max(pages.length, 1);
  const ideal = Math.sqrt((WIDTH * HEIGHT) / count) * 1.35;

  for (let step = 0; step < SIMULATION_STEPS; step++) {
    const heat = 0.09 * (1 - step / SIMULATION_STEPS) * Math.min(WIDTH, HEIGHT);
    const dx = pages.map(() => 0);
    const dy = pages.map(() => 0);

    for (let a = 0; a < pages.length; a++) {
      for (let b = a + 1; b < pages.length; b++) {
        let vx = xs[a] - xs[b];
        let vy = ys[a] - ys[b];
        const distance = Math.max(Math.hypot(vx, vy), 0.01);
        vx /= distance;
        vy /= distance;
        const repulsion = (ideal * ideal) / distance;
        dx[a] += vx * repulsion;
        dy[a] += vy * repulsion;
        dx[b] -= vx * repulsion;
        dy[b] -= vy * repulsion;
      }
    }
    for (const [a, b] of edgePairs) {
      let vx = xs[a] - xs[b];
      let vy = ys[a] - ys[b];
      const distance = Math.max(Math.hypot(vx, vy), 0.01);
      vx /= distance;
      vy /= distance;
      // Springs have a rest length — closer than it pushes APART, further
      // pulls in. Pull-only springs let a big hub crush its cluster into a
      // knot; this is how Obsidian keeps clusters inflated. Rest length
      // grows with the busier endpoint so hubs claim more room.
      const rest = ideal * (1 + 0.08 * Math.min(degree[a], degree[b]));
      const attraction = (distance - rest) * 0.35;
      dx[a] -= vx * attraction;
      dy[a] -= vy * attraction;
      dx[b] += vx * attraction;
      dy[b] += vy * attraction;
    }
    for (let i = 0; i < pages.length; i++) {
      // Linked pages feel a gentle pull to the middle. Orphans gravitate to
      // their own hashed anchor instead, so they scatter around the sheet
      // the way Obsidian's unlinked files do — never a geometric ring.
      const weight = 1 + degree[i] * 0.05;
      if (degree[i] === 0) {
        const anchorX = (hashToUnit(pages[i].pageId, 5) - 0.5) * WIDTH * 0.85;
        const anchorY = (hashToUnit(pages[i].pageId, 7) - 0.5) * HEIGHT * 0.85;
        dx[i] += (anchorX - xs[i]) * 0.05;
        dy[i] += (anchorY - ys[i]) * 0.05;
      } else {
        dx[i] -= xs[i] * 0.015;
        dy[i] -= ys[i] * 0.015;
      }
      const shove = Math.max(Math.hypot(dx[i], dy[i]), 0.01);
      const step_ = Math.min(shove, heat) / weight;
      xs[i] += (dx[i] / shove) * step_;
      ys[i] += (dy[i] / shove) * step_;
    }
  }

  // Fit whatever shape emerged onto the sheet.
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const scaleX = (WIDTH - PADDING * 2) / Math.max(maxX - minX, 1);
  const scaleY = (HEIGHT - PADDING * 2) / Math.max(maxY - minY, 1);

  const nodes: LayoutNode[] = pages.map((page, i) => ({
    pageId: page.pageId,
    kind: page.kind,
    title: page.title,
    subjectKey: page.subjectKey,
    degree: degree[i],
    x: PADDING + (xs[i] - minX) * scaleX,
    y: PADDING + (ys[i] - minY) * scaleY,
  }));
  const edges = edgePairs.map(([a, b]) => [nodes[a], nodes[b]] as [LayoutNode, LayoutNode]);
  return { nodes, edges };
}

export function WikiMapScreen({
  companyId,
  basePath,
  showWorkspaceNav,
}: {
  companyId?: Id<"companies">;
  basePath: string;
  showWorkspaceNav?: boolean;
}) {
  const t = useTranslations("aiPages");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const globalRows = useQuery(api.wikiPages.listPagesForMapForGlobal, companyId ? "skip" : {});
  const companyRows = useQuery(
    api.wikiPages.listPagesForMapForCompany,
    companyId ? { companyId } : "skip"
  );
  const rows = companyId ? companyRows : globalRows;

  const layout = useMemo(() => runForceLayout(rows ?? []), [rows]);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [from, to] of layout.edges) {
      if (!map.has(from.pageId)) map.set(from.pageId, new Set());
      if (!map.has(to.pageId)) map.set(to.pageId, new Set());
      map.get(from.pageId)!.add(to.pageId);
      map.get(to.pageId)!.add(from.pageId);
    }
    return map;
  }, [layout]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // The camera: zoom centred where the wheel points, drag to pan.
  const [view, setView] = useState({ x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
  const movedRef = useRef(false);

  const zoomFactor = WIDTH / view.w;
  // The Obsidian rule (Anthony's steer): zooming reveals, it never enlarges.
  // Everything drawn is multiplied by this so dots, text and lines keep a
  // constant SCREEN size at every zoom — closer just means fewer, clearer.
  const unit = view.w / WIDTH;

  // A source note's title is often a raw URL; the map shows the readable
  // tail of the path, never the protocol soup.
  const displayTitle = (node: LayoutNode): string => {
    let title = node.title;
    if (/^https?:\/\//.test(title)) {
      const path = title.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/$/, "");
      title = path.split("/").filter(Boolean).slice(-1)[0] ?? title.replace(/^https?:\/\//, "");
      title = title || "home";
    }
    return title.length > 24 ? `${title.slice(0, 23)}…` : title;
  };

  // Labels are a budget, not a default: only nodes inside the current view
  // qualify, hubs first, and never more than a readable number at once.
  const labelBudget = new Set<string>();
  {
    const inView = layout.nodes.filter(
      (node) =>
        node.x >= view.x - 20 &&
        node.x <= view.x + view.w + 20 &&
        node.y >= view.y - 20 &&
        node.y <= view.y + view.h + 20
    );
    const cap = zoomFactor >= 4 ? 400 : zoomFactor >= 2.2 ? 60 : zoomFactor >= 1.4 ? 30 : 12;
    for (const node of [...inView].sort((a, b) => b.degree - a.degree).slice(0, cap)) {
      labelBudget.add(node.pageId);
    }
  }

  const toSvgPoint = (clientX: number, clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    return {
      x: view.x + ((clientX - bounds.left) / bounds.width) * view.w,
      y: view.y + ((clientY - bounds.top) / bounds.height) * view.h,
    };
  };

  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    setView((current) => {
      // Deep enough that one node can fill the screen, like his vault.
      const w = Math.min(Math.max(current.w * factor, WIDTH / 80), WIDTH * 3);
      const h = (w / WIDTH) * HEIGHT;
      const focus = at ?? { x: current.x + current.w / 2, y: current.y + current.h / 2 };
      const fx = (focus.x - current.x) / current.w;
      const fy = (focus.y - current.y) / current.h;
      return { x: focus.x - fx * w, y: focus.y - fy * h, w, h };
    });
  };

  // Labels arrive as the camera does: hubs first, everything when close,
  // and the hovered neighbourhood always. Obsidian's behaviour, honestly.
  const labelOpacity = (node: LayoutNode): number => {
    if (hoveredId) {
      if (node.pageId === hoveredId || neighbours.get(hoveredId)?.has(node.pageId)) return 1;
      return 0;
    }
    if (!labelBudget.has(node.pageId)) return 0;
    return node.degree >= 6 ? 0.95 : 0.75;
  };

  const nodeOpacity = (node: LayoutNode): number => {
    if (!hoveredId) return 1;
    if (node.pageId === hoveredId || neighbours.get(hoveredId)?.has(node.pageId)) return 1;
    return 0.12;
  };

  const edgeState = (from: LayoutNode, to: LayoutNode): "lit" | "dim" | "base" => {
    if (!hoveredId) return "base";
    if (from.pageId === hoveredId || to.pageId === hoveredId) return "lit";
    return "dim";
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      <PageHeader
        icon={<Network className="w-6 h-6 text-brand" />}
        title={t("map.title")}
        description={t("map.subtitle")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href={basePath}
          className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("map.back")}
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          {Object.entries(KIND_CLASS).map(([kind, className]) => (
            <span key={kind} className="flex items-center gap-2 text-[12px] text-secondary">
              <span className={`inline-block w-2.5 h-2.5 rounded-full bg-current ${className}`} />
              {t(`kinds.${kind}`)}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Raw (all three zoom controls): square bordered icon chips — no kit variant is a bordered square. */}
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.3)}
            aria-label={t("map.zoomIn")}
            title={t("map.zoomIn")}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-border-dim text-secondary hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.3)}
            aria-label={t("map.zoomOut")}
            title={t("map.zoomOut")}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-border-dim text-secondary hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView({ x: 0, y: 0, w: WIDTH, h: HEIGHT })}
            aria-label={t("map.zoomReset")}
            title={t("map.zoomReset")}
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-border-dim text-secondary hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {rows !== undefined && layout.nodes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-secondary rounded-[16px] border border-border-dim bg-card/40">
          <Network className="w-6 h-6" />
          <p className="text-[13px] max-w-md text-center">{t("map.empty", { platformName })}</p>
        </div>
      ) : (
        <div className="rounded-[16px] border border-border-dim bg-card/40 overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className="w-full cursor-grab active:cursor-grabbing select-none"
            style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: "none" }}
            role="img"
            aria-label={t("map.title")}
            onWheel={(event) => {
              event.preventDefault();
              // Proportional, not stepped (Anthony: the old fixed step per
              // tick made trackpads zoom "way too sensitive and fast"): a
              // gentle nudge scrolls gently, a hard flick still travels,
              // and each event is capped so nothing ever lurches.
              const lines = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
              const factor = Math.exp(Math.max(-60, Math.min(60, lines)) * 0.0012);
              zoomBy(factor, toSvgPoint(event.clientX, event.clientY));
            }}
            onPointerDown={(event) => {
              movedRef.current = false;
              dragRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                viewX: view.x,
                viewY: view.y,
              };
              (event.target as Element).setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              const bounds = svgRef.current?.getBoundingClientRect();
              if (!drag || !bounds) return;
              const dx = ((event.clientX - drag.startX) / bounds.width) * view.w;
              const dy = ((event.clientY - drag.startY) / bounds.height) * view.h;
              if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) {
                movedRef.current = true;
              }
              setView((current) => ({ ...current, x: drag.viewX - dx, y: drag.viewY - dy }));
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
          >
            <g strokeLinecap="round">
              {layout.edges.map(([from, to]) => {
                const state = edgeState(from, to);
                return (
                  <line
                    key={`${from.pageId}-${to.pageId}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="currentColor"
                    className={state === "lit" ? "text-foreground/70" : "text-border-dim"}
                    strokeOpacity={state === "dim" ? 0.12 : state === "lit" ? 0.95 : 0.65}
                    strokeWidth={(state === "lit" ? 1.7 : 1.1) * unit}
                  />
                );
              })}
            </g>
            {layout.nodes.map((node) => {
              const radius = (2.2 + Math.min(node.degree * 0.35, 5)) * unit;
              const labels = labelOpacity(node);
              return (
                <g
                  key={node.pageId}
                  className={`${KIND_CLASS[node.kind] ?? "text-secondary"} cursor-pointer`}
                  opacity={nodeOpacity(node)}
                  onPointerEnter={() => setHoveredId(node.pageId)}
                  onPointerLeave={() => setHoveredId((current) => (current === node.pageId ? null : current))}
                  onClick={() => {
                    // A drag that ended on a node is a pan, not a visit.
                    if (!movedRef.current) router.push(`${basePath}/${node.pageId}`);
                  }}
                >
                  <circle cx={node.x} cy={node.y} r={radius} fill="currentColor" />
                  {labels > 0 && (
                    // Sub-pixel SVG font sizes come out garbled in Chrome at
                    // deep zoom; full-size glyphs under a scale transform stay
                    // crisp at any depth.
                    <text
                      transform={`translate(${node.x} ${node.y + radius + 11 * unit}) scale(${unit})`}
                      textAnchor="middle"
                      className="fill-foreground"
                      opacity={labels}
                      style={{ fontSize: 10.5 }}
                    >
                      {displayTitle(node)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
