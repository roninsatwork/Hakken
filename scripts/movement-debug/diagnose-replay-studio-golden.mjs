#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REGISTRY_RELATIVE_PATH = "scripts/movement-debug/fixtures/replay-studio/registry.json";
const FIXTURE_ROOT_RELATIVE_PATH = "scripts/movement-debug/fixtures/replay-studio";
const OUTPUT_DIR = "tmp/movement-replay-lab/replay-studio-golden";
const KNOWN_REPAIR_STAGES = [
  "source-capture",
  "source-normalization",
  "calibration",
  "motion-decision",
  "mirror-side-mapping",
  "support-contact",
  "retarget-solve",
  "vrm-application",
  "rendered-telemetry",
  "proof-artifact",
  "unknown",
];

function parseArgs(argv) {
  const args = {
    json: false,
    jsonOutPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--json-out") {
      args.jsonOutPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Run committed Replay Studio golden diagnosis fixtures.

Usage:
  npm run movement:diagnose:golden
  npm run movement:diagnose:golden -- --json

Options:
  --json             Print a machine-readable schemaVersion 1 summary.
  --json-out <file>  Write the same summary to a JSON file.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function expectString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function validateRegistry(registry) {
  if (!isRecord(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.fixtures)) {
    throw new Error(`${REGISTRY_RELATIVE_PATH} must be a schemaVersion 1 registry with fixtures.`);
  }
  return registry.fixtures.map((fixture, index) => {
    if (!isRecord(fixture)) throw new Error(`Fixture at index ${index} must be an object.`);
    const id = expectString(fixture.id, `fixtures[${index}].id`);
    const analysisPath = typeof fixture.analysis === "string" && fixture.analysis.length > 0 ? fixture.analysis : null;
    const sessionPath = typeof fixture.session === "string" && fixture.session.length > 0 ? fixture.session : null;
    if (analysisPath && sessionPath) {
      throw new Error(`Fixture ${id} must declare either analysis or session, not both.`);
    }
    if (!analysisPath && !sessionPath) {
      throw new Error(`Fixture ${id} must declare analysis or session.`);
    }
    const inputPath = `${FIXTURE_ROOT_RELATIVE_PATH}/${analysisPath ?? sessionPath}`;
    const inputKind = sessionPath ? "session" : "analysis";
    if (!existsSync(resolve(inputPath))) {
      throw new Error(`Fixture ${id} input path does not exist: ${inputPath}`);
    }
    if (!isRecord(fixture.expected)) throw new Error(`Fixture ${id} must declare expected results.`);
    return {
      ...fixture,
      id,
      inputKind,
      inputPath,
      refreshCommand: fixtureRefreshCommand(id),
    };
  });
}

function fixtureRefreshCommand(id) {
  return `npm run movement:diagnose -- --fixture ${shellQuote(id)} --require-fresh-artifact`;
}

function shellQuote(value) {
  return /^[A-Za-z0-9._/@:-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function expectedChecks(fixture, packet) {
  const expected = fixture.expected;
  return [
    ["status", packet.verdict.status, expected.status],
    ["failureCode", packet.verdict.failureCode, expected.failureCode],
    ["evidenceStatus", packet.verdict.evidenceStatus, expected.evidenceStatus],
    ["firstDivergentStage", packet.divergence.firstDivergentStage, expected.firstDivergentStage],
    ["fixtureId", packet.recording.fixtureId, expected.fixtureId],
    ["repairOwner", packet.repair.owner, expected.repairOwner],
    ["silentSkipCount", packet.scope.silentSkipCount, expected.silentSkipCount],
    ["sourceHash", packet.recording.sourceHash, expected.sourceHash],
    ["totalFramesCompared", packet.scope.totalFramesCompared, expected.totalFramesCompared],
    ["totalFramesExpected", packet.scope.totalFramesExpected, expected.totalFramesExpected],
  ].filter(([, , expectedValue]) => typeof expectedValue !== "undefined");
}

function runFixture(fixture) {
  const outPath = `${OUTPUT_DIR}/${fixture.id}.packet.json`;
  const mdOutPath = `${OUTPUT_DIR}/${fixture.id}.packet.md`;
  mkdirSync(dirname(resolve(outPath)), { recursive: true });

  const args = [
    "scripts/movement-debug/diagnose-replay-studio.mjs",
    "--fixture",
    fixture.id,
    "--out",
    outPath,
    "--md-out",
    mdOutPath,
  ];
  if (typeof fixture.frame === "number") args.push("--frame", String(fixture.frame));
  if (typeof fixture.recordingId === "string") args.push("--recording-id", fixture.recordingId);

  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return {
      fixtureInputKind: fixture.inputKind,
      fixtureInputPath: fixture.inputPath,
      fixtureRefreshCommand: fixture.refreshCommand,
      id: fixture.id,
      ok: false,
      problem: [
        `diagnose command exited ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ].filter(Boolean).join("\n"),
    };
  }

  const packet = readJson(outPath);
  const mismatches = expectedChecks(fixture, packet)
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => `${field}: expected ${expected}, got ${actual}`);
  if (mismatches.length > 0) {
    return {
      fixtureInputKind: fixture.inputKind,
      fixtureInputPath: fixture.inputPath,
      fixtureRefreshCommand: fixture.refreshCommand,
      id: fixture.id,
      ok: false,
      problem: mismatches.join("; "),
    };
  }

  return {
    fixtureInputKind: fixture.inputKind,
    fixtureInputPath: fixture.inputPath,
    fixtureRefreshCommand: fixture.refreshCommand,
    id: fixture.id,
    ok: true,
    packet,
  };
}

function formatStageList(stages) {
  return stages.length > 0 ? stages.join(", ") : "none";
}

function summarizeStageCoverage(results) {
  const coveredStages = new Set();
  const unknownStages = new Set();

  for (const result of results) {
    if (!result.ok) continue;
    const stage = result.packet.divergence.firstDivergentStage;
    if (KNOWN_REPAIR_STAGES.includes(stage)) {
      coveredStages.add(stage);
    } else {
      unknownStages.add(stage);
    }
  }

  return {
    coveredStages: KNOWN_REPAIR_STAGES.filter((stage) => coveredStages.has(stage)),
    gapStages: KNOWN_REPAIR_STAGES.filter((stage) => !coveredStages.has(stage)),
    unknownStages: Array.from(unknownStages).sort(),
  };
}

function resultSummary(result) {
  if (!result.ok) {
    return {
      fixtureInputKind: result.fixtureInputKind,
      fixtureInputPath: result.fixtureInputPath,
      fixtureRefreshCommand: result.fixtureRefreshCommand,
      id: result.id,
      ok: false,
      problem: result.problem,
    };
  }

  const artifact = result.packet.artifact;
  return {
    artifactCheckedPaths: artifact?.checkedPaths ?? [],
    artifactFreshnessStatus: artifact?.freshness?.status ?? null,
    artifactKind: artifact?.kind ?? null,
    artifactPath: artifact?.path ?? null,
    artifactRefreshCommand: artifact?.refreshCommand ?? null,
    evidenceStatus: result.packet.verdict.evidenceStatus,
    failureCode: result.packet.verdict.failureCode,
    firstDivergentStage: result.packet.divergence.firstDivergentStage,
    fixtureId: result.packet.recording.fixtureId,
    fixtureInputKind: result.fixtureInputKind,
    fixtureInputPath: result.fixtureInputPath,
    fixtureRefreshCommand: result.fixtureRefreshCommand,
    id: result.id,
    ok: true,
    repairOwner: result.packet.repair.owner,
    sourceHash: result.packet.recording.sourceHash,
    sourceHashBasis: result.packet.recording.sourceHashBasis,
    status: result.packet.verdict.status,
    totalFramesCompared: result.packet.scope.totalFramesCompared,
    totalFramesExpected: result.packet.scope.totalFramesExpected,
    totalFramesRendered: result.packet.scope.totalFramesRendered,
  };
}

function buildGoldenSummary({ failures, fixtures, results, stageCoverage }) {
  return {
    command: "movement:diagnose:golden",
    fixtureCount: fixtures.length,
    ok: failures.length === 0 && stageCoverage.unknownStages.length === 0,
    results: results.map(resultSummary),
    schemaVersion: 1,
    stageCoverage,
  };
}

const args = parseArgs(process.argv.slice(2));
const fixtures = validateRegistry(readJson(REGISTRY_RELATIVE_PATH));
const results = fixtures.map(runFixture);
const failures = results.filter((result) => !result.ok);
const stageCoverage = summarizeStageCoverage(results);
const summary = buildGoldenSummary({ failures, fixtures, results, stageCoverage });

if (args.jsonOutPath) {
  const outPath = resolve(args.jsonOutPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
}

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  for (const result of results) {
    if (result.ok) {
      console.log(
        `OK ${result.id}: ${result.packet.verdict.status}/${result.packet.verdict.failureCode}/${result.packet.divergence.firstDivergentStage}`,
      );
    } else {
      console.error(`FAIL ${result.id}: ${result.problem}`);
    }
  }

  console.log(`Coverage stages: ${formatStageList(stageCoverage.coveredStages)}`);
  console.log(`Coverage gaps: ${formatStageList(stageCoverage.gapStages)}`);

  if (stageCoverage.unknownStages.length > 0) {
    console.error(`Unknown repair stages: ${formatStageList(stageCoverage.unknownStages)}`);
  }

  if (args.jsonOutPath) console.log(`Wrote ${resolve(args.jsonOutPath)}`);
}

if (!summary.ok) {
  process.exitCode = 1;
}
