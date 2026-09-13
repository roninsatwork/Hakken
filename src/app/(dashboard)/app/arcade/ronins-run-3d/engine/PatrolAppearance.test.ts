import * as THREE from "three";
import { expect, it } from "vitest";
import { PatrolAppearance } from "./PatrolAppearance";

it("turns patrols blue while preserving the scenery and compiled material configuration", () => {
  const base = { cloth: new THREE.MeshStandardMaterial({ color: 0x223344 }) };
  const appearance = new PatrolAppearance(base);
  const mat = appearance.materials.cloth,
    version = mat.version,
    original = base.cloth.color.clone();
  appearance.update(true);
  expect(mat.color.equals(original)).toBe(false);
  expect(base.cloth.color.equals(original)).toBe(true);
  expect(mat.emissiveIntensity).toBeGreaterThan(0);
  appearance.update(false);
  expect(mat.color.equals(original)).toBe(true);
  expect(mat.version).toBe(version);
  expect(mat.uuid).not.toBe(base.cloth.uuid);
  appearance.dispose();
  base.cloth.dispose();
});
