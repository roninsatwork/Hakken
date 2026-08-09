/**
 * Grading for rehearsal evals: did the drill do what the fixture expected?
 *
 * A rehearsal run has already executed the real loop — real model, real reads,
 * every write recorded as REHEARSED instead of performed. What is graded here
 * is the recorded behaviour: the set of tool handlers the agent actually
 * invoked, compared against the fixture's expected tool plan. This is the
 * question the config-contract eval cannot answer — that one checks the agent
 * *could* call the right tools; this checks that, faced with the objective, it
 * *did*.
 *
 * Pure, so the judgement is testable without a model or a database.
 */

export type RehearsalToolCallRecord = {
  handlerMapping: string;
  /** The tool-call statuses the runtime writes. */
  status: string;
};

export type RehearsalGrade = {
  status: "PASSED" | "FAILED";
  /** Handler mappings the fixture required, deduplicated. */
  expected: string[];
  /** Handler mappings the run genuinely performed (reads) or rehearsed (writes). */
  performed: string[];
  /** Expected mappings the run never made. The heart of a failure. */
  missing: string[];
  /** Human-readable reasons, empty on a pass. */
  failures: string[];
};

/** A call counts as performed when it ran (reads) or was recorded (writes). */
const PERFORMED_STATUSES = new Set(["SUCCESS", "REHEARSED"]);

function parseExpectedMappings(expectedToolPlanJson: string | undefined): string[] {
  // Same shape `parseExpectedToolPlan` in agentEvalFixtures reads:
  // [{ handlerMapping: "..." }, ...]. Tolerant of junk for the same reason —
  // a hand-edited fixture must fail its eval, not crash it.
  if (!expectedToolPlanJson) return [];
  try {
    const parsed = JSON.parse(expectedToolPlanJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    const mappings = parsed
      .map((entry) =>
        entry && typeof entry === "object" && "handlerMapping" in entry
          ? (entry as { handlerMapping?: unknown }).handlerMapping
          : null
      )
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    return Array.from(new Set(mappings));
  } catch {
    return [];
  }
}

export function gradeRehearsalToolPlan(args: {
  expectedToolPlanJson: string | undefined;
  toolCalls: RehearsalToolCallRecord[];
  runStatus: string;
}): RehearsalGrade {
  const expected = parseExpectedMappings(args.expectedToolPlanJson);
  const performed = Array.from(
    new Set(
      args.toolCalls
        .filter((call) => PERFORMED_STATUSES.has(call.status))
        .map((call) => call.handlerMapping)
    )
  );

  const failures: string[] = [];

  // A drill that crashed grades as a failure regardless of what it managed
  // before crashing — "the agent would have done the right things, eventually"
  // is not a pass.
  if (args.runStatus !== "SUCCESS") {
    failures.push(`The rehearsal run ended ${args.runStatus}, not SUCCESS.`);
  }

  const missing = expected.filter((mapping) => !performed.includes(mapping));
  if (missing.length > 0) {
    failures.push(
      `Expected tool${missing.length === 1 ? "" : "s"} never called: ${missing.join(", ")}.`
    );
  }

  // A fixture with no expected plan still proves something ran to completion;
  // extra calls are deliberately not failures — the fixture names what must
  // happen, not everything that may.
  return {
    status: failures.length === 0 ? "PASSED" : "FAILED",
    expected,
    performed,
    missing,
    failures,
  };
}
