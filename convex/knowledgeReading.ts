import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type ActionCtx } from "./_generated/server";
import type { PassageJudge } from "./aiPromptAssembly";
import { runDecisions, type RunDecisionsDeps } from "./decisionActions";

/**
 * What the AI reads from a knowledge search, after the search has ranked it
 * (docs/plans/active/knowledge-relevance-cutoff-plan.md): the loader every
 * reading uses, and the relevance cut-off.
 *
 * Choosing within the budget is `selectKnowledgeChunksWithinBudget`
 * (`aiPromptAssembly.ts`); the search itself is `knowledgeRetrieval.ts`.
 */

export const PASSAGE_DECISION_KEY = "knowledge.passage-answers-question";

/**
 * One piece as the reading needs it: its words, whose it is, which model
 * embedded it and its document's name — never its 768-number embedding,
 * which the whole-row loader this replaced sent for every piece read.
 */
export type ChunkForReading = {
  text: string;
  documentId: Id<"knowledgeDocuments">;
  documentTitle: string;
  companyId?: Id<"companies">;
  agentId?: Id<"agents">;
  embeddingModelId?: string;
};

export const getChunkForReadingInternal = internalQuery({
  args: { id: v.id("knowledgeChunks") },
  handler: async (ctx, args): Promise<ChunkForReading | null> => {
    const chunk = await ctx.db.get(args.id);
    if (!chunk) return null;
    const document = await ctx.db.get(chunk.documentId);
    return {
      text: chunk.text,
      documentId: chunk.documentId,
      documentTitle: document?.title ?? "",
      ...(chunk.companyId ? { companyId: chunk.companyId } : {}),
      ...(chunk.agentId ? { agentId: chunk.agentId } : {}),
      ...(chunk.embeddingModelId ? { embeddingModelId: chunk.embeddingModelId } : {}),
    };
  },
});

/** The loader handed to the selection, reading through this action. */
export function readChunk(ctx: ActionCtx): (id: Id<"knowledgeChunks">) => Promise<ChunkForReading | null> {
  return (id) => ctx.runQuery(internal.knowledgeReading.getChunkForReadingInternal, { id });
}

/**
 * The cut-off for one search, or none while the Decision is Off.
 *
 * Off asks nothing and records nothing: forty rows a message saying "off"
 * would bury the Decision's page, so the mode is read first, as the page-type
 * and fan-out judges do. On, every judged passage is its own question in one
 * request, its run row naming that passage; only an answer the Decision may
 * act on (Acts on its own, fairly sure or better — it is low stakes) leaves a
 * passage out. "Ask a person" records every answer and leaves nothing out,
 * which is the trial. A request that fails answers "keep" for every passage,
 * and a mode that cannot be read means no cut-off: never less reading than
 * before it existed.
 */
export async function knowledgeCutOff(
  ctx: ActionCtx,
  args: {
    companyId?: Id<"companies">;
    question: string;
    links?: { agentRunId?: Id<"agentRuns">; threadId?: Id<"threads"> };
  },
  deps?: RunDecisionsDeps,
): Promise<PassageJudge | undefined> {
  let mode: string | undefined;
  try {
    const modes: Record<string, string> = await ctx.runQuery(internal.decisionRuns.resolveModesInternal, {
      decisionKeys: [PASSAGE_DECISION_KEY],
      ...(args.companyId ? { companyId: args.companyId } : {}),
    });
    mode = modes[PASSAGE_DECISION_KEY];
  } catch (error) {
    console.warn("Knowledge cut-off mode could not be read; reading without it.", error);
  }
  if (!mode || mode === "OFF") return undefined;

  return async (passages) => {
    const results = await runDecisions(ctx, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      subject: { kind: "knowledgeChunk", id: passages.map((passage) => passage.id).join("|").slice(0, 300) },
      state: {
        question: args.question.slice(0, 1_000),
        passages: Object.fromEntries(
          passages.map((passage) => [passage.id, { document: passage.document ?? "", text: passage.text }]),
        ),
      },
      requests: passages.map((passage) => ({
        key: PASSAGE_DECISION_KEY,
        id: passage.id,
        subjectId: passage.id,
        fallback: () => ({ kind: "yes-no" as const, yes: true }),
      })),
      ...(args.links ? { links: args.links } : {}),
    }, deps);
    return new Set(
      passages
        .filter((passage) => {
          const result = results[passage.id];
          return result?.verdict === "ACT" && result.answer.kind === "yes-no" && !result.answer.yes;
        })
        .map((passage) => passage.id),
    );
  };
}
