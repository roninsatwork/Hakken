import { describe, expect, it } from "vitest";

import {
  auditMovementOutstandingTasks,
  parseMovementOutstandingTasksAuditArgs,
} from "./movement-outstanding-tasks-audit.mjs";

const requiredOpenTasks = [
  "Maintain 0 missing-proof, manual-review, failed, and blocking rows",
  "Keep the 14 internal preview/demo/diagnostic coverage families out of product copy",
  "Capture or identify a real seated recording",
  "For `sitting`, cover `seated-forward-fold`",
  "Capture or identify a real walking/root-travel bundle",
  "Keep the refreshed 50-frame Game visual capture/review set current",
  "Before committing or handing off the current movement slice",
];

function planFixture({
  staleRootTurn = false,
} = {}) {
  const fillerTasks = Array.from({ length: 18 }, (_, index) => `- [ ] Keep placeholder task ${index} open.`);
  const currentSupportTask = staleRootTurn
    ? "2. Keep the current user-facing support list stable in product/UI copy: `upright`, `upper-body-standing`, `standing-side-bend-head-direction`, and `squat-knee-lift`."
    : "2. Current user-facing support list in product/UI copy: `upright`, `upper-body-standing`, `standing-side-bend-head-direction`, `squat-knee-lift`, and narrow standing `root-turn` for standing root orientation only.";
  const internalTask = staleRootTurn
    ? "3. Treat `root-turn`, `root-travel`, floor/yoga/Pilates, walking, jumping, props/contact, sitting, kneeling, and rolling/crawling as non-user-facing until proof exists."
    : "3. Treat `root-travel`, floor/yoga/Pilates, walking, jumping, props/contact, sitting, kneeling, and rolling/crawling as non-user-facing until proof exists; keep `root-turn` scoped to standing root orientation only.";

  return `# Movement Studio Best-Practice Architecture Plan

## Always-Open Outstanding Tasks

${requiredOpenTasks.map((task) => `- [ ] ${task}.`).join("\n")}
${fillerTasks.join("\n")}

## Recommended Next Slice

Next concrete tasks:

1. Record or identify seated forward-fold evidence, then run \`npx -p node@22.13.0 npm run movement:replay:validate-scenario -- --scenario movement-proof-seated-forward-fold --quiet\`.
${currentSupportTask}
${internalTask}
4. Keep the next recording/review target explicit: seated forward fold.
5. Capture or identify a real walking/root-travel bundle with \`movement-proof-root-travel\`.
6. Keep the refreshed 50-target Game visual proof set current.
7. Decide whether to keep compact summaries only; do not commit raw \`tmp/movement-replay-lab/**\` captures by default.
8. Pick the next family only after writing its support-claim audit shape first.
9. Before merge or push, run the repo local gate under Node 22.13.0.
`;
}

describe("movement outstanding tasks audit", () => {
  it("passes when open tasks and recommended next slice remain actionable", () => {
    expect(auditMovementOutstandingTasks(planFixture())).toMatchObject({
      failures: [],
      ok: true,
      recommendedTaskCount: 9,
      uncheckedTaskCount: 25,
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

  it("parses CLI options", () => {
    expect(parseMovementOutstandingTasksAuditArgs([
      "--plan",
      "plan.md",
      "--strict",
      "--json",
    ])).toMatchObject({
      json: true,
      planPath: "plan.md",
      strict: true,
    });
  });
});
