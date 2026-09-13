import {
  clearPath,
  distance,
  isWalkable,
  WORLD,
  ACTOR_RADIUS,
  COURTYARD_TERRAIN,
  type Terrain,
  type Point,
} from './MapData';

const STEP = 18;
const COLS = Math.ceil(WORLD.width / STEP);
const ROWS = Math.ceil(WORLD.height / STEP);
export class Navigation {
  private nodes: Point[] = [];
  private edges: number[][] = [];
  constructor(private terrain: Terrain) {
    const nodes = this.nodes;
    const cells = new Map<number, number>();
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) {
        const point = { x: col * STEP, y: row * STEP };
        if (isWalkable(point, ACTOR_RADIUS, terrain)) {
          cells.set(row * COLS + col, nodes.length);
          nodes.push(point);
        }
      }
    this.edges = nodes.map((point) => {
      const row = Math.round(point.y / STEP),
        col = Math.round(point.x / STEP);
      const result: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const next = cells.get((row + dy) * COLS + col + dx);
          if (next !== undefined && clearPath(point, nodes[next], ACTOR_RADIUS, terrain))
            result.push(next);
        }
      return result;
    });
  }
  private nearest(point: Point): number {
    const nodes = this.nodes;
    let best = -1,
      min = Infinity;
    nodes.forEach((node, i) => {
      const d = distance(point, node);
      if (d < min && clearPath(point, node, ACTOR_RADIUS, this.terrain)) {
        best = i;
        min = d;
      }
    });
    return best;
  }
  /** A* runs only when a target changes, never on every animation frame. */
  findPath(from: Point, to: Point): Point[] {
    const nodes = this.nodes,
      edges = this.edges;
    if (!isWalkable(to, ACTOR_RADIUS, this.terrain)) return [];
    if (clearPath(from, to, ACTOR_RADIUS, this.terrain)) return [{ ...to }];
    const start = this.nearest(from),
      end = this.nearest(to);
    if (start < 0 || end < 0) return [];
    const open = new Set([start]);
    const cost = new Map<number, number>([[start, 0]]),
      parent = new Map<number, number>();
    while (open.size) {
      let current = -1,
        best = Infinity;
      for (const n of open) {
        const score = (cost.get(n) ?? Infinity) + distance(nodes[n], nodes[end]);
        if (score < best) {
          best = score;
          current = n;
        }
      }
      if (current === end) {
        const path: Point[] = [{ ...to }];
        while (current !== start) {
          path.unshift(nodes[current]);
          current = parent.get(current)!;
        }
        const simplified: Point[] = [];
        let previous = from;
        for (let i = 0; i < path.length; i++) {
          let far = i;
          while (far + 1 < path.length && clearPath(previous, path[far + 1], ACTOR_RADIUS, this.terrain))
            far++;
          simplified.push({ ...path[far] });
          previous = path[far];
          i = far;
        }
        return simplified;
      }
      open.delete(current);
      for (const next of edges[current]) {
        const nextCost = (cost.get(current) ?? Infinity) + distance(nodes[current], nodes[next]);
        if (nextCost < (cost.get(next) ?? Infinity)) {
          cost.set(next, nextCost);
          parent.set(next, current);
          open.add(next);
        }
      }
    }
    return [];
  }
}
const cache = new WeakMap<Terrain, Navigation>();
export function navigationFor(terrain: Terrain): Navigation {
  let navigation = cache.get(terrain);
  if (!navigation) {
    navigation = new Navigation(terrain);
    cache.set(terrain, navigation);
  }
  return navigation;
}
export function findPath(from: Point, to: Point): Point[] {
  return navigationFor(COURTYARD_TERRAIN).findPath(from, to);
}
