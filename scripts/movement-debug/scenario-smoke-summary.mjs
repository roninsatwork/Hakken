#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function printHelp() {
  console.log(`Summarize Movement Replay scenario proof manifests.

Usage:
  npm run movement:replay:scenario-summary -- --controlling-manifest tmp/movement-replay-lab/current-analysis-reviewed.proof-manifest.json --manifest tmp/movement-replay-lab/front-leg-isolation-scenario-reviewed-smoke.proof-manifest.json --markdown-out tmp/movement-replay-lab/current-scenario-summary.md

Options:
  --manifest <path>              Proof manifest to summarize. Can repeat.
  --controlling-manifest <path>  Optional reviewed manifest for unique blocker counts.
  --out <path>                   Optional. Write JSON summary.
  --markdown-out <path>          Optional. Write Markdown table.
  --help                         Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    controllingManifest: "",
    manifests: [],
    markdownOut: "",
    out: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--manifest") {
      args.manifests.push(argv[++index] || "");
    } else if (arg === "--controlling-manifest") {
      args.controllingManifest = argv[++index] || "";
    } else if (arg === "--out") {
      args.out = argv[++index] || "";
    } else if (arg === "--markdown-out") {
      args.markdownOut = argv[++index] || "";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.manifests = args.manifests.filter(Boolean);
  if (args.manifests.length === 0) {
    throw new Error("At least one --manifest path is required.");
  }

  return args;
}

function countUniqueRecordingIds(rows) {
  return new Set(
    (rows ?? [])
      .map((row) => row.recordingId)
      .filter(Boolean),
  ).size;
}

function formatCounts(counts) {
  const entries = Object.entries(counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftKey.localeCompare(rightKey);
    });

  return entries.length > 0
    ? entries.map(([key, count]) => `${key}:${count}`).join(", ")
    : "none";
}

export function scenarioNameFromManifestPath(filePath) {
  const fileName = basename(filePath);
  return fileName
    .replace(/\.proof-manifest\.json$/, "")
    .replace(/-scenario-reviewed-smoke$/, "")
    .replace(/-scenario-smoke$/, "");
}

export function scenarioSmokeSummaryForManifest(manifest, options = {}) {
  const rows = manifest?.rows ?? [];
  const summary = manifest?.summary ?? {};

  return {
    acceptedProductLimitationCount: summary.acceptedProductLimitationCount ?? 0,
    blockerCodes: summary.blockingRowsByProofBlockerCode ?? {},
    failedCount: summary.failedCount ?? 0,
    manualReviewCount: summary.manualReviewCount ?? 0,
    missingProofCount: summary.missingProofCount ?? 0,
    passedCount: summary.passedCount ?? 0,
    proofCases: summary.blockingRowsByProofCase ?? {},
    productScopeLimitationCount: summary.productScopeLimitationCount ?? 0,
    recordingIdCount: countUniqueRecordingIds(rows),
    scenario: options.scenario || "unknown",
    sourceDataLimitationCount: summary.sourceDataLimitationCount ?? 0,
    totalRows: summary.totalRows ?? rows.length,
    visualCaptureFrameCount: summary.visualCaptureFrameCount ?? 0,
    visualCaptureRowCount: summary.visualCaptureRowCount ?? 0,
  };
}

export function controllingManifestSummaryForManifest(manifest, options = {}) {
  if (!manifest) return null;
  const summary = manifest.summary ?? {};

  return {
    acceptedProductLimitationCount: summary.acceptedProductLimitationCount ?? 0,
    blockerCodes: summary.blockingRowsByProofBlockerCode ?? {},
    failedCount: summary.failedCount ?? 0,
    manualReviewCount: summary.manualReviewCount ?? 0,
    missingProofCount: summary.missingProofCount ?? 0,
    passedCount: summary.passedCount ?? 0,
    path: options.path || "",
    proofCases: summary.blockingRowsByProofCase ?? {},
    productScopeLimitationCount: summary.productScopeLimitationCount ?? 0,
    sourceDataLimitationCount: summary.sourceDataLimitationCount ?? 0,
    totalRows: summary.totalRows ?? manifest.rows?.length ?? 0,
    visualCaptureFrameCount: summary.visualCaptureFrameCount ?? 0,
    visualCaptureRowCount: summary.visualCaptureRowCount ?? 0,
  };
}

export function scenarioSmokeSummaryForEntries(entries, options = {}) {
  const scenarios = entries.map(({ manifest, path, scenario }) => scenarioSmokeSummaryForManifest(
    manifest,
    { scenario: scenario || scenarioNameFromManifestPath(path || "") },
  ));

  const totals = scenarios.reduce((accumulator, scenario) => ({
    acceptedProductLimitationCount: accumulator.acceptedProductLimitationCount + scenario.acceptedProductLimitationCount,
    failedCount: accumulator.failedCount + scenario.failedCount,
    manualReviewCount: accumulator.manualReviewCount + scenario.manualReviewCount,
    missingProofCount: accumulator.missingProofCount + scenario.missingProofCount,
    passedCount: accumulator.passedCount + scenario.passedCount,
    productScopeLimitationCount:
      accumulator.productScopeLimitationCount + scenario.productScopeLimitationCount,
    recordingIdCount: accumulator.recordingIdCount + scenario.recordingIdCount,
    sourceDataLimitationCount: accumulator.sourceDataLimitationCount + scenario.sourceDataLimitationCount,
    totalRows: accumulator.totalRows + scenario.totalRows,
    visualCaptureFrameCount: accumulator.visualCaptureFrameCount + scenario.visualCaptureFrameCount,
    visualCaptureRowCount: accumulator.visualCaptureRowCount + scenario.visualCaptureRowCount,
  }), {
    acceptedProductLimitationCount: 0,
    failedCount: 0,
    manualReviewCount: 0,
    missingProofCount: 0,
    passedCount: 0,
    productScopeLimitationCount: 0,
    recordingIdCount: 0,
    sourceDataLimitationCount: 0,
    totalRows: 0,
    visualCaptureFrameCount: 0,
    visualCaptureRowCount: 0,
  });

  return {
    controllingManifest: controllingManifestSummaryForManifest(
      options.controllingManifest,
      { path: options.controllingManifestPath },
    ),
    generatedAt: new Date().toISOString(),
    scenarios,
    totals,
    totalsNote: "Scenario totals are row-occurrences and can double-count overlapping proof rows. Use the controlling reviewed manifest for unique blocker counts.",
  };
}

export function scenarioSmokeSummaryMarkdown(summary) {
  const lines = [
    "# Movement Replay Scenario Smoke Summary",
    "",
  ];

  if (summary.controllingManifest) {
    const controlling = summary.controllingManifest;
    lines.push("## Controlling Reviewed Manifest");
    lines.push("");
    lines.push([
      `Unique rows: ${controlling.totalRows}`,
      `${controlling.passedCount} passed`,
      `${controlling.missingProofCount} missing-proof`,
      `${controlling.manualReviewCount} manual-review`,
      `${controlling.productScopeLimitationCount} product-scope-limitation`,
      `${controlling.acceptedProductLimitationCount} accepted limitations`,
      `${controlling.visualCaptureRowCount} visual rows`,
      `${controlling.visualCaptureFrameCount} frame matches`,
    ].join("; "));
    lines.push("");
    lines.push(`Unique blockers: ${formatCounts(controlling.blockerCodes)}.`);
    lines.push(`Unique proof cases: ${formatCounts(controlling.proofCases)}.`);
    if (controlling.path) lines.push(`Source: \`${controlling.path}\`.`);
    lines.push("");
  }

  lines.push("## Scenario Manifests");
  lines.push("");
  lines.push("| Scenario | Recordings | Passed | Missing Proof | Manual Review | Product-Scope Limitations | Accepted Limitations | Visual Rows | Frame Matches | Blockers | Proof Cases |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");

  for (const scenario of summary.scenarios ?? []) {
    lines.push([
      `| ${scenario.scenario}`,
      scenario.recordingIdCount,
      scenario.passedCount,
      scenario.missingProofCount,
      scenario.manualReviewCount,
      scenario.productScopeLimitationCount,
      scenario.acceptedProductLimitationCount,
      scenario.visualCaptureRowCount,
      scenario.visualCaptureFrameCount,
      formatCounts(scenario.blockerCodes),
      `${formatCounts(scenario.proofCases)} |`,
    ].join(" | "));
  }

  lines.push("");
  lines.push("Scenario rows can overlap, so totals below are row-occurrences. Use the controlling reviewed manifest for unique blocker counts.");
  lines.push([
    "Scenario row-occurrence totals:",
    `${summary.totals?.passedCount ?? 0} passed`,
    `${summary.totals?.missingProofCount ?? 0} missing-proof`,
    `${summary.totals?.manualReviewCount ?? 0} manual-review`,
    `${summary.totals?.productScopeLimitationCount ?? 0} product-scope-limitation`,
    `${summary.totals?.acceptedProductLimitationCount ?? 0} accepted limitations`,
  ].join(" "));

  return `${lines.join("\n")}\n`;
}

async function readManifestEntry(filePath) {
  return {
    manifest: JSON.parse(await readFile(resolve(filePath), "utf8")),
    path: filePath,
  };
}

async function writeTextFile(filePath, text) {
  const resolved = resolve(filePath);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, text);
  console.log(`Wrote ${resolved}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const entries = await Promise.all(args.manifests.map(readManifestEntry));
  const controllingEntry = args.controllingManifest
    ? await readManifestEntry(args.controllingManifest)
    : null;
  const summary = scenarioSmokeSummaryForEntries(entries, {
    controllingManifest: controllingEntry?.manifest,
    controllingManifestPath: controllingEntry?.path,
  });
  const markdown = scenarioSmokeSummaryMarkdown(summary);

  console.log(markdown.trimEnd());

  if (args.out) {
    await writeTextFile(args.out, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (args.markdownOut) {
    await writeTextFile(args.markdownOut, markdown);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
