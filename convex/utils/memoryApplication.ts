/**
 * One idea shared by company memory and agent memory: a memory is a note the
 * AI should know, and the only question that changes its behaviour is *when* it
 * reaches the model.
 *
 * Before this, company memory had eight categories and agent memory had four
 * kinds, and neither changed anything at runtime — a memory reached the model
 * only if the visitor's message happened to contain one of its words. That is
 * exactly backwards for the notes that matter most: a tone note saying "be warm
 * and informal" is never going to share a word with a real question, and a
 * boundary saying "never promise delivery dates" only applied when someone
 * said "promise".
 */

export type MemoryApplyMode = "ALWAYS" | "WHEN_RELEVANT";

export const MEMORY_APPLY_MODES: MemoryApplyMode[] = ["ALWAYS", "WHEN_RELEVANT"];

/**
 * How many ALWAYS memories one company or one agent may carry.
 *
 * Every ALWAYS memory is text added to every message, so it costs money on each
 * one, slows the reply and spreads the model's attention thinner — the same
 * argument as the skill cap in agentSkills.ts. WHEN_RELEVANT is uncapped
 * because it is only paid for when it matches.
 */
export const MAX_ALWAYS_MEMORIES = 5;

/**
 * Legacy company categories that were really "this should always apply".
 * Everything else describes a fact worth looking up.
 */
const ALWAYS_COMPANY_CATEGORIES = new Set(["TONE", "BOUNDARY"]);

/** Legacy agent kinds that were really "this should always apply". */
const ALWAYS_AGENT_KINDS = new Set(["INSTRUCTION", "PREFERENCE"]);

export function companyCategoryToApplyMode(category: string | undefined): MemoryApplyMode {
  return category && ALWAYS_COMPANY_CATEGORIES.has(category) ? "ALWAYS" : "WHEN_RELEVANT";
}

export function agentKindToApplyMode(kind: string | undefined): MemoryApplyMode {
  return kind && ALWAYS_AGENT_KINDS.has(kind) ? "ALWAYS" : "WHEN_RELEVANT";
}

/**
 * Read the mode off a row that may predate the field.
 *
 * A backfill sets applyMode on every existing row, but a deploy is not
 * instantaneous and a row written by an older client can arrive without it.
 * Falling back to the old category rather than to a flat default keeps a
 * boundary written yesterday behaving as a boundary today.
 */
export function resolveCompanyApplyMode(memory: {
  applyMode?: MemoryApplyMode;
  category?: string;
}): MemoryApplyMode {
  return memory.applyMode ?? companyCategoryToApplyMode(memory.category);
}

export function resolveAgentApplyMode(memory: {
  applyMode?: MemoryApplyMode;
  kind?: string;
}): MemoryApplyMode {
  return memory.applyMode ?? agentKindToApplyMode(memory.kind);
}
