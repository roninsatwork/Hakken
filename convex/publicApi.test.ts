import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const OVERSIZED_BODY = "x".repeat(128 * 1024 + 1);

async function seedPublicRunSurfaces(t: ReturnType<typeof convexTest>) {
  const { companyId, adminId, agentId, workflowId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: "Public API Tenant",
      createdAt: Date.now(),
    });
    const adminId = await ctx.db.insert("users", {
      email: "admin@public-api.test",
      role: "ADMIN",
      companyId,
      createdAt: Date.now(),
    });
    const agentId = await ctx.db.insert("agents", {
      name: "Public Agent",
      modelId: "safe-model",
      thinkingMode: false,
      isActive: true,
      companyId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const workflowId = await ctx.db.insert("workflows", {
      name: "Public Workflow",
      isActive: true,
      triggerType: "WEBHOOK",
      companyId,
      nodes: "[]",
      edges: "[]",
      createdBy: adminId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { companyId, adminId, agentId, workflowId };
  });

  const created = await t.withIdentity({ subject: adminId }).mutation(api.apiKeys.create, {
    name: "Public run tests",
    scopes: ["agent:run", "workflow:run"],
  });

  return { apiKey: created.apiKey, agentId, companyId, workflowId };
}

describe("Public API request body limits", () => {
  test("oversized agent-run JSON is rejected before a run is created", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { apiKey } = await seedPublicRunSurfaces(t);

    const response = await t.fetch("/api/public/v1/agent-runs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: OVERSIZED_BODY,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Request body cannot exceed 131072 bytes.",
    });
    expect(await t.run(async (ctx) => ctx.db.query("agentRuns").collect())).toEqual([]);
  });

  test("oversized workflow-run JSON is rejected before an execution is created", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { apiKey } = await seedPublicRunSurfaces(t);

    const response = await t.fetch("/api/public/v1/workflow-runs", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: OVERSIZED_BODY,
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Request body cannot exceed 131072 bytes.",
    });
    expect(await t.run(async (ctx) => ctx.db.query("workflowExecutions").collect())).toEqual([]);
  });

  test("valid bounded JSON still reaches both public run handlers", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { apiKey, agentId, workflowId } = await seedPublicRunSurfaces(t);
    const headers = {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    };

    const agentResponse = await t.fetch("/api/public/v1/agent-runs", {
      method: "POST",
      headers,
      body: JSON.stringify({ agentId, objective: "Prepare a short status update." }),
    });
    const workflowResponse = await t.fetch("/api/public/v1/workflow-runs", {
      method: "POST",
      headers,
      body: JSON.stringify({ workflowId, initialInput: "Start the workflow." }),
    });

    expect(agentResponse.status).toBe(202);
    expect(workflowResponse.status).toBe(202);
  });
});
