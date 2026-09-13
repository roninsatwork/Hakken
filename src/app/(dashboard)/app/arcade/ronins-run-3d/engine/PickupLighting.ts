import * as THREE from "three";

/** Keep light topology stable: changing visibility changes Three's shader cache key. */
export class PickupLighting {
  private lights = new Map<
    THREE.Object3D,
    { light: THREE.PointLight; intensity: number }
  >();
  constructor(private scene: THREE.Scene) {}

  attach(model: THREE.Object3D, color: number) {
    const light = new THREE.PointLight(color, 3, 3.5, 2);
    light.position.copy(model.position).add(new THREE.Vector3(0, 1, 0));
    this.scene.add(light);
    this.lights.set(model, { light, intensity: light.intensity });
  }

  show(model: THREE.Object3D, visible: boolean) {
    model.visible = visible;
    const entry = this.lights.get(model);
    if (entry) entry.light.intensity = visible ? entry.intensity : 0;
  }
}
