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
const gamePlayPath = "src/app/(dashboard)/demos/movements/[id]/play/page.tsx";
const gameRuntimeHookFiles = [
  "src/app/(dashboard)/demos/movements/_hooks/useMovementInstructorPlayback.ts",
  "src/app/(dashboard)/demos/movements/_hooks/useMovementLiveMotionFrame.ts",
  "src/app/(dashboard)/demos/movements/_hooks/useMovementRecordedMotionFrame.ts",
  "src/app/(dashboard)/demos/movements/_hooks/useMovementTrackingCalibration.ts",
];
const replayProofFiles = [
  "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayLabFrameFailures.ts",
  "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayLabHelpers.ts",
  "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
];
const sharedMotionFiles = new Set([
  "movementLiveMotionFrame.ts",
  "movementGameRuntimeFrame.ts",
  "movementMotionFrame.ts",
  "movementPlayerMotionFrame.ts",
  "movementRecordedMotionFrame.ts",
  "movementRecordedPlayerSetup.ts",
  "movementReplayPlaybackClock.ts",
  "movementReplayPlayerMotionFrame.ts",
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

  return [
    ...movementFiles,
    ...replayProofFiles,
    ...gameRuntimeHookFiles,
    gamePlayPath,
    vrmAvatarPath,
  ].sort();
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
