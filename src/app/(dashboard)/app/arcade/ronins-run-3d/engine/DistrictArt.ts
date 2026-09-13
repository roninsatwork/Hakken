import { distantLandscape } from "./DistantLandscape";
import * as THREE from "three";
import type { LevelDefinition } from "../../ronins-run/engine/Levels";
import { boundarySegments, toWorld } from "./WorldLayout";
import { districtDressing } from "./DistrictDressing";
import { box, beam, cylinder, globe, lantern, rounded } from "./SceneAssets";
import { crate, pottery, tiledRoof, townhouse } from "./Architecture";
import { bamboo, fallenLeaves, fern, rock, tree } from "./GardenAssets";

type Palette = Record<string, THREE.Material>;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function marketStall(mats: Palette, seed: number) {
  const g = new THREE.Group();
  for (const x of [-1.08, 1.08])
    for (const z of [-0.74, 0.74]) {
      cylinder(g, mats.wood, x, 1.22, z, 0.046, 0.065, 2.44, 10);
      box(g, mats.wood, x, 0.45, z, 0.1, 0.9, 0.1);
    }
  rounded(g, mats.wood, 0, 0.87, -0.18, 2.3, 0.12, 1.3);
  for (let i = 0; i < 9; i++)
    box(g, mats.wood, (i - 4) * 0.255, 0.46, -0.8, 0.23, 0.76, 0.045);
  const canopy = new THREE.PlaneGeometry(2.64, 2.0, 24, 8);
  const positions = canopy.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i);
    positions.setXYZ(
      i,
      x,
      2.45 - Math.abs(y) * 0.14 + Math.cos(x * 16) * 0.024,
      y,
    );
  }
  canopy.computeVertexNormals();
  g.add(new THREE.Mesh(canopy, seed % 2 ? mats.wrap : mats.cloth));
  for (const x of [-1.04, 1.04]) lantern(g, x, 2.0, -0.79, mats.paper, mats.wood);
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.5;
    g.add(crate(x, 0.94, -0.28, 0.42, mats));
    for (let f = 0; f < 7; f++) {
      const fruit = globe(
        g,
        f % 2 ? mats.fruit : mats.moss,
        x + Math.sin(f * 2.4) * 0.12,
        1.38 + (f % 2) * 0.04,
        -0.28 + Math.cos(f * 2.4) * 0.1,
        0.065,
      );
      fruit.scale.y = 0.85;
    }
  }
  g.add(pottery(0.83, 0, 0.48, 0.29, mats));
  return g;
}

function cargoBoat(mats: Palette) {
  const g = new THREE.Group();
  // A shaped, hollow hull with overlapping plank courses, stern and curved bow.
  const outline = [
    [-0.64, -1.8],
    [-0.83, -1.1],
    [-0.83, 1.1],
    [-0.56, 2.1],
    [0, 2.5],
    [0.56, 2.1],
    [0.83, 1.1],
    [0.83, -1.1],
    [0.64, -1.8],
  ];
  for (let course = 0; course < 5; course++) {
    const scale = 0.75 + course * 0.055;
    const curve = new THREE.CatmullRomCurve3(
      outline.map(([x, z]) =>
        v(
          x * scale,
          0.07 + course * 0.095 + (z > 1.5 ? (z - 1.5) * 0.3 : 0),
          z * scale,
        ),
      ),
      true,
      "centripetal",
    );
    g.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 60, 0.065, 6, true),
        mats.wood,
      ),
    );
  }
  for (let z = -1.5; z < 1.7; z += 0.18)
    box(g, mats.wood, 0, 0.18, z, 1.15, 0.08, 0.16);
  for (const z of [-1.1, 1.0])
    rounded(g, mats.wood, 0, 0.52, z, 1.5, 0.13, 0.25);
  cylinder(g, mats.wood, 0, 2.05, 0.38, 0.042, 0.075, 3.9, 12);
  beam(g, mats.wood, v(-0.9, 3.05, 0.38), v(0.9, 3.05, 0.38), 0.035);
  for (const side of [-1, 1]) {
    beam(g, mats.straw, v(0, 3.85, 0.38), v(side * 0.7, 0.5, -1.3), 0.009);
    beam(g, mats.straw, v(0, 3.85, 0.38), v(side * 0.6, 0.5, 1.6), 0.009);
  }
  // Furled sail is intentionally narrow: no large flat billboard hides navigation.
  cylinder(g, mats.plaster, 0, 2.53, 0.43, 0.12, 0.16, 1.25, 12);
  g.add(
    crate(-0.28, 0.24, -0.6, 0.55, mats),
    crate(0.3, 0.24, 0.83, 0.44, mats),
  );
  lantern(g, -0.51, 0.94, 1.31, mats.paper, mats.wood);
  return g;
}

function shrine(mats: Palette) {
  const g = new THREE.Group();
  box(g, mats.stone, 0, 0.18, 0, 2.4, 0.36, 2.4);
  for (const x of [-0.8, 0.8])
    for (const z of [-0.8, 0.8])
      cylinder(g, mats.red, x, 1.35, z, 0.08, 0.11, 2.4, 12);
  g.add(tiledRoof(2.1, 2.1, 2.55, mats));
  box(g, mats.wood, 0, 0.7, 0.1, 1.4, 0.16, 1.0);
  g.add(
    pottery(-0.33, 0.78, 0.1, 0.22, mats),
    pottery(0.33, 0.78, 0.1, 0.22, mats),
  );
  lantern(g, 0, 2.08, 0, mats.paper, mats.wood);
  return g;
}

export function districtArt(
  level: LevelDefinition,
  mats: Palette,
  world: THREE.Group,
  scene: THREE.Scene,
) {
  const docks = level.id === "docks",
    gardens = level.id === "gardens";
  const borders = boundarySegments(level);
  for (const [i, edge] of borders.entries()) {
    const a = toWorld(edge.a),
      b = toWorld(edge.b),
      length = Math.hypot(a.x - b.x, a.z - b.z);
    const g = new THREE.Group();
    g.position.set(
      (a.x + b.x) / 2 + edge.outward.x * 0.13,
      0,
      (a.z + b.z) / 2 + edge.outward.y * 0.13,
    );
    g.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    rounded(g, mats.stone, 0, -0.05, 0, length + 0.04, 0.3, 0.28);
    const count = Math.max(1, Math.ceil(length / (docks ? 2.3 : 1.5)));
    for (let n = 0; n <= count; n++) {
      const x = -length / 2 + (n / count) * length;
      if (docks) {
        cylinder(g, mats.wood, x, 0.4, 0, 0.085, 0.11, 1.25, 12);
        cylinder(g, mats.straw, x, 0.73, 0, 0.11, 0.11, 0.13, 12);
        if (n < count) {
          const end = -length / 2 + ((n + 1) / count) * length;
          const rope = new THREE.CatmullRomCurve3([
            v(x, 0.74, 0),
            v((x + end) / 2, 0.55, 0),
            v(end, 0.74, 0),
          ]);
          g.add(
            new THREE.Mesh(
              new THREE.TubeGeometry(rope, 8, 0.022, 6, false),
              mats.straw,
            ),
          );
        }
      } else {
        rounded(
          g,
          mats.stone,
          x,
          0.22,
          0,
          Math.min(length / count, 1.5),
          0.3,
          0.31,
          0.035,
        );
        if (gardens)
          box(
            g,
            mats.roof,
            x,
            0.4,
            0,
            Math.min(length / count, 1.5),
            0.06,
            0.35,
          );
      }
    }
    if (length > 1.5 && i % 3 === 0) {
      cylinder(g, mats.wood, 0, 1.25, 0.24, 0.045, 0.07, 2.5, 12);
      lantern(g, 0, 2.12, 0.12, mats.paper, mats.wood);
      const lamp = new THREE.PointLight(0xffa35b, 6, 7, 2);
      lamp.position.copy(
        v(0, 2.12, 0.12)
          .applyAxisAngle(v(0, 1, 0), g.rotation.y)
          .add(g.position),
      );
      scene.add(lamp);
    }
    world.add(g);
  }
  for (const item of districtDressing(level)) {
    let model: THREE.Group;
    switch (item.kind) {
      case "shop":
      case "warehouse":
        model = townhouse(
          item.width - 1.15,
          item.depth - 1.75,
          item.kind === "warehouse" ? 4.4 : 3.1 + (item.seed % 3) * 0.45,
          mats,
          item.kind === "shop",
          item.seed,
        );
        break;
      case "stall":
        model = marketStall(mats, item.seed);
        break;
      case "boat":
        model = cargoBoat(mats);
        break;
      case "shrine":
        model = shrine(mats);
        break;
      case "bamboo":
        model = bamboo(mats, item.seed);
        break;
      case "tree":
        model = tree(
          mats,
          item.seed,
          gardens ? 1.13 : 0.95,
          item.seed % 3 !== 0,
        );
        break;
      case "rock":
        model = rock(mats, item.seed, 0.43);
        model.add(fern(mats, item.seed, 0.8));
        break;
    }
    model.position.set(item.x, item.kind === "boat" ? -0.23 : 0, item.z);
    model.rotation.y = item.rotation;
    world.add(model);
    if (item.kind === "tree") {
      const leaves = fallenLeaves(mats, item.seed, 50, 1.5);
      leaves.position.set(item.x, 0, item.z);
      world.add(leaves);
    }
  }
  // Land above the water under the market and garden beds; paths stay at exactly y=0.
  if (!docks) box(world, mats.earth, 27, -0.3, 17, 78, 0.34, 58);
  distantLandscape(mats, world);
}
