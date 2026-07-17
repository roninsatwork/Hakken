#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { allowLegacy: false, game: "", out: "", replay: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-legacy") args.allowLegacy = true;
    else if (arg === "--game") args.game = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--replay") args.replay = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function normalizeChecksumValue(value) {
  if (Array.isArray(value)) return value.map(normalizeChecksumValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeChecksumValue(entryValue)]),
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(6));
  }
  return value;
}

export function movementBoundaryChecksumForComparison(value) {
  const serialized = JSON.stringify(normalizeChecksumValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function replayPlayerDebug(frame) {
  return frame?.avatars?.player ?? frame?.debug ?? null;
}

const VISUAL_ABSOLUTE_TOLERANCE = 0.1;
const VISUAL_RELATIVE_LENGTH_TOLERANCE = 0.1;
const APPLIED_BONE_TOLERANCE = 0.05;

function isAngularTelemetryPath(valuePath) {
  if (/(?:Pitch|Roll|Yaw)$/.test(valuePath)) return true;
  return (
    valuePath.includes("playerApplied.avatarHead.") ||
    valuePath.includes("playerApplied.avatarHands.") ||
    valuePath.includes("playerApplied.avatarSpine.")
  ) && /\.(?:x|y|z)$/.test(valuePath);
}

function numericTelemetryDelta(left, right, valuePath) {
  const direct = Math.abs(left - right);
  if (!isAngularTelemetryPath(valuePath)) return direct;
  const fullTurn = Math.PI * 2;
  const wrapped = direct % fullTurn;
  return Math.min(wrapped, fullTurn - wrapped);
}

function compareTelemetryValues({
  left,
  path: valuePath,
  right,
  tolerance,
  worst,
}) {
  if (typeof left === "number" && typeof right === "number") {
    const relativeTolerance = valuePath.endsWith(".length") || valuePath.endsWith(".avatarScale")
      ? Math.max(Math.abs(left), Math.abs(right)) * VISUAL_RELATIVE_LENGTH_TOLERANCE
      : 0;
    const allowedDelta = Math.max(tolerance, relativeTolerance);
    const delta = Number.isFinite(left) && Number.isFinite(right)
      ? numericTelemetryDelta(left, right, valuePath)
      : Object.is(left, right) ? 0 : Number.POSITIVE_INFINITY;
    if (delta > allowedDelta && (!worst.value || delta / allowedDelta > worst.value.deltaRatio)) {
      worst.value = {
        delta,
        deltaRatio: delta / allowedDelta,
        gameValue: right,
        path: valuePath,
        replayValue: left,
        tolerance: allowedDelta,
      };
    }
    return;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      worst.value ??= {
        delta: Number.POSITIVE_INFINITY,
        deltaRatio: Number.POSITIVE_INFINITY,
        gameValue: right,
        path: valuePath,
        replayValue: left,
        tolerance: 0,
      };
      return;
    }
    left.forEach((value, index) => compareTelemetryValues({
      left: value,
      path: `${valuePath}[${index}]`,
      right: right[index],
      tolerance,
      worst,
    }));
    return;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left;
    const rightRecord = right;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    for (const key of keys) {
      compareTelemetryValues({
        left: leftRecord[key],
        path: `${valuePath}.${key}`,
        right: rightRecord[key],
        tolerance,
        worst,
      });
    }
    return;
  }
  if (!Object.is(left, right)) {
    worst.value ??= {
      delta: Number.POSITIVE_INFINITY,
      deltaRatio: Number.POSITIVE_INFINITY,
      gameValue: right,
      path: valuePath,
      replayValue: left,
      tolerance: 0,
    };
  }
}

function appliedSnapshot(debug) {
  const avatarHead = debug?.avatarHead ? { ...debug.avatarHead } : undefined;
  if (avatarHead) {
    delete avatarHead.appliedWorldPitch;
    delete avatarHead.appliedWorldQuaternion;
    delete avatarHead.appliedWorldRoll;
    delete avatarHead.appliedWorldYaw;
    delete avatarHead.targetWorldQuaternion;
  }
  return {
    avatarExpressions: debug?.avatarExpressions,
    avatarHands: debug?.avatarHands,
    avatarHead,
    avatarRoot: debug?.avatarRoot,
    avatarSpine: debug?.avatarSpine,
  };
}

function normalizeAppliedRoot(snapshot, baseline) {
  const next = structuredClone(snapshot);
  if (next?.avatarHead) {
    delete next.avatarHead.appliedWorldPitch;
    delete next.avatarHead.appliedWorldQuaternion;
    delete next.avatarHead.appliedWorldRoll;
    delete next.avatarHead.appliedWorldYaw;
    delete next.avatarHead.targetWorldQuaternion;
  }
  if (!next?.avatarRoot || !baseline?.avatarRoot) return next;
  for (const key of [
    "appliedPitch",
    "appliedRoll",
    "appliedX",
    "appliedYaw",
    "appliedZ",
    "targetPitch",
    "targetRoll",
    "targetX",
    "targetYaw",
    "targetZ",
  ]) {
    if (typeof next.avatarRoot[key] === "number" && typeof baseline.avatarRoot[key] === "number") {
      next.avatarRoot[key] -= baseline.avatarRoot[key];
    }
  }
  return next;
}

export function compareRenderedMovementTelemetry({
  gameApplied,
  gameAppliedBaseline,
  gameVisual,
  replayApplied,
  replayAppliedBaseline,
  replayVisual,
}) {
  const visualWorst = { value: null };
  compareTelemetryValues({
    left: replayVisual,
    path: "playerVisual",
    right: gameVisual,
    tolerance: VISUAL_ABSOLUTE_TOLERANCE,
    worst: visualWorst,
  });
  const appliedWorst = { value: null };
  compareTelemetryValues({
    left: normalizeAppliedRoot(replayApplied, replayAppliedBaseline),
    path: "playerApplied",
    right: normalizeAppliedRoot(gameApplied, gameAppliedBaseline),
    tolerance: APPLIED_BONE_TOLERANCE,
    worst: appliedWorst,
  });
  const worst = [visualWorst.value, appliedWorst.value]
    .filter(Boolean)
    .sort((left, right) => right.deltaRatio - left.deltaRatio)[0] ?? null;
  return { passed: !worst, worst };
}

export function compareReplayMountedGameChecksums({ allowLegacy = false, game, replay }) {
  const replayFrames = new Map(
    (Array.isArray(replay?.frames) ? replay.frames : []).map((frame) => [
      frame.sourceFrameIndex ?? frame.frameIndex,
      replayPlayerDebug(frame),
    ]),
  );
  const gameFrames = Array.isArray(game?.final?.renderedFrames)
    ? game.final.renderedFrames
    : [];
  const sourceHashesMatch = Boolean(
    replay?.sourceHash &&
    game?.final?.sourcePacketHash &&
    replay.sourceHash === game.final.sourcePacketHash
  );
  const isLegacy = !replay?.sourceHash || !game?.final?.sourcePacketHash;
  const exactChecksumDivergences = [];
  const visualToleranceDivergences = [];
  const firstGameFrame = gameFrames[0] ?? null;
  const firstReplayDebug = firstGameFrame
    ? replayFrames.get(firstGameFrame.frameIndex)
    : null;
  const replayAppliedBaseline = appliedSnapshot(firstReplayDebug);
  const gameAppliedBaseline = firstGameFrame?.playerApplied ?? null;
  const hasVisualTelemetry = gameFrames.length > 0 && gameFrames.every((frame) => (
    frame?.playerApplied && frame?.playerVisual
  ));

  for (const gameFrame of gameFrames) {
    const replayDebug = replayFrames.get(gameFrame.frameIndex);
    const replayChecksum = replayDebug?.avatarVisual
      ? movementBoundaryChecksumForComparison(replayDebug.avatarVisual)
      : null;
    const gameChecksum = gameFrame?.checksums?.playerRendered ?? null;
    if (!replayChecksum || replayChecksum !== gameChecksum) {
      exactChecksumDivergences.push({
        frameIndex: gameFrame.frameIndex,
        gameChecksum,
        replayChecksum,
      });
    }
    if (hasVisualTelemetry) {
      const comparison = compareRenderedMovementTelemetry({
        gameApplied: gameFrame.playerApplied,
        gameAppliedBaseline,
        gameVisual: gameFrame.playerVisual,
        replayApplied: appliedSnapshot(replayDebug),
        replayAppliedBaseline,
        replayVisual: replayDebug?.avatarVisual,
      });
      if (!comparison.passed) {
        visualToleranceDivergences.push({
          frameIndex: gameFrame.frameIndex,
          worst: comparison.worst,
        });
      }
    }
  }

  const failures = [];
  if (gameFrames.length === 0) failures.push("mounted Game report has no rendered frames");
  const activeFrameStartIndex = Number.isInteger(game?.final?.activeFrameStartIndex)
    ? game.final.activeFrameStartIndex
    : Number(game?.final?.setupFrameCount || 0);
  if (gameFrames.length !== replayFrames.size - activeFrameStartIndex) {
    failures.push("Replay and mounted Game active frame counts differ");
  }
  if (!hasVisualTelemetry) failures.push("mounted Game report has no comparable rendered visual telemetry");
  if (visualToleranceDivergences.length > 0) {
    failures.push(`${visualToleranceDivergences.length} rendered frame(s) exceeded visual tolerances`);
  }
  if (isLegacy && !allowLegacy) failures.push("source packet identity is legacy or missing");
  if (!isLegacy && !sourceHashesMatch) failures.push("Replay and mounted Game source packet hashes differ");
  const divergencePathCounts = Object.fromEntries(
    [...visualToleranceDivergences.reduce((counts, divergence) => {
      const divergencePath = divergence.worst?.path ?? "unknown";
      counts.set(divergencePath, (counts.get(divergencePath) ?? 0) + 1);
      return counts;
    }, new Map()).entries()].sort((left, right) => right[1] - left[1]),
  );
  const worstDivergence = [...visualToleranceDivergences]
    .sort((left, right) => (
      (right.worst?.deltaRatio ?? 0) - (left.worst?.deltaRatio ?? 0)
    ))[0] ?? null;

  return {
    comparedFrameCount: gameFrames.length,
    divergenceCount: visualToleranceDivergences.length,
    divergences: visualToleranceDivergences,
    divergencePathCounts,
    exactChecksumDivergenceCount: exactChecksumDivergences.length,
    exactChecksumDivergences,
    failures,
    firstDivergence: visualToleranceDivergences[0] ?? null,
    gamePacketId: game?.final?.packetId ?? null,
    identityStatus: isLegacy
      ? "legacy-unverifiable"
      : sourceHashesMatch
        ? "matched"
        : "mismatched",
    passed: failures.length === 0,
    replayRecordingId: replay?.recordingId ?? replay?.sessionId ?? null,
    visualToleranceComparisonAvailable: hasVisualTelemetry,
    visualTolerances: {
      appliedBoneAbsolute: APPLIED_BONE_TOLERANCE,
      renderedAbsolute: VISUAL_ABSOLUTE_TOLERANCE,
      renderedLengthRelative: VISUAL_RELATIVE_LENGTH_TOLERANCE,
    },
    worstDivergence,
  };
}

function printHelp() {
  console.log(`Compare current Replay rendered-player telemetry with a mounted Game report.

Usage:
  npm run movement:replay-game:compare -- --replay <telemetry.json> --game <report.json> [--out <report.json>]

Options:
  --allow-legacy  Diagnose historical packets without accepting missing source identity
`);
}

export async function runReplayMountedGameChecksumComparison(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  if (!args.replay) throw new Error("Pass --replay <telemetry.json>.");
  if (!args.game) throw new Error("Pass --game <report.json>.");

  const replay = JSON.parse(await readFile(path.resolve(args.replay), "utf8"));
  const game = JSON.parse(await readFile(path.resolve(args.game), "utf8"));
  const report = compareReplayMountedGameChecksums({
    allowLegacy: args.allowLegacy,
    game,
    replay,
  });
  if (args.out) {
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
  }
  console.log(
    `Replay/mounted Game comparison: ${report.comparedFrameCount} frame(s), ` +
    `${report.divergenceCount} divergence(s), identity ${report.identityStatus}.`,
  );
  if (!report.passed) {
    if (report.firstDivergence) {
      console.error(
        `First divergence at frame ${report.firstDivergence.frameIndex}: ` +
        `${report.firstDivergence.worst?.path ?? "unknown field"} delta ` +
        `${report.firstDivergence.worst?.delta ?? "unknown"} exceeds ` +
        `${report.firstDivergence.worst?.tolerance ?? "unknown"}.`,
      );
    }
    process.exitCode = 1;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runReplayMountedGameChecksumComparison(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
