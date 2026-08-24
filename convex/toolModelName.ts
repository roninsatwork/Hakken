/**
 * The name a model knows a tool by.
 *
 * **What this replaces.** A tool used to reach the model under its *routing
 * key* with the punctuation swapped for underscores — `knowledge.search` became
 * `knowledge_search`. That worked by accident for tools whose routing keys read
 * well, and badly for the rest: `salesCustomers_research_read`,
 * `opportunityReport_matchProspects`, `marketDiscovery_groups_review`. Half
 * camelCase, half snake_case, and written for plumbing rather than for a model
 * to read.
 *
 * Worse than the names themselves, the derivation welded two things together
 * that must move independently: where a call is routed, and what the model calls
 * it. Wanting a distinct name meant inventing a distinct routing key.
 *
 * So a tool now carries its model-facing name explicitly. There is **no
 * fallback and no derivation** — a fallback would be a second answer to the
 * question this field exists to answer, and the second answer is always the one
 * that rots.
 *
 * Three names, three jobs, and they should never be confused again:
 *
 * - `name` — the label an administrator types. Shown on screens. **Never
 *   reaches a model.**
 * - `handlerMapping` — where the call is routed. Internal. **Never reaches a
 *   model.**
 * - `modelName` — what the model is offered. This.
 */

import { appError } from "./utils/appError";

/**
 * The shape a model-facing name must take.
 *
 * Lower-case snake_case, starting with a letter. Every provider accepts it, and
 * a single house convention means a model never has to work out whether this
 * platform writes `readMailbox`, `read-mailbox` or `read_mailbox` today.
 *
 * The ceiling is the tightest of the providers' limits rather than the most
 * generous: a name that works on three providers and is rejected by the fourth
 * fails at the moment an agent tries to use it, which is far too late.
 */
export const TOOL_MODEL_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const TOOL_MODEL_NAME_MAX = 64;
export const TOOL_MODEL_NAME_MIN = 3;

/**
 * Check a model-facing name, and return it trimmed.
 *
 * Returned rather than validated in place so a caller cannot store the untrimmed
 * original by accident.
 */
export function normaliseToolModelName(raw: string): string {
  const name = raw.trim();

  if (name.length < TOOL_MODEL_NAME_MIN) {
    throw appError(
      "INVALID_INPUT",
      `A tool's model name must be at least ${TOOL_MODEL_NAME_MIN} characters.`,
    );
  }
  if (name.length > TOOL_MODEL_NAME_MAX) {
    throw appError(
      "INVALID_INPUT",
      `A tool's model name must be ${TOOL_MODEL_NAME_MAX} characters or fewer.`,
    );
  }
  if (!TOOL_MODEL_NAME_PATTERN.test(name)) {
    throw appError(
      "INVALID_INPUT",
      "A tool's model name must be lower-case words joined by single underscores, "
      + "starting with a letter — for example read_mailbox.",
    );
  }

  return name;
}

/**
 * Turn free text into something of the right shape.
 *
 * Used where a name has to be produced rather than chosen — a tool discovered
 * from a connected server, whose name was written by somebody else. Never used
 * to paper over a missing name on a tool built here; those are chosen.
 */
export function toToolModelName(raw: string): string {
  const candidate = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, TOOL_MODEL_NAME_MAX)
    .replace(/_+$/g, "");

  return candidate;
}
