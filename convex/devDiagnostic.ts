import { query } from "./_generated/server";
import { v } from "convex/values";

export const countChunks = query({
  args: {},
  handler: async (ctx) => {
    const chunks = await ctx.db.query("knowledgeChunks").collect();
    const docs = await ctx.db.query("knowledgeDocuments").collect();
    return {
      totalChunks: chunks.length,
      totalDocs: docs.length,
      chunksText: chunks.map(c => c.text.substring(0, 50) + "...")
    };
  }
});
