#!/usr/bin/env node

import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entryPoint = resolve("scripts/movement-debug/recover-local-movement-packet-cli.ts");
const bundleTempDir = mkdtempSync(join(tmpdir(), "hakken-local-movement-recovery-"));
const bundlePath = join(bundleTempDir, "recover-local-movement-packet-cli.bundle.mjs");

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
  const { runRecoverLocalMovementPacketCli } = await import(
    `${pathToFileURL(bundlePath).href}?t=${Date.now()}`
  );
  runRecoverLocalMovementPacketCli(process.argv.slice(2));
} finally {
  rmSync(bundleTempDir, { force: true, recursive: true });
}
