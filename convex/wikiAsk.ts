import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { adminAction } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";

/**
 * The Ask box (watch-it-think plan, phase 3): ask the brain a question
 * from inside the wiki and see the real answer with the pages it stood
 * on. Runs the ACTUAL answering pipeline through an EVAL-purpose thread
 * — the same road the checks use — so what you see is what a customer
 * would get. User-initiated model spend, one press one answer; the ask
 * lands in the loop's bookkeeping like any answer.
 */

export const createAskThreadInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("threads", {
      userId: args.userId,
      companyId: args.companyId,
      title: "Ask the brain",
      purpose: "EVAL",
      createdAt: now,
      updatedAt: now,
    });
  },
});

type AskResult = {
  answer: string;
  pages: Array<{ title: string; pageId: string; isPlatform: boolean }>;
};

// Exported for wikiAsk.test.ts; not a registered Convex function.
export async function askCore(
  // The generated Convex ctx types don't thread through custom wrappers
  // cleanly; the three run* capabilities are all this needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  args: { companyId: Id<"companies"> | undefined; userId: Id<"users">; question: string }
): Promise<AskResult> {
  const threadId = await ctx.runMutation(internal.wikiAsk.createAskThreadInternal, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    userId: args.userId,
  });
  await ctx.runAction(internal.aiChat.generateSonaeResponse, {
    threadId,
    content: args.question.slice(0, 500),
  });
  const outcome = await ctx.runQuery(internal.companyEvals.getEvalThreadOutcomeInternal, {
    threadId,
  });

  let pageKeys: string[] = [];
  try {
    const evidence = outcome.evidenceJson
      ? (JSON.parse(outcome.evidenceJson) as { wikiPageKeys?: string[] })
      : {};
    pageKeys = Array.isArray(evidence.wikiPageKeys) ? evidence.wikiPageKeys : [];
  } catch {
    pageKeys = [];
  }

  const pages: AskResult["pages"] = [];
  for (const rawKey of pageKeys) {
    const isPlatform = rawKey.startsWith("global/");
    const key = isPlatform ? rawKey.slice("global/".length) : rawKey;
    const separator = key.indexOf(":");
    if (separator <= 0) continue;
    const kind = key.slice(0, separator);
    if (!["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "SOURCE"].includes(kind)) continue;
    const page = await ctx.runQuery(internal.wikiPages.getPageOfKindInternal, {
      ...(isPlatform ? {} : args.companyId ? { companyId: args.companyId } : {}),
      kind: kind as "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE",
      subjectKey: key.slice(separator + 1),
    });
    if (page) pages.push({ title: page.title, pageId: page._id.toString(), isPlatform });
  }

  return { answer: outcome.answer, pages };
}

export const askBrainForCompany = adminAction({
  args: { companyId: v.id("companies"), question: v.string() },
  returns: tailShapes.wikiAnswerShape,
  handler: async (ctx, args): Promise<AskResult> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await askCore(ctx, {
      companyId: args.companyId,
      userId: ctx.userId,
      question: args.question,
    });
  },
});

export const askBrainForGlobal = adminAction({
  args: { question: v.string() },
  returns: tailShapes.wikiAnswerShape,
  handler: async (ctx, args): Promise<AskResult> => {
    if (ctx.user.role !== "SUPER_ADMIN") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return await askCore(ctx, { companyId: undefined, userId: ctx.userId, question: args.question });
  },
});
