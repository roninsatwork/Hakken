"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { embedRetrievalQuery, searchKnowledgeScope } from "./knowledgeRetrieval";
import {
  buildReportQueryText,
  buildSalesReportGroundingContext,
  REPORT_KNOWLEDGE_MAX_CHARS,
} from "./salesReportContextService";
import { getErrorMessage } from "./utils/lang";
import { appError } from "./utils/appError";


export const generateReport = internalAction({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
    // Something to pay particular attention to this run — a deal, a rep, a
    // question from the board. Set by whoever triggers the run; usually the
    // agent, relaying its objective.
    focus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch the Agent to get System Prompt and Document IDs
    const agent = await ctx.runQuery(internal.salesReports.getAgentQuery, { agentId: args.agentId });
    if (!agent) throw appError("NOT_FOUND", "Agent not found");

    const systemPrompt = agent.systemPrompt || "You are a Sales Data Analyst.";
    
    // 2. Fetch Knowledge Documents for this Agent
    const docs = await ctx.runQuery(internal.salesReports.getAgentKnowledgeDocumentsQuery, { agentId: args.agentId });
    
    if (docs.length === 0) {
      console.log("No documents uploaded for this agent yet. Skipping run.");
      return null;
    }

    let rawCsvContext = "";
    
    // 3. Extract text from the latest document
    const latestDoc = docs[0];
    if (latestDoc.textContent) {
        rawCsvContext = latestDoc.textContent;
    } else if (latestDoc.fileId) {
        const fileUrl = await ctx.storage.getUrl(latestDoc.fileId);
        if (fileUrl) {
           const response = await fetch(fileUrl);
           const buffer = await response.arrayBuffer();
           rawCsvContext = Buffer.from(buffer).toString('utf8');
        }
    }

    if (!rawCsvContext || rawCsvContext.trim() === "") {
        throw appError("INVALID_INPUT", "Could not extract any CSV data from the knowledge base.");
    }

    const modelConfig = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
      requestedModelId: agent.modelSelectionMode === "inherit" ? undefined : agent.modelId,
      companyId: args.companyId,
      useCase: "report",
    });

    // 4. Grounding — the same sources the interactive runtime injects: the
    // agent's memories, the company's memories, and the knowledge base via
    // vector search. The pipeline document is already in the prompt in full,
    // so its own chunks are skipped. Failures here degrade to an ungrounded
    // report rather than no report at all.
    const queryText = buildReportQueryText(args.focus);
    let groundingContext = "";
    try {
        const [memoryMatches, companyMemories, goalPages] = await Promise.all([
            ctx.runQuery(internal.agentMemories.searchMemoryInternal, {
                agentId: args.agentId,
                companyId: args.companyId,
                queryText,
                limit: 5,
            }),
            args.companyId
                ? ctx.runQuery(internal.companyMemories.getRuntimeMemoriesInternal, {
                    companyId: args.companyId,
                    queryText,
                    limit: 5,
                })
                : Promise.resolve({ relevant: [] as { title: string; content: string }[] }),
            // The workspace's stated aims, so the report can measure
            // against what the company wants — absent companyId means an
            // agent with no workspace, which has no goals to read.
            args.companyId
                ? ctx.runQuery(internal.wikiPages.getGoalPagesInternal, { companyId: args.companyId })
                : Promise.resolve([] as { title: string; content: string }[]),
        ]);

        const knowledgeChunks: string[] = [];
        try {
            const queryVector = await embedRetrievalQuery(ctx, {
                query: queryText,
                companyId: args.companyId,
                operation: "salesReportRagEmbedding",
            });

            if (queryVector) {
                // Hybrid (vector + keyword) search of the agent's knowledge.
                const vectorMatches = await searchKnowledgeScope(ctx, {
                    queryVector,
                    queryText,
                    scope: { kind: "agent", agentId: args.agentId },
                    limit: 50,
                });

                let chunkTextLength = 0;
                for (const match of vectorMatches) {
                    if (chunkTextLength >= REPORT_KNOWLEDGE_MAX_CHARS) break;
                    const chunk = await ctx.runQuery(internal.knowledge.getChunkInternal, { id: match._id });
                    // The pipeline document itself is already included in full.
                    if (!chunk || chunk.documentId === latestDoc._id) continue;
                    if (chunkTextLength + chunk.text.length > REPORT_KNOWLEDGE_MAX_CHARS) break;
                    knowledgeChunks.push(chunk.text);
                    chunkTextLength += chunk.text.length;
                }
            }
        } catch (error) {
            console.error("Sales report RAG pipeline failed to execute", getErrorMessage(error, "Unknown error during AI Generation"));
        }

        groundingContext = buildSalesReportGroundingContext({
            agentMemories: memoryMatches.map((memory) => memory.content),
            companyMemories: companyMemories.relevant,
            knowledgeChunks,
            goalPages,
        });
    } catch (error) {
        console.error("Sales report grounding failed to assemble", getErrorMessage(error, "Unknown error during AI Generation"));
    }

    // 5. Define the Response Schema mapped exactly to our salesReports Convex Schema
    // Plain JSON Schema rather than Vertex's `Schema` type: identical shape and
    // identical field descriptions, in the vocabulary every provider accepts.
    // This schema was the only reason report generation could not leave Vertex.
    const responseSchema = {
      type: "object",
      properties: {
        headline: { type: "string", description: "A punchy bold headline of the biggest news" },
        executiveSummary: { type: "string", description: "Executive summary paragraph" },
        kpis: {
          type: "object",
          properties: {
            totalPipeline: { type: "number" },
            totalPipelineChange: { type: "string", description: "String indicating delta or change e.g. '+£340k'" },
            weightedPipeline: { type: "number" },
            weightedPipelineChange: { type: "string", description: "String indicating delta or change" },
            openDeals: { type: "number" },
            openDealsChange: { type: "string", description: "String indicating delta or change e.g. '+3'" },
            winRatePct: { type: "number", description: "Win rate from 0-100" },
            winRatePctChange: { type: "string", description: "String indicating delta e.g. '▲ from 24%'" },
            avgDealSize: { type: "number" },
            avgDealSizeChange: { type: "string", description: "String indicating delta" },
            avgSalesCycleDays: { type: "number" },
            avgSalesCycleDaysChange: { type: "string", description: "String indicating delta e.g. '▼ from 71'" }
          },
          required: ["totalPipeline", "weightedPipeline", "openDeals", "winRatePct", "avgDealSize", "avgSalesCycleDays"]
        },
        closingWindows: {
            type: "array",
            items: { type: "object", properties: { window: { type: "string" }, deals: { type: "number" }, totalValue: { type: "number" }, weightedValue: { type: "number" } }, required: ["window", "deals", "totalValue", "weightedValue"] }
        },
        topDeals: {
            type: "array",
            items: { type: "object", properties: { dealName: { type: "string" }, rep: { type: "string" }, value: { type: "number" }, probability: { type: "number" }, status: { type: "string" } }, required: ["dealName", "rep", "value", "probability", "status"] }
        },
        chartData: {
          type: "object",
          properties: {
            funnel: { type: "array", items: { type: "object", properties: { stage: { type: "string" }, value: { type: "number" }, count: { type: "number" } }, required: ["stage", "value", "count"] } },
            timeline: { type: "array", items: { type: "object", properties: { month: { type: "string" }, expectedValue: { type: "number" } }, required: ["month", "expectedValue"] } },
            sources: { type: "array", items: { type: "object", properties: { source: { type: "string" }, winRate: { type: "number" }, count: { type: "number" } }, required: ["source", "winRate", "count"] } }
          },
          required: ["funnel", "timeline", "sources"]
        },
        pipelineHealth: {
          type: "object",
          properties: {
            byStage: { type: "array", items: { type: "object", properties: { stage: { type: "string" }, value: { type: "number" }, valueFormatted: { type: "string", description: "e.g. '£780k (12 deals)'" }, barChart: { type: "string", description: "Text-based bar chart like ████░░░░░░░░░░░░░░░░" }, observation: { type: "string" } }, required: ["stage", "value", "barChart", "observation"] } },
            byRep: { type: "array", items: { type: "object", properties: { rep: { type: "string" }, valPct: { type: "number" }, valueFormatted: { type: "string", description: "e.g. '£420k (32%)'" }, barChart: { type: "string", description: "Text-based bar chart like ████░░░░░░░░░░░░░░░░" }, observation: { type: "string" } }, required: ["rep", "valPct", "barChart", "observation"] } }
          },
          required: ["byStage", "byRep"]
        },
        riskRadar: {
          type: "object",
          properties: {
            critical: { type: "array", items: { type: "object", properties: { dealName: { type: "string" }, rep: { type: "string" }, value: { type: "number" }, reason: { type: "string" }, recommendation: { type: "string" } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } },
            atRisk: { type: "array", items: { type: "object", properties: { dealName: { type: "string" }, rep: { type: "string" }, value: { type: "number" }, reason: { type: "string" }, recommendation: { type: "string" } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } },
            quiet: { type: "array", items: { type: "object", properties: { dealName: { type: "string" }, rep: { type: "string" }, value: { type: "number" }, reason: { type: "string" }, recommendation: { type: "string" } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } }
          },
          required: ["critical", "atRisk", "quiet"]
        },
        teamSpotlight: {
            type: "object",
            properties: {
               momentum: { type: "array", items: { type: "object", properties: { rep: { type: "string" }, summary: { type: "string" } }, required: ["rep", "summary"] }, description: "Array of reps demonstrating positive momentum" },
               supportNeeded: { type: "array", items: { type: "object", properties: { rep: { type: "string" }, summary: { type: "string" } }, required: ["rep", "summary"] }, description: "Array of reps needing coaching or support" }
            },
            required: ["momentum", "supportNeeded"]
        },
        patterns: {
            type: "array",
            items: { type: "object", properties: { pattern: { type: "string" }, observation: { type: "string" } }, required: ["pattern", "observation"] }
        },
        priorities: {
            type: "array",
            items: { type: "string" }
        }
      },
      required: ["headline", "executiveSummary", "kpis", "closingWindows", "topDeals", "chartData", "pipelineHealth", "riskRadar", "teamSpotlight", "patterns", "priorities"]
    };

    // Fetch structured AI Rules attached to this tier
    const activeRules = await ctx.runQuery(internal.aiRules.getActiveRulesInternal, {
        companyId: args.companyId,
        agentId: args.agentId
    });

    let rulesContext = "";
    if (activeRules && activeRules.length > 0) {
        rulesContext = `\nSTRICT OPERATING RULES:\n`;
        activeRules.forEach((r, idx) => {
            rulesContext += `${idx + 1}. [PRIORITY: ${r.priority}] IF User intent or scenario contains (${r.trigger}) THEN you MUST ${r.instruction}\n`;
        });
    }

    // 6. Generate the Structured Final Report
    const briefSpec = `
# Sales Pipeline Report — Specification for AI Agents
This document defines what a world-class weekly pipeline report looks like when generated by the platform's AI. The goal is to make the reader feel that they've just had a 10-minute briefing from their sharpest analyst, compressed into 90 seconds.

## 1. The report's job
Make the reader immediately smarter about their pipeline than they were 60 seconds ago. Focus on:
1. Imminent closures
2. Deals at risk needing action
3. Reps needing support
4. Emerging patterns
5. Priority decisions

## 2. Report structure (MANDATORY)
Produce exactly this structure.
Section 1 — Executive Headline (max 3 sentences)
Section 2 — Pipeline at a Glance (dashboard of headline numbers in table)
Section 3 — Closing Windows (Table of deals by window, plus top 3 to watch)
Section 4 — Pipeline Health Check (Use text-based horizontal bar charts like so: ████░░░)
Section 5 — Risk Radar (Divided into 🔴 Critical, 🟡 At risk, 🟢 Quiet)
Section 6 — Team Spotlight (Momentum vs Support needed)
Section 7 — Patterns & Signals (2-4 non-obvious observations)
Section 8 — This Week's Priorities (Clean 1-5 list of actions)

## 3. Visual style & Tone rules
- YOU MUST use Markdown tables for structure (e.g. | Column | Column |). Do not use tabs or spaces.
- Use █ and ░ for text-based bar charts.
- Emoji only for status: 🔴 🟡 🟢 ▲ ▼.
- No corporate filler, no caveats. Punchy, direct language. Name deals and reps.

Total length: 600-900 words. Never pad.
`;

    const prompt = `
    SYSTEM INSTRUCTIONS:
    ${systemPrompt}
    ${rulesContext}
    
    ----------------------
    PIPELINE INTELLIGENCE BRIEF:
    ${briefSpec}

    ----------------------
    RAW CSV PIPELINE DATA:
    ${rawCsvContext}
    ${groundingContext}
    ${args.focus?.trim() ? `\n    THIS RUN'S FOCUS: ${args.focus.trim()}\n` : ""}
    Task: Read the raw CSV data above and act according to the system instructions and the PIPELINE INTELLIGENCE BRIEF.
    Calculate all values precisely. Output the exact JSON structure defined via the schema.
    Where the reference material above — the agent's memories and the company's knowledge — is relevant, use it to sharpen observations and recommendations. Every number must still come from the CSV.
    
    CRITICAL INSTRUCTION:
    Your output must EXACTLY map to the 8 sections of the Intelligence Brief via the highly structured JSON object.
    You are no longer outputting a single Markdown string. Every table, bar chart, deal risk, and pattern must be broken out into arrays and objects for the platform's native dashboard.
    For the text-based bar charts in pipelineHealth, use full block characters (e.g. ██████░░░░).
    - For pipelineHealth.byStage, YOU MUST EXTRACT AND INCLUDE ALL STAGES from the CSV. Do NOT truncate or limit to 2 items.
    - For pipelineHealth.byRep, YOU MUST EXTRACT AND INCLUDE ALL REPS from the CSV. Do NOT truncate or limit to 2 items.
    - For teamSpotlight.momentum and supportNeeded, you must extract arrays containing between 2 to 4 distinct sales reps per category. Include data-backed summaries for each. DO NOT output a monolithic text block.`;

    // Log the initiation of the generation pipeline
    await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
        agentId: args.agentId,
        interactionType: "BATCH_GENERATION_START",
        promptContent: prompt,
        responseContent: "Initiating remote generation...",
        companyId: args.companyId,
        // A start marker. The outcome is recorded by the success or error entry
        // that follows it, so claiming one here would be a guess.
        outcome: "UNKNOWN"
    });

    try {
        const modelResponse = await generateTextWithResolvedModel({
            model: modelConfig,
            contents: [{ type: "text", text: prompt }],
            temperature: 0.2, // Low temp for analytical accuracy
            jsonSchema: responseSchema,
        });

        const jsonText = modelResponse.text;
        if (!jsonText) throw appError("UPSTREAM_FAILURE", "Model returned empty response");

        // Log the successful completion
        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
            agentId: args.agentId,
            interactionType: "BATCH_GENERATION_SUCCESS",
            promptContent: "N/A [Execution Completion]",
            responseContent: jsonText,
            companyId: args.companyId,
            outcome: "SUCCESS"
        });

        const reportData = JSON.parse(jsonText);

        // Record Telemetry and Cost Analytics
        const inTokens = modelResponse.inputTokens || 0;
        const outTokens = modelResponse.outputTokens || 0;
        
        const config = await ctx.runQuery(internal.aiModels.getModelByIdInternal, {
          modelId: modelConfig.modelId,
        });
        
        const inRate = config ? (inTokens > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
        const outRate = config ? (config.outputResponseCost || 0) : 0;
        const calculatedCost = (inTokens / 1000000) * inRate + (outTokens / 1000000) * outRate;

        await ctx.runMutation(internal.agentTransactions.insertTransactionInternal, {
            agentId: args.agentId,
            companyId: args.companyId,
            actionContext: "Sales Pipeline Intelligence Engine",
            modelUsed: modelConfig.modelId,
            providerKey: modelConfig.providerKey,
            providerModelId: modelConfig.providerModelId,
            inputTokens: inTokens,
            outputTokens: outTokens,
            costGBP: calculatedCost,
            status: "SUCCESS"
        });

        // 7. Save to Convex
        await ctx.runMutation(internal.salesReports.saveGeneratedReport, {
           agentId: args.agentId,
           companyId: args.companyId,
           headline: reportData.headline,
           executiveSummary: reportData.executiveSummary,
           kpis: reportData.kpis,
           closingWindows: reportData.closingWindows,
           topDeals: reportData.topDeals,
           chartData: reportData.chartData,
           pipelineHealth: reportData.pipelineHealth,
           riskRadar: reportData.riskRadar,
           teamSpotlight: reportData.teamSpotlight,
           patterns: reportData.patterns,
           priorities: reportData.priorities,
        });

        // The caller — usually the agent's tool handler — gets enough to
        // report the outcome without re-reading the saved document.
        return {
            saved: true as const,
            headline: typeof reportData.headline === "string" ? reportData.headline : "",
        };
    } catch (error) {
        // Log the exact error
        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
            agentId: args.agentId,
            interactionType: "ERROR",
            promptContent: "N/A [Execution Failure]",
            responseContent: getErrorMessage(error, "Unknown error during AI Generation"),
            companyId: args.companyId,
            outcome: "FAILED"
        });
        throw error;
    }
  }
});
