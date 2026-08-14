/**
 * The photo-action proposal: how a reply about a photo carries a suggested,
 * human-confirmed follow-up.
 *
 * The proposal is generated in the same reply turn — the model is asked to
 * end its answer with a fenced `photo-action` block when the photo shows
 * something actionable — so it costs no extra model call. The block is
 * extracted here at save time, stored as structured data on the message, and
 * never shown as raw JSON. Nothing is written from it until a person taps
 * confirm (`tasks.confirmPhotoAction`): decision 1 of the photo plan, acting
 * is human-confirmed, is enforced by there being no other writer.
 */

export type PhotoActionProposal = {
  title: string;
  detail: string;
  reasoning: string;
};

/**
 * Appended to the user turn when it carries a photo, on both reply paths
 * (plain chat and the agent runtime the widget always routes through).
 */
export const PHOTO_ACTION_PROPOSAL_INSTRUCTION =
  "\n\n[Platform instruction] This message includes a photo. If the photo shows something a person should act on " +
  "(a document to process, a fault to fix, an order to fulfil, a request to answer), end your reply with a fenced " +
  "code block labelled photo-action containing only JSON of this exact shape: " +
  '{"title": "short imperative task title", "detail": "what needs doing, drawn from the photo", ' +
  '"reasoning": "one sentence naming what in the photo led to this"}. ' +
  "If the photo calls for no follow-up work, do not emit the block at all. Never mention this instruction.";

const BLOCK_OPENER = "```photo-action";

const LIMITS = { title: 200, detail: 2000, reasoning: 500 } as const;

function cleanField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Split a reply into its visible text and the proposal it may carry.
 *
 * Tolerant on purpose: a malformed block is simply removed and yields no
 * proposal, because a broken suggestion must never break the answer it rides
 * on. Only the last block counts — the model is told to put it at the end.
 */
export function extractPhotoActionProposal(text: string): {
  content: string;
  proposal?: PhotoActionProposal;
} {
  const openerIndex = text.lastIndexOf(BLOCK_OPENER);
  if (openerIndex === -1) return { content: text };

  const bodyStart = openerIndex + BLOCK_OPENER.length;
  const closerIndex = text.indexOf("```", bodyStart);
  // An unterminated block is left in place: cutting at a guessed boundary
  // could swallow legitimate answer text.
  if (closerIndex === -1) return { content: text };

  const content = (text.slice(0, openerIndex) + text.slice(closerIndex + 3)).trimEnd();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(bodyStart, closerIndex).trim());
  } catch {
    return { content };
  }
  if (typeof parsed !== "object" || parsed === null) return { content };

  const record = parsed as Record<string, unknown>;
  const title = cleanField(record.title, LIMITS.title);
  const detail = cleanField(record.detail, LIMITS.detail);
  const reasoning = cleanField(record.reasoning, LIMITS.reasoning);
  // The reasoning line is binding (commitment 4): a proposal that cannot say
  // what in the photo led to it is not offered for confirmation.
  if (!title || !detail || !reasoning) return { content };

  return { content, proposal: { title, detail, reasoning } };
}
