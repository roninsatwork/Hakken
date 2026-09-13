import {
  isWalkable,
  type Point,
  type Terrain,
} from "../../ronins-run/engine/MapData";

// Uniform scaling preserves the original map's routes, distances and balance.
export const WORLD_SCALE = 0.035;
export const EYE_HEIGHT = 1.65;
export const toWorld = (p: Point) => ({
  x: p.x * WORLD_SCALE,
  z: p.y * WORLD_SCALE,
});
export const toMap = (x: number, z: number): Point => ({
  x: x / WORLD_SCALE,
  y: z / WORLD_SCALE,
});
export function cameraInput(yaw: number, forward: number, right: number) {
  return {
    x: -Math.sin(yaw) * forward + Math.cos(yaw) * right,
    y: -Math.cos(yaw) * forward - Math.sin(yaw) * right,
  };
}
export const yawToward = (a: Point, b: Point) =>
  Math.atan2(a.x - b.x, a.y - b.y);
export interface Boundary {
  a: Point;
  b: Point;
  outward: Point;
}
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const minus = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const lerp = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Only exposed edges become walls: polygon overlaps are traversable joins. */
export function boundarySegments(terrain: Terrain): Boundary[] {
  const edges = [...terrain.walkable, ...terrain.blocked].flatMap((polygon) =>
    polygon.map(([x, y], i) => ({
      a: { x, y },
      b: {
        x: polygon[(i + 1) % polygon.length][0],
        y: polygon[(i + 1) % polygon.length][1],
      },
    })),
  );
  const output: Boundary[] = [],
    seen = new Set<string>();
  for (const edge of edges) {
    const direction = minus(edge.b, edge.a),
      length = Math.hypot(direction.x, direction.y);
    if (length < 0.001) continue;
    const cuts = [0, 1];
    for (const other of edges) {
      const v = minus(other.b, other.a),
        delta = minus(other.a, edge.a),
        denominator = cross(direction, v);
      if (Math.abs(denominator) > 1e-8) {
        const t = cross(delta, v) / denominator,
          u = cross(delta, direction) / denominator;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      } else if (Math.abs(cross(delta, direction)) < 1e-6) {
        for (const p of [other.a, other.b]) {
          const d = minus(p, edge.a),
            t = (d.x * direction.x + d.y * direction.y) / (length * length);
          if (t > 0 && t < 1) cuts.push(t);
        }
      }
    }
    cuts.sort((a, b) => a - b);
    const normal = { x: -direction.y / length, y: direction.x / length };
    for (let i = 1; i < cuts.length; i++) {
      if ((cuts[i] - cuts[i - 1]) * length < 0.01) continue;
      const a = lerp(edge.a, edge.b, cuts[i - 1]),
        b = lerp(edge.a, edge.b, cuts[i]),
        mid = lerp(a, b, 0.5);
      const left = isWalkable(
        { x: mid.x + normal.x * 0.05, y: mid.y + normal.y * 0.05 },
        0,
        terrain,
      );
      const right = isWalkable(
        { x: mid.x - normal.x * 0.05, y: mid.y - normal.y * 0.05 },
        0,
        terrain,
      );
      if (left === right) continue;
      const key = [a, b]
        .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
        .sort()
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        a,
        b,
        outward: {
          x: normal.x * (left ? -1 : 1),
          y: normal.y * (left ? -1 : 1),
        },
      });
    }
  }
  return output;
}
