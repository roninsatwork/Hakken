#!/usr/bin/env node

import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entryPoint = resolve("scripts/movement-debug/analyze-sessions-cli.ts");
const bundlePath = resolve("tmp/movement-replay-lab/analyze-sessions-cli.bundle.mjs");

mkdirSync(dirname(bundlePath), { recursive: true });

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
const { runMovementReplayAnalyzerCli } = await import(bundleUrl);

await runMovementReplayAnalyzerCli(process.argv.slice(2));
