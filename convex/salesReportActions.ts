"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Doc } from "./_generated/dataModel";

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Unknown error during AI Generation";

export const generateReport = internalAction({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    // 1. Fetch the Agent to get System Prompt and Document IDs
    const agent = await ctx.runQuery(internal.salesReports.getAgentQuery, { agentId: args.agentId });
    if (!agent) throw new Error("Agent not found");

    const systemPrompt = agent.systemPrompt || "You are a Sales Data Analyst.";
    
    // 2. Fetch Knowledge Documents for this Agent
    const docs = await ctx.runQuery(internal.salesReports.getAgentKnowledgeDocumentsQuery, { agentId: args.agentId });
    
    if (docs.length === 0) {
      console.log("No documents uploaded for this agent yet. Skipping run.");
      return;
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
        throw new Error("Could not extract any CSV data from the knowledge base.");
    }

    // 4. Initialize Gemini (vertexai) identical to knowledgeActions.ts
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "sonae-dev-491717";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
      
    const ai = new GoogleGenAI({ 
        project: projectId, 
        location: location,
        vertexai: true,
        googleAuthOptions: {
          credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }
        }
    });

    // 5. Define the Response Schema mapped exactly to our salesReports Convex Schema
    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING, description: "A punchy bold headline of the biggest news" },
        executiveSummary: { type: Type.STRING, description: "Executive summary paragraph" },
        kpis: {
          type: Type.OBJECT,
          properties: {
            totalPipeline: { type: Type.NUMBER },
            totalPipelineChange: { type: Type.STRING, description: "String indicating delta or change e.g. '+£340k'" },
            weightedPipeline: { type: Type.NUMBER },
            weightedPipelineChange: { type: Type.STRING, description: "String indicating delta or change" },
            openDeals: { type: Type.NUMBER },
            openDealsChange: { type: Type.STRING, description: "String indicating delta or change e.g. '+3'" },
            winRatePct: { type: Type.NUMBER, description: "Win rate from 0-100" },
            winRatePctChange: { type: Type.STRING, description: "String indicating delta e.g. '▲ from 24%'" },
            avgDealSize: { type: Type.NUMBER },
            avgDealSizeChange: { type: Type.STRING, description: "String indicating delta" },
            avgSalesCycleDays: { type: Type.NUMBER },
            avgSalesCycleDaysChange: { type: Type.STRING, description: "String indicating delta e.g. '▼ from 71'" }
          },
          required: ["totalPipeline", "weightedPipeline", "openDeals", "winRatePct", "avgDealSize", "avgSalesCycleDays"]
        },
        closingWindows: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { window: { type: Type.STRING }, deals: { type: Type.NUMBER }, totalValue: { type: Type.NUMBER }, weightedValue: { type: Type.NUMBER } }, required: ["window", "deals", "totalValue", "weightedValue"] }
        },
        topDeals: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { dealName: { type: Type.STRING }, rep: { type: Type.STRING }, value: { type: Type.NUMBER }, probability: { type: Type.NUMBER }, status: { type: Type.STRING } }, required: ["dealName", "rep", "value", "probability", "status"] }
        },
        chartData: {
          type: Type.OBJECT,
          properties: {
            funnel: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { stage: { type: Type.STRING }, value: { type: Type.NUMBER }, count: { type: Type.NUMBER } }, required: ["stage", "value", "count"] } },
            timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { month: { type: Type.STRING }, expectedValue: { type: Type.NUMBER } }, required: ["month", "expectedValue"] } },
            sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { source: { type: Type.STRING }, winRate: { type: Type.NUMBER }, count: { type: Type.NUMBER } }, required: ["source", "winRate", "count"] } }
          },
          required: ["funnel", "timeline", "sources"]
        },
        pipelineHealth: {
          type: Type.OBJECT,
          properties: {
            byStage: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { stage: { type: Type.STRING }, value: { type: Type.NUMBER }, valueFormatted: { type: Type.STRING, description: "e.g. '£780k (12 deals)'" }, barChart: { type: Type.STRING, description: "Text-based bar chart like ████░░░░░░░░░░░░░░░░" }, observation: { type: Type.STRING } }, required: ["stage", "value", "barChart", "observation"] } },
            byRep: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { rep: { type: Type.STRING }, valPct: { type: Type.NUMBER }, valueFormatted: { type: Type.STRING, description: "e.g. '£420k (32%)'" }, barChart: { type: Type.STRING, description: "Text-based bar chart like ████░░░░░░░░░░░░░░░░" }, observation: { type: Type.STRING } }, required: ["rep", "valPct", "barChart", "observation"] } }
          },
          required: ["byStage", "byRep"]
        },
        riskRadar: {
          type: Type.OBJECT,
          properties: {
            critical: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { dealName: { type: Type.STRING }, rep: { type: Type.STRING }, value: { type: Type.NUMBER }, reason: { type: Type.STRING }, recommendation: { type: Type.STRING } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } },
            atRisk: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { dealName: { type: Type.STRING }, rep: { type: Type.STRING }, value: { type: Type.NUMBER }, reason: { type: Type.STRING }, recommendation: { type: Type.STRING } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } },
            quiet: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { dealName: { type: Type.STRING }, rep: { type: Type.STRING }, value: { type: Type.NUMBER }, reason: { type: Type.STRING }, recommendation: { type: Type.STRING } }, required: ["dealName", "rep", "value", "reason", "recommendation"] } }
          },
          required: ["critical", "atRisk", "quiet"]
        },
        teamSpotlight: {
            type: Type.OBJECT,
            properties: { 
               momentum: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { rep: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["rep", "summary"] }, description: "Array of reps demonstrating positive momentum" }, 
               supportNeeded: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { rep: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["rep", "summary"] }, description: "Array of reps needing coaching or support" } 
            },
            required: ["momentum", "supportNeeded"]
        },
        patterns: {
            type: Type.ARRAY,
            items: { type: Type.OBJECT, properties: { pattern: { type: Type.STRING }, observation: { type: Type.STRING } }, required: ["pattern", "observation"] }
        },
        priorities: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
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
This document defines what a world-class weekly pipeline report looks like when generated by Sonae. The goal is to make the reader feel that they've just had a 10-minute briefing from their sharpest analyst, compressed into 90 seconds.

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
    SONAE PIPELINE INTELLIGENCE BRIEF:
    ${briefSpec}

    ----------------------
    RAW CSV PIPELINE DATA:
    ${rawCsvContext}
    
    Task: Read the raw CSV data above and act according to the system instructions and the SONAE PIPELINE INTELLIGENCE BRIEF. 
    Calculate all values precisely. Output the exact JSON structure defined via the schema.
    
    CRITICAL INSTRUCTION:
    Your output must EXACTLY map to the 8 sections of the Intelligence Brief via the highly structured JSON object.
    You are no longer outputting a single Markdown string. Every table, bar chart, deal risk, and pattern must be broken out into arrays and objects for the Sonae Native Dashboard.
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
        companyId: args.companyId
    });

    try {
        const modelResponse = await ai.models.generateContent({
            model: agent.modelId,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.2 // Low temp for analytical accuracy
            }
        });

        const jsonText = modelResponse.text;
        if (!jsonText) throw new Error("Model returned empty response");

        // Log the successful completion
        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
            agentId: args.agentId,
            interactionType: "BATCH_GENERATION_SUCCESS",
            promptContent: "N/A [Execution Completion]",
            responseContent: jsonText,
            companyId: args.companyId
        });

        const reportData = JSON.parse(jsonText);

        // Record Telemetry and Cost Analytics
        const inTokens = modelResponse.usageMetadata?.promptTokenCount || 0;
        const outTokens = modelResponse.usageMetadata?.candidatesTokenCount || 0;
        
        const allModelsRaw = await ctx.runQuery(internal.aiModels.getAllModelsInternal, {}) as Doc<"aiModels">[];
        const modelMap = new Map(allModelsRaw.map((model) => [model.modelId, model]));
        const config = modelMap.get(agent.modelId);
        
        const inRate = config ? (inTokens > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
        const outRate = config ? (config.outputResponseCost || 0) : 0;
        const calculatedCost = (inTokens / 1000000) * inRate + (outTokens / 1000000) * outRate;

        await ctx.runMutation(internal.agentTransactions.insertTransactionInternal, {
            agentId: args.agentId,
            companyId: args.companyId,
            actionContext: "Sales Pipeline Intelligence Engine",
            modelUsed: agent.modelId,
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
    } catch (error) {
        // Log the exact error
        await ctx.runMutation(internal.agentLogs.insertAgentLogInternal, {
            agentId: args.agentId,
            interactionType: "ERROR",
            promptContent: "N/A [Execution Failure]",
            responseContent: getErrorMessage(error),
            companyId: args.companyId
        });
        throw error;
    }
  }
});
