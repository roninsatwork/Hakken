import * as THREE from "three";
import { beam, cylinder } from "./SceneAssets";

type Palette = Record<string, THREE.Material>;
export function randomFor(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) | 0;
    return (value >>> 0) / 4294967296;
  };
}

function leafGeometry(maple: boolean) {
  // Curved cutout cards retain the photographed veins and serrated silhouette.
  const geometry = new THREE.PlaneGeometry(maple ? 1 : 1.3, 1, 1, 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), y = points.getY(i);
    points.setZ(i, x * x * 0.3 + Math.sin((y + 0.5) * Math.PI) * 0.06);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Branches and individual shaped leaves replace the old spherical tree crowns. */
export function tree(mats: Palette, seed: number, scale = 1, maple = true) {
  const g = new THREE.Group(),
    rng = randomFor(seed);
  const leaf = leafGeometry(maple),
    colors = maple
      ? [mats.maple, mats.autumn, mats.copperLeaf]
      : [mats.foliage, mats.foliage];
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.11, 0.85, -0.08),
    new THREE.Vector3(-0.04, 1.65, 0.09), new THREE.Vector3(0.19, 2.5, 0),
    new THREE.Vector3(0.06, 3.15, -0.06),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunk, 24, 0.16, 8, false);
  const tp = trunkGeo.attributes.position;
  for (let row = 0; row <= 24; row++) {
    const center = trunk.getPointAt(row / 24), taper = 1 - row / 24 * 0.82;
    for (let column = 0; column <= 8; column++) {
      const i = row * 9 + column;
      tp.setX(i, center.x + (tp.getX(i) - center.x) * taper);
      tp.setZ(i, center.z + (tp.getZ(i) - center.z) * taper);
    }
  }
  trunkGeo.computeVertexNormals();
  const trunkMesh = new THREE.Mesh(trunkGeo, mats.wood);
  trunkMesh.castShadow = trunkMesh.receiveShadow = true;
  g.add(trunkMesh);
  for (let b = 0; b < 8; b++) {
    const angle = b * 2.4 + (rng() - 0.5) * 0.8,
      height = 2.3 + b * 0.12 + rng() * 0.3,
      radius = 1.3 + rng() * 0.8;
    const tip = new THREE.Vector3(
      Math.cos(angle) * radius,
      height + 0.7,
      Math.sin(angle) * radius,
    );
    const joint = new THREE.Vector3(
      Math.sin(b) * 0.17,
      1.25 + b * 0.19,
      Math.cos(b) * 0.14,
    );
    const branchCurve = new THREE.CatmullRomCurve3([
      joint, joint.clone().lerp(tip, 0.48).add(new THREE.Vector3(0, 0.2, 0)), tip,
    ]);
    const branch = new THREE.Mesh(new THREE.TubeGeometry(branchCurve, 10, 0.033, 6, false), mats.wood);
    branch.castShadow = branch.receiveShadow = true;
    g.add(branch);
    for (let j = 0; j < 240; j++) {
      const a = rng() * Math.PI * 2,
        r = Math.sqrt(rng()) * (0.63 + (j % 3) * 0.17);
      const cluster = joint.clone().lerp(tip, 0.53 + (j % 3) * 0.235);
      const x = cluster.x + Math.cos(a) * r,
        y = cluster.y + (1 - r * r) * 0.35 + (rng() - 0.5) * 0.64,
        z = cluster.z + Math.sin(a) * r;
      const mesh = new THREE.Mesh(leaf.clone(), colors[j % colors.length]);
      mesh.position.set(x, y, z);
      mesh.rotation.set(-0.9 + rng() * 2.8, rng() * Math.PI * 2, rng() * 6);
      mesh.scale.setScalar(0.2 + rng() * 0.14);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      if (j % 16 === 0)
        beam(g, mats.wood, cluster, new THREE.Vector3(x, y, z), 0.009, 0.002);
    }
  }
  leaf.dispose();
  g.scale.setScalar(scale);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

export function fern(mats: Palette, seed: number, scale = 1) {
  const g = new THREE.Group(), rng = randomFor(seed);
  for (let frond = 0; frond < 9; frond++) {
    const angle = frond * 2.4, length = 0.65 + rng() * 0.4;
    const geometry = new THREE.PlaneGeometry(0.5, length, 2, 8);
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const t = points.getY(i) / length + 0.5;
      points.setXYZ(i, points.getX(i), Math.sin(t * Math.PI * 0.85) * length * 0.63,
        t * length * 0.86);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mats.fern);
    mesh.rotation.y = angle;
    mesh.position.y = 0.04;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.scale.setScalar(scale);
  return g;
}

export function bamboo(mats: Palette, seed: number) {
  const g = new THREE.Group(),
    rng = randomFor(seed),
    leaf = leafGeometry(false);
  for (let i = 0; i < 8; i++) {
    const x = (rng() - 0.5) * 1.4,
      z = (rng() - 0.5) * 1.4,
      h = 3 + rng() * 2;
    cylinder(g, mats.leaf, x, h / 2, z, 0.045, 0.075, h, 8);
    for (let y = 0.35; y < h; y += 0.48) {
      cylinder(g, mats.moss, x, y, z, 0.077, 0.077, 0.035, 8);
      if (y < 1.8) continue;
      const angle = rng() * 6;
      const end = new THREE.Vector3(
        x + Math.cos(angle) * 0.8,
        y + 0.15,
        z + Math.sin(angle) * 0.8,
      );
      beam(g, mats.leaf, new THREE.Vector3(x, y, z), end, 0.015, 0.003);
      for (let j = 0; j < 9; j++) {
        const l = new THREE.Mesh(leaf.clone(), mats.foliage);
        l.position.copy(end);
        l.position.x += (rng() - 0.5) * 0.8;
        l.position.z += (rng() - 0.5) * 0.8;
        l.rotation.set(rng() * 2, rng() * 6, rng() * 2);
        l.scale.set(0.17, 0.45, 0.2);
        l.castShadow = l.receiveShadow = true;
        g.add(l);
      }
    }
  }
  leaf.dispose();
  return g;
}

export function rock(mats: Palette, seed: number, size: number) {
  const rng = randomFor(seed),
    geometry = new THREE.IcosahedronGeometry(size, 1),
    points = geometry.attributes.position;
  // Position-derived displacement keeps duplicated face vertices joined.
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      y = points.getY(i),
      z = points.getZ(i);
    const warp = 1 + Math.sin(x * 12 + y * 7 + z * 5 + seed) * 0.12;
    points.setXYZ(i, x * warp, y * 0.68 * warp, z * 0.86 * warp);
  }
  geometry.computeVertexNormals();
  const g = new THREE.Group(),
    base = new THREE.Mesh(geometry, mats.stone);
  base.position.y = size * 0.28;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const moss = new THREE.Mesh(geometry.clone(), mats.moss);
  moss.position.set(0.03, size * 0.35, 0.01);
  moss.scale.set(0.86, 0.78, 0.91);
  moss.castShadow = moss.receiveShadow = true;
  g.add(moss);
  g.rotation.y = rng() * 6;
  return g;
}

export function fallenLeaves(
  mats: Palette,
  seed: number,
  count: number,
  radius: number,
) {
  const g = new THREE.Group(),
    rng = randomFor(seed),
    geo = leafGeometry(true);
  for (let i = 0; i < count; i++) {
    const l = new THREE.Mesh(geo.clone(), i % 2 ? mats.autumn : mats.maple);
    const angle = rng() * 6.28,
      r = Math.sqrt(rng()) * radius;
    l.position.set(
      Math.cos(angle) * r,
      0.021 + (i % 3) * 0.002,
      Math.sin(angle) * r,
    );
    l.rotation.set(-Math.PI / 2, 0, rng() * 6);
    l.scale.setScalar(0.1 + rng() * 0.12);
    g.add(l);
  }
  geo.dispose();
  return g;
}
