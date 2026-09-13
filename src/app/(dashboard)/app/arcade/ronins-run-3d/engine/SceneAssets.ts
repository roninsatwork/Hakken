import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// The game world's art palette is independent of dashboard theme tokens.
export const ART = {
  night: 0x142235,
  stone: 0x526478,
  wood: 0x372c2b,
  roof: 0x263c50,
  plaster: 0x9e9685,
  red: 0x943e32,
  gold: 0xc59a50,
  amber: 0xffb35a,
  jade: 0x50ffc0,
  spirit: 0x55bfff,
  cloth: 0x263545,
  skin: 0xb88b6c,
  water: 0x153e4b,
  leaf: 0x345c49,
};
export function material(color: number, emissive = 0, intensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.76,
    emissive,
    emissiveIntensity: intensity,
  });
}
export function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function rounded(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  radius = 0.035,
) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)),
    mat,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function beam(
  parent: THREE.Object3D,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  endRadius = radius,
) {
  const delta = b.clone().sub(a);
  const mesh = cylinder(
    parent,
    mat,
    (a.x + b.x) / 2,
    (a.y + b.y) / 2,
    (a.z + b.z) / 2,
    endRadius,
    radius,
    delta.length(),
    8,
  );
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return mesh;
}
export function cylinder(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  top: number,
  bottom: number,
  h: number,
  sides = 10,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, bottom, h, sides),
    mat,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
export function globe(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  radius: number,
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
export function pavement() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#26343d";
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++)
      for (let col = -1; col < 5; col++) {
        const shade = 69 + ((row * 17 + col * 13 + 80) % 23);
        ctx.fillStyle = `rgb(${shade},${shade + 10},${shade + 17})`;
        ctx.fillRect(col * 128 + (row % 2) * 64 + 2, row * 64 + 2, 123, 59);
        ctx.strokeStyle = "rgba(180,197,209,0.12)";
        ctx.strokeRect(col * 128 + (row % 2) * 64 + 4, row * 64 + 4, 118, 54);
      }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export function lantern(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  lit: THREE.Material,
  wood: THREE.Material,
) {
  // A continuous pleated paper shell avoids coplanar dark rings flickering
  // against the glowing body at a distance.
  const profile = Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    const r = 0.105 + Math.sin(t * Math.PI) * 0.09;
    return new THREE.Vector2(r + Math.cos(t * Math.PI * 48) * 0.0024, (t - 0.5) * 0.56);
  });
  const paper = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), lit);
  paper.position.set(x, y, z);
  parent.add(paper);
  paper.castShadow = paper.receiveShadow = false;
  cylinder(parent, wood, x, y + 0.29, z, 0.1, 0.13, 0.05, 12);
  cylinder(parent, wood, x, y - 0.29, z, 0.13, 0.1, 0.05, 12);
}
