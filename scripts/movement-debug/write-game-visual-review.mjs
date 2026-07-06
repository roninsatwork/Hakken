#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultManifestPath = "tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json";
const defaultOutPath = "tmp/movement-replay-lab/current-game-visual-proof-review.md";
const defaultDecisionsPath = "tmp/movement-replay-lab/current-game-visual-proof-review-decisions.template.json";

const validDecisions = [
  "TODO",
  "readable-pass",
  "readable-fail",
  "needs-stronger-automated-assertion",
  "needs-recapture",
];

function printHelp() {
  console.log(`Write a focused Game Studio visual-proof review checklist.

Usage:
  npm run movement:game-visual-review -- --manifest tmp/movement-replay-lab/captures/game-visual-proof/game-visual-proof-captures-manifest.json

Options:
  --manifest <file>       Game visual capture manifest. Defaults to ${defaultManifestPath}
  --out <file>            Markdown review checklist. Defaults to ${defaultOutPath}
  --decisions-out <file>  JSON decision template. Defaults to ${defaultDecisionsPath}
  --help                  Show this help
`);
}

export function parseGameVisualReviewArgs(argv) {
  const args = {
    decisionsOutPath: defaultDecisionsPath,
    help: false,
    manifestPath: defaultManifestPath,
    outPath: defaultOutPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--manifest") {
      args.manifestPath = argv[++index] || args.manifestPath;
    } else if (arg === "--out") {
      args.outPath = argv[++index] || args.outPath;
    } else if (arg === "--decisions-out") {
      args.decisionsOutPath = argv[++index] || args.decisionsOutPath;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function targetKey(capture) {
  const target = capture?.target ?? {};
  return [
    target.recordingId ?? "unknown-recording",
    target.frameIndex ?? "unknown-frame",
    Array.isArray(target.cases) ? target.cases.join("+") : "target",
  ].join(":");
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function proofCaseCounts(captures) {
  const cases = captures.flatMap((capture) => capture?.target?.cases ?? []);
  return Object.fromEntries(Object.entries(countBy(cases)).sort(([a], [b]) => a.localeCompare(b)));
}

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildGameVisualReview(manifest, options = {}) {
  const captures = Array.isArray(manifest?.captures) ? manifest.captures : [];
  const errors = Array.isArray(manifest?.errors) ? manifest.errors : [];
  const summary = {
    capturedCount: captures.length,
    errorCount: errors.length,
    needsReviewCount: captures.filter((capture) => capture.status === "needs-review").length,
    proofCases: proofCaseCounts(captures),
    statusCounts: countBy(captures.map((capture) => capture.status ?? "unknown")),
    targetCount: manifest?.summary?.targetCount ?? captures.length + errors.length,
  };

  const decisions = captures.map((capture) => {
    const target = capture.target ?? {};
    return {
      key: targetKey(capture),
      decision: "TODO",
      notes: "",
      reviewContext: {
        canvasPath: capture.canvasPath ?? "",
        cases: Array.isArray(target.cases) ? target.cases : [],
        capturedDebugFrameIndex: capture.capturedDebugFrameIndex ?? null,
        currentUrl: capture.currentUrl ?? "",
        displayLowerLabel: target.displayLowerLabel ?? "unknown",
        frameIndex: target.frameIndex ?? null,
        metrics: capture.metrics ?? null,
        movementId: target.movementId ?? null,
        pagePath: capture.pagePath ?? "",
        recordingId: target.recordingId ?? "unknown-recording",
        sourceLowerLabel: target.sourceLowerLabel ?? "unknown",
        status: capture.status ?? "unknown",
      },
    };
  });

  const decisionTemplate = {
    schema: "sonae-game-visual-review-decisions/v1",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    manifestPath: options.manifestPath ?? "",
    validDecisions,
    summary,
    decisions,
    errors,
  };

  const lines = [
    "# Game Studio Visual Proof Review",
    "",
    `Generated: ${decisionTemplate.generatedAt}`,
    `Manifest: ${options.manifestPath ?? ""}`,
    "",
    "## Summary",
    "",
    `- Targets: ${summary.targetCount}`,
    `- Captured: ${summary.capturedCount}`,
    `- Capture errors: ${summary.errorCount}`,
    `- Nonblank needs-review captures: ${summary.needsReviewCount}`,
    `- Status counts: ${JSON.stringify(summary.statusCounts)}`,
    `- Proof cases: ${JSON.stringify(summary.proofCases)}`,
    "",
    "## Review Rules",
    "",
    "- Use `readable-pass` only when the Game screenshot visibly matches the selected source/display proof case.",
    "- Use `readable-fail` when the screenshot is rendered but the visible pose/side/label is wrong.",
    "- Use `needs-stronger-automated-assertion` when the screenshot looks acceptable but the claim should be covered by code.",
    "- Use `needs-recapture` for route, blankness, cropping, auth, or asset-loading issues.",
    "- Leave `TODO` rows untouched until reviewed.",
    "",
    "## Capture Rows",
    "",
    "| Decision | Recording | Frame | Cases | Source label | Display label | Status | Canvas | Page | Notes |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const decision of decisions) {
    const context = decision.reviewContext;
    lines.push([
      "`TODO`",
      markdownEscape(context.recordingId),
      markdownEscape(context.frameIndex),
      markdownEscape(context.cases.join(", ")),
      markdownEscape(context.sourceLowerLabel),
      markdownEscape(context.displayLowerLabel),
      markdownEscape(context.status),
      markdownEscape(context.canvasPath),
      markdownEscape(context.pagePath),
      "",
    ].join(" | "));
  }

  if (errors.length > 0) {
    lines.push("", "## Capture Errors", "");
    for (const error of errors) {
      lines.push(`- ${error?.target?.recordingId ?? "unknown-recording"} frame ${error?.target?.frameIndex ?? "unknown"}: ${error?.message ?? "unknown error"}`);
    }
  }

  lines.push("");

  return {
    decisionTemplate,
    markdown: `${lines.join("\n")}\n`,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function main() {
  const args = parseGameVisualReviewArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const manifestPath = path.resolve(args.manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const review = buildGameVisualReview(manifest, {
    manifestPath,
  });

  await writeText(args.outPath, review.markdown);
  await writeJson(args.decisionsOutPath, review.decisionTemplate);

  console.log(
    `Game visual review: ${review.decisionTemplate.summary.capturedCount}/${review.decisionTemplate.summary.targetCount} captured, ${review.decisionTemplate.summary.errorCount} error(s).`,
  );
  console.log(`Wrote ${path.resolve(args.outPath)}`);
  console.log(`Wrote ${path.resolve(args.decisionsOutPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
