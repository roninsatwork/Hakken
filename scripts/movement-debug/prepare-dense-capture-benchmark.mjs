import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DENSE_CAPTURE_REQUIRED_SCENARIOS } from "./dense-capture-benchmark.mjs";

const VIDEO_EXTENSION = /\.(m4v|mov|mp4|webm)$/i;

function scenarioFromFilename(filename) {
  const normalized = filename.toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  return DENSE_CAPTURE_REQUIRED_SCENARIOS.filter((scenario) => normalized.includes(scenario));
}

export function prepareDenseCaptureBenchmarkManifest({
  clipsDir,
  confirmBenchmarkConsent = false,
  files,
  rootDir = process.cwd(),
}) {
  const failures = [];
  const availableFiles = files ?? (
    fs.existsSync(clipsDir)
      ? fs.readdirSync(clipsDir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
      : []
  );
  const videoFiles = availableFiles.filter((filename) => VIDEO_EXTENSION.test(filename)).sort();
  if (!confirmBenchmarkConsent) {
    failures.push("Explicit --confirm-benchmark-consent is required before preparing an RGB benchmark manifest.");
  }
  if (videoFiles.length === 0) failures.push(`No RGB video clips were found in ${clipsDir}.`);

  const clips = videoFiles.map((filename, index) => {
    const scenarios = scenarioFromFilename(filename);
    if (scenarios.length === 0) {
      failures.push(
        `${filename} has no recognised scenario label; include one of ${DENSE_CAPTURE_REQUIRED_SCENARIOS.join(", ")} in its filename.`,
      );
    }
    return {
      consent: { benchmarkUse: confirmBenchmarkConsent },
      id: `dense-rgb-${String(index + 1).padStart(2, "0")}-${path.parse(filename).name}`,
      path: path.relative(rootDir, path.resolve(clipsDir, filename)),
      scenarios,
    };
  });
  DENSE_CAPTURE_REQUIRED_SCENARIOS.forEach((scenario) => {
    if (!clips.some((clip) => clip.scenarios.includes(scenario))) {
      failures.push(`Benchmark pack is missing a ${scenario} clip.`);
    }
  });

  return {
    failures: Array.from(new Set(failures)),
    manifest: { clips, schemaVersion: 1 },
    passed: failures.length === 0,
  };
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const clipsDir = path.resolve(
    rootDir,
    argValue("--clips-dir") ?? "tmp/movement-replay-lab/dense-capture/clips",
  );
  const outPath = path.resolve(
    rootDir,
    argValue("--out") ?? "tmp/movement-replay-lab/dense-capture/benchmark-manifest.json",
  );
  const report = prepareDenseCaptureBenchmarkManifest({
    clipsDir,
    confirmBenchmarkConsent: process.argv.includes("--confirm-benchmark-consent"),
    rootDir,
  });
  if (report.passed) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report.manifest, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...report, outPath: report.passed ? outPath : null }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
