import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DENSE_CAPTURE_REQUIRED_SCENARIOS } from "./dense-capture-benchmark.mjs";

const VIDEO_EXTENSION = /\.(m4v|mov|mp4|webm)$/i;

export function planDenseCaptureBenchmarkIngest({ entries }) {
  const failures = [];
  const selected = [];
  for (const scenario of DENSE_CAPTURE_REQUIRED_SCENARIOS) {
    const matches = entries
      .filter((entry) => entry.isFile && entry.size > 0 && VIDEO_EXTENSION.test(entry.name))
      .filter((entry) => entry.name.toLowerCase().startsWith(`${scenario}-`))
      .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || left.name.localeCompare(right.name));
    if (matches.length === 0) {
      failures.push(`No downloaded ${scenario} benchmark clip was found.`);
      continue;
    }
    selected.push({ ...matches[0], scenario });
  }
  return {
    failures,
    passed: failures.length === 0,
    selected,
  };
}

function sha256(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

export function ingestDenseCaptureBenchmark({
  confirmBenchmarkConsent,
  destinationDir,
  sourceDir,
}) {
  if (!confirmBenchmarkConsent) {
    return {
      copied: [],
      failures: ["Explicit --confirm-benchmark-consent is required before copying RGB clips into the private benchmark folder."],
      passed: false,
    };
  }
  if (!fs.existsSync(sourceDir)) {
    return {
      copied: [],
      failures: [`Benchmark download source does not exist: ${sourceDir}.`],
      passed: false,
    };
  }
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).map((entry) => {
    const filePath = path.join(sourceDir, entry.name);
    const stats = entry.isFile() ? fs.statSync(filePath) : null;
    return {
      isFile: entry.isFile(),
      modifiedAtMs: stats?.mtimeMs ?? 0,
      name: entry.name,
      size: stats?.size ?? 0,
    };
  });
  const plan = planDenseCaptureBenchmarkIngest({ entries });
  if (!plan.passed) return { copied: [], failures: plan.failures, passed: false };

  fs.mkdirSync(destinationDir, { recursive: true });
  const copied = plan.selected.map((entry) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    return {
      bytes: entry.size,
      destinationPath,
      hash: sha256(destinationPath),
      preservedSourcePath: sourcePath,
      scenario: entry.scenario,
    };
  });
  return { copied, failures: [], passed: true };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const report = ingestDenseCaptureBenchmark({
    confirmBenchmarkConsent: process.argv.includes("--confirm-benchmark-consent"),
    destinationDir: path.resolve(
      rootDir,
      argValue("--destination-dir") ?? "tmp/movement-replay-lab/dense-capture/clips",
    ),
    sourceDir: path.resolve(argValue("--source-dir") ?? path.join(os.homedir(), "Downloads")),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
