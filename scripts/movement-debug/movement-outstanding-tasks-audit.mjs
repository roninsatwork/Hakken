#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PLAN_PATH = "docs/plans/active/movement-studio-best-practice-architecture-plan.md";

function printHelp() {
  console.log(`Audit that the movement architecture plan keeps actionable outstanding tasks current.

Usage:
  npm run movement:outstanding-tasks-audit
  npm run movement:outstanding-tasks-audit -- --strict --json

Options:
  --plan <file>              Architecture plan Markdown. Defaults to ${DEFAULT_PLAN_PATH}
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
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--plan") {
      args.planPath = argv[++index] || args.planPath;
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

export function auditMovementOutstandingTasks(planText) {
  const outstandingSection = sectionBetween(
    planText,
    "## Always-Open Outstanding Tasks",
    "## Recommended Next Slice",
  );
  const recommendedSection = sectionFrom(planText, "## Recommended Next Slice");
  const uncheckedTaskCount = countMatches(outstandingSection, /^- \[ \] /gm);
  const recommendedTaskCount = countMatches(recommendedSection, /^\d+\. /gm);
  const requiredOutstandingText = [
    "Maintain 0 missing-proof, manual-review, failed, and blocking rows",
    "Keep the 14 internal preview/demo/diagnostic coverage families out of product copy",
    "Capture or identify a real seated recording",
    "seated-forward-fold",
    "Capture or identify a real walking/root-travel bundle",
    "Keep the refreshed 50-frame Game visual capture/review set current",
    "Before committing or handing off the current movement slice",
  ];
  const requiredRecommendedText = [
    "Current user-facing support list",
    "`root-turn`",
    "standing root orientation only",
    "movement-proof-seated-forward-fold",
    "movement-proof-root-travel",
    "do not commit raw `tmp/movement-replay-lab/**` captures",
  ];
  const forbiddenRecommendedText = [
    "Treat `root-turn`, `root-travel`",
    "root-turn`, `root-travel`, floor",
  ];
  const failures = [];

  if (!outstandingSection) {
    failures.push("missing Always-Open Outstanding Tasks section before Recommended Next Slice");
  }
  if (!recommendedSection) {
    failures.push("missing Recommended Next Slice section");
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
  forbiddenRecommendedText
    .filter((substring) => recommendedSection.includes(substring))
    .forEach((substring) => {
      failures.push(`stale recommended-next-slice text is still present: ${substring}`);
    });

  return {
    failures,
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
  ];

  if (audit.failures.length > 0) {
    lines.push("", "Failures:", ...audit.failures.map((failure) => `- ${failure}`));
  }

  return lines.join("\n");
}

async function main() {
  const args = parseMovementOutstandingTasksAuditArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const planText = await readFile(path.resolve(args.planPath), "utf8");
  const audit = auditMovementOutstandingTasks(planText);

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
