"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { WIKI_EXAM_QUESTIONS } from "./wikiExamService";

/**
 * The gate between stage two and stage three (wiki-replaces-knowledge
 * plan): both answering paths sit the same twenty questions, graded by a
 * judge against the behaviour each question demands. The wiki must match or
 * beat the old path's score before any door switches over — this action IS
 * that measurement, and its result is written to the audit trail so the
 * decision is a record, not a memory.
 */

type QuestionResult = {
  key: string;
  prompt: string;
  severity: "BLOCKER" | "WARNING";
  chunks: { pass: boolean; reason: string };
  wiki: { pass: boolean; reason: string };
};

export const runWikiExam = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (
    ctx,
    args
  ): Promise<{
    chunksScore: number;
    wikiScore: number;
    total: number;
    wikiPasses: boolean;
    results: QuestionResult[];
  }> => {
    const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      useCase: "fast-chat",
    });

    const answerWith = async (mode: "chunks" | "wiki", prompt: string): Promise<string> => {
      const knowledge: { context: string } = await ctx.runAction(
        internal.ai.searchKnowledgeForVoiceInternal,
        { query: prompt, fallbackCompanyId: args.companyId, forceKnowledgeMode: mode }
      );
      const answerPrompt = `Company knowledge:\n${knowledge.context || "(none found)"}\n\nCustomer question: ${prompt}`;
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          "You are this company's assistant answering a prospective customer. Use ONLY the company knowledge provided. " +
          "Never invent facts, figures, prices, dates or services. If the knowledge does not settle the question, say a colleague will follow up with the specifics. Plain text, a short paragraph.",
        contents: [{ type: "text", text: answerPrompt }],
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
        systemKey: "WIKI_EXAMINER",
        companyId: args.companyId,
        actionContext: `Wiki Exam: answering as the assistant (${mode})`,
        modelId: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        promptContent: answerPrompt,
        responseContent: response.text ?? "",
      });
      return response.text?.trim() ?? "";
    };

    const judge = async (
      prompt: string,
      expectedBehavior: string,
      forbiddenClaims: string[],
      answer: string
    ): Promise<{ pass: boolean; reason: string }> => {
      const judgePrompt =
        `Question: ${prompt}\n\nRequired behaviour to pass:\n${expectedBehavior}\n\n` +
        (forbiddenClaims.length
          ? `The answer FAILS if it contains any of these:\n${forbiddenClaims.map((claim) => `- ${claim}`).join("\n")}\n\n`
          : "") +
        `The answer to grade:\n${answer || "(no answer was produced)"}`;
      const response = await generateTextWithResolvedModel({
        model,
        systemInstruction:
          'You grade one customer-service answer against a required behaviour. Reply with strict JSON, nothing else: {"pass": boolean, "reason": string} — reason is one sentence.',
        contents: [{ type: "text", text: judgePrompt }],
      });
      await ctx.runMutation(internal.wikiStaff.recordStaffModelCallInternal, {
        systemKey: "WIKI_EXAMINER",
        companyId: args.companyId,
        actionContext: "Wiki Exam: grading an answer",
        modelId: model.modelId,
        providerKey: model.providerKey,
        providerModelId: model.providerModelId,
        inputTokens: response.inputTokens ?? 0,
        outputTokens: response.outputTokens ?? 0,
        promptContent: judgePrompt,
        responseContent: response.text ?? "",
      });
      const raw = response.text ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { pass: false, reason: "The judge produced no verdict." };
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { pass?: unknown; reason?: unknown };
        return {
          pass: parsed.pass === true,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
        };
      } catch {
        return { pass: false, reason: "The judge produced no verdict." };
      }
    };

    const results: QuestionResult[] = [];
    for (const question of WIKI_EXAM_QUESTIONS) {
      const [chunksAnswer, wikiAnswer] = await Promise.all([
        answerWith("chunks", question.prompt),
        answerWith("wiki", question.prompt),
      ]);
      const [chunksVerdict, wikiVerdict] = await Promise.all([
        judge(question.prompt, question.expectedBehavior, question.forbiddenClaims, chunksAnswer),
        judge(question.prompt, question.expectedBehavior, question.forbiddenClaims, wikiAnswer),
      ]);
      results.push({
        key: question.key,
        prompt: question.prompt,
        severity: question.severity,
        chunks: chunksVerdict,
        wiki: wikiVerdict,
      });
    }

    const chunksScore = results.filter((result) => result.chunks.pass).length;
    const wikiScore = results.filter((result) => result.wiki.pass).length;
    // The bar: match or beat overall, and no BLOCKER may pass on the old
    // path yet fail on the wiki — discipline must not regress anywhere.
    const blockerRegression = results.some(
      (result) => result.severity === "BLOCKER" && result.chunks.pass && !result.wiki.pass
    );
    const wikiPasses = wikiScore >= chunksScore && !blockerRegression;

    await ctx.runMutation(internal.wikiExam.recordExamRunInternal, {
      companyId: args.companyId,
      chunksScore,
      wikiScore,
      total: results.length,
      wikiPasses,
      detailJson: JSON.stringify(
        results.map((result) => ({
          key: result.key,
          severity: result.severity,
          chunks: result.chunks.pass,
          wiki: result.wiki.pass,
        }))
      ),
    });

    return { chunksScore, wikiScore, total: results.length, wikiPasses, results };
  },
});
