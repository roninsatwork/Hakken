import * as THREE from "three";
import { randomFor } from "./GardenAssets";

/** Small deterministic height maps for close cloth/leather; no network or runtime generation. */
export function surfaceDetail(kind: "cloth" | "leather") {
  const size = 128,
    pixels = new Uint8Array(size * size * 4),
    random = randomFor(781);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const noise = (random() - 0.5) * 40;
      const weave =
        kind === "cloth"
          ? Math.sin((x * Math.PI) / 2) * 22 + Math.cos((y * Math.PI) / 2) * 22
          : Math.sin(x * 1.7 + y * 2.3) * 9;
      const shade = Math.max(0, Math.min(255, 128 + noise + weave)),
        i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = shade;
      pixels[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(kind === "cloth" ? 4 : 2, kind === "cloth" ? 4 : 2);
  texture.needsUpdate = true;
  return texture;
}
