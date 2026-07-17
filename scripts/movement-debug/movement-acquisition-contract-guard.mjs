import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MOVEMENT_ACQUISITION_CONTRACT_PATHS = {
  capture: "src/app/(dashboard)/demos/movements/_hooks/useMovementCapture.ts",
  contract: "src/app/(dashboard)/demos/movements/_lib/movementPlayerInputContract.ts",
  game: "src/app/(dashboard)/demos/movements/[id]/play/page.tsx",
  liveSetup: "src/app/(dashboard)/demos/movements/_hooks/useMovementLivePlayerSetup.ts",
  mediaPipe: "src/app/(dashboard)/demos/movements/_hooks/useMediaPipeVision.ts",
  playerTracking: "src/app/(dashboard)/demos/movements/_hooks/useMovementPlayerTracking.ts",
  replay: "src/app/(dashboard)/demos/movements/replay-lab/page.tsx",
  trackingCalibration: "src/app/(dashboard)/demos/movements/_hooks/useMovementTrackingCalibration.ts",
};

function includes(content, value) {
  return typeof content === "string" && content.includes(value);
}

export function auditMovementAcquisitionContract(files) {
  const failures = [];
  const requireText = (file, text, reason) => {
    if (!includes(files[file], text)) failures.push(`${file}: ${reason}`);
  };
  const forbidText = (file, text, reason) => {
    if (includes(files[file], text)) failures.push(`${file}: ${reason}`);
  };

  requireText("contract", 'id: "movement-player-input-v1"', "missing versioned contract id");
  requireText("contract", 'id: "mediapipe-vision-v1"', "missing versioned detector profile");
  requireText("contract", "MEDIAPIPE_POSE_CONFIDENCE", "detector options are not fingerprinted");
  requireText("contract", "prefixFrameCount: 60", "setup prefix is not fixed at 60 frames");
  requireText("contract", "sampleLimit: 12", "neutral sample limit is not fixed at 12");
  requireText("mediaPipe", "MOVEMENT_PLAYER_INPUT_CONTRACT", "MediaPipe options bypass the shared detector profile");
  requireText("capture", "createMovementAcquisitionFilters", "capture does not use the shared filter factory");
  requireText("capture", "prepareMovementAcquisitionFrame", "capture does not use shared result preparation");
  requireText("playerTracking", "createMovementAcquisitionFilters", "Game does not use the shared filter factory");
  requireText("playerTracking", "prepareMovementAcquisitionFrame", "Game does not use shared result preparation");
  requireText("liveSetup", "buildMovementPlayerSetupFromPrefix", "automatic Game setup bypasses the shared setup policy");
  requireText("trackingCalibration", "buildMovementPlayerSetupFromPrefix", "explicit Game setup bypasses the shared setup policy");
  requireText("game", "recordedSourceSequence:", "recorded mounted Game proof does not enter through the tracking boundary");
  requireText("game", "automaticPlayerSetup", "recorded mounted Game proof bypasses automatic setup");
  requireText("replay", "buildMovementPlayerSetupFromPrefix", "Replay bypasses the shared setup policy");

  for (const file of ["capture", "playerTracking"]) {
    forbidText(file, "new PoseFilterWrapper", "route-local acquisition filters are forbidden");
  }
  for (const file of ["game", "liveSetup", "replay", "trackingCalibration"]) {
    forbidText(file, "buildMovementRecordedPlayerSetup(", "route-local setup construction is forbidden");
    forbidText(file, "Math.min(59", "route-local 60-frame setup literal is forbidden");
    forbidText(file, "LIVE_PLAYER_SETUP_MIN_FRAMES", "route-local setup count is forbidden");
  }

  return { failures, ok: failures.length === 0 };
}

export function runMovementAcquisitionContractGuard(rootDir = process.cwd()) {
  const files = Object.fromEntries(Object.entries(MOVEMENT_ACQUISITION_CONTRACT_PATHS).map(
    ([key, relativePath]) => [key, fs.readFileSync(path.resolve(rootDir, relativePath), "utf8")],
  ));
  return auditMovementAcquisitionContract(files);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const report = runMovementAcquisitionContractGuard();
  if (report.ok) {
    console.log("Movement acquisition contract guard: passed");
  } else {
    console.error("Movement acquisition contract guard: failed");
    report.failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  }
}
