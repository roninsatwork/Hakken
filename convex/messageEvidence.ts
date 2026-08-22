import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";

/**
 * Why an answer said what it said.
 *
 * Every reply already records what actually reached the model — which
 * knowledge chunks retrieval admitted, which company memories applied, which
 * skills were in force — written from what was used rather than what was
 * merely available. Nothing has ever shown it.
 *
 * This only reads that record. It never infers, and where a reply carries no
 * evidence it says so, because "nothing was retrieved" is a true and useful
 * answer rather than an empty frame implying the question was not asked.
 */

type RuntimeEvidence = { skillIds?: string[]; sourceIds?: string[]; wikiPageKeys?: string[] };
type MemoryEvidence = {
  memories?: Array<{ memoryId?: string; title?: string; applyMode?: string; score?: number }>;
};

function parseEvidence<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A row written by an older or broken build is treated as no evidence
    // rather than failing the panel that reads it.
    return null;
  }
}

export const getForMessage = tenantQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const { userId, user, companyId } = ctx;

    const message = await ctx.db.get(args.messageId);
    if (!message || message.role !== "assistant") return null;

    const thread = await ctx.db.get(message.threadId);
    if (!thread) return null;
    // You may see the workings of answers you were given. Admins have the
    // observability screens for everybody else's.
    if (thread.userId !== userId && user.role !== "SUPER_ADMIN") return null;

    const runtime = parseEvidence<RuntimeEvidence>(message.companyRuntimeEvidenceJson);
    const memoryEvidence = parseEvidence<MemoryEvidence>(message.companyMemoryEvidenceJson);

    // Chunks resolve to the document they came from; several chunks of one
    // document are one source as far as a reader is concerned.
    const documentTitles = new Map<string, string>();
    for (const chunkId of runtime?.sourceIds ?? []) {
      const chunk = await ctx.db.get(chunkId as Id<"knowledgeChunks">).catch(() => null);
      if (!chunk) continue;
      if (documentTitles.has(chunk.documentId)) continue;
      const document = await ctx.db.get(chunk.documentId);
      // A document deleted since the answer was given is skipped rather than
      // rendered as a blank line.
      if (document) documentTitles.set(chunk.documentId, document.title);
    }

    const skills: Array<{ id: string; name: string }> = [];
    for (const skillId of runtime?.skillIds ?? []) {
      const skill = await ctx.db.get(skillId as Id<"companySkills">).catch(() => null);
      if (skill && (!companyId || skill.companyId === companyId)) {
        skills.push({ id: skill._id, name: skill.name });
      }
    }

    // The wiki pages the answer stood on (watch-it-think plan, phase 1):
    // recorded on every answer since the loop, shown at last. Company
    // pages resolve behind the thread's own wall; global/-prefixed keys
    // are the platform shelf's and say so. A page gone since the answer
    // is skipped, as documents already are.
    const wikiPages: Array<{ title: string; isPlatform: boolean }> = [];
    for (const rawKey of runtime?.wikiPageKeys ?? []) {
      const isPlatform = rawKey.startsWith("global/");
      const key = isPlatform ? rawKey.slice("global/".length) : rawKey;
      const separator = key.indexOf(":");
      if (separator <= 0) continue;
      const kind = key.slice(0, separator);
      if (!["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "SOURCE", "GOAL"].includes(kind)) continue;
      const page = await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) =>
          q
            .eq("companyId", isPlatform ? undefined : thread.companyId)
            .eq("kind", kind as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE" | "GOAL")
            .eq("subjectKey", key.slice(separator + 1))
        )
        .unique()
        .catch(() => null);
      if (page) wikiPages.push({ title: page.title, isPlatform });
    }

    const memories = (memoryEvidence?.memories ?? [])
      .filter((memory) => Boolean(memory.title))
      .map((memory) => ({
        id: memory.memoryId ?? "",
        title: memory.title as string,
        alwaysOn: memory.applyMode === "ALWAYS",
      }));

    const documents = Array.from(documentTitles.entries()).map(([id, title]) => ({ id, title }));

    return {
      documents,
      memories,
      skills,
      wikiPages,
      // The panel needs to distinguish "used nothing" from "we did not
      // record it", and only the first is worth stating plainly.
      hasAny:
        documents.length > 0 ||
        memories.length > 0 ||
        skills.length > 0 ||
        wikiPages.length > 0,
    };
  },
});
