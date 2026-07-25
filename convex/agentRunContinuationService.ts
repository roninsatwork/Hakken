/**
 * The rules governing a durable agent run: when it pauses, when it resumes, and
 * when it is declared dead.
 *
 * These are pure functions with no database or provider access so the policy can
 * be tested directly. The runtime in `agentRuntime.ts` supplies the clock and
 * the transcript; everything about *what should happen* lives here.
 *
 * Background: the objective loop used to run start-to-finish inside one Convex
 * action. That works while an agent is capped at four model turns, but P3.1
 * raised the ceiling to twenty-four, and an action that overruns its execution
 * window is killed with no failure handler and no record of the work already
 * done. The workflow engine already solved this by doing one node per scheduled
 * action and keeping its place in the database (`convex/workflowRuntime.ts`);
 * this brings the agent runtime to the same standard.
 */

/**
 * How long one action segment may keep working before it checkpoints and hands
 * over to a freshly scheduled continuation.
 *
 * Convex allows an action roughly ten minutes. Stopping at three leaves room for
 * the model call already in flight plus the bookkeeping writes that follow it,
 * so the handover always happens by choice rather than by being killed.
 */
export const AGENT_RUN_SEGMENT_BUDGET_MS = 3 * 60 * 1000;

/**
 * The longest a single action can plausibly stay alive.
 *
 * Used to derive the stall threshold below. Nothing enforces this value; it
 * describes the platform, so the derived threshold stays correct if the segment
 * budget is retuned.
 */
export const AGENT_RUN_MAX_ACTION_LIFETIME_MS = 10 * 60 * 1000;

/**
 * How long a checkpoint may go unchanged before the run is treated as stalled.
 *
 * This MUST exceed the maximum lifetime of an action. The checkpoint is how the
 * sweeper distinguishes "killed" from "still working", and it has no other
 * signal — a live action holds no lock the sweeper can see. Set this below the
 * action lifetime and the sweeper would resume runs that are still executing,
 * running their remaining tool calls a second time. Write side effects would be
 * duplicated.
 */
export const AGENT_RUN_STALL_MS = AGENT_RUN_MAX_ACTION_LIFETIME_MS + 2 * 60 * 1000;

/**
 * How many times a run may be revived after a stall before it is failed.
 *
 * A run that dies repeatedly at the same step is not going to succeed on the
 * fourth attempt; it is hitting something deterministic. Failing it visibly is
 * better than reviving it forever.
 */
export const AGENT_RUN_MAX_RESUME_ATTEMPTS = 3;

/**
 * Backstop on the number of continuation segments for one run.
 *
 * The runtime budget should always stop a run long before this: reaching twenty
 * segments means twenty separate three-minute windows, far past any configured
 * `maxRuntimeMs`. It exists so a bug in the handover cannot produce a run that
 * reschedules itself indefinitely.
 */
export const AGENT_RUN_MAX_SEGMENTS = 20;

/**
 * Cap on the stored transcript, in characters of serialised JSON.
 *
 * A Convex document is limited to 1MB. Tool results are the unpredictable part —
 * a search handler can return a lot — so the transcript is trimmed to fit rather
 * than risking a write that throws at the moment the run is trying to save its
 * progress.
 */
export const AGENT_RUN_CHECKPOINT_MAX_CHARS = 400_000;

export function getCancelledRunMessage(finalOutput?: string | null) {
  const trimmed = finalOutput?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Agent run cancelled.";
}

export function getStalledRunFailureMessage() {
  return "Agent Execution Interrupted: the run stopped unexpectedly and could not be resumed. No further steps were taken.";
}

/**
 * Whether the loop should stop because someone cancelled the run.
 *
 * `cancelRun` writes CANCELLED and returns; it has no way to reach into a
 * running action. The loop therefore has to come and look. Anything terminal
 * counts, not just CANCELLED: if another path has already concluded the run,
 * continuing to execute tools against it would produce work nobody is waiting
 * for.
 */
export function isRunStopRequested(status: string | null | undefined) {
  return status === "CANCELLED" || status === "SUCCESS" || status === "FAILED";
}

/**
 * Whether this segment should hand over to a scheduled continuation.
 *
 * Checked before starting another model turn, never in the middle of one. A
 * handover between turns leaves the transcript in a state the next segment can
 * pick up verbatim; a handover mid-turn would not.
 */
export function shouldCheckpointSegment(args: {
  segmentElapsedMs: number;
  segmentBudgetMs?: number;
}) {
  const budget = args.segmentBudgetMs ?? AGENT_RUN_SEGMENT_BUDGET_MS;
  return args.segmentElapsedMs >= budget;
}

export type StalledRunDecision = "WAIT" | "RESUME" | "FAIL";

/**
 * What the sweeper should do with a run that claims to be RUNNING.
 *
 * `WAIT` is the common answer and the safe default — a run that is progressing
 * normally must never be touched.
 */
export function decideStalledRunAction(args: {
  checkpointUpdatedAt: number;
  now: number;
  resumeAttempts: number;
  hasTranscript: boolean;
  stallMs?: number;
  maxResumeAttempts?: number;
}): StalledRunDecision {
  const stallMs = args.stallMs ?? AGENT_RUN_STALL_MS;
  const maxAttempts = args.maxResumeAttempts ?? AGENT_RUN_MAX_RESUME_ATTEMPTS;

  if (args.now - args.checkpointUpdatedAt < stallMs) return "WAIT";
  // Nothing to resume from is not a reason to keep a dead run marked RUNNING.
  if (!args.hasTranscript) return "FAIL";
  if (args.resumeAttempts >= maxAttempts) return "FAIL";
  return "RESUME";
}

type ConversationTurn = { role?: string };

/**
 * Trim a transcript from the front so it fits in a checkpoint.
 *
 * Oldest turns go first — that is ordinary context-window behaviour and the
 * recent turns are the ones the model needs. The subtlety is that a tool
 * interaction is two turns: a `model` turn carrying the calls and a `function`
 * turn carrying the matching results. Dropping only the first of those leaves an
 * orphan result the provider will reject, so whenever trimming exposes a leading
 * `function` turn that turn is dropped with it.
 */
export function trimConversationForCheckpoint<T extends ConversationTurn>(
  turns: T[],
  maxChars: number = AGENT_RUN_CHECKPOINT_MAX_CHARS,
): { turns: T[]; serialized: string; trimmed: boolean } {
  let kept = turns;
  let serialized = JSON.stringify(kept);
  let trimmed = false;

  while (serialized.length > maxChars && kept.length > 1) {
    kept = kept.slice(1);
    while (kept.length > 1 && kept[0]?.role === "function") {
      kept = kept.slice(1);
    }
    trimmed = true;
    serialized = JSON.stringify(kept);
  }

  // A single turn larger than the cap cannot be trimmed any further without
  // losing the objective itself. Report it rather than silently storing
  // something that will fail to write.
  return { turns: kept, serialized, trimmed };
}

/** Whether a trimmed transcript is small enough to store at all. */
export function isCheckpointStorable(
  serialized: string,
  maxChars: number = AGENT_RUN_CHECKPOINT_MAX_CHARS,
) {
  return serialized.length <= maxChars;
}
