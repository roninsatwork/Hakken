import * as THREE from "three";
import { expect, it } from "vitest";
import { batchRigidMeshes, batchScenery } from "./MeshBatch";

it("keeps paper lanterns unshadowed and paving receiving shadows after batching", () => {
  const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
  for (const [cast, receive] of [[false, false], [false, true], [true, true]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    root.add(mesh);
  }
  batchScenery(root);
  expect(root.children.map((m) => [m.castShadow, m.receiveShadow])).toEqual([
    [false, false], [false, true], [true, true],
  ]);
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  material.dispose();
});

it("preserves the rendered bounds and articulated joints when batching a transformed model", () => {
  const scene = new THREE.Group(),
    model = new THREE.Group(),
    knee = new THREE.Group();
  model.position.set(9, 2, -4);
  model.rotation.y = 0.7;
  scene.add(model);
  const material = new THREE.MeshStandardMaterial();
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), material);
  hip.position.y = 1;
  model.add(hip);
  const nested = new THREE.Group();
  nested.position.set(0.2, 0.3, -0.1);
  nested.rotation.z = 0.3;
  model.add(nested);
  const detail = new THREE.Mesh(new THREE.SphereGeometry(0.1), material);
  detail.position.y = 0.3;
  nested.add(detail);
  knee.position.set(0.15, 0.6, 0);
  model.add(knee);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), material);
  shin.position.y = -0.25;
  knee.add(shin);
  const before = new THREE.Box3().setFromObject(model, true);
  batchRigidMeshes(model, new Set([knee]));
  const after = new THREE.Box3().setFromObject(model, true);
  expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
  expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
  expect(knee.parent).toBe(model);
  const footBefore = new THREE.Box3().setFromObject(knee);
  knee.rotation.x = Math.PI / 3;
  const footAfter = new THREE.Box3().setFromObject(knee);
  expect(footAfter.min.distanceTo(footBefore.min)).toBeGreaterThan(0.1);
  const bodyMeshes = model.children.filter((o) => o instanceof THREE.Mesh);
  expect(bodyMeshes).toHaveLength(1);
  expect((bodyMeshes[0] as THREE.Mesh).material).toBe(material);
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  material.dispose();
});

it("preserves static positions and vertex sharing while separating distant scenery bounds", () => {
  const root = new THREE.Group(),
    material = new THREE.MeshStandardMaterial();
  root.position.set(4, 0, 7);
  for (const x of [1, 3, 40]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    box.position.x = x;
    root.add(box);
  }
  const before = new THREE.Box3().setFromObject(root, true);
  batchScenery(root);
  const after = new THREE.Box3().setFromObject(root, true);
  expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
  expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
  expect(root.children).toHaveLength(2);
  const meshes = root.children as THREE.Mesh[];
  expect(
    meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0),
  ).toBe(72);
  expect(meshes.every((m) => m.geometry.index !== null)).toBe(true);
  meshes.forEach((m) => m.geometry.dispose());
  material.dispose();
});
