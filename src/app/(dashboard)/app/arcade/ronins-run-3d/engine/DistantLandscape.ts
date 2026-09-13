import * as THREE from "three";
import { tiledRoof } from "./Architecture";
import { box, cylinder } from "./SceneAssets";
import { randomFor } from "./GardenAssets";
import { batchScenery } from "./MeshBatch";

type Palette = Record<string, THREE.Material>;

/** Mountains and the hilltop keep are outside every playable district. */
export function distantLandscape(mats: Palette, world: THREE.Group) {
  const root = new THREE.Group();
  root.name = "distant-landscape";
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const sectors = 160, rings = 16;
  const heightAt = (angle: number, t: number) => {
    const north = Math.max(0, -Math.sin(angle));
    const peak = 6 + north * 12 + Math.pow(Math.sin(angle * 4 + 0.3), 2) * 7;
    return -0.6 + Math.sin(t * Math.PI * 0.88) * peak +
      Math.sin(angle * 19 + t * 11) * Math.sin(t * Math.PI) * 1.3;
  };
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings, radius = 43 + t * 60;
    for (let sector = 0; sector <= sectors; sector++) {
      const a = sector / sectors * Math.PI * 2;
      positions.push(27 + Math.cos(a) * radius, heightAt(a, t), 17 + Math.sin(a) * radius);
      uv.push(sector / 10, ring / 2);
      if (ring && sector < sectors) {
        const b = ring * (sectors + 1) + sector, a = b - sectors - 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  terrain.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  terrain.setIndex(indices); terrain.computeVertexNormals();
  const mountain = new THREE.Mesh(terrain, mats.earth);
  mountain.receiveShadow = true;
  root.add(mountain);

  // Fine branch cutouts on crossed cards replace the far forest's cone shapes.
  // Alpha testing writes depth without transparency sorting or live shadows.
  const rng = randomFor(8321);
  for (let i = 0; i < 240; i++) {
    const a = rng() * Math.PI * 2, t = 0.14 + rng() * 0.39;
    const radius = 43 + t * 60, x = 27 + Math.cos(a) * radius, z = 17 + Math.sin(a) * radius;
    if (Math.hypot(x - 46, z + 38) < 9) continue;
    const y = heightAt(a, t), h = 2.5 + rng() * 3.8;
    const turn = rng() * Math.PI, cell = i % 4;
    for (let card = 0; card < 3; card++) {
      const geometry = new THREE.PlaneGeometry(h, h);
      const uv = geometry.attributes.uv;
      for (let v = 0; v < uv.count; v++)
        uv.setXY(v, (uv.getX(v) + cell % 2) / 2, (uv.getY(v) + 1 - Math.floor(cell / 2)) / 2);
      const tree = new THREE.Mesh(geometry, mats.distantTree);
      tree.position.set(x, y + h / 2, z);
      tree.rotation.y = turn + card * Math.PI / 3;
      root.add(tree);
    }
  }

  const keep = new THREE.Group();
  keep.name = "hilltop-keep";
  keep.position.set(46, 12, -38);
  keep.rotation.y = -0.38;
  // Sloping stone foundations bury the keep into the ridge instead of floating.
  const foundation = cylinder(keep, mats.stone, 0, -4, 0, 7.2, 10, 8, 4);
  foundation.rotation.y = Math.PI / 4;
  for (let tier = 0; tier < 4; tier++) {
    const width = 10 - tier * 1.8, depth = 7.2 - tier * 1.1, base = tier * 3.15;
    box(keep, mats.plaster, 0, base + 1.3, 0, width, 2.6, depth);
    box(keep, mats.wood, 0, base + 0.12, 0, width + 0.2, 0.24, depth + 0.2);
    for (const side of [-1, 1]) {
      for (let x = -width / 2 + 0.5; x < width / 2; x += 0.85) {
        box(keep, mats.wood, x, base + 1.7, side * (depth / 2 + 0.03), 0.7, 1.2, 0.08);
        box(keep, mats.window, x, base + 1.7, side * (depth / 2 + 0.08), 0.43, 0.86, 0.03);
        box(keep, mats.wood, x, base + 1.7, side * (depth / 2 + 0.1), 0.04, 0.9, 0.04);
      }
      box(keep, mats.wood, side * (width / 2 - 0.12), base + 1.3, 0, 0.2, 2.6, depth + 0.1);
    }
    keep.add(tiledRoof(width, depth, base + 2.6, mats));
  }
  root.add(keep);
  // The lightweight distant forest uses broader cells than the detailed streets.
  batchScenery(root, 32);
  world.add(root);
  return root;
}
