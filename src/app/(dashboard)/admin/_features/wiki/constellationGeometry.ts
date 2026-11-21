import type { WikiMapLayout } from "./wikiMapLayout";

/**
 * The wiki map as a constellation (Anthony, 2026-11-12, in the upstream
 * framework: "give it more of a particle feel … we can rotate it around, zoom
 * through it"; brought over on 2026-11-21, wiki-sonae-catch-up-plan-2026-11-21.md, S3). This file places every page in 3D and turns a point of that
 * space onto the screen; `WikiConstellation.tsx` draws it.
 *
 * The flat map's own layout (`wikiMapLayout.ts`) still decides where pages
 * sit across and down, so pages that link sit near each other. Depth comes
 * from the page's kind, so each kind is a loose layer you can turn round and
 * see apart. Everything is seeded from page ids, so the same wiki draws the
 * same constellation every visit.
 */

export const KIND_ORDER = ["CUSTOMER", "CLIENT", "PRODUCT", "POLICY", "ISSUE", "GOAL", "SOURCE"] as const;

export type ConstellationNode = {
  pageId: string;
  kind: string;
  title: string;
  degree: number;
  usage: number;
  /** Where the page's cloud sits. */
  p: [number, number, number];
  /** Each dot of the cloud: its offset from the centre and its twinkle phase. */
  dots: Array<[number, number, number, number]>;
  /** How big the cloud is drawn, from how linked and how used the page is. */
  size: number;
  /** How far the cloud's dots reach from its centre, before `size`. */
  radius: number;
  /** Its place in the order the wiki learned its pages, from 0. */
  rank: number;
};

export type Constellation = {
  nodes: ConstellationNode[];
  /** Pairs of node indexes, each with a phase for the dust that runs along it. */
  edges: Array<[number, number, number]>;
  /** For each node, the indexes of the nodes it is joined to. */
  neighbours: number[][];
};

/** The eye: how far round and up it has turned, how far it sits from the point it circles, and that point. */
export type Camera = { yaw: number; pitch: number; distance: number; target: [number, number, number] };

export const DEFAULT_CAMERA: Camera = { yaw: 0.6, pitch: -0.25, distance: 760, target: [0, 0, 0] };
/** Close enough to fly into a page's own cloud and out the other side (Anthony, 2026-11-12: "we need the zoom to go in more"). */
export const MIN_DISTANCE = 24;
export const MAX_DISTANCE = 1800;
/** How far the furthest page sits from the centre, across and down. */
const SPREAD = 340;

function hashToUnit(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 100000) / 100000;
}

/** The most dots the whole map draws, spread over its pages, so a big wiki turns as smoothly as a small one. */
export const MAP_DOT_BUDGET = 30_000;
/** The fewest dots a page is drawn with, however big the wiki: still a cloud you can see and point at. */
const MIN_DOTS_PER_PAGE = 12;

export function buildConstellation(
  layout: WikiMapLayout,
  extra: Map<string, { usage: number; learnedAt: number }>,
): Constellation {
  const index = new Map(layout.nodes.map((node, i) => [node.pageId, i]));
  const learnedOrder = [...layout.nodes]
    .map((node, i) => ({ i, at: extra.get(node.pageId)?.learnedAt ?? 0 }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const rankOf = new Map(learnedOrder.map((entry, rank) => [entry.i, rank]));

  // The flat layout's middle becomes the centre the map turns round, and the
  // pages spread to the same reach whether the wiki has nine pages or four
  // hundred, so a small wiki fills the frame instead of huddling in it.
  const count = layout.nodes.length || 1;
  const midX = layout.nodes.reduce((sum, node) => sum + node.x, 0) / count;
  const midY = layout.nodes.reduce((sum, node) => sum + node.y, 0) / count;
  const reach = Math.max(1, ...layout.nodes.map((node) => Math.hypot(node.x - midX, node.y - midY)));
  const spread = layout.nodes.length > 1 ? SPREAD / reach : 1;
  const plainDots = layout.nodes.reduce((sum, node) => sum + 44 + Math.min(node.degree, 10) * 6 + Math.min(extra.get(node.pageId)?.usage ?? 0, 30), 0);
  const dotShare = plainDots > MAP_DOT_BUDGET ? MAP_DOT_BUDGET / plainDots : 1;

  const nodes: ConstellationNode[] = layout.nodes.map((node, i) => {
    const kindIndex = Math.max(0, KIND_ORDER.indexOf(node.kind as (typeof KIND_ORDER)[number]));
    const usage = extra.get(node.pageId)?.usage ?? 0;
    const z = (kindIndex - (KIND_ORDER.length - 1) / 2) * 110 + (hashToUnit(node.pageId, 3) - 0.5) * 160;
    // Fewer dots a page as the wiki grows (wiki-sonae-catch-up-plan-2026-11-21.md, S3): the whole map stays near
    // MAP_DOT_BUDGET however many pages it has, where 1,000 pages once moved about 134,000 dots every frame.
    const dotCount = Math.max(MIN_DOTS_PER_PAGE, Math.round((44 + Math.min(node.degree, 10) * 6 + Math.min(usage, 30)) * dotShare));
    // Big enough to see and point at without zooming (Anthony, 2026-11-12).
    const radius = 24 + Math.sqrt(node.degree) * 10;
    const dots: ConstellationNode["dots"] = [];
    for (let d = 0; d < dotCount; d++) {
      const r = radius * (0.35 + 0.65 * hashToUnit(node.pageId, 10 + d * 4));
      const theta = hashToUnit(node.pageId, 11 + d * 4) * Math.PI * 2;
      const phi = Math.acos(2 * hashToUnit(node.pageId, 12 + d * 4) - 1);
      dots.push([
        Math.sin(phi) * Math.cos(theta) * r,
        Math.sin(phi) * Math.sin(theta) * r,
        Math.cos(phi) * r,
        hashToUnit(node.pageId, 13 + d * 4) * Math.PI * 2,
      ]);
    }
    return {
      pageId: node.pageId,
      kind: node.kind,
      title: node.title,
      degree: node.degree,
      usage,
      p: [(node.x - midX) * spread, (node.y - midY) * spread, z],
      dots,
      size: 1 + Math.min(usage, 30) / 60,
      radius,
      rank: rankOf.get(i) ?? i,
    };
  });

  const edges: Constellation["edges"] = [];
  const neighbours: number[][] = nodes.map(() => []);
  for (const [from, to] of layout.edges) {
    const a = index.get(from.pageId);
    const b = index.get(to.pageId);
    if (a === undefined || b === undefined) continue;
    edges.push([a, b, hashToUnit(`${from.pageId}${to.pageId}`, 7)]);
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  return { nodes, edges, neighbours };
}

/** Anything nearer the eye than this is behind you, so flying in carries you through. */
const NEAR = 10;

/**
 * Turn a point in the constellation onto the screen: its x and y, how much
 * nearer things are drawn larger, and how far away it is. `null` when the
 * point is behind the eye, which is how flying in carries you through a cloud.
 */
export function projectPoint(
  point: readonly [number, number, number],
  camera: Camera,
  width: number,
  height: number,
): [number, number, number, number] | null {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const px = point[0] - camera.target[0];
  const py = point[1] - camera.target[1];
  const pz = point[2] - camera.target[2];
  const x1 = px * cy - pz * sy;
  const z1 = px * sy + pz * cy;
  const y2 = py * cp - z1 * sp;
  const z2 = py * sp + z1 * cp;
  const depth = z2 + camera.distance;
  if (depth < NEAR) return null;
  // The lens grows with the frame, so the map fills a full window as it fills
  // the page, and leans towards the frame's width so a wide frame is used.
  const scale = Math.min(Math.min(width, height) * 1.45, Math.max(width, height) * 0.6) / depth;
  return [width / 2 + x1 * scale, height / 2 + y2 * scale, scale, depth];
}

export function clampDistance(distance: number) {
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
}

/**
 * How the map moves when you touch it. Anthony, 2026-11-12: "the wiki graph
 * move is too sensitive and we need to slow it down a little".
 *
 * Each wheel tick used to fly a fixed 11% closer, however small the tick. A
 * trackpad pinch sends dozens of tiny ticks a second, so a light pinch shot a
 * long way. Now a tick moves the map by how far the fingers actually moved,
 * with a cap, so a gentle pinch is a gentle zoom and one mouse-wheel notch is
 * still one clear step.
 */
export const MAP_MOTION = {
  /** How much of each pixel of wheel travel becomes zoom. */
  wheelPerPixel: 0.0018,
  /** The most one tick can count for, in pixels: about one mouse-wheel notch. */
  wheelTickCap: 50,
  /** How far one pixel of dragging turns the map, in radians (was 0.006). */
  dragPerPixel: 0.0036,
  /** How much of the way to where it is heading the map glides each frame (was 0.08). */
  glide: 0.06,
} as const;

/** WheelEvent.deltaMode: 0 is pixels, 1 is lines, 2 is pages. */
const WHEEL_PIXELS_PER_MODE = [1, 16, 800];

/**
 * What one wheel tick multiplies the camera's distance by: under 1 flies
 * closer, over 1 backs away, and the size follows the tick's own size.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0) {
  const pixels = deltaY * (WHEEL_PIXELS_PER_MODE[deltaMode] ?? 1);
  const capped = Math.max(-MAP_MOTION.wheelTickCap, Math.min(MAP_MOTION.wheelTickCap, pixels));
  return Math.exp(capped * MAP_MOTION.wheelPerPixel);
}
