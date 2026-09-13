import type { LevelDefinition } from "../../ronins-run/engine/Levels";
import { isWalkable, insidePolygon } from "../../ronins-run/engine/MapData";
import { boundarySegments, toMap, toWorld } from "./WorldLayout";

export type DressingKind =
  | "shop"
  | "stall"
  | "warehouse"
  | "boat"
  | "tree"
  | "bamboo"
  | "rock"
  | "shrine";
export interface Dressing {
  kind: DressingKind;
  x: number;
  z: number;
  rotation: number;
  width: number;
  depth: number;
  seed: number;
}

/** Includes overhangs and props; only foliage above head height may overhang paths. */
export function footprintFits(level: LevelDefinition, item: Dressing) {
  const cos = Math.cos(item.rotation),
    sin = Math.sin(item.rotation);
  const nx = Math.ceil(item.width / 0.14),
    nz = Math.ceil(item.depth / 0.14);
  for (let ix = 0; ix <= nx; ix++)
    for (let iz = 0; iz <= nz; iz++) {
      const x = (ix / nx - 0.5) * item.width;
      const z = (iz / nz - 0.5) * item.depth;
      if (
        isWalkable(
          toMap(item.x + x * cos + z * sin, item.z - x * sin + z * cos),
          0,
          level,
        )
      )
        return false;
    }
  return true;
}

/** Deterministic placements, inspectable independently of WebGL and the game simulation. */
export function districtDressing(level: LevelDefinition): Dressing[] {
  const items: Dressing[] = [];
  const add = (item: Dressing, spacing = 0.2) => {
    const radius = Math.hypot(item.width, item.depth) / 2;
    if (
      !footprintFits(level, item) ||
      items.some(
        (p) =>
          Math.hypot(p.x - item.x, p.z - item.z) <
          (Math.hypot(p.width, p.depth) / 2 + radius) * spacing,
      )
    )
      return false;
    items.push(item);
    return true;
  };
  const borders = boundarySegments(level);
  let buildings = 0,
    foliage = 0;
  for (const [i, edge] of borders.entries()) {
    const a = toWorld(edge.a),
      b = toWorld(edge.b);
    const length = Math.hypot(a.x - b.x, a.z - b.z);
    const x = (a.x + b.x) / 2,
      z = (a.z + b.z) / 2;
    const rotation = Math.atan2(edge.outward.x, edge.outward.y);
    const candidate = (
      kind: DressingKind,
      width: number,
      depth: number,
      setback: number,
    ): Dressing => ({
      kind,
      width,
      depth,
      rotation,
      seed: i * 73 + 19,
      x: x + edge.outward.x * (depth / 2 + setback),
      z: z + edge.outward.y * (depth / 2 + setback),
    });
    if (
      length > 2.5 &&
      buildings < 24 &&
      i % 2 === 0 &&
      level.id !== "gardens"
    ) {
      const kind = level.id === "docks" ? "warehouse" : "shop";
      if (add(candidate(kind, Math.min(length * 0.8, 6.5), 5.3, 0.35), 0.86))
        buildings++;
    }
    if (level.id === "market" && length > 1.8 && i % 2 === 1)
      add(candidate("stall", 2.9, 2.2, 0.28), 0.82);
    if (level.id === "docks" && length > 3.4 && i % 3 === 1)
      add(candidate("boat", 2.3, 5.4, 0.4), 0.85);
    if (level.id === "gardens" && length > 3 && i % 9 === 0)
      add(candidate("shrine", 3.6, 3.6, 0.5), 0.9);
    if (i % 3 === 0 && foliage < (level.id === "gardens" ? 38 : 13)) {
      const kind = level.id === "gardens" && i % 2 === 0 ? "bamboo" : "tree";
      if (
        add(
          candidate(
            kind,
            kind === "tree" ? 0.85 : 1.6,
            kind === "tree" ? 0.85 : 1.6,
            0.5,
          ),
          1.2,
        )
      )
        foliage++;
    }
    if (i % 2 === 0 && length > 0.9)
      add(candidate("rock", 0.9, 0.9, 0.2), 0.95);
  }
  // In gardens, fill the authored solid islands with layered planting, never new obstacles.
  if (level.id === "gardens")
    for (let x = 6; x < 52; x += 2.8)
      for (let z = 8; z < 30; z += 2.8) {
        const map = toMap(x, z);
        if (!level.blocked.some((polygon) => insidePolygon(map, polygon)))
          continue;
        add(
          {
            kind: Math.round(x + z) % 3 === 0 ? "bamboo" : "tree",
            x,
            z,
            rotation: x,
            width: 1.6,
            depth: 1.6,
            seed: Math.round(x * 77 + z * 31),
          },
          1.2,
        );
      }
  return items;
}
