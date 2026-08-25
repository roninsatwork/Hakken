const MAX_NODES = 400;
const WIDTH = 1000;
const HEIGHT = 700;
const PADDING = 70;
const SIMULATION_STEPS = 320;

export type WikiMapRow = {
  pageId: string;
  kind: string;
  title: string;
  subjectKey: string;
  links: string[];
};

export type LayoutNode = {
  pageId: string;
  kind: string;
  title: string;
  subjectKey: string;
  degree: number;
  x: number;
  y: number;
};

export type WikiMapLayout = {
  nodes: LayoutNode[];
  edges: Array<[LayoutNode, LayoutNode]>;
};

/** Deterministic per-id jitter so layout is stable across visits. */
function hashToUnit(value: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function runForceLayout(rows: WikiMapRow[]): WikiMapLayout {
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
