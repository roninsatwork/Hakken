"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";
import {
  buildGradingPrompt,
  combineGradeSamples,
  parseGradeVerdict,
  selectGraderModel,
  type GradeVerdict,
} from "./agentEvalGradingService";
import { calculateModelCostGBP } from "./aiCostService";
import { gradeRehearsalToolPlan } from "./rehearsalEvalService";

/** More than this is a runaway, not a confidence interval. */
const MAX_SAMPLE_COUNT = 5;

/**
 * What a graded check cost, in pounds.
 *
 * The run already recorded tokens and the table already had `costGBP`; nothing joined
 * the two, so an eval's spend read as zero. Reuses the catalogue rates rather than
 * inventing a second cost calculation.
 */
async function calculateGradedRunCostGBP(
  ctx: { runQuery: (ref: typeof internal.aiModels.getModelByIdInternal, args: { modelId: string }) => Promise<{
    standardInputCostBelow200k?: number;
    standardInputCostAbove200k?: number;
    cachedInputCostBelow200k?: number;
    cachedInputCostAbove200k?: number;
    outputResponseCost?: number;
  } | null> },
  args: {
    answerModelId?: string;
    graderModelId?: string;
    answerInputTokens: number;
    answerOutputTokens: number;
    gradingInputTokens: number;
    gradingOutputTokens: number;
  },
) {
  const answerRates = args.answerModelId
    ? await ctx.runQuery(internal.aiModels.getModelByIdInternal, { modelId: args.answerModelId })
    : null;
  const graderRates = args.graderModelId
    ? await ctx.runQuery(internal.aiModels.getModelByIdInternal, { modelId: args.graderModelId })
    : null;

  return calculateModelCostGBP({
    inputTokens: args.answerInputTokens,
    outputTokens: args.answerOutputTokens,
    rates: answerRates,
  }) + calculateModelCostGBP({
    inputTokens: args.gradingInputTokens,
    outputTokens: args.gradingOutputTokens,
    rates: graderRates,
  });
}

function getRequestedModelId(agent: Doc<"agents">) {
  return agent.modelSelectionMode === "inherit" ? undefined : agent.modelId;
}

export const gradeSmokeEvalWithModel = internalAction({
  args: {
    runId: v.id("agentRuns"),
    agentId: v.id("agents"),
    fixtureId: v.id("agentEvalFixtures"),
    companyId: v.optional(v.id("companies")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agentRuns.updateRunStatusInternal, {
      runId: args.runId,
      status: "RUNNING",
    });

    const context = await ctx.runQuery(internal.agentEvalFixtures.getSmokeEvalGradingContextInternal, {
      runId: args.runId,
      agentId: args.agentId,
      fixtureId: args.fixtureId,
    });
    if (!context) {
      throw new Error("Smoke eval grading context not found.");
    }

    let modelId: string | undefined;
    let providerKey: string | undefined;
    let providerModelId: string | undefined;

    try {
      const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
        requestedModelId: getRequestedModelId(context.agent),
        companyId: args.companyId,
        useCase: "agent",
      });
      modelId = modelConfig.modelId;
      providerKey = modelConfig.providerKey;
      providerModelId = modelConfig.providerModelId;

      // Run the objective through the real runtime rather than calling the
      // provider directly. The previous version sent the system prompt and the
      // objective and nothing else — no tools, memories, skills, retrieval,
      // history or budgets — so it graded a model, not the agent that ships. An
      // agent whose whole job is looking things up would be evaluated with its
      // ability to look things up removed.
      //
      // Repeated `sampleCount` times, every sample required to pass. One attempt at a
      // non-deterministic system is weak evidence, and this gates whether the agent
      // goes live. Opt-in, because each sample is a whole agent turn plus a grade.
      const sampleCount = Math.min(
        Math.max(Math.round(context.fixture.sampleCount ?? 1), 1),
        MAX_SAMPLE_COUNT,
      );
      const verdicts: GradeVerdict[] = [];
      let modelOutput = "Agent produced no readable output.";
      let gradingOutput = "";
      let independentGrade = false;
      let graderModelId: string | undefined;
      let answerInputTokens = 0;
      let answerOutputTokens = 0;
      let gradingInputTokens = 0;
      let gradingOutputTokens = 0;

      for (let sample = 0; sample < sampleCount; sample += 1) {
        const evalThreadId = await ctx.runMutation(internal.agentEvalFixtures.createEvalThreadInternal, {
          agentId: args.agentId,
          companyId: args.companyId,
          userId: args.userId,
          fixtureId: args.fixtureId,
        });

        await ctx.runAction(internal.agentRuntime.runAgentObjective, {
          threadId: evalThreadId,
          agentId: args.agentId,
          content: context.fixture.objective,
        });

        const outcome = await ctx.runQuery(internal.agentEvalFixtures.getEvalThreadOutcomeInternal, {
          threadId: evalThreadId,
        });
        modelOutput = outcome.output || "Agent produced no readable output.";
        answerInputTokens += outcome.inputTokens;
        answerOutputTokens += outcome.outputTokens;

        // Grade with a different model from the one under test. The same model
        // marking its own homework favours its own output, and a model that has
        // just confidently asserted something wrong is the least likely thing to
        // notice — so the grade measured self-consistency, not correctness.
        // Text-capable only. Reading every enabled model meant that on a deployment
        // with an enabled embedding model the grader could be `text-embedding-004`,
        // which answers a generate-text call with a provider NOT_FOUND — and
        // `parseGradeVerdict` fails closed, so every model-graded eval failed for a
        // reason that had nothing to do with the agent.
        const enabledModelIds = await ctx.runQuery(internal.aiModels.getEnabledTextModelIdsInternal, {});
        const grader = selectGraderModel({
          targetModelId: modelConfig.modelId,
          enabledModelIds,
        });
        const graderConfig = grader.independent
          ? await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
            requestedModelId: grader.modelId,
            companyId: args.companyId,
            useCase: "agent",
          })
          : modelConfig;
        independentGrade = grader.independent;
        graderModelId = graderConfig.modelId;

        // Through the registry, so a grader on any provider can grade. Grading
        // independently means grading with a *different* model than the one under
        // test, which was impossible to guarantee while every grade had to run on
        // Vertex.
        const gradingResponse = await generateTextWithResolvedModel({
          model: graderConfig,
          contents: [{
            type: "text",
            text: buildGradingPrompt({
              objective: context.fixture.objective,
              expectedFinalOutputRubric: context.fixture.expectedFinalOutputRubric,
              modelOutput,
            }),
          }],
          temperature: 0,
        });
        gradingOutput = gradingResponse.text || "";
        gradingInputTokens += gradingResponse.inputTokens || 0;
        gradingOutputTokens += gradingResponse.outputTokens || 0;

        const sampleVerdict = parseGradeVerdict(gradingOutput);
        verdicts.push(sampleVerdict);
        // Every sample has to pass, so a failure settles it. Continuing would spend a
        // whole further agent turn to confirm a result already decided.
        if (!sampleVerdict.pass) break;
      }

      const grade = combineGradeSamples(verdicts);
      const status = grade.pass ? "SUCCESS" : "FAILED";
      // A deployment with one enabled model cannot grade independently. Say so
      // on the result rather than letting a weaker grade read like a full one.
      const independenceNote = independentGrade
        ? `Graded by ${graderModelId}.`
        : `Graded by the model under test — no other model is enabled, so this grade is not independent.`;
      const sampleNote = sampleCount > 1 ? ` Ran ${verdicts.length} of ${sampleCount} samples.` : "";
      const finalOutput = grade.pass
        ? `Model-graded check passed. ${grade.reason} ${independenceNote}${sampleNote}`
        : `Model-graded check failed. ${grade.reason} ${independenceNote}${sampleNote}`;
      const costGBP = await calculateGradedRunCostGBP(ctx, {
        answerModelId: modelConfig.modelId,
        graderModelId,
        answerInputTokens,
        answerOutputTokens,
        gradingInputTokens,
        gradingOutputTokens,
      });

      await ctx.runMutation(internal.agentEvalFixtures.completeModelGradedSmokeEvalInternal, {
        runId: args.runId,
        agentId: args.agentId,
        companyId: args.companyId,
        userId: args.userId,
        fixtureId: args.fixtureId,
        objective: context.fixture.objective,
        status,
        modelOutput,
        gradingOutput,
        finalOutput,
        ...(status === "FAILED" ? { error: finalOutput } : {}),
        modelId,
        providerKey,
        providerModelId,
        // The agent's own spend is already recorded against its run; this adds
        // what the grading pass cost on top.
        inputTokens: answerInputTokens + gradingInputTokens,
        outputTokens: answerOutputTokens + gradingOutputTokens,
        costGBP,
      });
    } catch (error: unknown) {
      const errorMessage = normalizeAiRuntimeError(error, "Model-graded smoke eval failed.").error;
      await ctx.runMutation(internal.agentEvalFixtures.completeModelGradedSmokeEvalInternal, {
        runId: args.runId,
        agentId: args.agentId,
        companyId: args.companyId,
        userId: args.userId,
        fixtureId: args.fixtureId,
        objective: context.fixture.objective,
        status: "FAILED",
        finalOutput: errorMessage,
        error: errorMessage,
        modelId,
        providerKey,
        providerModelId,
      });
    }
  },
});

/**
 * Execute one fixture as a rehearsal and grade what was recorded.
 *
 * The heavy lifting is elsewhere: `runTriggeredAgentObjective` with
 * `rehearsal: true` runs the genuine loop with writes captured as REHEARSED,
 * and `gradeRehearsalToolPlan` is the pure judgement. This action is the
 * plumbing between them, plus the grading step that makes the verdict part of
 * the run's own durable record — where every other judgement about a run
 * already lives.
 */
export const runRehearsalEvalInternal = internalAction({
  args: {
    fixtureId: v.id("agentEvalFixtures"),
    userId: v.id("users"),
  },
  // Explicit so the fixtures module and this one can reference each other
  // through the generated api without TypeScript giving up on both.
  handler: async (ctx, args): Promise<{ runId: Id<"agentRuns">; status: "PASSED" | "FAILED"; missing: string[] }> => {
    const fixture = await ctx.runQuery(internal.agentEvalFixtures.getFixtureForRehearsalInternal, {
      fixtureId: args.fixtureId,
    });
    if (!fixture || fixture.status !== "ACTIVE") {
      throw new Error("Rehearsal fixture is missing or no longer active.");
    }

    const { runId } = await ctx.runAction(internal.agentRuntime.runTriggeredAgentObjective, {
      agentId: fixture.agentId,
      objective: `Rehearsal eval: ${fixture.objective}`,
      triggerType: "MANUAL",
      companyId: fixture.companyId,
      userId: args.userId,
      rehearsal: true,
    });

    const [runState, toolCalls] = await Promise.all([
      ctx.runQuery(internal.agentRuns.getRunExecutionStateInternal, { runId }),
      ctx.runQuery(internal.agentRuns.getToolCallRecordsForRunInternal, { runId }),
    ]);

    const grade = gradeRehearsalToolPlan({
      expectedToolPlanJson: fixture.expectedToolPlanJson,
      toolCalls,
      runStatus: runState?.status ?? "FAILED",
    });

    const stepIndex = await ctx.runQuery(internal.agentRuns.getLatestStepIndexInternal, { runId });
    await ctx.runMutation(internal.agentRuns.appendStepInternal, {
      runId,
      agentId: fixture.agentId,
      companyId: fixture.companyId,
      stepIndex: stepIndex + 1,
      kind: "FINAL",
      status: grade.status === "PASSED" ? "SUCCESS" : "FAILED",
      input: JSON.stringify({ rehearsalEval: true, fixtureId: args.fixtureId }),
      output: JSON.stringify({
        status: grade.status,
        expected: grade.expected,
        performed: grade.performed,
        missing: grade.missing,
        failures: grade.failures,
      }),
    });

    return { runId, status: grade.status, missing: grade.missing };
  },
});
