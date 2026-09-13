import * as THREE from "three";
import { randomFor } from "./GardenAssets";

/** Authored paper fibres, bamboo ribs and the game's three-petal crest. */
export function lanternPaper() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const rng = randomFor(523);
  ctx.fillStyle = "#ffe1af";
  ctx.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y++) {
    const strength = 0.03 + Math.pow((1 + Math.cos(y / 512 * Math.PI * 48)) / 2, 8) * 0.2;
    ctx.fillStyle = `rgba(91,49,19,${strength})`;
    ctx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = `rgba(125,86,42,${rng() * 0.12})`;
    ctx.fillRect(rng() * 256, rng() * 512, 0.6, 2 + rng() * 5);
  }
  // Two crests around the cylinder, with no borrowed lettering or insignia.
  for (const x of [0, 128, 256]) {
    ctx.save();
    ctx.translate(x, 256);
    ctx.scale(0.23, 1);
    ctx.strokeStyle = ctx.fillStyle = "#43291a";
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(0, 0, 125, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath(); ctx.ellipse(0, -46, 30, 59, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** A small, static night environment gives metal and wet stone reflected colour.
 * Prefilter once during loading, never during movement or a power-up. */
export function nightEnvironment(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#345173");
  sky.addColorStop(0.44, "#738fba");
  sky.addColorStop(0.51, "#38414d");
  sky.addColorStop(1, "#111c29");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256);
  for (const [x, y, radius] of [[90, 125, 36], [310, 128, 28], [435, 122, 20]]) {
    const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, "rgba(255,189,101,0.95)");
    light.addColorStop(1, "rgba(255,165,72,0)");
    ctx.fillStyle = light; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromEquirectangular(texture);
  } finally {
    texture.dispose(); generator.dispose();
  }
}
