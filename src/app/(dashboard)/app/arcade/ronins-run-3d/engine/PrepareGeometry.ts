import * as THREE from "three";

/** Shader compilation alone does not upload offscreen or hidden vertex buffers.
 * Draw once into a tiny target while loading, then restore all scene state. */
export function prepareGeometry(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  excluded: ReadonlySet<THREE.Object3D> = new Set(),
) {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  const previousTarget = renderer.getRenderTarget();
  const states: { object: THREE.Object3D; visible: boolean; culled: boolean }[] = [];
  scene.traverse((object) => {
    states.push({ object, visible: object.visible, culled: object.frustumCulled });
    if (!(object instanceof THREE.Light)) object.visible = !excluded.has(object);
    object.frustumCulled = false;
  });
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  } finally {
    states.forEach(({ object, visible, culled }) => {
      object.visible = visible; object.frustumCulled = culled;
    });
    // Hidden objects were shown for upload, so bake the real world afresh.
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(previousTarget);
    target.dispose();
  }
}
