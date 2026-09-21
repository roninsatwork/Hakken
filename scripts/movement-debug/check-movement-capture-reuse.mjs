#!/usr/bin/env node

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entryPoint = resolve("scripts/movement-debug/check-movement-capture-reuse-cli.ts");
const bundleTempDir = mkdtempSync(join(tmpdir(), "hakken-capture-reuse-"));
const bundlePath = join(bundleTempDir, "check-movement-capture-reuse-cli.bundle.mjs");
await build({
  bundle: true,
  entryPoints: [entryPoint],
  format: "esm",
  logLevel: "silent",
  outfile: bundlePath,
  platform: "node",
  target: "node22",
});
try {
  const { runMovementCaptureReuseCli } = await import(
    `${pathToFileURL(bundlePath).href}?t=${Date.now()}`
  );
  runMovementCaptureReuseCli(process.argv.slice(2));
} finally {
  rmSync(bundleTempDir, { force: true, recursive: true });
}
