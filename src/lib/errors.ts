/**
 * Convex surfaces thrown errors to the client with framing around the message
 * the author actually wrote. Show that sentence only — the rest is noise to a
 * user and can leak internals.
 *
 * The framing is not confined to a prefix on line one. A server failure arrives
 * shaped like:
 *
 *     [Request ID: 9f2c] Server Error
 *     Uncaught Error: Activation blocked: run an eval first.
 *         at handler (../convex/agents.ts:214:11)
 *
 * so reading only the first line yields "Server Error" — Convex's placeholder,
 * which tells the reader nothing and is what the caller's own fallback was
 * written for. Scan downwards instead and take the first line that survives
 * unwrapping, which skips the envelope without needing to know its exact shape.
 *
 * This lives here rather than beside the toast provider because the same
 * unwrapping is needed by callers that render the message inline and never
 * touch React context.
 */

/** Convex placeholders that carry no information for a reader. */
const EMPTY_ENVELOPE = /^(server error|internal server error|error)$/i;

export function toUserFacingMessage(error: unknown, fallbackMessage: string) {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  for (const line of raw.split('\n')) {
    const candidate = line
      .trim()
      .replace(/^\[.*?\]\s*/, '')
      .replace(/^(Uncaught\s+)?(Convex)?Error:\s*/i, '')
      .trim();

    if (!candidate) continue;
    // A stack frame, not a sentence.
    if (/^at\s/.test(candidate)) continue;
    if (EMPTY_ENVELOPE.test(candidate)) continue;
    // Anything this long is a serialized payload rather than something written
    // for a person; keep looking in case a real sentence follows.
    if (candidate.length > 200) continue;

    return candidate;
  }

  return fallbackMessage;
}

/**
 * The older, wider-used spelling of the same idea. It used to return
 * `error.message` untouched, which printed the whole Convex envelope — request
 * ID, placeholder, and in development a stack fragment — into admin forms
 * across the app. Delegating means those call sites are fixed without being
 * touched, and there is one definition of "what a user should see".
 *
 * Non-Error values still fall back rather than being rendered: a string thrown
 * from somewhere unknown is not a sentence written for a reader.
 */
export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? toUserFacingMessage(error, fallback) : fallback;
}
