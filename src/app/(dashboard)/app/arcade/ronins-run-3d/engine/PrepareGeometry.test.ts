import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { prepareGeometry } from "./PrepareGeometry";

it.each([false, true])("prepares hidden meshes and restores state, including failed uploads (%s)", (fail) => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const hidden = new THREE.Group(), mesh = new THREE.Mesh(), reflection = new THREE.Group();
  const light = new THREE.PointLight();
  light.visible = hidden.visible = false;
  hidden.add(mesh); scene.add(hidden, reflection, light);
  const previous = new THREE.WebGLRenderTarget(8, 8);
  let temporary: THREE.WebGLRenderTarget | null = null;
  const dispose = vi.fn();
  const renderer = {
    getRenderTarget: () => previous,
    setRenderTarget: vi.fn((target) => {
      if (target !== previous) { temporary = target; target.addEventListener("dispose", dispose); }
    }),
    shadowMap: { needsUpdate: false },
    render: () => {
      expect(hidden.visible).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
      expect(light.visible).toBe(false);
      expect(reflection.visible).toBe(false);
      if (fail) throw new Error("upload failed");
    },
  };
  const prepare = () => prepareGeometry(renderer as unknown as THREE.WebGLRenderer, scene, camera, new Set([reflection]));
  if (fail) expect(prepare).toThrow("upload failed"); else prepare();
  expect(temporary).not.toBeNull();
  expect(dispose).toHaveBeenCalledOnce();
  expect(hidden.visible).toBe(false);
  expect(mesh.frustumCulled).toBe(true);
  expect(reflection.visible).toBe(true);
  expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previous);
  expect(renderer.shadowMap.needsUpdate).toBe(true);
  mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); previous.dispose();
});
