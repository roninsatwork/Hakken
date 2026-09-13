import * as THREE from "three";

/** Cross sections are authored in metres, from hem/wrist to shoulder/fingertips. */
type Section = readonly [y: number, halfWidth: number, halfDepth: number, offsetZ?: number];

/** Smooth the authored pattern sections; keep folds in geometry, not the texture. */
function smoothSections(sections: readonly Section[], steps: number): Section[] {
  const component = (index: number, key: number) => sections[Math.max(0, Math.min(sections.length - 1, index))][key] ?? 0;
  return Array.from({ length: steps + 1 }, (_, row) => {
    const t = row / steps * (sections.length - 1), i = Math.floor(t), f = t - i;
    return [0, 1, 2, 3].map((key) => {
      const a = component(i - 1, key), b = component(i, key), c = component(i + 1, key), d = component(i + 2, key);
      return 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    }) as unknown as Section;
  });
}

export function tailoredSurface(
  sections: readonly Section[],
  { segments = 32, folds = 0, opening = 0, square = 1 }: {
    segments?: number;
    folds?: number;
    opening?: number;
    square?: number;
  } = {},
) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row < sections.length; row++) {
    const [y, width, depth, offset = 0] = sections[row];
    const t = row / (sections.length - 1);
    for (let col = 0; col <= segments; col++) {
      const u = col / segments;
      // The opening faces the character's forward (-Z) direction.
      const angle = -Math.PI / 2 + opening / 2 + u * (Math.PI * 2 - opening);
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const fold = 1 + folds * (0.35 + 0.65 * (1 - t)) *
        (Math.sin(angle * 11 + t * 1.3) + Math.sin(angle * 19 - t * 3) * 0.3);
      positions.push(
        Math.sign(cos) * Math.pow(Math.abs(cos), square) * width * fold,
        y + folds * 0.13 * Math.sin(angle * 5) * (1 - t),
        Math.sign(sin) * Math.pow(Math.abs(sin), square) * depth * fold + offset,
      );
      uv.push(u, t);
      if (row > 0 && col < segments) {
        const a = row * (segments + 1) + col, b = a - segments - 1;
        indices.push(b, a, b + 1, b + 1, a, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function coatPanels(material: THREE.Material) {
  const group = new THREE.Group();
  const skirt = new THREE.Mesh(tailoredSurface(smoothSections([
    [0.44, 0.335, 0.205, 0.018], [0.58, 0.34, 0.225, 0.02],
    [0.75, 0.30, 0.202, 0.012], [0.91, 0.245, 0.17],
    [1.045, 0.222, 0.145],
  ], 32), { opening: 0.42, folds: 0.09, segments: 48 }), material);
  const torso = new THREE.Mesh(tailoredSurface(smoothSections([
    [1.0, 0.222, 0.148], [1.11, 0.23, 0.157], [1.28, 0.272, 0.17],
    [1.40, 0.287, 0.156], [1.47, 0.215, 0.13], [1.515, 0.098, 0.10],
  ], 28), { folds: 0.043, segments: 48 }), material);
  skirt.castShadow = torso.castShadow = true;
  group.add(skirt, torso);
  return group;
}

/** Tapered animal ribcage with tucked belly, chest and haunches in one shell. */
export function houndBody(material: THREE.Material) {
  const mesh = new THREE.Mesh(tailoredSurface(smoothSections([
    [-0.49, 0.025, 0.045, 0.055], [-0.38, 0.15, 0.17, 0.015],
    [-0.23, 0.177, 0.15, 0.025], [-0.03, 0.188, 0.195, 0],
    [0.18, 0.237, 0.25, -0.015], [0.32, 0.223, 0.262, 0.015],
    [0.43, 0.16, 0.2, 0.072], [0.5, 0.10, 0.14, 0.14],
  ], 36), { segments: 48, square: 0.8 }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.665;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A curved, overlapping shell follows the ribcage instead of a row of spheres. */
export function houndArmour(material: THREE.Material, front: number, back: number) {
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 8; row++) {
    const t = row / 8, z = front + (back - front) * t;
    const width = 0.245 - (z + 0.25) * 0.08;
    for (let col = 0; col <= 20; col++) {
      const a = -1.72 + col / 20 * 3.44;
      points.push(Math.sin(a) * width, 0.695 + Math.cos(a) * (0.23 - Math.max(0, z) * 0.15) + Math.sin(t * Math.PI) * 0.022, z);
      uv.push(col / 20, t);
      if (row && col < 20) {
        const b = row * 21 + col, a = b - 21;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export function pointedEar(material: THREE.Material, side: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.067, 0);
  shape.quadraticCurveTo(-0.08, 0.13, -0.045, 0.245);
  shape.quadraticCurveTo(0.085, 0.16, 0.073, 0.01);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, steps: 1, curveSegments: 5 });
  const ear = new THREE.Mesh(geometry, material);
  ear.position.set(side * 0.125, 1.09, -0.57);
  ear.rotation.set(-0.2, side * 0.2, -side * 0.22);
  return ear;
}

export function clothLeg(material: THREE.Material) {
  return new THREE.Mesh(tailoredSurface(smoothSections([
    [-0.34, 0.072, 0.078, 0.01], [-0.28, 0.096, 0.09],
    [-0.12, 0.113, 0.111], [0.025, 0.096, 0.105],
  ], 16), { folds: 0.065, segments: 24 }), material);
}

export function guardBoot(material: THREE.Material) {
  const mesh = new THREE.Mesh(tailoredSurface(smoothSections([
    [-0.075, 0.028, 0.045, 0.018], [-0.045, 0.063, 0.075, 0.022],
    [0.035, 0.071, 0.069, 0.014], [0.12, 0.079, 0.046, -0.009],
    [0.205, 0.051, 0.033, -0.007], [0.224, 0.011, 0.012, -0.002],
  ], 20), { segments: 24, square: 0.77 }), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Skin is a narrow surface around the eye sockets, flush with the wrapped hood. */
export function guardEyes(material: THREE.Material) {
  const p: number[] = [], uv: number[] = [], index: number[] = [];
  for (let row = 0; row <= 3; row++) for (let col = 0; col <= 20; col++) {
    const x = (col / 20 - 0.5) * 0.225;
    const y = 1.703 + (row / 3 - 0.5) * 0.033;
    const z = -0.158 * Math.sqrt(Math.max(0, 1 - (x / 0.168) ** 2 - ((y - 1.67) / 0.22) ** 2)) - 0.006;
    p.push(x, y, z); uv.push(col / 20, row / 3);
    if (row && col < 20) { const b = row * 21 + col, a = b - 21; index.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export function sleeve(material: THREE.Material, length = 0.46) {
  const sections: Section[] = Array.from({ length: 18 }, (_, i) => {
    const t = i / 17;
    const width = 0.092 - t * 0.041 + Math.sin(t * 23) * 0.004 * Math.sin(t * Math.PI);
    return [(t - 0.5) * length, width, width * 0.79, Math.sin(t * Math.PI) * 0.012];
  });
  return new THREE.Mesh(tailoredSurface(sections, { folds: 0.035 }), material);
}

/** Shaped muzzle shell: brow, cheek, bridge and tapered nose in one surface. */
export function houndMask(material: THREE.Material) {
  const mesh = new THREE.Mesh(tailoredSurface([
    [-0.16, 0.11, 0.10], [-0.1, 0.175, 0.155],
    [0, 0.168, 0.15], [0.12, 0.118, 0.097, -0.016],
    [0.29, 0.075, 0.067, -0.03], [0.31, 0.065, 0.05, -0.025],
  ], { square: 0.7, segments: 24 }), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.98, -0.63);
  return mesh;
}
