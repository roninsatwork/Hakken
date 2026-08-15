import type { Id } from "../_generated/dataModel";

/**
 * The evidence trail written onto assistant messages: which company memories
 * and which knowledge chunks reached the model behind an answer.
 *
 * This is what makes an answer ratable — message feedback moves memory
 * counters through `companyMemoryEvidenceJson`, and the knowledge-evidence
 * sweep reads chunk ids from `companyRuntimeEvidenceJson` (self-improvement
 * plan, Phases 3 and 4). Shared between the assistant path (`ai.ts`) and the
 * agent chat path (`agentRuntime.ts`) so an answer carries the same trail
 * whichever runtime produced it.
 */

export type MessageEvidenceMemory = {
  memoryId: Id<"companyMemories">;
  title: string;
  applyMode: "ALWAYS" | "WHEN_RELEVANT";
  confidence: number;
  score: number;
};

export type MessageEvidence = {
  companyMemoryEvidenceJson?: string;
  companyRuntimeEvidenceJson?: string;
};

// What reached the model besides memory: which company skills were in the system
// instruction, and which knowledge chunks retrieval admitted. Recorded so a check
// can ask "was this answer actually grounded in the handbook?" and get a real
// answer. Before this existed the ids were computed during assembly and discarded,
// so any check requiring a document or a skill could never pass.
export function buildCompanyRuntimeEvidence(args: {
  skillIds: Id<"companySkills">[];
  sourceIds: string[];
  /** Wiki pages read whole for this answer, as "KIND:subjectKey" (stage two
   * of wiki-replaces-knowledge): the pages an answer names as its own. */
  wikiPageKeys?: string[];
}) {
  const wikiPageKeys = args.wikiPageKeys ?? [];
  if (args.skillIds.length === 0 && args.sourceIds.length === 0 && wikiPageKeys.length === 0) {
    return undefined;
  }

  return JSON.stringify({
    version: 1,
    skillIds: args.skillIds,
    sourceIds: args.sourceIds,
    ...(wikiPageKeys.length > 0 ? { wikiPageKeys } : {}),
  });
}

export function buildCompanyMemoryEvidence(memories: MessageEvidenceMemory[]) {
  if (memories.length === 0) return undefined;

  return JSON.stringify({
    version: 1,
    memories: memories.map((memory) => ({
      memoryId: memory.memoryId,
      title: memory.title,
      applyMode: memory.applyMode,
      confidence: memory.confidence,
      score: memory.score,
    })),
  });
}
