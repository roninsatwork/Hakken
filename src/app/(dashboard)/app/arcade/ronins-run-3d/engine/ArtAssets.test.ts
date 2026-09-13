import * as THREE from "three";
import { expect, it } from "vitest";
import { firstPersonHands, patrolModel } from "./CharacterAssets";
import { coatPanels } from "./TailoredGeometry";
import { sculptedHand } from "./SculptedHand";
import { batchScenery } from "./MeshBatch";
import { courtyardArt } from "./CourtyardArt";
import { districtArt } from "./DistrictArt";
import { LEVELS } from "../../ronins-run/engine/Levels";

function palette() {
  return Object.fromEntries([
    "stone", "wood", "roof", "plaster", "red", "wrap", "gold", "cloth", "skin",
    "straw", "lit", "paper", "window", "jade", "spirit", "leaf", "foliage", "fern", "maple",
    "autumn", "copperLeaf", "moss", "earth", "ceramic", "leather", "fruit", "distantTree",
  ].map((key) => [key, new THREE.MeshStandardMaterial()]));
}
function inspect(root: THREE.Object3D) {
  let triangles = 0, meshes = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const geo = object.geometry;
    expect(geo.getAttribute("uv")).toBeDefined();
    for (const name of ["position", "normal"]) {
      const data = geo.getAttribute(name).array;
      // Reject invalid geometry before it reaches shader preparation or culling.
      expect(data.every(Number.isFinite), name).toBe(true);
    }
    triangles += (geo.index?.count ?? geo.attributes.position.count) / 3;
  });
  return { triangles, meshes };
}
function dispose(root: THREE.Object3D, materials: Record<string, THREE.Material>) {
  root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  Object.values(materials).forEach((m) => m.dispose());
}

it("keeps detailed articulated characters within a modest geometry budget", () => {
  const mats = palette();
  for (const kind of ["guard", "hound"] as const) {
    const model = patrolModel(kind, mats);
    const counts = inspect(model.group);
    expect(counts.triangles).toBeLessThan(35_000);
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    expect(size.y).toBeLessThan(kind === "guard" ? 2.1 : 1.4);
    expect(model.limbs).toHaveLength(4);
    const limb = model.limbs[0];
    const before = new THREE.Box3().setFromObject(limb).getCenter(new THREE.Vector3());
    limb.rotation.x = 0.5;
    const after = new THREE.Box3().setFromObject(limb).getCenter(new THREE.Vector3());
    expect(before.distanceTo(after)).toBeGreaterThan(0.03);
    dispose(model.group, {});
  }
  const hands = firstPersonHands(mats);
  expect(inspect(hands).triangles).toBeLessThan(16_000);
  dispose(hands, mats);
});

it("keeps the coat opening and a continuous shaped palm", () => {
  const mat = new THREE.MeshStandardMaterial();
  const coat = coatPanels(mat), palm = sculptedHand(mat, 1);
  expect(coat.children).toHaveLength(2);
  const size = new THREE.Box3().setFromObject(palm).getSize(new THREE.Vector3());
  expect(size.x).toBeGreaterThan(0.09);
  expect(size.x).toBeLessThan(0.18);
  expect(size.z).toBeLessThan(0.14);
  inspect(coat); inspect(palm);
  dispose(coat, {}); dispose(palm, { mat });
});

// Constructing and inspecting a complete district is an integration check;
// coverage on the two-core CI runner takes longer than the 5s unit-test default.
it.each(LEVELS)("keeps $id scenery finite and bounded after spatial batching", (level) => {
  const mats = palette(), root = new THREE.Group(), scene = new THREE.Scene();
  if (level.id === "courtyard") courtyardArt(level, mats, root, scene);
  else districtArt(level, mats, root, scene);
  const before = new THREE.Box3().setFromObject(root);
  batchScenery(root);
  const counts = inspect(root);
  const after = new THREE.Box3().setFromObject(root);
  expect(before.min.distanceTo(after.min)).toBeLessThan(0.001);
  expect(before.max.distanceTo(after.max)).toBeLessThan(0.001);
  expect(counts.triangles).toBeLessThan(1_200_000);
  expect(counts.meshes).toBeLessThan(430);
  dispose(root, mats);
}, 30_000);
