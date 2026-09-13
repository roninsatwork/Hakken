import { distantLandscape } from "./DistantLandscape";
import * as THREE from "three";
import type { LevelDefinition } from "../../ronins-run/engine/Levels";
import { isWalkable } from "../../ronins-run/engine/MapData";
import { boundarySegments, toMap, toWorld } from "./WorldLayout";
import { beam, box, cylinder, globe, lantern, rounded } from "./SceneAssets";
import { crate, gate, pottery, townhouse } from "./Architecture";
import {
  bamboo,
  fallenLeaves,
  fern,
  randomFor,
  rock,
  tree,
} from "./GardenAssets";

type Palette = Record<string, THREE.Material>;

/** All bulky scenery stays outside the shared navigable footprint. */
export function sceneryFits(
  level: LevelDefinition,
  x: number,
  z: number,
  radius: number,
) {
  if (isWalkable(toMap(x, z), 0, level)) return false;
  for (let ring = 0.15; ring <= radius + 0.15; ring += 0.15)
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      if (
        isWalkable(
          toMap(
            x + Math.cos(angle) * Math.min(ring, radius),
            z + Math.sin(angle) * Math.min(ring, radius),
          ),
          0,
          level,
        )
      )
        return false;
    }
  return true;
}

export function courtyardArt(
  level: LevelDefinition,
  mats: Palette,
  world: THREE.Group,
  scene: THREE.Scene,
) {
  const borders = boundarySegments(level),
    occupied: { x: number; z: number; r: number }[] = [];
  const rng = randomFor(9271);
  let buildings = 0,
    trees = 0,
    lamps = 0;
  for (const [i, edge] of borders.entries()) {
    const a = toWorld(edge.a),
      b = toWorld(edge.b),
      length = Math.hypot(b.x - a.x, b.z - a.z),
      mx = (a.x + b.x) / 2,
      mz = (a.z + b.z) / 2;
    const map = toMap(mx, mz),
      normal = edge.outward,
      rotation = Math.atan2(normal.x, normal.y);
    const canal = map.x > 605 && map.x < 1220 && map.y > 280 && map.y < 705;
    const bridge =
      canal && map.x > 660 && map.x < 935 && map.y > 500 && map.y < 668;
    const railing = new THREE.Group();
    railing.position.set(mx + normal.x * 0.11, 0, mz + normal.y * 0.11);
    railing.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    // Retaining blocks delineate the exact original boundary; the route remains open above them.
    for (let x = -length / 2 + 0.22; x < length / 2; x += 0.48) {
      rounded(
        railing,
        mats.stone,
        x,
        -0.12,
        0,
        Math.min(0.47, length),
        0.43,
        0.28,
        0.05,
      );
      if (!canal)
        rounded(railing, mats.stone, x, 0.14, 0.05, 0.46, 0.15, 0.27, 0.03);
    }
    if (canal) {
      for (const y of [0.34, 0.91])
        rounded(railing, mats.red, 0, y, 0.02, length + 0.03, 0.09, 0.1, 0.02);
      const count = Math.max(1, Math.ceil(length / 1.8));
      for (let n = 0; n <= count; n++) {
        const x = -length / 2 + (n / count) * length;
        rounded(railing, mats.red, x, 0.55, 0, 0.16, 1.1, 0.16, 0.025);
        cylinder(railing, mats.gold, x, 1.1, 0, 0.13, 0.13, 0.055, 12);
        globe(railing, mats.wood, x, 1.18, 0, 0.105);
        for (const y of [0.27, 0.88])
          globe(railing, mats.gold, x, y, -0.089, 0.019);
      }
    }
    world.add(railing);
    if (length > 1.2 && i % 3 === 0) {
      const x = mx + normal.x * 0.4,
        z = mz + normal.y * 0.4;
      cylinder(world, mats.stone, x, 0.13, z, 0.17, 0.22, 0.26, 12);
      cylinder(world, mats.wood, x, 1.16, z, 0.043, 0.065, 2.25, 12);
      beam(
        world,
        mats.wood,
        new THREE.Vector3(x, 2.25, z),
        new THREE.Vector3(x - normal.x * 0.25, 2.25, z - normal.y * 0.25),
        0.035,
      );
      lantern(
        world,
        x - normal.x * 0.22,
        1.94,
        z - normal.y * 0.22,
        mats.paper,
        mats.wood,
      );
      if (lamps++ < 16) {
        const lamp = new THREE.PointLight(0xffa051, 7, 7, 2);
        lamp.position.set(x - normal.x * 0.25, 1.87, z - normal.y * 0.25);
        scene.add(lamp);
      }
    }
    if (bridge) continue;
    // Several overlapping path edges belong to the same garden. Do not place a house on each one.
    if (!canal && length > 2.5 && i % 2 === 0 && buildings < 20) {
      const width = Math.min(5.8, length * 0.83),
        depth = 3.5,
        radius = Math.hypot(width / 2 + 0.55, depth / 2 + 0.65);
      const x = mx + normal.x * (depth / 2 + 0.78),
        z = mz + normal.y * (depth / 2 + 0.78);
      let fits = true;
      for (let dx = -width / 2 - 0.56; dx <= width / 2 + 0.56; dx += 0.2)
        for (let dz = -depth / 2 - 0.7; dz <= depth / 2 + 0.56; dz += 0.2) {
          if (
            isWalkable(
              toMap(
                x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
                z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
              ),
              0,
              level,
            )
          )
            fits = false;
        }
      if (
        fits &&
        !occupied.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + radius - 0.8)
      ) {
        const shop = townhouse(
          width,
          depth,
          3.0 + (buildings % 3) * 0.52,
          mats,
          buildings % 2 === 0,
          buildings,
        );
        shop.position.set(x, 0, z);
        shop.rotation.y = rotation;
        world.add(shop);
        occupied.push({ x, z, r: radius });
        buildings++;
        const props = new THREE.Group();
        props.position.copy(shop.position);
        props.rotation.copy(shop.rotation);
        props.add(
          crate(-width * 0.31, 0, -depth / 2 - 0.41, 0.48, mats),
          crate(-width * 0.33, 0.48, -depth / 2 - 0.41, 0.34, mats),
          pottery(width * 0.31, 0, -depth / 2 - 0.48, 0.25, mats),
        );
        world.add(props);
        const front = new THREE.Vector3(0, 2.1, -depth / 2 - 1.2)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation)
          .add(shop.position);
        const light = new THREE.PointLight(0xffa051, 5, 7, 2);
        light.position.copy(front);
        scene.add(light);
      }
    }
    const rx = mx + normal.x * 0.67,
      rz = mz + normal.y * 0.67;
    if (length > 0.7 && i % 2 === 0 && sceneryFits(level, rx, rz, 0.45)) {
      const stone = rock(mats, i + 31, 0.42 + rng() * 0.12);
      stone.position.set(rx, -0.08, rz);
      world.add(stone);
      const plant = fern(mats, i + 81, 1.1);
      plant.position.set(rx, 0.12, rz);
      world.add(plant);
    }
    const tx = mx + normal.x * 1.5,
      tz = mz + normal.y * 1.5;
    if (
      length > 1.1 &&
      i % 5 === 0 &&
      trees < 23 &&
      sceneryFits(level, tx, tz, 0.4) &&
      !occupied.some((p) => Math.hypot(p.x - tx, p.z - tz) < p.r)
    ) {
      const plant = tree(mats, i * 53 + 2, 0.86 + rng() * 0.42, i % 3 !== 0);
      plant.position.set(tx, 0, tz);
      world.add(plant);
      trees++;
      const leaves = fallenLeaves(mats, i * 37, 65, 1.7);
      leaves.position.set(tx, 0, tz);
      world.add(leaves);
    }
  }
  // Close garden canopies frame the entry and the blue shrine turn.
  for (const [i, point] of [
    [9.8, 16.2],
    [16.6, 23.7],
    [18.1, 13.1],
  ].entries()) {
    const [x, z] = point;
    if (
      sceneryFits(level, x, z, 0.4) &&
      !occupied.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 0.7)
    ) {
      const canopy = tree(mats, 917 + i, 1.5, true);
      canopy.position.set(x, 0, z);
      world.add(canopy);
      const groundLeaves = fallenLeaves(mats, 711 + i, 160, 2.6);
      groundLeaves.position.set(x, 0, z);
      world.add(groundLeaves);
      for (let f = 0; f < 5; f++) {
        const angle = f * 2.4,
          px = x + Math.cos(angle) * 0.8,
          pz = z + Math.sin(angle) * 0.8;
        if (sceneryFits(level, px, pz, 0.35)) {
          const plant = fern(mats, 888 + f, 1.6);
          plant.position.set(px, 0, pz);
          world.add(plant);
        }
      }
    }
  }
  distantLandscape(mats, world);
  for (const [x, z] of [
    [4, 17],
    [7, 15],
    [13, 11],
    [36, 14],
    [47, 23],
  ]) {
    if (sceneryFits(level, x, z, 0.8)) {
      const stand = bamboo(mats, x * 9 + z);
      stand.position.set(x, 0, z);
      world.add(stand);
    }
  }
  // A shrine gate frames the quiet garden; its posts are outside its branch path.
  const gardenGate = gate(3.7, mats);
  gardenGate.position.set(10.82, 0, 13.3);
  gardenGate.rotation.y = -0.88;
  const posts = [
    new THREE.Vector3(-1.85, 0, 0),
    new THREE.Vector3(1.85, 0, 0),
  ].map((p) =>
    p
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), gardenGate.rotation.y)
      .add(gardenGate.position),
  );
  if (posts.every((p) => sceneryFits(level, p.x, p.z, 0.42)))
    world.add(gardenGate);
  else
    gardenGate.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  // Soft earth at the outer garden, below the paths and above the water plane.
  for (const [x, z, sx, sz] of [
    [2, 13, 6, 17],
    [14, 4, 21, 7],
    [53, 12, 7, 21],
  ])
    box(world, mats.earth, x, -0.28, z, sx, 0.38, sz);
}
