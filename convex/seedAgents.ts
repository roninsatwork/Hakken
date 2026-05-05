import { internalMutation, mutation, query } from "./_generated/server";

export const injectDemoAgents = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Delete existing demo agents so we can repeatedly test
    const existingAgents = await ctx.db.query("agents").collect();
    const demoNames = [
        "Market Sourcing Agent", 
        "Internal Platform Architect", 
        "Verification Agent", 
        "Financial Modeler", 
        "Executive Synthesis Agent"
    ];
    for (const agent of existingAgents) {
        if (demoNames.includes(agent.name)) {
            await ctx.db.delete(agent._id);
        }
    }

    const now = Date.now();

    // 2. Inject
    const agentsToCreate = [
      {
        name: "Market Sourcing Agent",
        description: "Extract raw, messy competitor feature and pricing data",
        systemPrompt: "You are the Market Sourcing Agent. You extract messy, raw data from the web regarding competitor feature releases and pricing. Do not format it deeply, just capture maximum volume and facts. If the prompt does not specify which competitors to research, you must deduce them organically from the company context or perform a broad discovery search.",
        isActive: true,
        modelId: "gemini-3.1-flash-lite-preview",
        isGlobal: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Internal Platform Architect",
        description: "Proprietary Sonae platform knowledge extraction",
        systemPrompt: "You are the Internal Platform Architect. You query the secure Sonae database to extract our matching technical capabilities. Always declare exactly what Sonae can do securely without hallucination.",
        isActive: true,
        modelId: "gemini-3.1-pro-preview",
        isGlobal: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Verification Agent",
        description: "Risk mitigation and fact-checking over raw AI data",
        systemPrompt: "You are a pragmatic auditor. You review the output of the Sourcing Agent. If it returns projected or estimated future revenues (like Q3 FY2025) for competitors, DO NOT discard the data. Instead, allow it to pass through and explicitly instruct downstream agents to use the data but add a minor 'projected estimate' footnote. Never strip out comparative numeric data.",
        isActive: true,
        modelId: "gemini-3.1-pro-preview",
        isGlobal: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Financial Modeler",
        description: "ROI calculation and TCO forecasting",
        systemPrompt: "You process raw pricing structures and compute hypothetical 1-year and 3-year Total Cost of Ownership (TCO) comparisons between us and the competitor. Provide exact theoretical numbers.",
        isActive: true,
        modelId: "gemini-3.1-pro-preview",
        isGlobal: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        name: "Executive Synthesis Agent",
        description: "Final polished output generation",
        systemPrompt: "You take the verified facts, internal capabilities, and financial ROI, and fuse them into a devastatingly effective, highly readable Markdown email pitched to a Chief Revenue Officer.",
        isActive: true,
        modelId: "gemini-3.1-pro-preview",
        isGlobal: true,
        thinkingMode: false,
        createdAt: now,
        updatedAt: now,
      }
    ];

    for (const def of agentsToCreate) {
       await ctx.db.insert("agents", def);
    }
    
    return "Successfully injected 5 Demo agents.";
  }
});
