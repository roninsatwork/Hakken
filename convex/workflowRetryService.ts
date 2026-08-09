/**
 * Whether a failed workflow step gets another attempt, and when.
 *
 * A step used to fail its whole execution on the first error, which punished
 * the commonest failure there is: a provider having a moment. But retrying is
 * only safe when running the step twice cannot do a thing twice — so this
 * policy answers two separate questions, and both must say yes:
 *
 * 1. **Was the failure transient?** Classified from the error text. Unknown
 *    errors are terminal: retrying "agent not found" three times is three
 *    identical failures with extra latency, and a misclassified transient
 *    error merely fails as it always did.
 * 2. **Is the node safe to run again?** Decided by node type, deny by
 *    default. A retry may only repeat work whose externally visible effects
 *    are none (before its output is finalized). `emailNode` may have sent the
 *    email before the error; `actionNode` may have POSTed to an API that is
 *    not idempotent; `databaseNode` writes. None of those can prove the first
 *    attempt did nothing, so none retry — they fail to the review list on the
 *    first error, unchanged from before.
 *
 * `agentNode` is the one type that clears the bar today: its callable surface
 * is a model call plus reads, its writes are its own run records, and any
 * real-world action a tool takes sits behind the approval gate. It is also
 * where transient provider errors actually happen.
 */

/** Total tries a step gets, first attempt included. */
export const MAX_STEP_ATTEMPTS = 3;

/** Node types where a re-run cannot repeat an externally visible effect. */
const RETRYABLE_NODE_TYPES = new Set(["agentNode"]);

const TRANSIENT_ERROR_PATTERNS: readonly RegExp[] = [
  /\b429\b/,
  /\b50[0234]\b/,
  /rate limit/i,
  /timed? ?out/i,
  /temporarily unavailable/i,
  /\bunavailable\b/i,
  /overloaded/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /fetch failed/i,
  /network error/i,
  /socket hang ?up/i,
];

export function isTransientWorkflowError(message: string): boolean {
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isRetryableNodeType(nodeType: string | undefined): boolean {
  return nodeType !== undefined && RETRYABLE_NODE_TYPES.has(nodeType);
}

/**
 * Delay before the next attempt: 5s then 25s. Long enough for a provider
 * hiccup to pass, short enough that a workflow does not appear hung.
 */
export function retryDelayMs(attemptJustFailed: number): number {
  return attemptJustFailed === 1 ? 5_000 : 25_000;
}

/**
 * The single decision point `executeNode`'s catch block consults.
 *
 * `attemptJustFailed` is 1-based. The answer is "retry" only when the error
 * reads transient, the node type is provably safe, and the budget allows
 * another try — otherwise the step fails exactly as it always has.
 */
export function decideStepFailure(args: {
  errorMessage: string;
  nodeType: string | undefined;
  attemptJustFailed: number;
}): { action: "retry"; delayMs: number } | { action: "fail" } {
  if (
    isRetryableNodeType(args.nodeType) &&
    isTransientWorkflowError(args.errorMessage) &&
    args.attemptJustFailed < MAX_STEP_ATTEMPTS
  ) {
    return { action: "retry", delayMs: retryDelayMs(args.attemptJustFailed) };
  }
  return { action: "fail" };
}
