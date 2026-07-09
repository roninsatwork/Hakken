#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRecordingPlanPath = "tmp/movement-replay-lab/current-proof-recording-plan.reviewed.json";
const defaultManifestPath = "tmp/movement-replay-lab/latest-recorded-proof-manifest.json";
const supportRecordingPlanPaths = [
  "tmp/movement-replay-lab/current-expansion-preview-sitting-recording-plan.json",
  "tmp/movement-replay-lab/current-expansion-preview-walking-recording-plan.json",
  "tmp/movement-replay-lab/current-facing-occlusion-recording-plan.json",
];

function printHelp() {
  console.log(`Validate one fresh-recording scenario from a generated recording plan.

Usage:
  npm run movement:replay:validate-scenario -- --scenario movement-proof-front-leg-isolation
  npm run movement:replay:validate-scenario -- --all --quiet
  npm run movement:replay:validate-scenario -- --scenario root-travel --dry-run

Options:
  --scenario <id>        Required. Capture scenario id, fresh recording label, title, or proof case.
  --all                  Validate every capture scenario in the recording plan.
  --controlling-manifest <path>
                         Include unique counts from the reviewed controlling proof manifest.
  --recording-plan <p>   Generated recording-plan JSON. Defaults to ${defaultRecordingPlanPath}
                         If omitted, known support recording plans are searched by scenario.
  --export <path>        Convex export ZIP/directory. Defaults to the scenario validation pointer.
  --out <path>           Override the scenario validation output path.
  --summary-out <path>   Write a JSON summary of validated scenario manifest counts.
  --summary-markdown-out <path>
                         Write a Markdown summary of validated scenario manifest counts.
  --strict               Forward strict mode to movement:replay:analyze.
  --strict-manifest      Forward strict manifest proof mode to movement:replay:analyze.
  --quiet                Hide analyzer session detail unless the analyzer exits non-zero.
  --dry-run              Print the analyzer argv without running it.
  --help                 Show this help.
`);
}

export function parseValidateRecordingScenarioArgs(argv) {
  const args = {
    all: false,
    controllingManifestPath: "",
    dryRun: false,
    exportPath: "",
    out: "",
    quiet: false,
    recordingPlanPath: defaultRecordingPlanPath,
    recordingPlanPathExplicit: false,
    scenario: "",
    strict: false,
    strictManifest: false,
    summaryMarkdownOut: "",
    summaryOut: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--all") {
      args.all = true;
    } else if (arg === "--controlling-manifest") {
      args.controllingManifestPath = argv[++index] || "";
    } else if (arg === "--scenario" || arg === "--recording-scenario") {
      args.scenario = argv[++index] || "";
    } else if (arg === "--recording-plan") {
      args.recordingPlanPath = argv[++index] || defaultRecordingPlanPath;
      args.recordingPlanPathExplicit = true;
    } else if (arg === "--export") {
      args.exportPath = argv[++index] || "";
    } else if (arg === "--out") {
      args.out = argv[++index] || "";
    } else if (arg === "--summary-out") {
      args.summaryOut = argv[++index] || "";
    } else if (arg === "--summary-markdown-out") {
      args.summaryMarkdownOut = argv[++index] || "";
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--strict-manifest") {
      args.strictManifest = true;
    } else if (arg === "--quiet") {
      args.quiet = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (args.all && args.scenario) {
    throw new Error("Use either --all or --scenario, not both.");
  }

  if (!args.all && !args.scenario) {
    throw new Error("--scenario is required unless --all is passed.");
  }

  return args;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeScenarioId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function scenarioCandidateIds(scenario) {
  return [
    scenario.id,
    scenario.freshRecordingLabel,
    scenario.title,
    scenario.validation?.recordingScenario,
    ...(scenario.proofCases ?? []),
  ].map(normalizeScenarioId).filter(Boolean);
}

export function selectRecordingValidationScenario(plan, scenarioId) {
  const wanted = normalizeScenarioId(scenarioId);
  const matches = (plan.captureScenarios ?? []).filter((scenario) => (
    scenarioCandidateIds(scenario).includes(wanted)
  ));

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Scenario "${scenarioId}" is ambiguous: ${matches.map((scenario) => scenario.freshRecordingLabel || scenario.id).join(", ")}`);
  }

  const available = (plan.captureScenarios ?? [])
    .map((scenario) => scenario.freshRecordingLabel || scenario.id)
    .filter(Boolean)
    .join(", ");
  throw new Error(`Scenario "${scenarioId}" was not found in the recording plan. Available scenarios: ${available || "none"}.`);
}

async function readRecordingPlanIfPresent(recordingPlanPath) {
  if (!existsSync(recordingPlanPath)) return null;
  return JSON.parse(await readFile(recordingPlanPath, "utf8"));
}

export async function resolveRecordingPlanForValidation(args, options = {}) {
  if (args.recordingPlanPathExplicit || args.all) {
    return {
      plan: JSON.parse(await readFile(args.recordingPlanPath, "utf8")),
      recordingPlanPath: args.recordingPlanPath,
    };
  }

  const fallbackRecordingPlanPaths = options.supportRecordingPlanPaths ?? supportRecordingPlanPaths;
  const candidates = uniqueValues([
    args.recordingPlanPath,
    ...fallbackRecordingPlanPaths,
  ]);
  const foundMatches = [];
  const existingLabels = [];

  for (const recordingPlanPath of candidates) {
    const plan = await readRecordingPlanIfPresent(recordingPlanPath);
    if (!plan) continue;
    existingLabels.push(recordingPlanPath);
    try {
      const scenario = selectRecordingValidationScenario(plan, args.scenario);
      foundMatches.push({ plan, recordingPlanPath, scenario });
    } catch {
      // Keep looking; missing scenarios are reported below with the searched plans.
    }
  }

  if (foundMatches.length === 1) {
    return {
      plan: foundMatches[0].plan,
      preselectedScenario: foundMatches[0].scenario,
      recordingPlanPath: foundMatches[0].recordingPlanPath,
    };
  }

  if (foundMatches.length > 1) {
    throw new Error(`Scenario "${args.scenario}" matched multiple recording plans: ${foundMatches.map((match) => match.recordingPlanPath).join(", ")}. Pass --recording-plan to choose one.`);
  }

  if (existingLabels.length > 0) {
    throw new Error(`Scenario "${args.scenario}" was not found in searched recording plans: ${existingLabels.join(", ")}. Pass --recording-plan if it lives elsewhere.`);
  }

  throw new Error(`No recording plan found. Expected ${args.recordingPlanPath}, or one of ${fallbackRecordingPlanPaths.join(", ")}. Generate the relevant support audit first, or pass --recording-plan.`);
}

function replaceFlagValue(argv, flag, value) {
  const index = argv.indexOf(flag);
  if (index === -1) return [...argv, flag, value];
  return [
    ...argv.slice(0, index + 1),
    value,
    ...argv.slice(index + 2),
  ];
}

export async function readRecordingValidationExportPath(scenario, explicitExportPath = "") {
  if (explicitExportPath) return explicitExportPath;

  const pointerPath = scenario.validation?.latestExportPointerPath;
  if (!pointerPath) {
    throw new Error("No --export was provided and the selected scenario has no validation.latestExportPointerPath.");
  }

  const exportPath = (await readFile(pointerPath, "utf8")).trim();
  if (!exportPath) {
    throw new Error(`Latest export pointer is empty: ${pointerPath}`);
  }
  return exportPath;
}

export function analyzerArgsForRecordingValidationScenario(scenario, options) {
  const validation = scenario.validation ?? {};
  let argv = Array.isArray(validation.argvTemplate) ? [...validation.argvTemplate] : [];

  if (argv.length === 0) {
    const label = scenario.freshRecordingLabel || validation.recordingScenario || scenario.id;
    argv = [
      "--export",
      "<latest-export-path>",
      "--recording-plan",
      options.recordingPlanPath,
      "--recording-scenario",
      label,
    ];
  }

  argv = argv.map((entry) => entry === "<latest-export-path>" ? options.exportPath : entry);
  argv = replaceFlagValue(argv, "--recording-plan", options.recordingPlanPath);
  if (options.out) argv = replaceFlagValue(argv, "--out", options.out);
  if (options.strict) argv.push("--strict");
  if (options.strictManifest) argv.push("--strict-manifest");

  return argv;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function validationDisplayCommand(argv, nodeVersion = "22.13.0") {
  return [
    "npx",
    "-p",
    `node@${nodeVersion}`,
    "npm",
    "run",
    "movement:replay:analyze",
    "--",
    ...argv,
  ].map(shellQuote).join(" ");
}

function valueAfterFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? "" : argv[index + 1] || "";
}

export function manifestPathForAnalyzerArgs(argv) {
  const explicitManifestPath = valueAfterFlag(argv, "--manifest-out");
  if (explicitManifestPath) return explicitManifestPath;

  const outPath = valueAfterFlag(argv, "--out");
  if (!outPath) return defaultManifestPath;
  return outPath.endsWith(".json")
    ? outPath.replace(/\.json$/, ".proof-manifest.json")
    : `${outPath}.proof-manifest.json`;
}

function formatCountMap(value) {
  return Object.entries(value ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([, left], [, right]) => Number(right) - Number(left))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ") || "none";
}

export function proofManifestValidationSummary(manifest) {
  const summary = manifest?.summary ?? {};
  return {
    acceptedProductLimitationCount: summary.acceptedProductLimitationCount ?? 0,
    blockerCodes: summary.blockingRowsByProofBlockerCode ?? {},
    failedCount: summary.failedCount ?? 0,
    manualReviewCount: summary.manualReviewCount ?? 0,
    missingProofCount: summary.missingProofCount ?? 0,
    passedCount: summary.passedCount ?? 0,
    productScopeLimitationCount: summary.productScopeLimitationCount ?? 0,
    sourceDataLimitationCount: summary.sourceDataLimitationCount ?? 0,
    totalRows: summary.totalRows ?? 0,
    visualCaptureFrameCount: summary.visualCaptureFrameCount ?? 0,
    visualCaptureRowCount: summary.visualCaptureRowCount ?? 0,
  };
}

export function proofManifestValidationSummaryText(manifest, manifestPath) {
  const summary = proofManifestValidationSummary(manifest);
  return [
    `Scenario proof manifest: ${summary.totalRows} rows; ${summary.passedCount} passed; ${summary.failedCount} failed; ${summary.missingProofCount} missing-proof; ${summary.manualReviewCount} manual-review; ${summary.productScopeLimitationCount} product-scope-limitation; ${summary.acceptedProductLimitationCount} accepted limitations; ${summary.visualCaptureRowCount} visual rows; ${summary.visualCaptureFrameCount} frame matches.`,
    `Scenario blockers: ${formatCountMap(summary.blockerCodes)}.`,
    `Source: ${manifestPath}`,
  ].join("\n");
}

function mergeCountMap(entries) {
  return entries.reduce((counts, entry) => {
    for (const [key, value] of Object.entries(entry ?? {})) {
      counts[key] = (counts[key] ?? 0) + Number(value || 0);
    }
    return counts;
  }, {});
}

export function aggregateScenarioValidationSummaries(entries, {
  controllingManifest = null,
  controllingManifestPath = "",
} = {}) {
  const totals = entries.reduce((summary, entry) => {
    summary.acceptedProductLimitationCount += entry.summary.acceptedProductLimitationCount;
    summary.failedCount += entry.summary.failedCount;
    summary.manualReviewCount += entry.summary.manualReviewCount;
    summary.missingProofCount += entry.summary.missingProofCount;
    summary.passedCount += entry.summary.passedCount;
    summary.productScopeLimitationCount += entry.summary.productScopeLimitationCount ?? 0;
    summary.sourceDataLimitationCount += entry.summary.sourceDataLimitationCount;
    summary.totalRows += entry.summary.totalRows;
    summary.visualCaptureFrameCount += entry.summary.visualCaptureFrameCount;
    summary.visualCaptureRowCount += entry.summary.visualCaptureRowCount;
    return summary;
  }, {
    acceptedProductLimitationCount: 0,
    failedCount: 0,
    manualReviewCount: 0,
    missingProofCount: 0,
    passedCount: 0,
    productScopeLimitationCount: 0,
    sourceDataLimitationCount: 0,
    totalRows: 0,
    visualCaptureFrameCount: 0,
    visualCaptureRowCount: 0,
  });

  const aggregate = {
    scenarioCount: entries.length,
    scenarioRowsNote: "Scenario rows can overlap; totals are row-occurrences, not unique proof rows.",
    scenarios: entries,
    totals: {
      ...totals,
      blockerCodes: mergeCountMap(entries.map((entry) => entry.summary.blockerCodes)),
    },
  };

  if (controllingManifest) {
    aggregate.controllingManifest = {
      path: controllingManifestPath,
      summary: proofManifestValidationSummary(controllingManifest),
    };
  }

  return aggregate;
}

export function aggregateScenarioValidationSummaryText(aggregate) {
  const totals = aggregate.totals;
  return [
    "# Scenario validation aggregate",
    ...(aggregate.controllingManifest ? [
      `Unique controlling manifest: ${aggregate.controllingManifest.summary.totalRows} rows; ${aggregate.controllingManifest.summary.passedCount} passed; ${aggregate.controllingManifest.summary.failedCount} failed; ${aggregate.controllingManifest.summary.missingProofCount} missing-proof; ${aggregate.controllingManifest.summary.manualReviewCount} manual-review; ${aggregate.controllingManifest.summary.productScopeLimitationCount} product-scope-limitation; ${aggregate.controllingManifest.summary.acceptedProductLimitationCount} accepted limitations.`,
      `Unique blockers: ${formatCountMap(aggregate.controllingManifest.summary.blockerCodes)}.`,
    ] : []),
    `${aggregate.scenarioCount} scenario(s); ${totals.totalRows} row-occurrences; ${totals.passedCount} passed; ${totals.failedCount} failed; ${totals.missingProofCount} missing-proof; ${totals.manualReviewCount} manual-review; ${totals.productScopeLimitationCount} product-scope-limitation; ${totals.acceptedProductLimitationCount} accepted limitations; ${totals.visualCaptureRowCount} visual row-occurrences; ${totals.visualCaptureFrameCount} frame matches.`,
    `Aggregate blockers: ${formatCountMap(totals.blockerCodes)}.`,
    aggregate.scenarioRowsNote,
  ].join("\n");
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

export function aggregateScenarioValidationSummaryMarkdown(aggregate) {
  const totals = aggregate.totals;
  return [
    "# Movement Replay Scenario Validation Summary",
    "",
    ...(aggregate.controllingManifest ? [
      "## Controlling Reviewed Manifest",
      "",
      `Unique rows: ${aggregate.controllingManifest.summary.totalRows}`,
      `Passed: ${aggregate.controllingManifest.summary.passedCount}`,
      `Missing proof: ${aggregate.controllingManifest.summary.missingProofCount}`,
      `Manual review: ${aggregate.controllingManifest.summary.manualReviewCount}`,
      `Product-scope limitations: ${aggregate.controllingManifest.summary.productScopeLimitationCount}`,
      `Accepted limitations: ${aggregate.controllingManifest.summary.acceptedProductLimitationCount}`,
      "",
      `Unique blockers: ${formatCountMap(aggregate.controllingManifest.summary.blockerCodes)}.`,
      ...(aggregate.controllingManifest.path ? ["", `Source: ${aggregate.controllingManifest.path}`] : []),
      "",
      "## Scenario Row-Occurrence Totals",
      "",
    ] : []),
    `Scenarios: ${aggregate.scenarioCount}`,
    `Row-occurrences: ${totals.totalRows}`,
    `Passed: ${totals.passedCount}`,
    `Missing proof: ${totals.missingProofCount}`,
    `Manual review: ${totals.manualReviewCount}`,
    `Product-scope limitations: ${totals.productScopeLimitationCount}`,
    `Accepted limitations: ${totals.acceptedProductLimitationCount}`,
    `Visual row-occurrences: ${totals.visualCaptureRowCount}`,
    `Frame matches: ${totals.visualCaptureFrameCount}`,
    "",
    `Aggregate blockers: ${formatCountMap(totals.blockerCodes)}.`,
    "",
    aggregate.scenarioRowsNote,
    "",
    "| Scenario | Rows | Passed | Missing Proof | Manual Review | Product-Scope Limitations | Accepted Limitations | Visual Rows | Frame Matches | Blockers | Manifest |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...aggregate.scenarios.map((entry) => `| ${[
      entry.scenario,
      entry.summary.totalRows,
      entry.summary.passedCount,
      entry.summary.missingProofCount,
      entry.summary.manualReviewCount,
      entry.summary.productScopeLimitationCount ?? 0,
      entry.summary.acceptedProductLimitationCount,
      entry.summary.visualCaptureRowCount,
      entry.summary.visualCaptureFrameCount,
      formatCountMap(entry.summary.blockerCodes),
      entry.manifestPath,
    ].map(markdownCell).join(" | ")} |`),
    "",
  ].join("\n");
}

function scenarioLabel(scenario) {
  return scenario.freshRecordingLabel || scenario.validation?.recordingScenario || scenario.id || "unknown-scenario";
}

function runAnalyzer(scriptPath, analyzerArgs, { quiet }) {
  const options = {
    env: {
      ...process.env,
      SENTRY_DSN: "",
    },
  };

  if (!quiet) {
    execFileSync(process.execPath, [scriptPath, ...analyzerArgs], {
      ...options,
      stdio: "inherit",
    });
    return;
  }

  try {
    execFileSync(process.execPath, [scriptPath, ...analyzerArgs], {
      ...options,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error?.stdout) process.stdout.write(error.stdout);
    if (error?.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

async function main() {
  const args = parseValidateRecordingScenarioArgs(process.argv.slice(2));
  const {
    plan,
    preselectedScenario,
    recordingPlanPath,
  } = await resolveRecordingPlanForValidation(args);
  args.recordingPlanPath = recordingPlanPath;
  const controllingManifest = args.controllingManifestPath
    ? JSON.parse(await readFile(args.controllingManifestPath, "utf8"))
    : null;
  const scenarios = args.all
    ? [...(plan.captureScenarios ?? [])]
    : [preselectedScenario ?? selectRecordingValidationScenario(plan, args.scenario)];
  if (scenarios.length === 0) {
    if (args.all) {
      const aggregate = aggregateScenarioValidationSummaries([], {
        controllingManifest,
        controllingManifestPath: args.controllingManifestPath,
      });
      console.log(aggregateScenarioValidationSummaryText(aggregate));
      if (args.summaryOut) {
        await writeFile(args.summaryOut, `${JSON.stringify(aggregate, null, 2)}\n`);
        console.log(`Wrote ${args.summaryOut}`);
      }
      if (args.summaryMarkdownOut) {
        await writeFile(args.summaryMarkdownOut, aggregateScenarioValidationSummaryMarkdown(aggregate));
        console.log(`Wrote ${args.summaryMarkdownOut}`);
      }
      return;
    }
    throw new Error("No capture scenarios were found in the recording plan.");
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const analyzeScriptPath = path.join(__dirname, "analyze-sessions.mjs");
  const validationEntries = [];

  for (const scenario of scenarios) {
    const exportPath = await readRecordingValidationExportPath(scenario, args.exportPath);
    const analyzerArgs = analyzerArgsForRecordingValidationScenario(scenario, {
      exportPath,
      out: args.all ? "" : args.out,
      recordingPlanPath: args.recordingPlanPath,
      strict: args.strict,
      strictManifest: args.strictManifest,
    });
    const nodeVersion = scenario.validation?.nodeVersion || "22.13.0";

    if (args.dryRun) {
      console.log(`# ${scenarioLabel(scenario)}`);
      console.log(validationDisplayCommand(analyzerArgs, nodeVersion));
      continue;
    }

    runAnalyzer(analyzeScriptPath, analyzerArgs, { quiet: args.quiet });

    const manifestPath = manifestPathForAnalyzerArgs(analyzerArgs);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const summary = proofManifestValidationSummary(manifest);
    validationEntries.push({
      manifestPath,
      scenario: scenarioLabel(scenario),
      summary,
    });
    console.log(`# ${scenarioLabel(scenario)}`);
    console.log(proofManifestValidationSummaryText(manifest, manifestPath));
  }

  const shouldWriteSummary = args.summaryOut || args.summaryMarkdownOut;
  if (!args.dryRun && (args.all || validationEntries.length > 1 || shouldWriteSummary)) {
    const aggregate = aggregateScenarioValidationSummaries(validationEntries, {
      controllingManifest,
      controllingManifestPath: args.controllingManifestPath,
    });
    if (args.all || validationEntries.length > 1) {
      console.log(aggregateScenarioValidationSummaryText(aggregate));
    }
    if (args.summaryOut) {
      await writeFile(args.summaryOut, `${JSON.stringify(aggregate, null, 2)}\n`);
      console.log(`Wrote ${args.summaryOut}`);
    }
    if (args.summaryMarkdownOut) {
      await writeFile(args.summaryMarkdownOut, aggregateScenarioValidationSummaryMarkdown(aggregate));
      console.log(`Wrote ${args.summaryMarkdownOut}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
