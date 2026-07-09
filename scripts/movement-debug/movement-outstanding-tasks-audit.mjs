#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const DEFAULT_PLAN_PATH = "docs/plans/active/movement-studio-best-practice-architecture-plan.md";
const DEFAULT_RUNBOOK_PATH = "scripts/movement-debug/README.md";
const execFileAsync = promisify(execFile);
const REQUIRED_FUTURE_FAMILY_AUDIT_SHAPES = [
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];
export const HANDOFF_SOURCE_CANDIDATE_FILES = [
  "scripts/movement-debug/facing-occlusion-support-readiness-audit.mjs",
  "scripts/movement-debug/facing-occlusion-support-readiness-audit.test.mjs",
  "scripts/movement-debug/future-family-support-audit-shapes.mjs",
  "scripts/movement-debug/future-family-support-audit-shapes.test.mjs",
  "scripts/movement-debug/root-travel-support-readiness-audit.mjs",
  "scripts/movement-debug/root-travel-support-readiness-audit.test.mjs",
  "scripts/movement-debug/recording-gap-plan.test.mjs",
];
const HANDOFF_DEPENDENT_FILES = [
  "package.json",
  "scripts/movement-debug/README.md",
  "scripts/movement-debug/movement-architecture-guard.mjs",
  "scripts/movement-debug/movement-architecture-guard.test.mjs",
  "scripts/movement-debug/movement-support-readiness-matrix.mjs",
  "scripts/movement-debug/movement-support-readiness-matrix.test.mjs",
  "scripts/movement-debug/next-proof-readiness.mjs",
  "scripts/movement-debug/next-proof-readiness.test.mjs",
  "docs/plans/active/movement-studio-best-practice-architecture-plan.md",
];

function printHelp() {
  console.log(`Audit that the movement architecture plan keeps actionable outstanding tasks current.

Usage:
  npm run movement:outstanding-tasks-audit
  npm run movement:outstanding-tasks-audit -- --strict --json
  npm run movement:precommit-handoff-audit

Options:
  --plan <file>              Architecture plan Markdown. Defaults to ${DEFAULT_PLAN_PATH}
  --runbook <file>           Movement debug runbook Markdown. Defaults to ${DEFAULT_RUNBOOK_PATH}
  --precommit-handoff        Check source-control tracking for current handoff source candidates.
  --strict                   Exit non-zero when required open tasks or next-slice guidance drift.
  --json                     Print machine-readable JSON.
  --help                     Show this help.
`);
}

export function parseMovementOutstandingTasksAuditArgs(argv) {
  const args = {
    help: false,
    json: false,
    planPath: DEFAULT_PLAN_PATH,
    precommitHandoff: false,
    runbookPath: DEFAULT_RUNBOOK_PATH,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--plan") {
      args.planPath = argv[++index] || args.planPath;
    } else if (arg === "--runbook") {
      args.runbookPath = argv[++index] || args.runbookPath;
    } else if (arg === "--precommit-handoff") {
      args.precommitHandoff = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function parseGitFileList(stdout) {
  return uniqueSorted(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function parseIgnoredFiles(stdout) {
  return uniqueSorted(stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\t/).at(-1) || line.split(/\s+/).at(-1) || ""));
}

export function auditMovementPrecommitHandoff({
  dependentFileTexts = {},
  ignoredFiles = [],
  stagedFiles = [],
  trackedFiles = [],
} = {}) {
  const tracked = new Set(trackedFiles);
  const ignored = new Set(ignoredFiles);
  const staged = new Set(stagedFiles);
  const dependentTexts = Object.values(dependentFileTexts);
  const referencedSourceCandidates = HANDOFF_SOURCE_CANDIDATE_FILES
    .filter((file) => dependentTexts.some((text) => text.includes(file)));
  const untrackedReferencedSourceCandidates = referencedSourceCandidates
    .filter((file) => !tracked.has(file));
  const ignoredSourceCandidates = HANDOFF_SOURCE_CANDIDATE_FILES
    .filter((file) => ignored.has(file));
  const stagedDependentFiles = HANDOFF_DEPENDENT_FILES
    .filter((file) => staged.has(file));
  const stagedReferencedSourceCandidates = referencedSourceCandidates
    .filter((file) => staged.has(file));
  const missingFromStagedSourceCandidates = stagedDependentFiles.length > 0
    ? referencedSourceCandidates.filter((file) => !staged.has(file))
    : [];
  const failures = [];

  if (referencedSourceCandidates.length > 0 && untrackedReferencedSourceCandidates.length > 0) {
    failures.push(
      `tracked handoff references depend on source candidates that are not tracked: ${untrackedReferencedSourceCandidates.join(", ")}`,
    );
  }
  if (ignoredSourceCandidates.length > 0) {
    failures.push(`source/test handoff candidates must not be ignored: ${ignoredSourceCandidates.join(", ")}`);
  }
  if (missingFromStagedSourceCandidates.length > 0) {
    failures.push(
      `staged handoff dependency set is split; stage referenced source candidates too: ${missingFromStagedSourceCandidates.join(", ")}`,
    );
  }

  return {
    failures,
    ignoredSourceCandidates,
    missingFromStagedSourceCandidates,
    ok: failures.length === 0,
    referencedSourceCandidates,
    stagedDependentFiles,
    stagedReferencedSourceCandidates,
    trackedSourceCandidates: HANDOFF_SOURCE_CANDIDATE_FILES.filter((file) => tracked.has(file)),
    untrackedReferencedSourceCandidates,
  };
}

function sectionBetween(planText, startMarker, endMarker) {
  const start = planText.indexOf(startMarker);
  const end = planText.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) return "";
  return planText.slice(start, end);
}

function sectionFrom(planText, startMarker) {
  const start = planText.indexOf(startMarker);
  if (start === -1) return "";
  return planText.slice(start);
}

function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

function missingSubstrings(section, substrings) {
  return substrings.filter((substring) => !section.includes(substring));
}

export function auditMovementOutstandingTasks(planText, { runbookText = "" } = {}) {
  const outstandingSection = sectionBetween(
    planText,
    "## Always-Open Outstanding Tasks",
    "## Recommended Next Slice",
  );
  const recommendedSection = sectionFrom(planText, "## Recommended Next Slice");
  const futureFamilyAuditShapesSection = sectionBetween(
    planText,
    "## Future Family Audit Shapes",
    "## Executive Verdict",
  );
  const proofArtifactPolicySection = sectionBetween(
    planText,
    "## Proof Artifact Policy",
    "## Future Family Audit Shapes",
  );
  const currentHandoffInventorySection = sectionBetween(
    planText,
    "## Current Handoff Inventory",
    "## Future Family Audit Shapes",
  );
  const recentFocusedVerificationSection = sectionBetween(
    planText,
    "Recent focused verification:",
    "## Verification Notes",
  );
  const historicalLogBoundarySection = sectionBetween(
    planText,
    "## Historical Log Boundary",
    "Earlier verification run",
  );
  const verificationNotesSection = sectionBetween(
    planText,
    "## Verification Notes",
    "## Historical Log Boundary",
  );
  const uncheckedTaskCount = countMatches(outstandingSection, /^- \[ \] /gm);
  const recommendedTaskCount = countMatches(recommendedSection, /^\d+\. /gm);
  const futureFamilyAuditShapeCount = REQUIRED_FUTURE_FAMILY_AUDIT_SHAPES
    .filter((family) => futureFamilyAuditShapesSection.includes(`\`${family}\``))
    .length;
  const requiredOutstandingText = [
    "Maintain 0 missing-proof, manual-review, failed, and blocking rows",
    "Keep the 14 internal preview/demo/diagnostic coverage families out of product copy",
    "Capture or identify a real seated recording",
    "seated-forward-fold",
    "Capture or identify a real walking/root-travel bundle",
    "Decide deliberately whether proof-ready `facing-occlusion` should stay diagnostic-only",
    "production support moves intentionally from 5/19",
    "Keep the refreshed 50-frame Game visual capture/review set current",
    "Before committing or handing off the current movement slice",
    "classify the seven support-audit/test files as source/test candidates",
  ];
  const requiredRecommendedText = [
    "Current user-facing support list",
    "`root-turn`",
    "standing root orientation only",
    "Make a deliberate product-truth decision for proof-ready `facing-occlusion`",
    "coverage product truth is still internal diagnostic",
    "movement-proof-seated-forward-fold",
    "movement-proof-root-travel",
    "keep raw/generated `tmp/movement-replay-lab/**` artifacts as ignored scratch by default",
  ];
  const forbiddenRecommendedText = [
    "Treat `root-turn`, `root-travel`",
    "root-turn`, `root-travel`, floor",
  ];
  const forbiddenPlanText = [
    "two untracked replay export helpers",
    "44 unchecked always-open tasks",
    "reported expected-blocked: missing recorded fallback/readability proof",
    "The next action is Replay visual/source review conversion",
    "49/49 Game visual",
    "37/37",
    "117 proof rows",
    "63 accepted limitations",
    "five untracked support-audit/test",
    "Current audit verification on 2026-07-07",
    "Current product decision: keep all four broad rows",
    "Current default audit result: blocked as expected",
  ];
  const failures = [];
  const requiredRunbookText = runbookText ? [
    "Historical Log Boundary",
    "stale historical proof-count/current-label wording",
    "the seven current support-audit/test source candidates",
    "expected two recording labels",
    "current scoped broad `upper-body-standing` claim",
    "facing/occlusion product-truth decision",
  ] : [];
  const forbiddenRunbookText = runbookText ? [
    "five current support-audit/test",
    "expected three recording labels",
    "stable 49-frame",
    "broad `upper-body-standing` remains internal-demo-only",
  ] : [];

  if (!outstandingSection) {
    failures.push("missing Always-Open Outstanding Tasks section before Recommended Next Slice");
  }
  if (!recommendedSection) {
    failures.push("missing Recommended Next Slice section");
  }
  if (!futureFamilyAuditShapesSection) {
    failures.push("missing Future Family Audit Shapes section before Executive Verdict");
  }
  if (!proofArtifactPolicySection) {
    failures.push("missing Proof Artifact Policy section before Future Family Audit Shapes");
  }
  if (!currentHandoffInventorySection) {
    failures.push("missing Current Handoff Inventory section before Future Family Audit Shapes");
  }
  if (!recentFocusedVerificationSection) {
    failures.push("missing Recent focused verification section before Verification Notes");
  }
  if (!historicalLogBoundarySection) {
    failures.push("missing Historical Log Boundary section before older verification logs");
  }
  if (!verificationNotesSection) {
    failures.push("missing Verification Notes section before Historical Log Boundary");
  }
  if (uncheckedTaskCount < 20) {
    failures.push(`expected at least 20 unchecked outstanding tasks, got ${uncheckedTaskCount}`);
  }
  if (recommendedTaskCount < 9) {
    failures.push(`expected at least 9 numbered recommended next tasks, got ${recommendedTaskCount}`);
  }
  missingSubstrings(outstandingSection, requiredOutstandingText).forEach((substring) => {
    failures.push(`missing outstanding-task text: ${substring}`);
  });
  missingSubstrings(recommendedSection, requiredRecommendedText).forEach((substring) => {
    failures.push(`missing recommended-next-slice text: ${substring}`);
  });
  missingSubstrings(futureFamilyAuditShapesSection, [
    "Required recorded proof cases before promotion",
    "Required Game visual cases before promotion",
    "Acceptable user-facing claim after proof",
    "Fallback / non-promotion rule",
    "Generic promotion checklist for each future family",
  ]).forEach((substring) => {
    failures.push(`missing future-family-audit-shapes text: ${substring}`);
  });
  missingSubstrings(proofArtifactPolicySection, [
    "keep compact proof summaries in tracked documentation",
    "keep raw/generated proof artifacts under `tmp/movement-replay-lab/**` as ignored scratch",
    "Do not commit raw capture images",
    "Promote a small reviewed artifact bundle only after an explicit product/engineering decision",
    "Reopen this policy",
  ]).forEach((substring) => {
    failures.push(`missing proof-artifact-policy text: ${substring}`);
  });
  missingSubstrings(currentHandoffInventorySection, [
    "support-audit/test files are source candidates, not scratch proof artifacts",
    "facing-occlusion-support-readiness-audit.mjs",
    "root-travel-support-readiness-audit.mjs",
    "recording-gap-plan.test.mjs",
    "Tracked movement-slice edits currently cluster",
    "Scratch proof output remains `tmp/movement-replay-lab/**` by default",
    "classify every untracked file as either tracked source/test code or ignored generated proof output",
    "`git ls-files` lists all seven paths",
    "rerun the audit after staging the dependent tracked files too",
    "Commit-readiness checklist for this movement slice",
    "before commit, it must list all seven files if tracked aliases/imports still reference them",
    "Source/test `.mjs` files should not be ignored",
    "Run `git diff --cached --name-only` before committing",
  ]).forEach((substring) => {
    failures.push(`missing current-handoff-inventory text: ${substring}`);
  });
  missingSubstrings(recentFocusedVerificationSection, [
    "2026-07-08 current documentation and proof gate",
    "`npx -p node@22.13.0 npm run movement:today-finish-gate` passed",
    "50/50 Game visual targets",
    "5/19 user-facing production-supported families",
    "`facing-occlusion` is proof-ready for review but remains diagnostic-only",
  ]).forEach((substring) => {
    failures.push(`missing recent-focused-verification text: ${substring}`);
  });
  missingSubstrings(historicalLogBoundarySection, [
    "Everything below this heading is dated context",
    "not the authoritative current product-support state",
    "For current support truth, use the Current Standing Board",
    "2026-07-08 verification notes",
  ]).forEach((substring) => {
    failures.push(`missing historical-log-boundary text: ${substring}`);
  });
  missingSubstrings(verificationNotesSection, [
    "support-matrix Markdown sync",
    "roadmap Markdown sync",
    "architecture-plan status text sync",
    "Future-family shape failures: 0",
  ]).forEach((substring) => {
    failures.push(`missing verification-notes text: ${substring}`);
  });
  REQUIRED_FUTURE_FAMILY_AUDIT_SHAPES
    .filter((family) => !futureFamilyAuditShapesSection.includes(`\`${family}\``))
    .forEach((family) => {
      failures.push(`missing future-family audit shape: ${family}`);
    });
  forbiddenRecommendedText
    .filter((substring) => recommendedSection.includes(substring))
    .forEach((substring) => {
      failures.push(`stale recommended-next-slice text is still present: ${substring}`);
    });
  forbiddenPlanText
    .filter((substring) => planText.includes(substring))
    .forEach((substring) => {
      failures.push(`stale plan text is still present: ${substring}`);
    });
  [
    "49/49 Game visual proof",
    "after adding the broad capture workflow state",
    "user-facing `upright,standing-side-bend-head-direction,squat-knee-lift`",
  ]
    .filter((substring) => recentFocusedVerificationSection.includes(substring))
    .forEach((substring) => {
      failures.push(`stale recent-focused-verification text is still present: ${substring}`);
    });
  missingSubstrings(runbookText, requiredRunbookText).forEach((substring) => {
    failures.push(`missing runbook text: ${substring}`);
  });
  forbiddenRunbookText
    .filter((substring) => runbookText.includes(substring))
    .forEach((substring) => {
      failures.push(`stale runbook text is still present: ${substring}`);
    });

  return {
    failures,
    futureFamilyAuditShapeCount,
    ok: failures.length === 0,
    recommendedTaskCount,
    uncheckedTaskCount,
  };
}

function formatOutstandingTasksAudit(audit) {
  const lines = [
    `Movement outstanding tasks audit: ${audit.ok ? "passed" : "blocked"}`,
    `Unchecked outstanding tasks: ${audit.uncheckedTaskCount}`,
    `Recommended next tasks: ${audit.recommendedTaskCount}`,
    `Future family audit shapes: ${audit.futureFamilyAuditShapeCount}/${REQUIRED_FUTURE_FAMILY_AUDIT_SHAPES.length}`,
  ];

  if (audit.failures.length > 0) {
    lines.push("", "Failures:", ...audit.failures.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

function formatPrecommitHandoffAudit(audit) {
  const lines = [
    `Movement pre-commit handoff audit: ${audit.ok ? "passed" : "blocked"}`,
    `Referenced source candidates: ${audit.referencedSourceCandidates.length}/${HANDOFF_SOURCE_CANDIDATE_FILES.length}`,
    `Tracked source candidates: ${audit.trackedSourceCandidates.length}/${HANDOFF_SOURCE_CANDIDATE_FILES.length}`,
    `Ignored source candidates: ${audit.ignoredSourceCandidates.length}`,
    `Staged dependent files: ${audit.stagedDependentFiles.length}`,
    `Staged referenced source candidates: ${audit.stagedReferencedSourceCandidates.length}/${audit.referencedSourceCandidates.length}`,
  ];

  if (audit.failures.length > 0) {
    lines.push("", "Failures:", ...audit.failures.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

async function gitStdout(args, { allowFailure = false } = {}) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: process.cwd() });
    return stdout;
  } catch (error) {
    if (allowFailure && typeof error?.stdout === "string") {
      return error.stdout;
    }
    throw error;
  }
}

async function readDependentFileTexts() {
  const entries = await Promise.all(HANDOFF_DEPENDENT_FILES.map(async (file) => {
    try {
      return [file, await readFile(path.resolve(file), "utf8")];
    } catch {
      return [file, ""];
    }
  }));

  return Object.fromEntries(entries);
}

async function buildMovementPrecommitHandoffAudit() {
  const trackedFiles = parseGitFileList(await gitStdout([
    "ls-files",
    "--",
    ...HANDOFF_SOURCE_CANDIDATE_FILES,
  ]));
  const ignoredFiles = parseIgnoredFiles(await gitStdout([
    "check-ignore",
    "-v",
    "--",
    ...HANDOFF_SOURCE_CANDIDATE_FILES,
  ], { allowFailure: true }));
  const stagedFiles = parseGitFileList(await gitStdout([
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...HANDOFF_DEPENDENT_FILES,
    ...HANDOFF_SOURCE_CANDIDATE_FILES,
  ]));

  return auditMovementPrecommitHandoff({
    dependentFileTexts: await readDependentFileTexts(),
    ignoredFiles,
    stagedFiles,
    trackedFiles,
  });
}

async function main() {
  const args = parseMovementOutstandingTasksAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.precommitHandoff) {
    const audit = await buildMovementPrecommitHandoffAudit();
    console.log(args.json ? JSON.stringify(audit, null, 2) : formatPrecommitHandoffAudit(audit));
    if (args.strict && !audit.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const [planText, runbookText] = await Promise.all([
    readFile(path.resolve(args.planPath), "utf8"),
    readFile(path.resolve(args.runbookPath), "utf8"),
  ]);
  const audit = auditMovementOutstandingTasks(planText, { runbookText });

  console.log(args.json ? JSON.stringify(audit, null, 2) : formatOutstandingTasksAudit(audit));
  if (args.strict && !audit.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
