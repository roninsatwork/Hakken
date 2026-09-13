import * as THREE from "three";
import { expect, it } from "vitest";
import { distantLandscape } from "./DistantLandscape";

it("keeps the complete mountain/forest/keep outside playable ground with upward terrain faces", () => {
  const mats = Object.fromEntries(["earth", "wood", "distantTree", "stone", "plaster", "window", "roof"]
    .map((key) => [key, new THREE.MeshStandardMaterial()]));
  const root = distantLandscape(mats, new THREE.Group());
  let triangles = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      expect(Math.hypot(p.getX(i) - 27, p.getZ(i) - 17)).toBeGreaterThan(40);
    if (o.material === mats.earth) {
      const n = o.geometry.attributes.normal;
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
    }
    triangles += o.geometry.index!.count / 3;
    o.geometry.dispose();
  });
  expect(triangles).toBeLessThan(100_000);
  expect(root.children.length).toBeLessThan(65);
  Object.values(mats).forEach((m) => m.dispose());
});
