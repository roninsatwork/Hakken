import { describe, expect, it } from "vitest";

import {
  auditMovementPrecommitHandoff,
  auditMovementOutstandingTasks,
  parseMovementOutstandingTasksAuditArgs,
} from "./movement-outstanding-tasks-audit.mjs";

const handoffSourceCandidateFiles = [
  "scripts/movement-debug/facing-occlusion-support-readiness-audit.mjs",
  "scripts/movement-debug/facing-occlusion-support-readiness-audit.test.mjs",
  "scripts/movement-debug/future-family-support-audit-shapes.mjs",
  "scripts/movement-debug/future-family-support-audit-shapes.test.mjs",
  "scripts/movement-debug/root-travel-support-readiness-audit.mjs",
  "scripts/movement-debug/root-travel-support-readiness-audit.test.mjs",
  "scripts/movement-debug/recording-gap-plan.test.mjs",
];

const requiredOpenTasks = [
  "Maintain 0 missing-proof, manual-review, failed, and blocking rows",
  "Keep the 14 internal preview/demo/diagnostic coverage families out of product copy",
  "Capture or identify a real seated recording",
  "For `sitting`, cover `seated-forward-fold`",
  "Capture or identify a real walking/root-travel bundle",
  "Decide deliberately whether proof-ready `facing-occlusion` should stay diagnostic-only or become a user-facing support claim; ensure production support moves intentionally from 5/19",
  "Keep the refreshed 50-frame Game visual capture/review set current",
  "Before committing or handing off the current movement slice",
  "classify the seven support-audit/test files as source/test candidates",
];
const futureFamilyAuditShapeRows = [
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
].map((family) => `| \`${family}\` | Required recorded proof cases before promotion. | Required Game visual cases before promotion. | Acceptable user-facing claim after proof. | Fallback / non-promotion rule. |`);

function planFixture({
  staleHandoffInventory = false,
  staleFacingProofState = false,
  staleHistoricalCounts = false,
  staleHistoricalCurrentLabels = false,
  missingHistoricalBoundary = false,
  missingVerificationSyncNotes = false,
  staleRecentFocusedVerification = false,
  staleRootTurn = false,
} = {}) {
  const fillerTasks = Array.from({ length: 18 }, (_, index) => `- [ ] Keep placeholder task ${index} open.`);
  const currentSupportTask = staleRootTurn
    ? "2. Keep the current user-facing support list stable in product/UI copy: `upright`, `upper-body-standing`, `standing-side-bend-head-direction`, and `squat-knee-lift`."
    : "2. Current user-facing support list in product/UI copy: `upright`, `upper-body-standing`, `standing-side-bend-head-direction`, `squat-knee-lift`, and narrow standing `root-turn` for standing root orientation only.";
  const internalTask = staleRootTurn
    ? "3. Treat `root-turn`, `root-travel`, floor/yoga/Pilates, walking, jumping, props/contact, sitting, kneeling, and rolling/crawling as non-user-facing until proof exists."
    : "3. Treat `root-travel`, floor/yoga/Pilates, walking, jumping, props/contact, sitting, kneeling, and rolling/crawling as non-user-facing until proof exists; keep `root-turn` scoped to standing root orientation only.";

  const staleHandoffText = staleHandoffInventory
    ? "\nHistorical note: two untracked replay export helpers were present.\n\nAudit note: 44 unchecked always-open tasks remain.\n"
    : "";
  const staleFacingProofStateText = staleFacingProofState
    ? "\n- `movement:facing-occlusion-support-audit -- --json` reported expected-blocked: missing recorded fallback/readability proof, side-swap recovery evidence, and self-occlusion recovery evidence. The next action is Replay visual/source review conversion.\n"
    : "";
  const staleHistoricalCountsText = staleHistoricalCounts
    ? "\n- Older guard output still says 49/49 Game visual proof, 37/37 captured, 117 proof rows, 63 accepted limitations, and five untracked support-audit/test files.\n"
    : "";
  const staleHistoricalCurrentLabelsText = staleHistoricalCurrentLabels
    ? "\nCurrent audit verification on 2026-07-07\n\n- Current product decision: keep all four broad rows internal.\n- Current default audit result: blocked as expected.\n"
    : "";
  const historicalBoundaryText = missingHistoricalBoundary
    ? ""
    : [
      "## Historical Log Boundary",
      "",
      "Everything below this heading is dated context. It is not the authoritative current product-support state. For current support truth, use the Current Standing Board and 2026-07-08 verification notes.",
      "",
      "Earlier verification run",
    ].join("\n");
  const recentFocusedVerificationText = staleRecentFocusedVerification
    ? "- `npx -p node@22.13.0 npm run movement:architecture-guard` passed after adding the broad capture workflow state: user-facing `upright,standing-side-bend-head-direction,squat-knee-lift`, internal-demo-only `upper-body-standing,root-turn,root-travel`, 49/49 Game visual proof, and 153 proof rows with 0 blocking."
    : [
      "- 2026-07-08 current documentation and proof gate: `npx -p node@22.13.0 npm run movement:today-finish-gate` passed.",
      "- Current proof snapshot: 50/50 Game visual targets captured and reviewed as `readable-pass`, 5/19 user-facing production-supported families, and 14/19 internal preview/diagnostic families.",
      "- Current blocked lanes: `facing-occlusion` is proof-ready for review but remains diagnostic-only until a deliberate product-truth decision.",
    ].join("\n");
  const verificationSyncNotesText = missingVerificationSyncNotes
    ? ""
    : [
      "- 2026-07-08 support-matrix Markdown sync: `formatSupportReadinessMatrix` now prints `Future-family shape failures: 0`.",
      "- 2026-07-08 roadmap Markdown sync: `formatMovementRoadmapProgressReport` now has direct regression coverage for the `Future-family shape failures: 0` Markdown line.",
      "- 2026-07-08 architecture-plan status text sync: `formatAudit` from `movement-architecture-plan-status-audit` is now exported and directly regression-tested for the `Future-family shape failures: 0` terminal line.",
    ].join("\n");

  return `# Movement Studio Best-Practice Architecture Plan

## Always-Open Outstanding Tasks

${requiredOpenTasks.map((task) => `- [ ] ${task}.`).join("\n")}
${fillerTasks.join("\n")}

## Proof Artifact Policy

Default policy: keep compact proof summaries in tracked documentation, and keep raw/generated proof artifacts under \`tmp/movement-replay-lab/**\` as ignored scratch.

Do not commit raw capture images by default.
Promote a small reviewed artifact bundle only after an explicit product/engineering decision names exact durable files.
Reopen this policy if a gate starts depending on ignored scratch files that cannot be regenerated.

## Current Handoff Inventory

- Newly staged support-audit/test files are source candidates, not scratch proof artifacts: \`scripts/movement-debug/facing-occlusion-support-readiness-audit.mjs\`, \`scripts/movement-debug/facing-occlusion-support-readiness-audit.test.mjs\`, \`scripts/movement-debug/future-family-support-audit-shapes.mjs\`, \`scripts/movement-debug/future-family-support-audit-shapes.test.mjs\`, \`scripts/movement-debug/root-travel-support-readiness-audit.mjs\`, \`scripts/movement-debug/root-travel-support-readiness-audit.test.mjs\`, and \`scripts/movement-debug/recording-gap-plan.test.mjs\`.
- Tracked movement-slice edits currently cluster around documentation/runbook updates, npm movement aliases, architecture/outstanding-task guards, support-readiness matrix and next-proof queue logic, recording-gap planning, focused support audits, Replay/Game proof-manifest and visual-parity tests, plus small lint cleanups.
- Scratch proof output remains \`tmp/movement-replay-lab/**\` by default.
- Before commit, classify every untracked file as either tracked source/test code or ignored generated proof output.
- \`git ls-files\` lists all seven paths.
- Before any final commit or PR, rerun the audit after staging the dependent tracked files too.

Commit-readiness checklist for this movement slice:

1. Run \`git status --short\` before commit.
2. before commit, it must list all seven files if tracked aliases/imports still reference them.
3. Source/test \`.mjs\` files should not be ignored.
4. Run \`git diff --cached --name-only\` before committing.
${staleHandoffText}

## Future Family Audit Shapes

| Family | Required recorded proof cases before promotion | Required Game visual cases before promotion | Acceptable user-facing claim after proof | Fallback / non-promotion rule |
| --- | --- | --- | --- | --- |
${futureFamilyAuditShapeRows.join("\n")}

Generic promotion checklist for each future family:

1. Add opt-in proof-manifest rows first.

## Executive Verdict

${staleFacingProofStateText}
${staleHistoricalCountsText}
${staleHistoricalCurrentLabelsText}

## Recommended Next Slice

Next concrete tasks:

1. Record or identify seated forward-fold evidence, then run \`npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet\`.
${currentSupportTask}
${internalTask}
4. Keep the next recording/review target explicit: seated forward fold.
5. Capture or identify a real walking/root-travel bundle with \`movement-proof-root-travel\`.
6. Make a deliberate product-truth decision for proof-ready \`facing-occlusion\`; if it stays diagnostic, keep the support-matrix blocker \`coverage product truth is still internal diagnostic\`.
7. Keep the refreshed 50-target Game visual proof set current.
8. Follow the Proof Artifact Policy: keep compact summaries only, and keep raw/generated \`tmp/movement-replay-lab/**\` artifacts as ignored scratch by default.
9. Pick the next family only after writing its support-claim audit shape first.
10. Before merge or push, run the repo local gate under Node 22.13.0.

Recent focused verification:

${recentFocusedVerificationText}

## Verification Notes

${verificationSyncNotesText}

${historicalBoundaryText}
`;
}

function runbookFixture({
  staleSupportCandidateCount = false,
  staleCaptureLabelCount = false,
  staleFrameCount = false,
  staleUpperBodyStatus = false,
  missingFacingDecision = false,
} = {}) {
  return [
    "Run the outstanding-task audit when editing the plan's task board or recommended next slice.",
    "It requires the Proof Artifact Policy, Current Handoff Inventory, Recent focused verification, and Historical Log Boundary.",
    "It also blocks stale historical proof-count/current-label wording so older dated logs do not read like product truth.",
    staleSupportCandidateCount
      ? "The gate expects five current support-audit/test source candidates."
      : "The gate is expected to pass when the seven current support-audit/test source candidates are tracked and staged with the dependent movement script/docs changes.",
    staleCaptureLabelCount
      ? "The queue-only preflight fails if the expected three recording labels drift."
      : "The queue-only preflight fails if the expected two recording labels drift.",
    "This should pass for the current scoped broad `upper-body-standing` claim while reviewed bundle proof remains readable.",
    missingFacingDecision ? "" : "Use this before making the facing/occlusion product-truth decision.",
    staleFrameCount ? "The old stable 49-frame visual proof remains current." : "",
    staleUpperBodyStatus ? "The broad `upper-body-standing` remains internal-demo-only." : "",
  ].join("\n");
}

describe("movement outstanding tasks audit", () => {
  it("passes when open tasks and recommended next slice remain actionable", () => {
    expect(auditMovementOutstandingTasks(planFixture())).toMatchObject({
      failures: [],
      futureFamilyAuditShapeCount: 10,
      ok: true,
      recommendedTaskCount: 10,
      uncheckedTaskCount: 27,
    });
  });

  it("blocks stale root-turn non-user-facing guidance", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleRootTurn: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing recommended-next-slice text: Current user-facing support list",
      "missing recommended-next-slice text: standing root orientation only",
      "stale recommended-next-slice text is still present: Treat `root-turn`, `root-travel`",
    ]));
  });

  it("blocks stale handoff inventory and task-count wording anywhere in the plan", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleHandoffInventory: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "stale plan text is still present: two untracked replay export helpers",
      "stale plan text is still present: 44 unchecked always-open tasks",
    ]));
  });

  it("blocks stale facing/occlusion missing-proof wording anywhere in the plan", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleFacingProofState: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "stale plan text is still present: reported expected-blocked: missing recorded fallback/readability proof",
      "stale plan text is still present: The next action is Replay visual/source review conversion",
    ]));
  });

  it("blocks obsolete exact historical proof counts anywhere in the plan", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleHistoricalCounts: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "stale plan text is still present: 49/49 Game visual",
      "stale plan text is still present: 37/37",
      "stale plan text is still present: 117 proof rows",
      "stale plan text is still present: 63 accepted limitations",
      "stale plan text is still present: five untracked support-audit/test",
    ]));
  });

  it("blocks current-sounding labels in historical verification sections", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleHistoricalCurrentLabels: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "stale plan text is still present: Current audit verification on 2026-07-07",
      "stale plan text is still present: Current product decision: keep all four broad rows",
      "stale plan text is still present: Current default audit result: blocked as expected",
    ]));
  });

  it("blocks plans that remove the historical log boundary", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ missingHistoricalBoundary: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing Historical Log Boundary section before older verification logs",
    ]));
  });

  it("blocks plans that remove current verification sync notes", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ missingVerificationSyncNotes: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing verification-notes text: support-matrix Markdown sync",
      "missing verification-notes text: roadmap Markdown sync",
      "missing verification-notes text: architecture-plan status text sync",
      "missing verification-notes text: Future-family shape failures: 0",
    ]));
  });

  it("blocks stale current verification counts in the recent focused verification block", () => {
    const audit = auditMovementOutstandingTasks(planFixture({ staleRecentFocusedVerification: true }));

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing recent-focused-verification text: 2026-07-08 current documentation and proof gate",
      "stale recent-focused-verification text is still present: 49/49 Game visual proof",
      "stale recent-focused-verification text is still present: after adding the broad capture workflow state",
      "stale recent-focused-verification text is still present: user-facing `upright,standing-side-bend-head-direction,squat-knee-lift`",
    ]));
  });

  it("checks README runbook wording alongside the architecture plan", () => {
    expect(auditMovementOutstandingTasks(planFixture(), {
      runbookText: runbookFixture(),
    }).ok).toBe(true);

    const audit = auditMovementOutstandingTasks(planFixture(), {
      runbookText: runbookFixture({
        missingFacingDecision: true,
        staleCaptureLabelCount: true,
        staleFrameCount: true,
        staleSupportCandidateCount: true,
        staleUpperBodyStatus: true,
      }),
    });

    expect(audit.ok).toBe(false);
    expect(audit.failures).toEqual(expect.arrayContaining([
      "missing runbook text: facing/occlusion product-truth decision",
      "stale runbook text is still present: five current support-audit/test",
      "stale runbook text is still present: expected three recording labels",
      "stale runbook text is still present: stable 49-frame",
      "stale runbook text is still present: broad `upper-body-standing` remains internal-demo-only",
    ]));
  });

  it("blocks pre-commit handoff when referenced source candidates are untracked", () => {
    const audit = auditMovementPrecommitHandoff({
      dependentFileTexts: {
        "package.json": handoffSourceCandidateFiles.join("\n"),
      },
      trackedFiles: [],
    });

    expect(audit.ok).toBe(false);
    expect(audit.untrackedReferencedSourceCandidates).toEqual(handoffSourceCandidateFiles);
    expect(audit.failures[0]).toContain("not tracked");
  });

  it("blocks pre-commit handoff when staged dependent files split source candidates", () => {
    const audit = auditMovementPrecommitHandoff({
      dependentFileTexts: {
        "package.json": handoffSourceCandidateFiles.join("\n"),
      },
      stagedFiles: ["package.json", handoffSourceCandidateFiles[0]],
      trackedFiles: handoffSourceCandidateFiles,
    });

    expect(audit.ok).toBe(false);
    expect(audit.missingFromStagedSourceCandidates).toEqual(handoffSourceCandidateFiles.slice(1));
    expect(audit.failures[0]).toContain("staged handoff dependency set is split");
  });

  it("passes pre-commit handoff when references and source candidates are tracked together", () => {
    const audit = auditMovementPrecommitHandoff({
      dependentFileTexts: {
        "package.json": handoffSourceCandidateFiles.join("\n"),
      },
      stagedFiles: ["package.json", ...handoffSourceCandidateFiles],
      trackedFiles: handoffSourceCandidateFiles,
    });

    expect(audit).toMatchObject({
      failures: [],
      ok: true,
      referencedSourceCandidates: handoffSourceCandidateFiles,
      stagedReferencedSourceCandidates: handoffSourceCandidateFiles,
      trackedSourceCandidates: handoffSourceCandidateFiles,
    });
  });

  it("parses CLI options", () => {
    expect(parseMovementOutstandingTasksAuditArgs([
      "--plan",
      "plan.md",
      "--runbook",
      "README.md",
      "--strict",
      "--json",
    ])).toMatchObject({
      json: true,
      planPath: "plan.md",
      runbookPath: "README.md",
      strict: true,
    });
    expect(parseMovementOutstandingTasksAuditArgs([
      "--precommit-handoff",
      "--strict",
    ])).toMatchObject({
      precommitHandoff: true,
      strict: true,
    });
  });
});
