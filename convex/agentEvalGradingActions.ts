"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { buildAgentSystemInstruction } from "./aiPromptAssembly";
import { getGoogleVertexProviderModelId } from "./aiModelService";
import {
  createVertexGenAIClient,
  generateVertexContentWithRetry,
} from "./vertexProviderService";
import { normalizeAiRuntimeError } from "./aiToolExecutionService";

function buildGradingPrompt(args: {
  objective: string;
  expectedFinalOutputRubric: string;
  modelOutput: string;
}) {
  return [
    "Grade this agent smoke eval using the rubric.",
    "Return strict JSON only with this shape:",
    "{\"pass\": boolean, \"reason\": string, \"confidence\": number}",
    "",
    `Objective: ${args.objective}`,
    `Rubric: ${args.expectedFinalOutputRubric}`,
    `Agent output: ${args.modelOutput}`,
  ].join("\n");
}

function parsePassFromGradingOutput(output: string) {
  const trimmed = output.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { pass: false, reason: "Grading response was not valid JSON." };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { pass: false, reason: "Grading response JSON was not an object." };
    }
    const result = parsed as { pass?: unknown; reason?: unknown };
    return {
      pass: result.pass === true,
      reason: typeof result.reason === "string" ? result.reason : "No grading reason provided.",
    };
  } catch {
    return { pass: false, reason: "Grading response could not be parsed." };
  }
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

      const ai = createVertexGenAIClient();
      const targetModel = getGoogleVertexProviderModelId(modelConfig, "agent smoke eval grading");
      const agentResponse = await generateVertexContentWithRetry(ai, {
        model: targetModel,
        contents: [{
          role: "user",
          parts: [{ text: context.fixture.objective }],
        }],
        config: {
          systemInstruction: buildAgentSystemInstruction(context.agent.systemPrompt),
          temperature: context.agent.temperature !== undefined ? context.agent.temperature : 0.1,
        },
      }, {
        operation: "agentSmokeEvalGenerate",
      });
      const modelOutput = agentResponse.text || "Agent produced no readable output.";

      const gradingResponse = await generateVertexContentWithRetry(ai, {
        model: targetModel,
        contents: [{
          role: "user",
          parts: [{
            text: buildGradingPrompt({
              objective: context.fixture.objective,
              expectedFinalOutputRubric: context.fixture.expectedFinalOutputRubric,
              modelOutput,
            }),
          }],
        }],
        config: {
          temperature: 0,
        },
      }, {
        operation: "agentSmokeEvalGrade",
      });
      const gradingOutput = gradingResponse.text || "";
      const grade = parsePassFromGradingOutput(gradingOutput);
      const status = grade.pass ? "SUCCESS" : "FAILED";
      const finalOutput = grade.pass
        ? `Model-graded smoke eval passed. ${grade.reason}`
        : `Model-graded smoke eval failed. ${grade.reason}`;

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
        inputTokens: (agentResponse.usageMetadata?.promptTokenCount || 0) + (gradingResponse.usageMetadata?.promptTokenCount || 0),
        outputTokens: (agentResponse.usageMetadata?.candidatesTokenCount || 0) + (gradingResponse.usageMetadata?.candidatesTokenCount || 0),
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
