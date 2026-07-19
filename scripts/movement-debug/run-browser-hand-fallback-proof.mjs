#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(process.argv.slice(2).reduce((entries, value, index, values) => {
  if (value.startsWith("--")) entries.push([value.slice(2), values[index + 1]]);
  return entries;
}, []));
const baseUrl = args["base-url"] || "http://localhost:3000";
const imagePath = path.resolve(args.image || "scripts/movement-debug/fixtures/deep-capture/near-camera-open-left-palm.png");
const outDir = path.resolve(args.out || "tmp/movement-replay-lab/hand-fallback-browser-proof");
const secret = args.secret || process.env.LOCAL_TEST_AUTH_SECRET || "";
await mkdir(outDir, { recursive: true });
const bundlePath = path.join(outDir, "browser-entry.js");
await build({
  banner: { js: "/* eslint-disable -- generated browser proof bundle */" },
  bundle: true,
  entryPoints: [path.resolve("scripts/movement-debug/browser-hand-fallback-proof-entry.ts")],
  format: "iife",
  outfile: bundlePath,
  platform: "browser",
  sourcemap: false,
});

const imageBuffer = await readFile(imagePath);
const imageDataUrl = `data:image/png;base64,${imageBuffer.toString("base64")}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { height: 1000, width: 1400 } });
  if (secret) {
    const authUrl = new URL("/local-test-auth", baseUrl);
    authUrl.searchParams.set("role", "super-admin");
    authUrl.searchParams.set("secret", secret);
    authUrl.searchParams.set("redirectTo", "/demos/movements/replay-lab");
    await page.goto(authUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/demos/movements/replay-lab");
  } else {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  }
  await page.goto("about:blank");
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; background: #08080d; color: white; font: 16px system-ui; }
    main { width: min(1280px, calc(100vw - 32px)); margin: 16px auto; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    #proof-status { color: #86efac; font-weight: 800; margin-bottom: 12px; }
    canvas { width: 100%; height: auto; border: 1px solid #334155; border-radius: 16px; }
    pre { white-space: pre-wrap; background: #111827; padding: 16px; border-radius: 12px; }
  </style></head><body><main>
    <h1>Deep Capture hand fallback — browser proof</h1>
    <div id="proof-status">Running local browser models…</div>
    <canvas id="proof-canvas"></canvas>
    <pre id="proof-report"></pre>
  </main></body></html>`);
  await page.addScriptTag({ path: bundlePath });
  const report = await page.evaluate(async (dataUrl) => {
    if (!window.__runMovementHandFallbackProof) throw new Error("Browser proof entry did not load.");
    return window.__runMovementHandFallbackProof(dataUrl);
  }, imageDataUrl);
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ fullPage: true, path: path.join(outDir, "browser-proof.png") });
  if (!report?.passed) throw new Error(`Browser hand fallback proof failed: ${JSON.stringify(report)}`);
  console.log(`Browser hand fallback proof passed (${report.mappedImageLandmarkCount} image + ${report.mappedWorldLandmarkCount} world landmarks).`);
  console.log(`Wrote ${outDir}`);
} finally {
  await browser.close();
}
