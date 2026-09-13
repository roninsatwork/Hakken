import * as THREE from "three";

/** Isolated uniforms make the entire patrol visibly vulnerable without touching scenery. */
export class PatrolAppearance {
  readonly materials: Record<string, THREE.MeshStandardMaterial>;
  private powered: boolean | undefined;
  constructor(private base: Record<string, THREE.MeshStandardMaterial>) {
    this.materials = Object.fromEntries(
      Object.entries(base).map(([key, mat]) => [key, mat.clone()]),
    );
  }
  prepare() {
    Object.entries(this.materials).forEach(([key, mat]) =>
      mat.copy(this.base[key]),
    );
    this.powered = undefined;
  }
  update(powered: boolean) {
    if (this.powered === powered) return;
    this.powered = powered;
    const blue = new THREE.Color(0x319bff);
    Object.entries(this.materials).forEach(([key, mat]) => {
      const original = this.base[key];
      mat.color.copy(original.color);
      mat.emissive.copy(original.emissive);
      mat.emissiveIntensity = original.emissiveIntensity;
      if (powered && key !== "lit" && key !== "paper") {
        mat.color.lerp(blue, 0.68);
        mat.emissive.copy(blue);
        mat.emissiveIntensity = 0.38;
      }
    });
  }
  dispose() {
    Object.values(this.materials).forEach((mat) => mat.dispose());
  }
}
