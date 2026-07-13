#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeFullSequence } from "./analyze-replay-full-sequence.mjs";
import { analyzeThreePartyReplay } from "./analyze-replay-three-party.mjs";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import { sourceHashForReplaySession } from "./lib/replay-proof-identity.mjs";

function parseArgs(argv) {
  const args = {
    json: false,
    manifest: "",
    out: "",
    requiredRecordingIds: [],
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") args.manifest = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--json") args.json = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--require-recording-ids") {
      args.requiredRecordingIds.push(...parseIdList(argv[++index] || ""));
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function parseIdList(value) {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`Analyze a full rendered Replay telemetry bundle.

Usage:
  npm run movement:replay:full-sequence:bundle -- --manifest <file> [--out <file>] [--json] [--strict]

Manifest schemaVersion 1:
  {
    "recordingSetId": "acceptance",
    "requiredRecordingIds": ["recording-a"],
    "recordings": [
      {
        "id": "recording-a",
        "session": "tmp/replay-session.json",
        "telemetry": "tmp/full-sequence.json",
        "expectedFrameCount": 120
      }
    ]
  }
`);
}

async function readJson(filePath, label) {
  const resolvedPath = path.resolve(filePath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  return JSON.parse(await readFile(resolvedPath, "utf8"));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeManifest(manifest) {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.recordings)) {
    throw new Error("Full-sequence bundle manifest must be schemaVersion 1 with recordings.");
  }

  return {
    recordingSetId: typeof manifest.recordingSetId === "string" ? manifest.recordingSetId : "full-sequence-bundle",
    recordings: manifest.recordings.map((recording, index) => {
      if (!isRecord(recording)) throw new Error(`recordings[${index}] must be an object.`);
      const id = typeof recording.id === "string" && recording.id.length > 0
        ? recording.id
        : typeof recording.recordingId === "string" && recording.recordingId.length > 0
          ? recording.recordingId
          : "";
      if (!id) throw new Error(`recordings[${index}].id must be a non-empty string.`);
      return {
        expectedFrameCount: typeof recording.expectedFrameCount === "number"
          ? recording.expectedFrameCount
          : undefined,
        id,
        proofMode: typeof recording.proofMode === "string" ? recording.proofMode : "player-avatar",
        requireCurrentFingerprint: recording.requireCurrentFingerprint !== false,
        requireThreeParty: recording.requireThreeParty === true,
        session: typeof recording.session === "string" ? recording.session : "",
        telemetry: typeof recording.telemetry === "string" ? recording.telemetry : "",
        threePartyTelemetry: typeof recording.threePartyTelemetry === "string"
          ? recording.threePartyTelemetry
          : "",
      };
    }),
    requiredRecordingIds: Array.isArray(manifest.requiredRecordingIds)
      ? manifest.requiredRecordingIds.filter((id) => typeof id === "string" && id.length > 0)
      : [],
  };
}

function frameAccountingFromReport(report) {
  return report.frameAccounting ?? {
    compared: 0,
    complete: false,
    expected: report.frameCount ?? 0,
    missing: report.missingFrameCount ?? 0,
    rendered: 0,
  };
}

async function analyzeRecording(recording) {
  const checkedPaths = [recording.session, recording.telemetry, recording.threePartyTelemetry].filter(Boolean);
  if (!recording.session || !recording.telemetry || (recording.requireThreeParty && !recording.threePartyTelemetry)) {
    return {
      checkedPaths,
      failures: [{ code: "bundle-recording-input-missing", count: 1 }],
      frameAccounting: {
        compared: 0,
        complete: false,
        expected: recording.expectedFrameCount ?? 0,
        missing: recording.expectedFrameCount ?? 0,
        rendered: 0,
      },
      id: recording.id,
      ok: false,
      problem: recording.requireThreeParty
        ? "Bundle row must declare session, uninterrupted telemetry, and three-party telemetry paths."
        : "Bundle row must declare session and telemetry paths.",
      status: "missing-input",
    };
  }

  if (
    !existsSync(path.resolve(recording.session)) ||
    !existsSync(path.resolve(recording.telemetry)) ||
    (recording.requireThreeParty && !existsSync(path.resolve(recording.threePartyTelemetry)))
  ) {
    return {
      checkedPaths,
      failures: [{ code: "bundle-recording-artifact-missing", count: 1 }],
      frameAccounting: {
        compared: 0,
        complete: false,
        expected: recording.expectedFrameCount ?? 0,
        missing: recording.expectedFrameCount ?? 0,
        rendered: 0,
      },
      id: recording.id,
      ok: false,
      problem: `Missing session or telemetry artifact for ${recording.id}.`,
      status: "missing-input",
    };
  }

  try {
    const session = await readJson(recording.session, "Replay session JSON");
    const telemetry = await readJson(recording.telemetry, "full-sequence telemetry JSON");
    const report = analyzeFullSequence({
      expectedMotionPipelineFingerprint: recording.requireCurrentFingerprint
        ? movementPipelineFingerprint()
        : null,
      requireIdentity: true,
      session,
      telemetry,
    });
    const frameAccounting = frameAccountingFromReport(report);
    const frameCountMismatch = typeof recording.expectedFrameCount === "number" &&
      recording.expectedFrameCount !== frameAccounting.expected;
    const sessionIdentityMismatch = session?.id !== recording.id;
    const proofModeMismatch = telemetry.proofMode !== recording.proofMode;
    const sourceHashMismatch = telemetry.sourceHash !== sourceHashForReplaySession(session);
    let threePartyReport = null;
    let threePartyFailures = [];
    let threePartyProblem = "";
    if (recording.requireThreeParty) {
      const threePartyTelemetry = await readJson(
        recording.threePartyTelemetry,
        "three-party rendered telemetry JSON",
      );
      threePartyReport = analyzeThreePartyReplay({ telemetry: threePartyTelemetry });
      const threePartyIdentityFailures = [
        ...(threePartyTelemetry.sessionId !== session?.id
          ? [{ code: "three-party-session-identity-mismatch", count: 1 }]
          : []),
        ...(threePartyTelemetry.recordingId !== recording.id
          ? [{ code: "three-party-recording-identity-mismatch", count: 1 }]
          : []),
        ...(threePartyTelemetry.sourceHash !== sourceHashForReplaySession(session)
          ? [{ code: "three-party-source-hash-mismatch", count: 1 }]
          : []),
        ...(
          recording.requireCurrentFingerprint &&
          threePartyTelemetry.motionPipelineFingerprint !== movementPipelineFingerprint()
            ? [{ code: "three-party-pipeline-fingerprint-mismatch", count: 1 }]
            : []
        ),
      ];
      threePartyFailures = [
        ...threePartyReport.failures,
        ...threePartyIdentityFailures,
      ];
      if (threePartyFailures.length > 0) {
        threePartyProblem = `Three-party proof blocked: ${threePartyFailures.map((failure) => failure.code).join(", ")}.`;
      }
    }
    const identityFailures = [
      ...(sessionIdentityMismatch ? [{ code: "bundle-session-identity-mismatch", count: 1 }] : []),
      ...(proofModeMismatch ? [{ code: "bundle-proof-mode-mismatch", count: 1 }] : []),
      ...(sourceHashMismatch ? [{ code: "bundle-source-hash-mismatch", count: 1 }] : []),
    ];
    const status = report.status === "passed" &&
      !frameCountMismatch &&
      identityFailures.length === 0 &&
      threePartyFailures.length === 0
      ? "passed"
      : "blocked";
    return {
      checkedPaths,
      failures: [
        ...report.failures,
        ...(frameCountMismatch
          ? [{ code: "bundle-frame-count-mismatch", count: 1 }]
          : []),
        ...identityFailures,
        ...threePartyFailures,
      ],
      frameAccounting,
      id: recording.id,
      ok: status === "passed",
      playbackMode: report.playbackMode,
      problem: [
        frameCountMismatch
          ? `Expected ${recording.expectedFrameCount} frame(s), got ${frameAccounting.expected}.`
          : "",
        sessionIdentityMismatch
          ? `Session id ${session?.id ?? "missing"} does not match bundle recording id ${recording.id}.`
          : "",
        proofModeMismatch
          ? `Telemetry proof mode ${telemetry.proofMode ?? "missing"} does not match ${recording.proofMode}.`
          : "",
        sourceHashMismatch
          ? "Telemetry source hash does not match the immutable source session."
          : "",
        threePartyProblem,
      ].filter(Boolean).join(" "),
      sessionId: report.sessionId,
      sourceHash: report.sourceHash,
      status,
      ...(threePartyReport
        ? {
            threePartyFrameAccounting: threePartyReport.frameAccounting,
            threePartyStatus: threePartyReport.status,
          }
        : {}),
    };
  } catch (error) {
    return {
      checkedPaths,
      failures: [{ code: "bundle-recording-harness-error", count: 1 }],
      frameAccounting: {
        compared: 0,
        complete: false,
        expected: recording.expectedFrameCount ?? 0,
        missing: recording.expectedFrameCount ?? 0,
        rendered: 0,
      },
      id: recording.id,
      ok: false,
      problem: error instanceof Error ? error.message : String(error),
      status: "harness-error",
    };
  }
}

export async function buildFullSequenceBundleReport({
  manifestPath,
  requiredRecordingIds = [],
}) {
  const manifest = normalizeManifest(await readJson(manifestPath, "full-sequence bundle manifest JSON"));
  const requiredIds = Array.from(new Set([
    ...manifest.requiredRecordingIds,
    ...requiredRecordingIds,
  ]));
  const rows = [];
  for (const recording of manifest.recordings) {
    rows.push(await analyzeRecording(recording));
  }
  const observedIds = new Set(rows.map((row) => row.id));
  const missingRequiredRecordingIds = requiredIds.filter((id) => !observedIds.has(id));
  const statusCounts = rows.reduce((counts, row) => ({
    ...counts,
    [row.status]: (counts[row.status] ?? 0) + 1,
  }), {});
  const frameTotals = rows.map((row) => ({
    compared: row.frameAccounting.compared,
    complete: row.frameAccounting.complete,
    expected: row.frameAccounting.expected,
    id: row.id,
    missing: row.frameAccounting.missing,
    rendered: row.frameAccounting.rendered,
  }));
  const threePartyFrameTotals = rows.flatMap((row) => row.threePartyFrameAccounting
    ? [{
        compared: row.threePartyFrameAccounting.compared,
        complete: row.threePartyFrameAccounting.complete,
        expected: row.threePartyFrameAccounting.expected,
        id: row.id,
        missing: row.threePartyFrameAccounting.missing,
        rendered: row.threePartyFrameAccounting.rendered,
      }]
    : []);
  const ok = rows.every((row) => row.ok) && missingRequiredRecordingIds.length === 0;

  return {
    command: "movement:replay:full-sequence:bundle",
    frameTotals,
    manifestPath,
    missingRequiredRecordingIds,
    ok,
    recordingCount: rows.length,
    recordingIds: rows.map((row) => row.id),
    recordingSetId: manifest.recordingSetId,
    requiredRecordingCount: requiredIds.length,
    requiredRecordingIds: requiredIds,
    rows,
    schemaVersion: 1,
    statusCounts,
    threePartyFrameTotals,
  };
}

function printHumanSummary(report) {
  console.log(`Full-sequence bundle: ${report.recordingSetId}`);
  console.log(`Recordings: ${report.recordingCount}; required: ${report.requiredRecordingCount}; ok: ${report.ok}`);
  if (report.missingRequiredRecordingIds.length > 0) {
    console.log(`Missing required recording ids: ${report.missingRequiredRecordingIds.join(", ")}`);
  }
  report.rows.forEach((row) => {
    const frames = row.frameAccounting;
    const problem = row.problem ? ` (${row.problem})` : "";
    console.log(
      `${row.status.toUpperCase()} ${row.id}: rendered ${frames.rendered}/${frames.expected}, compared ${frames.compared}, missing ${frames.missing}${problem}`,
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.manifest) throw new Error("Pass --manifest <file>.");
  const report = await buildFullSequenceBundleReport({
    manifestPath: args.manifest,
    requiredRecordingIds: args.requiredRecordingIds,
  });
  if (args.out) {
    await writeFile(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHumanSummary(report);
  if (args.strict && !report.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
