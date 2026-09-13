import * as THREE from "three";
import { randomFor } from "./GardenAssets";

const EXTENT = 80, OFFSET = 12;
export const groundOcclusionUV = (x: number, z: number) => [(x + OFFSET) / EXTENT, (z + OFFSET) / EXTENT];

/** Bake contact shade once. No extra camera, shadow pass or work during play. */
export function groundContactMap(root: THREE.Object3D) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1024, 1024);
  const bounds = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    bounds.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld);
    if (bounds.min.y > 0.22 || bounds.max.y < 0.34 || bounds.max.y - bounds.min.y < 0.25) return;
    const x = (bounds.min.x + bounds.max.x) / 2, z = (bounds.min.z + bounds.max.z) / 2;
    if (x < -4 || x > 65 || z < -4 || z > 48) return;
    const rx = Math.max(0.15, (bounds.max.x - bounds.min.x) / 2 + 0.28);
    const rz = Math.max(0.15, (bounds.max.z - bounds.min.z) / 2 + 0.28);
    const [u, v] = groundOcclusionUV(x, z);
    ctx.save(); ctx.translate(u * 1024, (1 - v) * 1024);
    ctx.scale(rx / EXTENT * 1024, rz / EXTENT * 1024);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, "rgba(0,0,0,0.64)");
    gradient.addColorStop(0.64, "rgba(0,0,0,0.3)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.channel = 1;
  return texture;
}

/** Fine roughness variation gives stone grain a different response from wet joints. */
export function stoneRoughness(source: THREE.Texture) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source.image as CanvasImageSource, 0, 0, 512, 512);
  const pixels = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const light = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 765;
    const rough = Math.round(85 + light * 120);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = rough;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function wovenStraw() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!, rng = randomFor(7201);
  ctx.fillStyle = "#a3946d"; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = rng() * 512, y = rng() * 512;
    ctx.strokeStyle = i % 3 ? `rgba(49,42,25,${0.08 + rng() * 0.3})` : "rgba(227,210,155,.3)";
    ctx.lineWidth = 0.5 + rng(); ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + 2 + rng() * 4, y + 25 + rng() * 80); ctx.stroke();
  }
  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = "rgba(41,34,21,.22)"; ctx.fillRect(0, y, 512, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
