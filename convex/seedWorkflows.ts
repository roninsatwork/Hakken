import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seedAcmeWorkflow = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Find or create the ACME Inc company
    let acme = await ctx.db
      .query("companies")
      .withIndex("by_name", (q) => q.eq("name", "ACME Inc"))
      .first();

    if (!acme) {
      const id = await ctx.db.insert("companies", {
        name: "ACME Inc",
        description: "A leading industrial solutions provider.",
        createdAt: now,
      });
      acme = (await ctx.db.get(id))!;
    }

    const companyId = acme._id;

    // 2. Create the Workflow
    const workflowId = await ctx.db.insert("workflows", {
      name: "Team Intel & Synthesis",
      description: "Extract common profiles, enhance from web, and generate executive summary.",
      isActive: true,
      triggerType: "MANUAL",
      createdAt: now,
      updatedAt: now,
      createdBy: (await ctx.db.query("users").first())?._id as any, // fallback to any first user
    });

    // 3. Create Inline Agents
    // Agent 1: User Extraction
    const agent1Id = await ctx.db.insert("agents", {
      name: "Team Extraction Agent",
      description: "Extracts user data from the platform directory",
      modelId: "gemini-3.1-flash-lite-preview",
      systemPrompt: "You are the User Extraction Agent. Your task is to output a JSON list of all users belonging to ACME Inc. For this demonstration, if you don't have access to a tool, simulate a list of 3-5 realistic profiles based on the company's industrial background.",
      isActive: true,
      isGlobal: false,
      thinkingMode: false,
      workflowId,
      createdAt: now,
      updatedAt: now,
      temperature: 0.1,
      inputSchema: JSON.stringify({
        type: "object",
        properties: {
          companyName: { type: "string" }
        }
      }),
      outputSchema: JSON.stringify({
        type: "object",
        properties: {
          users: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                email: { type: "string" }
              }
            }
          }
        }
      })
    });

    // Agent 2: Web Enrichment
    const agent2Id = await ctx.db.insert("agents", {
      name: "Web Enrichment Agent",
      description: "Enhances profiles using online search",
      modelId: "gemini-3.1-pro-preview",
      systemPrompt: "You are the Web Enrichment Agent. For the team members provided in the input, perform an online search to find their professional bio, key expertise, and public achievements. Return the enriched JSON data.",
      isActive: true,
      isGlobal: false,
      thinkingMode: false,
      workflowId,
      createdAt: now,
      updatedAt: now,
      allowInternetAccess: true,
      temperature: 0.2,
      inputSchema: JSON.stringify({
        type: "object",
        properties: {
          users: { type: "array" }
        }
      }),
      outputSchema: JSON.stringify({
        type: "object",
        properties: {
          enrichedUsers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                bio: { type: "string" },
                expertise: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      })
    });

    // Agent 3: Executive Summary
    const agent3Id = await ctx.db.insert("agents", {
      name: "Executive Summary Agent",
      description: "Generates final report synthesis",
      modelId: "gemini-3.1-pro-preview",
      systemPrompt: "You are the Executive Summary Agent. Transform the enriched team profiles into a high-end, professional executive summary in Markdown format. Focus on leadership diversity, technical depth, and strategic alignment.",
      isActive: true,
      isGlobal: false,
      thinkingMode: false,
      workflowId,
      createdAt: now,
      updatedAt: now,
      temperature: 0.3,
      inputSchema: JSON.stringify({
        type: "object",
        properties: {
          enrichedUsers: { type: "array" }
        }
      })
    });

    // 4. Construct Nodes and Edges (React Flow format)
    const nodes = [
      {
        id: "node-1",
        type: "agentNode",
        position: { x: 100, y: 100 },
        data: {
          label: "Team Extraction",
          _agentId: agent1Id,
          isInline: true,
          modelId: "gemini-3.1-flash-lite-preview"
        }
      },
      {
        id: "node-2",
        type: "agentNode",
        position: { x: 400, y: 100 },
        data: {
          label: "Web Enrichment",
          _agentId: agent2Id,
          isInline: true,
          modelId: "gemini-3.1-pro-preview"
        }
      },
      {
        id: "node-3",
        type: "agentNode",
        position: { x: 700, y: 100 },
        data: {
          label: "Executive Summary",
          _agentId: agent3Id,
          isInline: true,
          modelId: "gemini-3.1-pro-preview"
        }
      }
    ];

    const edges = [
      { id: "edge-1-2", source: "node-1", target: "node-2", animated: true },
      { id: "edge-2-3", source: "node-2", target: "node-3", animated: true }
    ];

    // 5. Update Workflow with Graph
    await ctx.db.patch(workflowId, {
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      updatedAt: now
    });

    // 6. Log in Audit
    await ctx.db.insert("auditLogs", {
      actionType: "SEED_WORKFLOW",
      actorId: (await ctx.db.query("users").first())?._id as any,
      entityType: "workflows",
      entityId: workflowId,
      timestamp: now,
      metadata: JSON.stringify({ name: "Team Intel & Synthesis", company: "ACME Inc" })
    });

    return {
      status: "SUCCESS",
      workflowId,
      agents: [agent1Id, agent2Id, agent3Id]
    };
  }
});
