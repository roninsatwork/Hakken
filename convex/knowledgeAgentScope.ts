import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { fuseRetrievalRankings } from "./knowledgeRetrievalService";

/**
 * A shared agent reads its platform knowledge and the asking company's, never another company's (Sonae `20f34fa6`;
 * wiki-sonae-catch-up-plan-2026-11-21.md, 0.2). A shared agent's knowledge is filed by agent and by company, and
 * Convex's vector index can't ask for "this agent and this company" at once, so the vector half is checked here after
 * the search, and the keyword half asks for each allowed company in turn.
 */

/** The candidates from a vector search an agent may read: its own, and of those only the platform's and this company's. */
export const filterAgentChunkIdsInternal = internalQuery({
  args: { chunkIds: v.array(v.id("knowledgeChunks")), agentId: v.id("agents"), companyId: v.optional(v.id("companies")) },
  returns: v.array(v.id("knowledgeChunks")),
  handler: async (ctx, args) => {
    const chunks = await Promise.all(args.chunkIds.map((id) => ctx.db.get(id)));
    return chunks.flatMap((chunk) =>
      chunk && chunk.agentId === args.agentId && (chunk.companyId === undefined || chunk.companyId === args.companyId) ? [chunk._id] : []);
  },
});

/** The keyword half for an agent: the platform's pieces, and this company's when there is one, merged so neither starves. */
export async function searchAgentChunksByText(
  ctx: Pick<QueryCtx, "db">,
  args: { query: string; limit: number; agentId: Id<"agents">; companyId?: Id<"companies"> },
) {
  const companies = args.companyId ? [args.companyId, undefined] : [undefined];
  const ranked = await Promise.all(companies.map((companyId) => ctx.db
    .query("knowledgeChunks")
    .withSearchIndex("search_text", (q) => q.search("text", args.query).eq("agentId", args.agentId).eq("companyId", companyId))
    .take(args.limit)));
  return fuseRetrievalRankings({ vectorRanked: ranked[0], keywordRanked: ranked[1] ?? [] })
    .slice(0, args.limit).map(({ _id }) => ({ _id }));
}
