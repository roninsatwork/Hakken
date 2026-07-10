import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { buildMovementGamePathSimulation } from "../../src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation";
import { resolveMovementAvatarRetargetSegmentApplication } from "../../src/app/(dashboard)/demos/movements/_lib/movementAvatarPipeline";
import {
  buildMovementReplaySessionFromRecording,
  type MovementReplayRecordingSource,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import {
  isInlinePoseData,
  parseMovementFramePayload,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementFrameCodec";
import type { MovementDataFormat } from "../../src/app/(dashboard)/demos/movements/_lib/movementTypes";

// One-off Phase 3 step 5 measurement: how often does each instructor foot
// gate in resolveMovementAvatarRetargetSegmentApplication block foot segment
// application on the golden recordings, and what does the player role see?
// instructorSquatPresentationDepth is approximated with the frame's raw
// squatDepth (the real value is a smoothed visual state).

const RUNS_DIR = "tmp/movement-replay-lab/runs";

function convexDataTable(table: string, limit: string): unknown {
  const output = execFileSync(
    "npx",
    ["convex", "data", table, "--limit", String(limit), "--order", "desc", "--format", "json"],
    {
      encoding: "utf8",
      env: { ...process.env, SENTRY_DSN: "" },
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output) as unknown;
}

function readLatestExportPath() {
  const pointerPath = resolve(RUNS_DIR, "latest-export-path.txt");
  if (!existsSync(pointerPath)) return null;
  const exportPath = readFileSync(pointerPath, "utf8").trim();
  if (!exportPath || !existsSync(exportPath)) return null;
  return exportPath;
}

function readStoragePayload(storageId: string) {
  const exportPath = readLatestExportPath();
  if (!exportPath) throw new Error(`No export for storage-backed recording ${storageId}.`);
  const stats = statSync(exportPath);
  for (const extension of [".json", ".txt", ""]) {
    if (stats.isDirectory()) {
      const candidate = resolve(exportPath, "_storage", `${storageId}${extension}`);
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    } else {
      try {
        return execFileSync("unzip", ["-p", exportPath, `_storage/${storageId}${extension}`], {
          encoding: "utf8",
          maxBuffer: 512 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        // try next extension
      }
    }
  }
  throw new Error(`Could not find storage payload ${storageId}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function movementDataFormat(value: unknown): MovementDataFormat | undefined {
  return value === "legacy-inline-json" || value === "legacy-storage-json" || value === "storage-json-v1"
    ? value
    : undefined;
}

function parseRecordingRow(value: unknown): MovementReplayRecordingSource | null {
  if (!isRecord(value)) return null;
  const poseData = typeof value.poseData === "string" ? value.poseData : "";
  if (!poseData) return null;
  return {
    _id: String(value._id ?? "unknown"),
    captureFps: typeof value.captureFps === "number" ? value.captureFps : undefined,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : undefined,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    frameCount: typeof value.frameCount === "number" ? value.frameCount : undefined,
    poseData,
    poseDataFormat: movementDataFormat(value.poseDataFormat),
    title: typeof value.title === "string" ? value.title : "Untitled movement",
  };
}

export async function runCountFootGates() {
  const rows = convexDataTable("movements", "5");
  const recordings = (Array.isArray(rows) ? rows : [rows])
    .map(parseRecordingRow)
    .filter((recording): recording is MovementReplayRecordingSource => Boolean(recording));

  const totals: Record<string, Record<string, number>> = {};

  for (const recording of recordings) {
    const payload = isInlinePoseData(recording.poseData)
      ? recording.poseData
      : readStoragePayload(recording.poseData);
    const sourceFormat = recording.poseDataFormat ??
      (isInlinePoseData(recording.poseData) ? "legacy-inline-json" : "legacy-storage-json");
    const parsed = parseMovementFramePayload(payload, sourceFormat);
    const session = buildMovementReplaySessionFromRecording(
      recording,
      parsed.frames,
      recording.captureFps ?? parsed.fps,
      { captureStartReadiness: parsed.captureStartReadiness },
    );
    const simulation = buildMovementGamePathSimulation(session);

    const counts: Record<string, Record<string, number>> = {
      instructor: {},
      player: {},
    };
    let frames = 0;

    simulation.decisions.forEach((decision) => {
      if (!decision) return;
      frames += 1;
      (["leftFoot", "rightFoot"] as const).forEach((segmentName) => {
        (["instructor", "player"] as const).forEach((avatarRole) => {
          const application = resolveMovementAvatarRetargetSegmentApplication({
            avatarRole,
            instructorSquatPresentationDepth: decision.retargetFrame.squatDepth,
            lowerBodySegmentMotion: decision.lowerBodySegmentMotion,
            retargetFrame: decision.retargetFrame,
            segmentName,
            segmentType: "foot",
          });
          counts[avatarRole][application.reason] = (counts[avatarRole][application.reason] ?? 0) + 1;
        });
      });
    });

    const shortId = recording._id.slice(0, 12);
    console.log(`\n${shortId} (${recording.title}) - ${frames} frames x 2 feet:`);
    for (const role of ["instructor", "player"] as const) {
      const entries = Object.entries(counts[role]).sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((sum, [, count]) => sum + count, 0);
      console.log(`  ${role}: ${entries.map(([reason, count]) =>
        `${reason} ${count} (${Math.round((count / total) * 100)}%)`).join(", ")}`);
      entries.forEach(([reason, count]) => {
        totals[role] = totals[role] ?? {};
        totals[role][reason] = (totals[role][reason] ?? 0) + count;
      });
    }
  }

  console.log("\n== totals across goldens (foot-segment decisions):");
  for (const role of ["instructor", "player"] as const) {
    const entries = Object.entries(totals[role] ?? {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    console.log(`  ${role}: ${entries.map(([reason, count]) =>
      `${reason} ${count} (${Math.round((count / total) * 100)}%)`).join(", ")}`);
  }
}
