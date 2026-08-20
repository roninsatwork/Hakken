/**
 * What a run is told to do.
 *
 * Pressing Run runs the agent. It does not open a form, and it does not
 * refuse (Anthony, 2026-08-20: *"i want it to run"*). Both of those were
 * here: the manual path threw when an agent had no standing job, so the
 * screen popped a "what should it do?" box before anything could start, and
 * the scheduled path sent the schedule's own name — a label, not an
 * instruction.
 *
 * An agent already knows what it is. Its system prompt says so, and usually
 * its description does too. So the objective falls back through what the
 * agent itself carries, and only reaches the generic line when the agent
 * carries nothing at all — at which point the system prompt is still in
 * front of the model and the run is still the right thing to attempt.
 *
 * One function, used by every path that starts an agent. These two paths
 * drifted apart once already, and that drift is the whole bug.
 */

/** Said to an agent that carries no job line of its own. */
export const IMPLICIT_RUN_OBJECTIVE =
  "Carry out your standing purpose as set out in your instructions.";

function firstMeaningful(...candidates: Array<string | null | undefined>): string | undefined {
  for (const candidate of candidates) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function resolveRunObjective(args: {
  /** What the caller asked for this time, which always wins. */
  requested?: string | null;
  /** The agent's own standing job, set on its Prompt screen. */
  standingObjective?: string | null;
  /** What the agent is for, in a sentence. */
  description?: string | null;
}): string {
  return (
    firstMeaningful(args.requested, args.standingObjective, args.description) ??
    IMPLICIT_RUN_OBJECTIVE
  );
}
