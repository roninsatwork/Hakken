import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function indexedCopy(geometry: THREE.BufferGeometry) {
  const copy = geometry.clone();
  if (!copy.index)
    copy.setIndex(
      Array.from({ length: copy.attributes.position.count }, (_, i) => i),
    );
  return copy;
}

/** Keep vertex sharing and spatial bounds so looking away can cull distant streets. */
export function batchScenery(root: THREE.Group, cellSize = 12) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<
    string,
    { material: THREE.Material; geometries: THREE.BufferGeometry[]; cast: boolean; receive: boolean }
  >();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const geo = indexedCopy(object.geometry);
    geo.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
    );
    geo.computeBoundingBox();
    const center = geo.boundingBox!.getCenter(new THREE.Vector3());
    const key = `${object.material.uuid}:${Math.floor(center.x / cellSize)}:${Math.floor(center.z / cellSize)}:${object.castShadow}:${object.receiveShadow}`;
    const batch = batches.get(key) ?? {
      material: object.material,
      geometries: [] as THREE.BufferGeometry[],
      cast: object.castShadow, receive: object.receiveShadow,
    };
    batch.geometries.push(geo);
    batches.set(key, batch);
    object.geometry.dispose();
  });
  root.clear();
  batches.forEach(({ material, geometries, cast, receive }) => {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) throw new Error("Incompatible static scenery geometry");
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
  });
}

/** Merge rigid details by material while leaving explicitly articulated groups movable. */
export function batchRigidMeshes(
  root: THREE.Group,
  joints: ReadonlySet<THREE.Object3D> = new Set(),
) {
  root.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const visit = (object: THREE.Object3D) => {
    if (joints.has(object) && object instanceof THREE.Group) {
      batchRigidMeshes(object, joints);
      return;
    }
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      const geo = indexedCopy(object.geometry);
      geo.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
      );
      const items = batches.get(object.material) ?? [];
      items.push(geo);
      batches.set(object.material, items);
      object.geometry.dispose();
      object.removeFromParent();
    } else for (const child of [...object.children]) visit(child);
  };
  for (const child of [...root.children]) visit(child);
  batches.forEach((geometries, material) => {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) throw new Error("Incompatible rigid scenery geometry");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  });
}
