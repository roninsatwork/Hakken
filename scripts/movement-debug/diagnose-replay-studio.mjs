#!/usr/bin/env node

import { build } from "esbuild";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  diagnoseReplayStudioBundleFilename,
  diagnoseReplayStudioBundleTempDir,
} from "./lib/diagnose-replay-studio-bundle-path.mjs";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";

const entryPoint = resolve("scripts/movement-debug/diagnose-replay-studio-cli.ts");
const bundleTempDir = mkdtempSync(diagnoseReplayStudioBundleTempDir());
const bundlePath = join(bundleTempDir, diagnoseReplayStudioBundleFilename());

await build({
  bundle: true,
  entryPoints: [entryPoint],
  format: "esm",
  logLevel: "silent",
  outfile: bundlePath,
  platform: "node",
  target: "node22",
});

const bundleUrl = `${pathToFileURL(bundlePath).href}?t=${Date.now()}`;
const {
  reportMovementReplayStudioDiagnoseFailure,
  runMovementReplayStudioDiagnoseCli,
} = await import(bundleUrl);

try {
  await runMovementReplayStudioDiagnoseCli(process.argv.slice(2), {
    motionPipelineFingerprint: movementPipelineFingerprint(),
  });
} catch (error) {
  process.exitCode = reportMovementReplayStudioDiagnoseFailure(error, process.argv.slice(2));
} finally {
  try {
    if (existsSync(bundleTempDir)) rmSync(bundleTempDir, { force: true, recursive: true });
  } catch {
    // Best-effort cleanup only; diagnosis output is more important than temp file removal.
  }
}
