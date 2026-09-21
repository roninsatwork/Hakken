#!/usr/bin/env node

/* global navigator, window */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { cpus, freemem, platform, tmpdir, totalmem } from "node:os";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { auditDenseCaptureBenchmarkManifest } from "./dense-capture-benchmark.mjs";

export const DENSE_CAPTURE_BROWSER_CANDIDATES = [
  {
    id: "bodypix-mobilenet-v1-075-q2",
    license: "Apache-2.0 repository; model-weight attribution and product review pending",
    model: { architecture: "MobileNetV1", multiplier: 0.75, outputStride: 16, quantBytes: 2 },
    modelId: "bodypix-mobilenet-v1-075-q2@2.2.1",
    modelUrl: "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/075/model-stride16.json",
  },
  {
    id: "bodypix-resnet50-q2",
    license: "Apache-2.0 repository; model-weight attribution and product review pending",
    model: { architecture: "ResNet50", outputStride: 32, quantBytes: 2 },
    modelId: "bodypix-resnet50-q2@2.2.1",
    modelUrl: "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/resnet50/quant2/model-stride32.json",
  },
];

function argValue(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

function sha256Parts(parts) {
  const hash = createHash("sha256");
  parts.forEach((part) => hash.update(part));
  return `sha256:${hash.digest("hex")}`;
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

export function parseByteRange(rangeHeader, byteLength) {
  if (byteLength <= 0) return null;
  const suffixMatch = /^bytes=-(\d+)$/.exec(rangeHeader ?? "");
  if (suffixMatch) {
    const suffixLength = Number(suffixMatch[1]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { end: byteLength - 1, start: Math.max(0, byteLength - suffixLength) };
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= byteLength || requestedEnd < start) {
    return null;
  }
  return { end: Math.min(requestedEnd, byteLength - 1), start };
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Model download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function cacheModelArtifacts(candidate, modelRoot) {
  const candidateRoot = path.join(modelRoot, candidate.id);
  await mkdir(candidateRoot, { recursive: true });
  let modelJson;
  try {
    modelJson = await readFile(path.join(candidateRoot, "model.json"));
  } catch {
    modelJson = await download(candidate.modelUrl);
  }
  const parsed = JSON.parse(modelJson.toString("utf8"));
  const shardPaths = Array.from(new Set(
    (parsed.weightsManifest ?? []).flatMap((group) => group.paths ?? []),
  ));
  const files = [{ bytes: modelJson, relativePath: "model.json" }];
  for (const shardPath of shardPaths) {
    let bytes;
    try {
      bytes = await readFile(path.join(candidateRoot, shardPath));
    } catch {
      bytes = await download(new URL(shardPath, candidate.modelUrl).toString());
    }
    files.push({ bytes, relativePath: shardPath });
  }
  await Promise.all(files.map(async ({ bytes, relativePath }) => {
    const outPath = path.join(candidateRoot, relativePath);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, bytes);
  }));
  return {
    artifactBytes: files.reduce((total, file) => total + file.bytes.length, 0),
    files: files.map((file) => file.relativePath),
    modelHash: sha256Parts(files.map((file) => file.bytes)),
    root: candidateRoot,
  };
}

async function startPrivateServer({ bundlePath, clips, modelCaches, token }) {
  const routes = new Map();
  routes.set(`/${token}/benchmark.js`, bundlePath);
  clips.forEach((clip) => {
    routes.set(`/${token}/clips/${encodeURIComponent(clip.id)}${path.extname(clip.path)}`, clip.path);
  });
  modelCaches.forEach(({ cache, candidate }) => {
    cache.files.forEach((relativePath) => {
      routes.set(`/${token}/models/${candidate.id}/${relativePath}`, path.join(cache.root, relativePath));
    });
  });
  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (requestPath === `/${token}/`) {
        response.writeHead(200, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><html><body><script type="module" src="/${token}/benchmark.js"></script></body></html>`);
        return;
      }
      const filePath = routes.get(requestPath);
      if (!filePath) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const bytes = await readFile(filePath);
      const range = parseByteRange(request.headers.range, bytes.length);
      if (request.headers.range && !range) {
        response.writeHead(416, { "content-range": `bytes */${bytes.length}` });
        response.end();
        return;
      }
      if (range) {
        const body = bytes.subarray(range.start, range.end + 1);
        response.writeHead(206, {
          "accept-ranges": "bytes",
          "cache-control": "no-store",
          "content-length": body.length,
          "content-range": `bytes ${range.start}-${range.end}/${bytes.length}`,
          "content-type": contentType(filePath),
        });
        response.end(body);
        return;
      }
      response.writeHead(200, {
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "content-length": bytes.length,
        "content-type": contentType(filePath),
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

function serverPort(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Private benchmark server did not expose a TCP port.");
  return address.port;
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function runCandidateInBrowser({
  browser,
  candidate,
  cache,
  clips,
  cycles,
  inputMode,
  qualityTier,
  evidenceType,
  port,
  token,
}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.exposeFunction("reportDenseProgress", (message) => {
    console.log(`[dense-benchmark] ${candidate.id}: ${message}`);
  });
  const baseUrl = `http://127.0.0.1:${port}/${token}`;
  await page.addInitScript((config) => {
    window.__denseCaptureBenchmarkConfig = config;
  }, {
    candidateId: candidate.id,
    clips: clips.map((clip) => ({
      id: clip.id,
      url: `${baseUrl}/clips/${encodeURIComponent(clip.id)}${path.extname(clip.path)}`,
    })),
    model: candidate.model,
    modelUrl: `${baseUrl}/models/${candidate.id}/model.json`,
    cycles,
    inputMode,
    qualityTier,
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__denseCaptureBenchmarkDone === true, null, { timeout: 10 * 60_000 });
  const error = await page.evaluate(() => window.__denseCaptureBenchmarkError ?? null);
  if (error) throw new Error(`${candidate.id} browser benchmark failed: ${error}`);
  const measurement = await page.evaluate(() => window.__denseCaptureBenchmarkResult);
  const browserDevice = await page.evaluate(() => ({
    deviceMemoryGb: navigator.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    userAgent: navigator.userAgent,
  }));
  await context.close();
  return {
    ...measurement,
    artifactBytes: cache.artifactBytes,
    browserDevice,
    id: candidate.id,
    geometryCapabilities: {
      anatomicalCorrespondence: "semantic-part-lattice",
      depth: "unavailable",
      surfaceNormals: "unavailable",
    },
    license: candidate.license,
    memoryMeasurementStatus: "partial-tensor-only",
    minimumSupportedDevice: "Pending lower-tier device measurement and reviewer decision",
    minimumSupportedDeviceStatus: "pending-lower-tier",
    modelHash: cache.modelHash,
    modelId: candidate.modelId,
    peakMemoryMb: Math.max(1, measurement.peakTensorMemoryMb),
    runtime: "webgl",
    status: "measured",
    thermalMeasurementStatus: evidenceType === "sustained-performance"
      ? "automated-soak-complete"
      : "pending-manual",
    thermalNotes: evidenceType === "sustained-performance"
      ? `${cycles}-cycle automated sustained-performance run completed; no browser thermal sensor is available, so manual/device thermal review remains required.`
      : "Short automated browser run only; no browser thermal sensor is available. Sustained manual review remains required.",
  };
}

export async function runDenseCaptureBrowserBenchmark({
  candidateIds = DENSE_CAPTURE_BROWSER_CANDIDATES.map((candidate) => candidate.id),
  cycles = 1,
  evidenceType = "candidate-comparison",
  inputMode = "video",
  qualityTier = "high",
  manifestPath,
  outPath,
  rootDir = process.cwd(),
}) {
  if (!Number.isSafeInteger(cycles) || cycles <= 0) throw new Error("Benchmark cycles must be a positive integer.");
  if (!["canvas", "video"].includes(inputMode)) throw new Error("Benchmark input mode must be canvas or video.");
  if (!["high", "medium", "low"].includes(qualityTier)) throw new Error("Benchmark quality tier is invalid.");
  const selectedCandidates = DENSE_CAPTURE_BROWSER_CANDIDATES.filter(
    (candidate) => candidateIds.includes(candidate.id),
  );
  if (selectedCandidates.length !== candidateIds.length || selectedCandidates.length === 0) {
    throw new Error("Benchmark candidate selection contains an unknown or empty candidate id.");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifestReport = auditDenseCaptureBenchmarkManifest(manifest, { rootDir });
  if (!manifestReport.passed) throw new Error(`Dense benchmark manifest is invalid: ${manifestReport.failures.join("; ")}`);
  const clips = manifest.clips.map((clip) => ({ ...clip, path: path.resolve(rootDir, clip.path) }));
  const privateRoot = path.resolve(rootDir, "tmp/movement-replay-lab/dense-capture");
  const modelRoot = path.join(privateRoot, "models");
  const transientRoot = await mkdtemp(path.join(tmpdir(), "hakken-dense-browser-benchmark-"));
  const bundlePath = path.join(transientRoot, "benchmark.js");
  const token = randomBytes(18).toString("hex");
  let browser;
  let server;
  try {
    await build({
      bundle: true,
      entryPoints: [path.resolve(rootDir, "scripts/movement-debug/dense-capture-browser-benchmark-page.mjs")],
      format: "esm",
      logLevel: "silent",
      minify: true,
      outfile: bundlePath,
      platform: "browser",
      sourcemap: false,
    });
    const modelCaches = [];
    for (const candidate of selectedCandidates) {
      modelCaches.push({ candidate, cache: await cacheModelArtifacts(candidate, modelRoot) });
    }
    server = await startPrivateServer({ bundlePath, clips, modelCaches, token });
    browser = await chromium.launch({
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
      headless: false,
    });
    const candidates = [];
    for (const entry of modelCaches) {
      try {
        candidates.push(await runCandidateInBrowser({
          browser,
          candidate: entry.candidate,
          cache: entry.cache,
          clips,
          cycles,
          evidenceType,
          inputMode,
          qualityTier,
          port: serverPort(server),
          token,
        }));
      } catch (error) {
        candidates.push({
          artifactBytes: entry.cache.artifactBytes,
          id: entry.candidate.id,
          license: entry.candidate.license,
          modelHash: entry.cache.modelHash,
          modelId: entry.candidate.modelId,
          rejectionReason: error instanceof Error ? error.message : String(error),
          runtime: "webgl",
          status: "rejected",
        });
      }
    }
    const results = {
      candidates,
      cycles,
      evidenceType,
      inputMode,
      qualityTier,
      measuredAt: new Date().toISOString(),
      measurementHost: {
        architecture: process.arch,
        cpu: cpus()[0]?.model ?? "unknown",
        freeMemoryMbAfterRun: Math.round(freemem() / 1024 ** 2),
        logicalCpuCount: cpus().length,
        memoryGb: Math.round(totalmem() / 1024 ** 3),
        platform: platform(),
      },
      schemaVersion: 1,
      selectedCandidateId: null,
      selectionStatus: evidenceType === "sustained-performance"
        ? "evidence-only"
        : "pending-review",
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(results, null, 2)}\n`);
    return results;
  } finally {
    if (browser) await browser.close();
    if (server) await closeServer(server);
    await rm(transientRoot, { force: true, recursive: true });
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const rootDir = process.cwd();
  const manifestPath = path.resolve(rootDir, argValue(
    process.argv,
    "--manifest",
    "tmp/movement-replay-lab/dense-capture/benchmark-manifest.json",
  ));
  const outPath = path.resolve(rootDir, argValue(
    process.argv,
    "--out",
    "tmp/movement-replay-lab/dense-capture/benchmark-results.json",
  ));
  const candidateArg = argValue(process.argv, "--candidate", "");
  const candidateIds = candidateArg
    ? candidateArg.split(",").map((value) => value.trim()).filter(Boolean)
    : DENSE_CAPTURE_BROWSER_CANDIDATES.map((candidate) => candidate.id);
  const cycles = Number(argValue(process.argv, "--cycles", "1"));
  const evidenceType = argValue(process.argv, "--evidence-type", "candidate-comparison");
  const inputMode = argValue(process.argv, "--input-mode", "video");
  const qualityTier = argValue(process.argv, "--quality-tier", "high");
  runDenseCaptureBrowserBenchmark({ candidateIds, cycles, evidenceType, inputMode, manifestPath, outPath, qualityTier, rootDir })
    .then((results) => {
      console.log(JSON.stringify({
        candidateCount: results.candidates.length,
        cycles: results.cycles,
        evidenceType: results.evidenceType,
        outPath,
        selectedCandidateId: results.selectedCandidateId,
        selectionStatus: results.selectionStatus,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}
