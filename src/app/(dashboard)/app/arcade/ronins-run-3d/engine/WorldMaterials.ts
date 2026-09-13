import * as THREE from "three";

/** Decode atlas cells as texture sources; artwork remains one immutable asset. */
async function loadAtlas(url: string) {
  const source = await new THREE.TextureLoader().loadAsync(url);
  const image = source.image as HTMLImageElement;
  const size = Math.floor(image.width / 2);
  const maps = [0, 1, 2, 3].map((index) => {
    const cell = document.createElement("canvas");
    cell.width = size;
    cell.height = size;
    const ctx = cell.getContext("2d");
    if (!ctx) throw new Error("Texture canvas unavailable");
    ctx.drawImage(
      image,
      (index % 2) * size,
      Math.floor(index / 2) * size,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    const texture = new THREE.CanvasTexture(cell);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  });
  source.dispose();
  return maps;
}

export async function loadWorldMaterials() {
  const maps = await loadAtlas("/games/ronins-run-3d/material-atlas-v1.png");
  return { stone: maps[0], wood: maps[1], plaster: maps[2], roof: maps[3] };
}

export async function loadCharacterMaterials() {
  const maps = await loadAtlas("/games/ronins-run-3d/character-material-atlas-v1.png");
  return { leather: maps[0], cloth: maps[1], gold: maps[2], wrap: maps[3] };
}

export async function loadFoliageMaterials() {
  const maps = await loadAtlas("/games/ronins-run-3d/foliage-atlas-v1.png");
  // Keep the supplied alpha; opaque cutouts avoid sorting every leaf each frame.
  maps.forEach((texture) => {
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  });
  return { maple: maps[0], autumn: maps[1], foliage: maps[2], fern: maps[3] };
}

/** One shared atlas; distant tree geometry selects its quadrant with UVs. */
export async function loadDistantTrees() {
  const texture = await new THREE.TextureLoader().loadAsync("/games/ronins-run-3d/distant-tree-atlas-v1.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function applySurface(
  mat: THREE.MeshStandardMaterial,
  texture: THREE.Texture,
  tint: number,
  bump: number,
) {
  mat.map = texture;
  mat.bumpMap = texture;
  mat.bumpScale = bump;
  mat.color.set(tint);
  mat.needsUpdate = true;
}
