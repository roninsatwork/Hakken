import * as THREE from "three";

/** Keep shader light count fixed while choosing nearby decorative lamps.
 * Pickups and the player light are separate, so power/contact feedback never drops out.
 */
export class LanternLighting {
  private slots: THREE.PointLight[];
  private sources: THREE.PointLight[];
  private ranked: { source: THREE.PointLight; distance: number }[];
  constructor(scene: THREE.Scene, capacity = 8) {
    this.sources = scene.children.filter(
      (o): o is THREE.PointLight => o instanceof THREE.PointLight,
    );
    this.sources.forEach((light) => light.removeFromParent());
    this.ranked = this.sources.map((source) => ({ source, distance: 0 }));
    this.slots = Array.from(
      { length: Math.min(capacity, this.sources.length) },
      () => {
        const light = new THREE.PointLight(0xffa35b, 0, 7, 2);
        scene.add(light);
        return light;
      },
    );
  }
  update(position: THREE.Vector3) {
    this.ranked.forEach((entry) => {
      entry.distance = entry.source.position.distanceToSquared(position);
    });
    this.ranked.sort((a, b) => a.distance - b.distance);
    this.slots.forEach((light, i) => {
      const { source, distance } = this.ranked[i];
      light.position.copy(source.position);
      light.color.copy(source.color);
      light.distance = source.distance;
      light.decay = source.decay;
      // The fade reaches zero before selection changes can become conspicuous.
      light.intensity =
        source.intensity *
        THREE.MathUtils.smoothstep(22 - Math.sqrt(distance), 0, 8);
    });
  }
}
