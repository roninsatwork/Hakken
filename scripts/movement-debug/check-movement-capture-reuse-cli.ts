import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { evaluateMovementCaptureReuse } from "../../src/app/(dashboard)/demos/movements/_lib/movementCaptureReusePolicy";

function parseArgs(argv: string[]) {
  const args = {
    benchmarkResults: "",
    cameraFingerprint: "",
    denseModelHash: "",
    denseModelId: "",
    help: false,
    out: "",
    packet: "",
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--benchmark-results") args.benchmarkResults = argv[++index] || "";
    else if (arg === "--camera-fingerprint") args.cameraFingerprint = argv[++index] || "";
    else if (arg === "--dense-model-hash") args.denseModelHash = argv[++index] || "";
    else if (arg === "--dense-model-id") args.denseModelId = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--packet") args.packet = argv[++index] || "";
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function selectedDenseModel(args: ReturnType<typeof parseArgs>) {
  if (args.benchmarkResults) {
    const results = JSON.parse(readFileSync(resolve(args.benchmarkResults), "utf8"));
    const selected = results.candidates?.find(
      (candidate: { id?: string }) => candidate.id === results.selectedCandidateId,
    );
    if (!selected) throw new Error("Benchmark results have no selected dense-model candidate.");
    return {
      modelHash: selected.modelHash,
      modelId: selected.modelId ?? (
        selected.version ? `${selected.id}@${selected.version}` : selected.id
      ),
    };
  }
  if (!args.denseModelId || !args.denseModelHash) return null;
  return { modelHash: args.denseModelHash, modelId: args.denseModelId };
}

export function runMovementCaptureReuseCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Check whether an immutable schema-v3 packet can be reused after code changes.

Usage:
  npm run movement:replay-game:deep-capture-reuse -- --packet <session.json> \\
    --camera-fingerprint <fingerprint> --benchmark-results <results.json> [--strict]

Solver, shared-runtime, renderer, and proof-harness changes do not require a new capture.
Camera, detector/options, acquisition/filter, dense model, refinement, or setup-policy changes do.
`);
    return null;
  }
  if (!args.packet) throw new Error("Pass --packet <session.json>.");
  const packet = JSON.parse(readFileSync(resolve(args.packet), "utf8"));
  const report = evaluateMovementCaptureReuse({
    currentCameraFingerprint: args.cameraFingerprint || null,
    currentDenseModel: selectedDenseModel(args),
    packet,
  });
  console.log(JSON.stringify(report, null, 2));
  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.strict && !report.reusable) process.exitCode = 1;
  return report;
}
