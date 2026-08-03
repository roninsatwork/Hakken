/**
 * The rules a research job runs by: what it does next, when it gives up on one
 * item, and when the whole job is finished.
 *
 * Pure functions with no database access, so the policy can be tested on its own
 * — the same split `agentRunContinuationService.ts` uses for the runtime. What
 * *should* happen lives here; the Convex functions in `salesDataResearchJobs.ts`
 * supply the rows and the clock.
 */

export type ResearchJobPhase = "CUSTOMERS" | "CHAINS" | "PROSPECTS" | "DONE";
export type ResearchJobItemKind = "CUSTOMER" | "CHAIN" | "PROSPECT";
export type ResearchJobItemStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "FAILED";
export type ResearchJobStatus =
  | "RUNNING"
  | "COMPLETE"
  | "COMPLETE_WITH_EXCEPTIONS"
  | "STOPPED"
  | "FAILED";

/**
 * How many goes an item gets before the job records it as undone and moves on.
 *
 * Two. The first failure is often the run meeting a ceiling, which the next run
 * will not; a second failure at the same item is something deterministic, and a
 * third attempt is money spent proving it again. One awkward chain must not take
 * the other twenty-nine down with it — which is exactly what the old fan-out
 * did, silently.
 */
export const MAX_ITEM_ATTEMPTS = 2;

/**
 * What a job may spend across every run it starts, unless told otherwise.
 *
 * Sized from measured runs rather than guessed: one chain finished in thirteen
 * tool calls for about ten pence, and the job is roughly a hundred customers,
 * chains and prospects. Twenty-five pounds is several times the expected bill
 * and still small enough that hitting it means something has gone wrong.
 */
export const DEFAULT_JOB_MAX_COST_GBP = 25;

/** The order the phases run in. Fixed here, never chosen by the model. */
const PHASE_ORDER: ResearchJobPhase[] = ["CUSTOMERS", "CHAINS", "PROSPECTS", "DONE"];

/**
 * The phase after this one.
 *
 * Phase three exists because of phase two: a prospect's details cannot be
 * researched until the chain pass has found the prospect. That dependency is
 * why this is one job rather than three buttons pressed in order.
 */
export function nextPhase(phase: ResearchJobPhase): ResearchJobPhase {
  const index = PHASE_ORDER.indexOf(phase);
  if (index < 0 || index >= PHASE_ORDER.length - 1) return "DONE";
  return PHASE_ORDER[index + 1];
}

export function phaseForKind(kind: ResearchJobItemKind): ResearchJobPhase {
  if (kind === "CUSTOMER") return "CUSTOMERS";
  if (kind === "CHAIN") return "CHAINS";
  return "PROSPECTS";
}

export function kindForPhase(phase: ResearchJobPhase): ResearchJobItemKind | null {
  if (phase === "CUSTOMERS") return "CUSTOMER";
  if (phase === "CHAINS") return "CHAIN";
  if (phase === "PROSPECTS") return "PROSPECT";
  return null;
}

/**
 * What to do with an item whose run did not finish it.
 *
 * A run that stopped on one of its own ceilings has not failed at the item — it
 * ran out of room mid-way. Either way the item goes back on the queue until it
 * has had its attempts, because the alternative is what used to happen: the work
 * vanished into a list of 141 runs and nothing ever picked it up again.
 */
export function decideItemRetry(attempts: number): "RETRY" | "GIVE_UP" {
  return attempts >= MAX_ITEM_ATTEMPTS ? "GIVE_UP" : "RETRY";
}

export type ItemTally = {
  pending: number;
  inProgress: number;
  done: number;
  failed: number;
};

export function tallyItems(
  items: ReadonlyArray<{ status: ResearchJobItemStatus }>
): ItemTally {
  const tally: ItemTally = { pending: 0, inProgress: 0, done: 0, failed: 0 };
  for (const item of items) {
    if (item.status === "PENDING") tally.pending += 1;
    else if (item.status === "IN_PROGRESS") tally.inProgress += 1;
    else if (item.status === "DONE") tally.done += 1;
    else tally.failed += 1;
  }
  return tally;
}

/** Nothing left to hand out, in any phase. */
export function isQueueDrained(tally: ItemTally): boolean {
  return tally.pending === 0 && tally.inProgress === 0;
}

/**
 * How a drained queue ended.
 *
 * Two endings, not one, because "finished" and "finished apart from these four"
 * are different things to be told and the difference is the whole point of
 * recording exceptions.
 */
export function decideJobEnding(tally: ItemTally): "COMPLETE" | "COMPLETE_WITH_EXCEPTIONS" {
  return tally.failed > 0 ? "COMPLETE_WITH_EXCEPTIONS" : "COMPLETE";
}

/**
 * Whether the job has spent what it was allowed.
 *
 * Checked before starting another run rather than during one: a run already in
 * flight is left to finish, so the job stops on a boundary instead of abandoning
 * an item half-researched.
 */
export function shouldStopForJobBudget(args: {
  spentGBP: number;
  maxCostGBP: number;
}): boolean {
  return args.spentGBP >= args.maxCostGBP;
}

/**
 * The line the screen shows while the job is working.
 *
 * One sentence a person can read at a glance — the count that matters and the
 * phase it belongs to, not a run count. "Queued 60" was never information.
 */
export function describeProgress(args: {
  phase: ResearchJobPhase;
  tally: ItemTally;
}): string {
  const { phase, tally } = args;
  const total = tally.pending + tally.inProgress + tally.done + tally.failed;

  if (phase === "DONE" || total === 0) return "Finishing up";

  const noun =
    phase === "CUSTOMERS" ? "customers" : phase === "CHAINS" ? "chains" : "prospects";
  const verb = phase === "CHAINS" ? "Looking through" : "Filling in";

  return `${verb} ${noun} — ${tally.done + tally.failed} of ${total}`;
}
