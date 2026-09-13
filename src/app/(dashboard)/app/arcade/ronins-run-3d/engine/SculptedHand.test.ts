import * as THREE from "three";
import { expect, it } from "vitest";
import { sculptedHand } from "./SculptedHand";

it("uploads a closed, outward-facing hand with correctly mirrored winding", () => {
  const mat = new THREE.MeshStandardMaterial();
  for (const side of [-1, 1]) {
    const mesh = sculptedHand(mat, side);
    const { geometry } = mesh, p = geometry.attributes.position;
    const edges = new Map<string, number>();
    let volume = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ids = geometry.index!.array;
    for (let i = 0; i < ids.length; i += 3) {
      const face = [ids[i], ids[i + 1], ids[i + 2]];
      a.fromBufferAttribute(p, face[0]); b.fromBufferAttribute(p, face[1]); c.fromBufferAttribute(p, face[2]);
      volume += a.dot(b.cross(c)) / 6;
      for (let e = 0; e < 3; e++) {
        const pair = [face[e], face[(e + 1) % 3]].sort((x, y) => x - y).join(":");
        edges.set(pair, (edges.get(pair) ?? 0) + 1);
      }
    }
    expect(volume).toBeGreaterThan(0.0003);
    expect(volume).toBeLessThan(0.0015);
    expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
    expect(p.count).toBeLessThan(3_200);
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.25);
    geometry.dispose();
  }
  mat.dispose();
});
