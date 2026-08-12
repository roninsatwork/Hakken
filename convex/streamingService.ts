/**
 * Flush policy for streamed assistant replies.
 *
 * Convex queries are reactive, so "streaming" is really: write the partial reply
 * into the message row and let every subscribed client re-render. The cost is
 * that each write is a real transaction fanned out to every subscriber, so
 * writing per token would turn a 500-token answer into 500 transactions.
 *
 * This decides when a pending chunk is worth writing. It is pure so the policy
 * can be tested without a database or a provider.
 */

/** Write at most this often, so a fast model cannot flood the database. */
export const STREAM_FLUSH_INTERVAL_MS = 250;

/**
 * Flush early once this much text is pending, so a slow model still feels live
 * rather than arriving in silent 250ms blocks.
 */
export const STREAM_FLUSH_CHARS = 120;

export function shouldFlushStreamedText(args: {
  pendingChars: number;
  msSinceLastFlush: number;
  isFinal: boolean;
}): boolean {
  // The last chunk always lands: the reader must never be left looking at a
  // reply that is missing its final words because they were under the threshold.
  if (args.isFinal) return args.pendingChars > 0;
  if (args.pendingChars <= 0) return false;

  return args.pendingChars >= STREAM_FLUSH_CHARS || args.msSinceLastFlush >= STREAM_FLUSH_INTERVAL_MS;
}

/**
 * How long a half-written reply may sit before it is treated as abandoned.
 *
 * A run whose action is killed outright cannot clean up after itself, so its
 * message would stay marked as streaming forever and the UI would show a caret
 * blinking against a reply that is never coming. Anything older than the longest
 * a run may take is stale by definition.
 */
export const STREAM_STALE_AFTER_MS = 10 * 60 * 1000;

export function isStreamStale(args: { startedAt: number; now: number }): boolean {
  return args.now - args.startedAt >= STREAM_STALE_AFTER_MS;
}

/**
 * What the reader should see for a message.
 *
 * `streaming` means text is still arriving and the UI should show a caret.
 * `stalled` means the run died without finishing; the UI must say so rather than
 * pretending more text is coming. `complete` is an ordinary finished message.
 */
export type StreamPresentation = "complete" | "streaming" | "stalled";

export function getStreamPresentation(args: {
  isStreaming?: boolean;
  streamStartedAt?: number;
  now: number;
}): StreamPresentation {
  if (!args.isStreaming) return "complete";
  if (args.streamStartedAt === undefined) return "streaming";
  return isStreamStale({ startedAt: args.streamStartedAt, now: args.now }) ? "stalled" : "streaming";
}

/** Shown in place of an abandoned reply so the reader is never left hanging. */
export const STREAM_STALLED_MESSAGE =
  "This reply stopped unexpectedly and could not be completed. Please try again.";

/**
 * The real phases of a plain assistant reply, for the pre-reply status pill.
 *
 * These replaced a client-side rotation of invented phrases on a 1.2s timer.
 * The contract is honesty: a stage is written by the run as it enters that
 * phase, appears only if the phase actually runs, and lasts exactly as long
 * as the phase does. `READING_FILES` only ever shows when the message carried
 * attachments still being processed; `SEARCHING_KNOWLEDGE` only when
 * retrieval actually runs.
 */
export const ASSISTANT_STAGES = [
  "CHECKING",
  "READING_FILES",
  "SEARCHING_KNOWLEDGE",
  "WRITING",
] as const;

export type AssistantStage = (typeof ASSISTANT_STAGES)[number];

/**
 * Which stage the pill may honestly show right now.
 *
 * A crashed run cannot clear its stage, so anything older than the longest a
 * run may take is ignored rather than displayed — same reasoning as the
 * stream staleness guard. An unknown value (a newer deployment's stage read
 * by an older client, or vice versa) is dropped rather than guessed at.
 */
export function getPresentableAssistantStage(args: {
  stage?: string;
  stageAt?: number;
  now: number;
}): AssistantStage | null {
  if (!args.stage || args.stageAt === undefined) return null;
  if (args.now - args.stageAt >= STREAM_STALE_AFTER_MS) return null;
  return (ASSISTANT_STAGES as readonly string[]).includes(args.stage)
    ? (args.stage as AssistantStage)
    : null;
}
