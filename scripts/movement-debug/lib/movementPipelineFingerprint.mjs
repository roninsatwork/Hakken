import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const movementLibDir = path.join(
  repoRoot,
  "src/app/(dashboard)/demos/movements/_lib",
);
const vrmAvatarPath = "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx";
const sharedMotionFiles = new Set([
  "movementLiveMotionFrame.ts",
  "movementMotionFrame.ts",
  "movementRecordedMotionFrame.ts",
  "movementRetargeting.ts",
  "movementRootMotion.ts",
]);

export function movementPipelineFingerprintFiles() {
  const movementFiles = readdirSync(movementLibDir)
    .filter((fileName) => (
      fileName.endsWith(".ts") &&
      !fileName.endsWith(".test.ts") &&
      fileName !== "movementAvatarProofFixtures.ts" &&
      (fileName.startsWith("movementAvatar") || sharedMotionFiles.has(fileName))
    ))
    .map((fileName) => path.posix.join(
      "src/app/(dashboard)/demos/movements/_lib",
      fileName,
    ));

  return [...movementFiles, vrmAvatarPath].sort();
}

export function movementPipelineFingerprint() {
  const hash = createHash("sha256");

  movementPipelineFingerprintFiles().forEach((relativePath) => {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(path.join(repoRoot, relativePath)));
    hash.update("\0");
  });

  return `sha256:${hash.digest("hex")}`;
}
