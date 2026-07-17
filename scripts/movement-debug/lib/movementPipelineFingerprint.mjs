import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const movementLibDir = path.join(
  repoRoot,
  "src/app/(dashboard)/demos/movements/_lib",
);
const movementHooksDir = path.join(
  repoRoot,
  "src/app/(dashboard)/demos/movements/_hooks",
);
const gameComponentsDir = path.join(
  repoRoot,
  "src/app/(dashboard)/demos/movements/[id]/play/_components",
);
const vrmAvatarPath = "src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx";
const gamePlayPath = "src/app/(dashboard)/demos/movements/[id]/play/page.tsx";
const movementCapturePath = "src/app/(dashboard)/demos/movement-capture/page.tsx";
const replayProofFiles = [
  "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayLabFrameFailures.ts",
  "src/app/(dashboard)/demos/movements/replay-lab/_lib/replayLabHelpers.ts",
  "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
];

function sourceFiles(directory, relativeDirectory) {
  return readdirSync(directory)
    .filter((fileName) => (
      /\.(?:ts|tsx)$/.test(fileName) &&
      !/\.test\.(?:ts|tsx)$/.test(fileName)
    ))
    .map((fileName) => path.posix.join(relativeDirectory, fileName));
}

export function movementPipelineFingerprintFiles() {
  const movementFiles = sourceFiles(
    movementLibDir,
    "src/app/(dashboard)/demos/movements/_lib",
  );
  const movementHookFiles = sourceFiles(
    movementHooksDir,
    "src/app/(dashboard)/demos/movements/_hooks",
  );
  const gameComponentFiles = sourceFiles(
    gameComponentsDir,
    "src/app/(dashboard)/demos/movements/[id]/play/_components",
  );

  return Array.from(new Set([
    ...movementFiles,
    ...movementHookFiles,
    ...gameComponentFiles,
    ...replayProofFiles,
    gamePlayPath,
    movementCapturePath,
    vrmAvatarPath,
  ])).sort();
}

export function movementCodeCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
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
