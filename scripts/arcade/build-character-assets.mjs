// Original, offline-authored game mesh. No marching-cubes work runs during play.
import fs from 'node:fs';
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const min = [-0.12, -0.135, -0.125], span = [0.22, 0.37, 0.18];
const resolution = 36;
const surface = new MarchingCubes(resolution, new THREE.MeshStandardMaterial(), false, false, 30000);
surface.isolation = 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothMin = (a, b, k) => {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
};
function ellipsoid(p, center, radii) {
  const q = p.map((v, i) => (v - center[i]) / radii[i]);
  const k0 = Math.hypot(...q), k1 = Math.hypot(...q.map((v, i) => v / radii[i]));
  return k0 * (k0 - 1) / Math.max(1e-8, k1);
}
function capsule(p, a, b, r0, r1) {
  const pa = p.map((v, i) => v - a[i]), ba = b.map((v, i) => v - a[i]);
  const t = clamp(pa.reduce((s, v, i) => s + v * ba[i], 0) / ba.reduce((s, v) => s + v * v, 0), 0, 1);
  return Math.hypot(...pa.map((v, i) => v - ba[i] * t)) - (r0 + (r1 - r0) * t);
}
// Five articulated, differently sized digits. Curves continue into the palm,
// with a thenar pad and webbing instead of separate tubes attached to a mitten.
const digits = [];
for (let finger = 0; finger < 4; finger++) {
  const x = (finger - 1.5) * 0.026;
  const length = [0.092, 0.103, 0.092, 0.075][finger];
  const splay = (finger - 1.1) * 0.011;
  const curl = [0.048, 0.062, 0.066, 0.06][finger];
  digits.push([
    [[x, 0.041, 0], [x + splay * 0.25, 0.09, -0.001], 0.0158, 0.0142],
    [[x + splay * 0.25, 0.09, -0.001], [x + splay * 0.7, 0.09 + length * 0.47, -0.018], 0.0142, 0.0125],
    [[x + splay * 0.7, 0.09 + length * 0.47, -0.018], [x + splay, 0.09 + length * 0.72, -curl], 0.0125, 0.0108],
    [[x + splay, 0.09 + length * 0.72, -curl], [x + splay, 0.09 + length * 0.58, -curl - 0.024], 0.0108, 0.0092],
  ]);
}
digits.push([
  [[-0.026, -0.014, -0.011], [-0.059, 0.016, -0.018], 0.024, 0.019],
  [[-0.059, 0.016, -0.018], [-0.085, 0.05, -0.037], 0.019, 0.0158],
  [[-0.085, 0.05, -0.037], [-0.08, 0.085, -0.063], 0.0158, 0.0128],
]);
function distance(p) {
  let d = ellipsoid(p, [0.003, 0.013, -0.002], [0.053, 0.080, 0.025]);
  d = smoothMin(d, capsule(p, [0, -0.078, 0], [0.002, -0.026, 0], 0.031, 0.034), 0.013);
  d = smoothMin(d, ellipsoid(p, [-0.025, -0.003, -0.018], [0.024, 0.044, 0.024]), 0.01);
  for (const digit of digits) for (const [a, b, r0, r1] of digit)
    d = smoothMin(d, capsule(p, a, b, r0, r1), 0.0055);
  // Subtle leather compression folds across the palm and knuckle line.
  const back = clamp((p[2] + 0.004) / 0.028, 0, 1);
  const fold = Math.exp(-Math.pow((p[1] - 0.054) / 0.027, 2));
  return d + Math.sin(p[1] * 490 + p[0] * 40) * 0.0005 * back * fold;
}
for (let z = 0; z < resolution; z++) for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
  const p = [x, y, z].map((v, i) => min[i] + v / resolution * span[i]);
  surface.field[x + y * resolution + z * resolution * resolution] = -distance(p);
}
surface.update();
const geo = new THREE.BufferGeometry();
const source = surface.geometry.attributes.position;
const positions = [], uvs = [];
for (let i = 0; i < surface.count; i++) {
  const p = [source.getX(i), source.getY(i), source.getZ(i)].map((v, axis) => min[axis] + (v + 1) / 2 * span[axis]);
  positions.push(...p); uvs.push((p[0] + 0.12) * 4, (p[1] + 0.115) * 4);
}
geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
const welded = mergeVertices(geo, 0.00001);
welded.computeVertexNormals();
const output = {
  position: Array.from(welded.attributes.position.array, v => +v.toFixed(6)),
  normal: Array.from(welded.attributes.normal.array, v => +v.toFixed(5)),
  uv: Array.from(welded.attributes.uv.array, v => +v.toFixed(5)),
  index: Array.from(welded.index.array),
};
fs.writeFileSync('src/app/(dashboard)/app/arcade/ronins-run-3d/engine/assets/ronin-hand-v2.json', JSON.stringify(output));
console.log({ triangles: output.index.length / 3, vertices: output.position.length / 3 });
surface.geometry.dispose(); surface.material.dispose(); geo.dispose(); welded.dispose();
