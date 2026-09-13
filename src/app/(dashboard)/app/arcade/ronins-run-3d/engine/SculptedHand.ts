import * as THREE from "three";
import sculpt from "./assets/ronin-hand-v2.json";

/** Offline sculpt, shared by both hands. Only buffer upload happens at load time. */
export function sculptedHand(material: THREE.Material, side: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(sculpt.position);
  const normals = new Float32Array(sculpt.normal);
  const indices = [...sculpt.index];
  if (side < 0) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] *= -1;
      normals[i] *= -1;
    }
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(sculpt.uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "sculpted-leather-hand";
  return mesh;
}
