/**
 * Where a job's time actually went.
 *
 * ## Why the durations are derived rather than read
 *
 * A run step is written once its work has finished, and the writer stamps
 * `startedAt` and `completedAt` with the same instant. So every step on record
 * has a duration of zero, and a waterfall drawn straight from those fields would
 * be a row of hairlines.
 *
 * What the steps do record faithfully is the moment each one finished. A run is
 * a sequence — think, call a tool, read the result, think again — so the elapsed
 * time belonging to a step is the gap between the previous step finishing and
 * this one finishing, with the first step measured from the start of the run.
 *
 * That attribution is exact rather than approximate: every second between the
 * run starting and the last step finishing is charged to exactly one step, and
 * the parts sum to the whole. Recording per-step start times instead would leave
 * the overhead between steps unattributed, which is the opposite of what a
 * waterfall is for.
 */

/** Below this a bar is invisible, so a fast step would look like it never ran. */
const MIN_VISIBLE_PERCENT = 0.6;

export type WaterfallStepInput = {
  _id: string;
  kind: string;
  status: string;
  startedAt: number;
  completedAt?: number;
  input?: string;
  error?: string;
  /**
   * Which tool this step used, in the words a person installed it under.
   *
   * Resolved by the caller, because the two tool steps hide the name in
   * different places: the call step stores its arguments, and the result step
   * stores the runtime's own name for the tool. Neither is worth showing.
   */
  toolName?: string;
};

export type WaterfallTone = "thinking" | "tool" | "waiting" | "failed";

export type WaterfallRow = {
  id: string;
  label: string;
  offsetPercent: number;
  widthPercent: number;
  durationMs: number;
  tone: WaterfallTone;
  /** The step that consumed most of the run, so the screen can say so outright. */
  isLongest: boolean;
  failed: boolean;
};

/**
 * A tool's name for reading, from the runtime's name for it.
 *
 * The fallback, for a tool that has since been uninstalled and so has no
 * installed name left to read. `apify_actor_run` becomes "Apify actor run",
 * which is at least a phrase rather than an identifier.
 */
export function humaniseToolName(runtimeName: string): string {
  const words = runtimeName.trim().replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a step is, in words. The stored kinds are the runtime's vocabulary and
 * mean nothing to somebody who has not read the runtime.
 *
 * The two tool steps used to be labelled from their stored input, which put a
 * blob of raw JSON arguments on the chart for the call step and a truncated
 * `apify_actor_run` on the result step. Neither told the reader the one thing
 * they came to the chart for: which tool ran, and when.
 */
export function describeStepKind(kind: string, input?: string, toolName?: string): string {
  const tool = toolName?.trim();
  switch (kind) {
    case "OBSERVE": return "Read the request";
    case "PLAN": return "Decided what to do";
    case "REPLAN": return "Changed its plan";
    case "MODEL": return "Thought about it";
    case "TOOL_CALL": return tool ? `Used ${tool}` : "Used a tool";
    case "TOOL_RESULT": return tool ? `Read what ${tool} sent back` : "Read the result";
    case "APPROVAL_REQUEST": return "Waited for someone to approve";
    case "FINAL": return "Wrote the answer";
    default: return kind;
  }
}

/** How a step ended, in words rather than the runtime's own states. */
export function describeStepStatus(status: string): string {
  switch (status) {
    case "SUCCESS": return "Worked";
    case "FAILED": return "Failed";
    case "RUNNING": return "Running";
    case "PENDING": return "Not started";
    case "SKIPPED": return "Skipped";
    default: return status;
  }
}

function toneFor(step: WaterfallStepInput): WaterfallTone {
  if (step.status === "FAILED") return "failed";
  if (step.kind === "APPROVAL_REQUEST") return "waiting";
  if (step.kind === "TOOL_CALL" || step.kind === "TOOL_RESULT") return "tool";
  return "thinking";
}

export function buildWaterfall(
  steps: ReadonlyArray<WaterfallStepInput>,
  options: { runStartedAt: number; runCompletedAt?: number; now: number }
): WaterfallRow[] {
  if (steps.length === 0) return [];

  const ordered = [...steps].sort((left, right) => left.startedAt - right.startedAt);

  // An unfinished run is measured to the present moment, so the step it is
  // currently stuck on grows while you watch rather than reading as instant.
  const runEndedAt = options.runCompletedAt
    ?? Math.max(options.now, ordered[ordered.length - 1].startedAt);
  const totalMs = Math.max(runEndedAt - options.runStartedAt, 1);

  let previousEnd = options.runStartedAt;
  const measured = ordered.map((step) => {
    // Clamped to the run's own start: clock skew between the writer of the run
    // and the writer of its steps can put a step fractionally earlier, which
    // would otherwise draw a bar off the left of the chart.
    const finishedAt = Math.max(step.completedAt ?? step.startedAt, options.runStartedAt);
    const startedAt = Math.min(Math.max(previousEnd, options.runStartedAt), finishedAt);
    const durationMs = Math.max(finishedAt - startedAt, 0);
    previousEnd = finishedAt;
    return { step, startedAt, durationMs };
  });

  const longestDuration = Math.max(...measured.map((entry) => entry.durationMs));

  return measured.map((entry) => {
    const rawWidth = (entry.durationMs / totalMs) * 100;
    return {
      id: entry.step._id,
      label: describeStepKind(entry.step.kind, entry.step.input, entry.step.toolName),
      offsetPercent: Math.min(((entry.startedAt - options.runStartedAt) / totalMs) * 100, 100),
      widthPercent: Math.min(Math.max(rawWidth, MIN_VISIBLE_PERCENT), 100),
      durationMs: entry.durationMs,
      tone: toneFor(entry.step),
      // Only worth pointing at when one step genuinely dominates. Flagging the
      // largest of several similar steps would draw the eye to nothing.
      isLongest: longestDuration > 0
        && entry.durationMs === longestDuration
        && entry.durationMs / totalMs >= 0.5,
      failed: entry.step.status === "FAILED",
    };
  });
}

/**
 * The one-line reading of the chart, or nothing when there is no story to tell.
 */
export function summariseWaterfall(rows: ReadonlyArray<WaterfallRow>): string | undefined {
  const dominant = rows.find((row) => row.isLongest);
  if (!dominant) return undefined;

  const share = Math.round(
    (dominant.durationMs / rows.reduce((sum, row) => sum + row.durationMs, 0)) * 100
  );
  if (!Number.isFinite(share)) return undefined;

  return dominant.failed
    ? `${share}% of this job was spent on a step that then failed: ${dominant.label.toLowerCase()}.`
    : `${share}% of this job was spent on one step: ${dominant.label.toLowerCase()}.`;
}
