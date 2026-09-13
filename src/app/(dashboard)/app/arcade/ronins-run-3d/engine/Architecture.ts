import * as THREE from "three";
import { beam, box, cylinder, lantern, rounded } from "./SceneAssets";

type Palette = Record<string, THREE.Material>;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Roof tiles have actual profiles and end caps, so the silhouette survives at eye level. */
export function tiledRoof(
  width: number,
  depth: number,
  height: number,
  mats: Palette,
  hipped = false,
) {
  const roof = new THREE.Group();
  const half = depth / 2 + 0.55,
    span = width + 1.05;
  const profile = (z: number, x = 0) => {
    const slope = Math.max(Math.abs(z / half), hipped ? Math.max(0, (Math.abs(x) - span * 0.23) / (span * 0.27)) : 0);
    return height + 1.05 - slope * 1.1 + Math.pow(slope, 5) * 0.32;
  };
  // Solid timber gables close the space beneath the curved tiles.
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-half, height - 0.03);
    for (let i = 0; i <= 24; i++) {
      const z = -half + (i / 24) * half * 2;
      shape.lineTo(z, profile(z, width / 2));
    }
    shape.lineTo(half, height - 0.03);
    const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape), mats.wood);
    panel.rotation.y = (side * Math.PI) / 2;
    panel.position.x = (side * width) / 2;
    roof.add(panel);
  }
  const columns = Math.ceil(span / 0.2),
    rows = 9;
  for (let col = 0; col < columns; col++) {
    const x = (col / (columns - 1) - 0.5) * span;
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 12 }, (_, i) => {
        const z = ((side * i) / 11) * half;
        return v(x, profile(z, x), z);
      });
      const tile = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          12,
          0.055,
          6,
          false,
        ),
        mats.roof,
      );
      roof.add(tile);
    }
  }
  // Broad courses beneath the raised tile joints and a rounded ridge.
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const courseColumns = hipped ? 12 : 1;
  for (let row = 0; row <= rows * 2; row++)
    for (let col = 0; col <= courseColumns; col++) {
      const z = ((row / (rows * 2)) * 2 - 1) * half;
      const x = (col / courseColumns - 0.5) * span;
      positions.push(x, profile(z, x) - 0.035, z);
      uv.push(col / courseColumns * span, row / 3);
    }
  for (let row = 0; row < rows * 2; row++)
    for (let col = 0; col < courseColumns; col++) {
      const a = row * (courseColumns + 1) + col, b = a + courseColumns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  roof.add(new THREE.Mesh(geo, mats.roof));
  beam(
    roof,
    mats.roof,
    v(-span * (hipped ? 0.23 : 0.5) - 0.12, height + 1.12, 0),
    v(span * (hipped ? 0.23 : 0.5) + 0.12, height + 1.12, 0),
    0.13,
  );
  for (const side of [-1, 1]) {
    beam(
      roof,
      mats.wood,
      v(-span / 2, height + 0.17, side * half),
      v(span / 2, height + 0.17, side * half),
      0.09,
    );
    for (let col = 0; col < columns; col++) {
      const x = (col / (columns - 1) - 0.5) * span;
      const cap = cylinder(
        roof,
        mats.roof,
        x,
        profile(half, x),
        side * (half + 0.025),
        0.074,
        0.074,
        0.055,
        12,
      );
      cap.rotation.x = Math.PI / 2;
    }
  }
  roof.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true;
  });
  return roof;
}

function banner(width: number, height: number, mat: THREE.Material) {
  const geometry = new THREE.PlaneGeometry(width, height, 10, 16);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const y = points.getY(i),
      x = points.getX(i),
      weight = 0.5 - y / height;
    points.setZ(i, Math.sin(x * 19 + y * 3) * 0.045 * weight);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function crest(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  size: number,
) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size, size * 0.065, 5, 28),
    mat,
  );
  ring.position.set(x, y, z);
  parent.add(ring);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const petal = new THREE.Mesh(new THREE.CircleGeometry(size * 0.38, 18), mat);
    petal.position.set(x + Math.sin(angle) * size * 0.35, y + Math.cos(angle) * size * 0.35, z);
    petal.rotation.y = Math.PI;
    petal.scale.set(0.62, 1, 1);
    petal.rotation.z = -angle;
    parent.add(petal);
  }
}

/** Service windows and weatherboard break up walls seen while turning corners. */
function sideFacade(width: number, height: number, upper: boolean, mats: Palette, closed: boolean) {
  const g = new THREE.Group(), w = Math.min(1.65, width * 0.56);
  for (let x = -width / 2 + 0.12; x < width / 2; x += 0.18)
    box(g, mats.wood, x, 0.61, -0.065, 0.165, 0.73, 0.08);
  const rows = upper ? [1.78, height + 0.55] : [1.78];
  for (const y of rows) {
    box(g, mats.wood, 0, y, -0.12, w + 0.2, 1.3, 0.16);
    box(g, closed ? mats.cloth : mats.window, 0, y, -0.215, w, 1.05, 0.035);
    for (let x = -w / 2; x <= w / 2; x += 0.13)
      box(g, mats.wood, x, y, -0.25, 0.025, 1.12, 0.035);
    for (const dy of [-0.56, 0, 0.56])
      box(g, mats.wood, 0, y + dy, -0.26, w + 0.14, 0.05, 0.05);
    box(g, mats.wood, 0, y - 0.62, -0.19, w + 0.3, 0.1, 0.3);
    if (closed)
      for (let board = 0; board < 3; board++)
        box(g, mats.wood, -w * 0.3 + board * w * 0.16, y, -0.29, w * 0.15, 1.16, 0.04);
  }
  return g;
}

export function townhouse(
  width: number,
  depth: number,
  height: number,
  mats: Palette,
  market = false,
  variant = 0,
) {
  const g = new THREE.Group(),
    front = -depth / 2,
    style = Math.abs(variant) % 4;
  const upper = height >= 3 && (style === 1 || style === 3);
  const roofHeight = height + (upper ? 1.55 : 0);
  box(g, mats.stone, 0, 0.12, 0, width + 0.15, 0.24, depth + 0.14);
  box(g, mats.plaster, 0, roofHeight / 2, 0, width, roofHeight, depth);
  for (const side of [-1, 1]) {
    const facade = sideFacade(depth, height, upper, mats, style === 3 && side === 1);
    facade.rotation.y = -side * Math.PI / 2;
    facade.position.x = side * width / 2;
    g.add(facade);
    for (let z = -depth / 2; z <= depth / 2; z += 0.7)
      rounded(
        g,
        mats.wood,
        side * (width / 2 + 0.025),
        roofHeight / 2,
        z,
        0.13,
        roofHeight,
        0.14,
      );
    for (const y of [0.28, 1.02, roofHeight - 0.1])
      box(g, mats.wood, (side * width) / 2, y, 0, 0.18, 0.13, depth + 0.12);
  }
  const rear = sideFacade(width, height, upper, mats, true);
  rear.rotation.y = Math.PI;
  rear.position.z = depth / 2;
  g.add(rear);
  if (upper) {
    for (const side of [-1, 1])
      box(g, mats.wood, side * width / 2, height - 0.18, 0, 0.21, 0.18, depth + 0.1);
    box(g, mats.wood, 0, height - 0.18, depth / 2, width + 0.1, 0.18, 0.21);
  }
  for (let x = -width / 2; x <= width / 2 + 0.01; x += width / 4)
    rounded(g, mats.wood, x, roofHeight / 2, front - 0.08, 0.17, roofHeight, 0.18);
  for (const y of [0.32, 1.03, 2.45, roofHeight - 0.1])
    box(g, mats.wood, 0, y, front - 0.08, width + 0.18, 0.16, 0.2);
  // Recessed timber lower panels, shoji windows and their fine lattice.
  for (let x = -width / 2 + 0.12; x < width / 2; x += 0.12)
    box(g, mats.wood, x, 0.65, front - 0.11, 0.075, 0.6, 0.035);
  for (const side of [-1, 1]) {
    const x = side * width * 0.3,
      w = width * 0.28;
    box(g, mats.wood, x, 1.73, front - 0.13, w + 0.16, 1.45, 0.16);
    box(g, mats.window, x, 1.73, front - 0.225, w, 1.24, 0.022);
    for (let dx = -w / 2; dx <= w / 2; dx += style === 2 ? 0.22 : 0.12)
      box(g, mats.wood, x + dx, 1.73, front - 0.25, 0.025, 1.28, 0.04);
    for (const y of (style === 2 ? [1.15, 1.73, 2.34] : [1.15, 1.45, 1.75, 2.05, 2.34]))
      box(g, mats.wood, x, y, front - 0.25, w, 0.025, 0.04);
    box(g, mats.wood, x, 1.09, front - 0.31, w + 0.22, 0.07, 0.31);
    if (style === 1 && side === 1) {
      // A half-lowered reed blind gives the shop a lived-in, asymmetric front.
      for (let row = 0; row < 15; row++)
        cylinder(g, mats.straw, x, 2.33 - row * 0.039, front - 0.28, 0.012, 0.012, w, 6)
          .rotation.z = Math.PI / 2;
      for (const dx of [-w * 0.32, w * 0.32])
        box(g, mats.wood, x + dx, 2.05, front - 0.3, 0.012, 0.59, 0.012);
    }
    if (style === 3 && side === -1) {
      for (let board = 0; board < 5; board++)
        box(g, mats.wood, x - w * 0.22 + board * w * 0.11, 1.75, front - 0.29,
          w * 0.10, 1.26, 0.05);
    }
  }
  box(g, mats.wood, 0, 1.12, front - 0.13, 0.92, 2.16, 0.18);
  for (let i = 0; i < 6; i++)
    box(
      g,
      mats.cloth,
      (i - 2.5) * 0.13,
      1.35,
      front - 0.25,
      0.095,
      1.42,
      0.025,
    );
  const curtainMaterial = style === 1 || style === 3 ? mats.wrap : mats.cloth;
  const panels = style === 2 ? 3 : 1;
  for (let panel = 0; panel < panels; panel++) {
    const curtain = banner(0.82 / panels - 0.015, style === 2 ? 0.5 : 0.79, curtainMaterial);
    curtain.position.set((panel - (panels - 1) / 2) * 0.82 / panels, 2.14, front - 0.42);
    g.add(curtain);
  }
  crest(g, mats.plaster, 0, 2.14, front - 0.48, style === 2 ? 0.13 : 0.22);
  if (style === 3) {
    const rope = new THREE.CatmullRomCurve3([
      v(-0.7, 2.68, front - 0.3), v(0, 2.57, front - 0.36), v(0.7, 2.68, front - 0.3),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 16, 0.025, 6, false), mats.straw));
    for (const x of [-0.42, 0, 0.42]) {
      const paper = banner(0.065, 0.17, mats.plaster);
      paper.position.set(x, 2.5, front - 0.38);
      paper.rotation.z = 0.2;
      g.add(paper);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.18);
    box(g, mats.wood, x, 2.48, front - 0.4, 0.08, 0.08, 0.7);
    beam(
      g,
      mats.wood,
      v(x, 2.1, front - 0.09),
      v(x, 2.48, front - 0.65),
      0.035,
    );
    lantern(g, x, 2.1, front - 0.66, mats.paper, mats.wood);
    box(g, mats.wood, x, 2.57, front - 0.57, 0.025, 0.27, 0.025);
  }
  if (upper) {
    const y = height + 0.56;
    for (const side of [-1, 1]) {
      const x = side * width * 0.26, w = width * 0.36;
      rounded(g, mats.wood, x, y, front - 0.09, w + 0.16, 1.2, 0.2);
      box(g, mats.window, x, y, front - 0.2, w, 1.02, 0.025);
      for (let dx = -w / 2; dx < w / 2; dx += 0.11)
        box(g, mats.wood, x + dx, y, front - 0.24, 0.033, 1.07, 0.04);
      for (const dy of [-0.5, 0.1, 0.5])
        box(g, mats.wood, x, y + dy, front - 0.24, w, 0.035, 0.04);
    }
    const eave = tiledRoof(width - 0.15, 0.15, 2.35, mats);
    eave.position.z = front + 0.05;
    g.add(eave);
    rounded(g, mats.wood, 0, height - 0.06, front - 0.15, width + 0.2, 0.18, 0.35);
    if (style === 1) {
      // A shallow upper veranda changes the building silhouette within its eave.
      box(g, mats.wood, 0, height + 0.02, front - 0.3, width * 0.86, 0.10, 0.53);
      for (let x = -width * 0.42; x <= width * 0.42; x += 0.21)
        box(g, mats.wood, x, height + 0.32, front - 0.53, 0.045, 0.56, 0.045);
      box(g, mats.wood, 0, height + 0.61, front - 0.53, width * 0.87, 0.07, 0.075);
    }
  }
  g.add(tiledRoof(width, depth, roofHeight, mats, style === 2 || style === 3));
  // Exposed supporting rafters under the overhang.
  for (let x = -width / 2; x <= width / 2; x += 0.37) {
    const rafter = rounded(
      g,
      mats.wood,
      x,
      roofHeight - 0.03,
      0,
      0.09,
      0.12,
      depth + 1.1,
    );
    rafter.rotation.x = 0.025;
  }
  if (market) {
    const sign = banner(0.43 + (style % 2) * 0.1, 0.96 + (style % 3) * 0.15, curtainMaterial);
    sign.position.set(width * 0.36, 1.78, front - 0.85);
    g.add(sign);
    crest(g, mats.plaster, width * 0.36, 2.03, front - 0.9, 0.17);
    box(g, mats.wood, 0, 0.75, front - 0.53, width * 0.62, 0.1, 0.52);
    for (const x of [-width * 0.25, width * 0.25])
      box(g, mats.wood, x, 0.38, front - 0.58, 0.1, 0.76, 0.1);
    for (let i = 0; i < 4; i++)
      g.add(
        pottery((i - 1.5) * 0.33, 0.8, front - 0.55, 0.12 + (i % 3) * 0.045, mats, (i + style) % 3),
      );
  }
  return g;
}

export function pottery(
  x: number,
  y: number,
  z: number,
  size: number,
  mats: Palette,
  variant = 0,
) {
  const profiles = [[
    [0.45, 0],
    [0.66, 0.05],
    [0.87, 0.3],
    [1, 0.7],
    [0.78, 1.1],
    [0.47, 1.32],
    [0.47, 1.46],
    [0.58, 1.48],
    [0.58, 1.58],
    [0.4, 1.58],
    [0.37, 1.3],
  ], [
    [0.48, 0], [0.75, 0.16], [0.86, 0.65], [0.72, 1.18],
    [0.3, 1.62], [0.23, 1.93], [0.3, 1.94], [0.31, 2.04], [0.2, 2.04], [0.18, 1.78],
  ], [
    [0.35, 0], [0.43, 0.04], [0.64, 0.16], [0.92, 0.46],
    [1.03, 0.63], [1.03, 0.68], [0.93, 0.66], [0.83, 0.44], [0.45, 0.15],
  ]];
  const profile = profiles[variant % 3].map(([r, h]) => new THREE.Vector2(r * size, h * size));
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 20),
    variant === 1 ? mats.stone : mats.ceramic,
  );
  pot.castShadow = true;
  g.add(pot);
  if (variant === 0)
    cylinder(g, mats.wood, 0, size * 1.3, 0, size * 0.37, size * 0.37, 0.012, 20);
  return g;
}

export function crate(
  x: number,
  y: number,
  z: number,
  size: number,
  mats: Palette,
) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  rounded(g, mats.wood, 0, size / 2, 0, size, size, size);
  for (const side of [-1, 1])
    for (const n of [-0.37, 0.37]) {
      box(
        g,
        mats.gold,
        n * size,
        size / 2,
        side * (size / 2 + 0.01),
        0.035,
        size,
        0.025,
      );
      for (let i = 0; i < 4; i++)
        box(
          g,
          mats.roof,
          0,
          ((i + 0.5) * size) / 4,
          side * (size / 2 + 0.02),
          size * 0.9,
          0.014,
          0.012,
        );
    }
  return g;
}

export function gate(width: number, mats: Palette) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    cylinder(g, mats.stone, (side * width) / 2, 0.2, 0, 0.33, 0.4, 0.4, 12);
    cylinder(g, mats.red, (side * width) / 2, 1.8, 0, 0.2, 0.25, 3.45, 16);
    for (const y of [0.5, 2.65])
      cylinder(g, mats.gold, (side * width) / 2, y, 0, 0.253, 0.253, 0.1, 16);
    for (const dz of [-0.38, 0.38])
      beam(
        g,
        mats.wood,
        v((side * width) / 2, 2.7, dz),
        v(side * (width / 2 - 0.6), 3.26, dz),
        0.07,
      );
    lantern(g, side * (width / 2 - 0.43), 2.73, 0, mats.paper, mats.wood);
  }
  rounded(g, mats.red, 0, 2.5, 0, width + 0.7, 0.19, 0.28);
  rounded(g, mats.red, 0, 3.32, 0, width + 0.95, 0.3, 0.48);
  g.add(tiledRoof(width + 0.5, 0.85, 3.47, mats));
  const plaque = rounded(g, mats.wood, 0, 3.13, -0.32, 0.48, 0.65, 0.07);
  crest(g, mats.gold, plaque.position.x, 3.13, -0.37, 0.15);
  return g;
}
