import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

async function seedRuntimeWorkflow(
  t: ReturnType<typeof convexTest>,
  args: {
    node: {
      id: string;
      type: string;
      data?: Record<string, unknown>;
    };
    input?: Record<string, unknown>;
    state?: Record<string, unknown>;
    edges?: Array<{ source: string; target: string }>;
  }
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: `${args.node.id}@test.com`,
      role: "SUPER_ADMIN",
      createdAt: Date.now(),
    });
    const workflowId = await ctx.db.insert("workflows", {
      name: `${args.node.id} Workflow`,
      isActive: true,
      triggerType: "MANUAL",
      nodes: JSON.stringify([args.node]),
      edges: JSON.stringify(args.edges ?? []),
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const executionId = await ctx.db.insert("workflowExecutions", {
      workflowId,
      triggerType: "MANUAL",
      status: "RUNNING",
      state: JSON.stringify(args.state ?? { trigger: {} }),
      startedAt: Date.now(),
      startedBy: userId,
    });
    const stepId = await ctx.db.insert("workflowExecutionSteps", {
      executionId,
      nodeId: args.node.id,
      input: JSON.stringify(args.input ?? { trigger: {} }),
      status: "PENDING",
      startedAt: Date.now(),
    });

    return { userId, workflowId, executionId, stepId };
  });
}

async function getRuntimeState(t: ReturnType<typeof convexTest>, executionId: Id<"workflowExecutions">) {
  return await t.run(async (ctx) => {
    const execution = await ctx.db.get(executionId);
    const steps = (await ctx.db.query("workflowExecutionSteps").collect()).filter(
      (step) => step.executionId === executionId
    );

    return { execution, steps };
  });
}

describe("workflow runtime actions", () => {
  test("startWorkflow initializes empty workflow executions as successful", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId, executionId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Empty Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "MANUAL",
        status: "RUNNING",
        startedAt: Date.now(),
        startedBy: userId,
      });

      return { workflowId, executionId };
    });

    await t.action(internal.workflowRuntime.startWorkflow, {
      workflowId,
      executionId,
      initialInput: JSON.stringify({ source: "test" }),
    });

    const { execution, steps } = await getRuntimeState(t, executionId);

    expect(execution).toMatchObject({
      status: "SUCCESS",
      state: JSON.stringify({ message: "No nodes to execute" }),
    });
    expect(steps).toEqual([]);
  });

  test("executeNode handles code, wait, approval, iterator, and bypass nodes", async () => {
    const cases = [
      {
        node: {
          id: "code",
          type: "codeNode",
          data: { _inputTemplate: "Hello {{input.name}} from {{execution.trigger.source}}" },
        },
        input: { name: "Ada" },
        state: { trigger: { source: "runtime" } },
        expectedOutput: JSON.stringify("Hello  from runtime"),
        expectedStatus: "SUCCESS",
      },
      {
        node: {
          id: "wait",
          type: "waitNode",
          data: { _waitConfig: { delaySeconds: "2" } },
        },
        expectedOutput: JSON.stringify({ _system: { delayMs: 2000, structurallyHandled: true }, waitedSeconds: 2 }),
        expectedStatus: "SUCCESS",
      },
      {
        node: {
          id: "approval",
          type: "approvalNode",
          data: { _approvalConfig: { message: "Review", previewTarget: "{{trigger.item}}" } },
        },
        input: { trigger: { item: "Deal A" } },
        expectedOutput: JSON.stringify({
          _system: { halt: true, structurallyHandled: true },
          message: "Review",
          previewData: "Deal A",
        }),
        expectedStatus: "PENDING_APPROVAL",
      },
      {
        node: {
          id: "iterator",
          type: "iteratorNode",
          data: { _iteratorConfig: { listVariable: "{{trigger.items}}" } },
        },
        input: { trigger: { items: ["one", "two"] } },
        expectedOutput: JSON.stringify({ _system: { isIterator: true }, items: ["one", "two"] }),
        expectedStatus: "SUCCESS",
      },
      {
        node: {
          id: "unknown",
          type: "customNode",
        },
        input: { trigger: { value: 1 } },
        expectedOutput: JSON.stringify({ bypassed: true, nodeType: "customNode", received: JSON.stringify({ trigger: { value: 1 } }) }),
        expectedStatus: "SUCCESS",
      },
    ] as const;

    for (const runtimeCase of cases) {
      const t = convexTest(schema, import.meta.glob("./**/*.*s"));
      const { workflowId, executionId, stepId } = await seedRuntimeWorkflow(t, runtimeCase);

      await t.action(internal.workflowRuntime.executeNode, {
        workflowId,
        executionId,
        nodeId: runtimeCase.node.id,
      });

      const { steps } = await getRuntimeState(t, executionId);
      const step = steps.find((entry) => entry._id === stepId);

      expect(step).toMatchObject({
        status: runtimeCase.expectedStatus,
        output: runtimeCase.expectedOutput,
      });
    }
  });

  // template:remove:start properties
  test("executeNode handles database, merge, and email nodes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId, executionId, databaseStepId, mergeStepId, emailStepId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Runtime Branches",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([
          {
            id: "database",
            type: "databaseNode",
            data: {
              _dbConfig: { tableName: "properties", operation: "INSERT" },
              _inputMapping: {
                rightmoveId: "{{trigger.rightmoveId}}",
                address: "{{trigger.address}}",
                price: 500,
                url: "https://example.com/property",
                scrapedAt: 123,
              },
            },
          },
          { id: "upstream", type: "codeNode" },
          { id: "merge", type: "mergeNode" },
          {
            id: "email",
            type: "emailNode",
            data: {
              _emailConfig: {
                to: "ops@example.com, support@example.com",
                subject: "Hello {{trigger.name}}",
                body: "<p>{{trigger.message}}</p>",
              },
            },
          },
        ]),
        edges: JSON.stringify([{ source: "upstream", target: "merge" }]),
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "MANUAL",
        status: "RUNNING",
        state: JSON.stringify({ trigger: { name: "Ada", message: "Approved" } }),
        startedAt: Date.now(),
        startedBy: userId,
      });
      const databaseStepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "database",
        input: JSON.stringify({ trigger: { rightmoveId: "prop-1", address: "1 Test Street" } }),
        status: "PENDING",
        startedAt: 1,
      });
      await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "upstream",
        input: "{}",
        output: JSON.stringify({ result: "done" }),
        status: "SUCCESS",
        startedAt: 2,
        completedAt: 3,
      });
      const mergeStepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "merge",
        input: "{}",
        status: "PENDING",
        startedAt: 4,
      });
      const emailStepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "email",
        input: JSON.stringify({ trigger: { name: "Ada", message: "Approved" } }),
        status: "PENDING",
        startedAt: 5,
      });

      return { workflowId, executionId, databaseStepId, mergeStepId, emailStepId };
    });

    for (const nodeId of ["database", "merge", "email"]) {
      await t.action(internal.workflowRuntime.executeNode, {
        workflowId,
        executionId,
        nodeId,
      });
    }

    const { steps } = await getRuntimeState(t, executionId);
    const insertedProperties = await t.run(async (ctx) => await ctx.db.query("properties").collect());
    const databaseStep = steps.find((entry) => entry._id === databaseStepId);
    const mergeStep = steps.find((entry) => entry._id === mergeStepId);
    const emailStep = steps.find((entry) => entry._id === emailStepId);

    expect(insertedProperties[0]).toMatchObject({
      rightmoveId: "prop-1",
      address: "1 Test Street",
      price: 500,
      url: "https://example.com/property",
      scrapedAt: 123,
    });
    expect(JSON.parse(databaseStep?.output ?? "{}")).toMatchObject({
      _system: { db: true },
      operation: "INSERT",
      tableName: "properties",
      result: { id: insertedProperties[0]._id },
    });
    expect(JSON.parse(mergeStep?.output ?? "{}")).toMatchObject({
      _system: { isMerge: true, structurallyHandled: true },
      mergedContexts: { upstream: { result: "done" } },
    });
    expect(JSON.parse(emailStep?.output ?? "{}")).toMatchObject({
      success: true,
      simulated: true,
      to: ["ops@example.com", "support@example.com"],
      subject: "Hello Ada",
      bodyPreview: "<p>Approved</p>",
    });
  });
  // template:remove:end

  test("executeNode failure marks the claimed step and execution as failed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { workflowId, executionId, stepId } = await seedRuntimeWorkflow(t, {
      node: {
        id: "unsafe-action",
        type: "actionNode",
        data: { _actionConfig: { url: "http://localhost:3000/internal" } },
      },
    });

    await t.action(internal.workflowRuntime.executeNode, {
      workflowId,
      executionId,
      nodeId: "unsafe-action",
    });

    const { execution, steps } = await getRuntimeState(t, executionId);
    const step = steps.find((entry) => entry._id === stepId);

    expect(execution?.status).toBe("FAILED");
    expect(step).toMatchObject({
      status: "FAILED",
      error: expect.stringContaining("API Action request failed: SSRF Prevention"),
    });
  });
});

/**
 * `resumeApprovalStep` had no test of any kind, which is how it kept a guard of
 * "any authenticated user" while every other workflow function required a super
 * admin. These pin the guard, not just the happy path.
 */
describe("resumeApprovalStep authorization", () => {
  async function seedHaltedApproval(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Halted Co",
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@halted.test",
        role: "SUPER_ADMIN",
        createdAt: Date.now(),
      });
      const companyAdminId = await ctx.db.insert("users", {
        email: "admin@halted.test",
        role: "ADMIN",
        companyId,
        createdAt: Date.now(),
      });
      const plainUserId = await ctx.db.insert("users", {
        email: "user@halted.test",
        role: "USER",
        companyId,
        createdAt: Date.now(),
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Halted Approval Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([
          { id: "approval", type: "approvalNode" },
          { id: "downstream", type: "bypassNode" },
        ]),
        edges: JSON.stringify([{ source: "approval", target: "downstream" }]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        companyId,
        triggerType: "MANUAL",
        status: "RUNNING",
        state: JSON.stringify({ trigger: {} }),
        startedAt: Date.now(),
        startedBy: superAdminId,
      });
      const stepId = await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "approval",
        input: JSON.stringify({ trigger: {} }),
        output: JSON.stringify({ _system: { halt: true }, message: "Review" }),
        status: "PENDING_APPROVAL",
        startedAt: Date.now(),
      });

      return { companyId, superAdminId, companyAdminId, plainUserId, workflowId, executionId, stepId };
    });
  }

  test("a plain user cannot resume an approval step", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { plainUserId, executionId } = await seedHaltedApproval(t);

    await expect(
      t.withIdentity({ subject: plainUserId }).action(api.workflowRuntime.resumeApprovalStep, {
        executionId,
        nodeId: "approval",
        action: "APPROVED",
      })
    ).rejects.toThrow(/Unauthorized/);

    const { steps } = await getRuntimeState(t, executionId);
    expect(steps[0].status).toBe("PENDING_APPROVAL");
  });

  test("a company admin cannot resume an approval step, even in their own company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { companyAdminId, executionId } = await seedHaltedApproval(t);

    await expect(
      t.withIdentity({ subject: companyAdminId }).action(api.workflowRuntime.resumeApprovalStep, {
        executionId,
        nodeId: "approval",
        action: "APPROVED",
      })
    ).rejects.toThrow(/Unauthorized/);

    const { execution, steps } = await getRuntimeState(t, executionId);
    expect(steps[0].status).toBe("PENDING_APPROVAL");
    expect(execution?.status).toBe("RUNNING");
  });

  test("an unauthenticated caller cannot resume an approval step", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { executionId } = await seedHaltedApproval(t);

    await expect(
      t.action(api.workflowRuntime.resumeApprovalStep, {
        executionId,
        nodeId: "approval",
        action: "APPROVED",
      })
    ).rejects.toThrow();
  });

  test("a super admin approving resumes the step and releases downstream nodes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, executionId } = await seedHaltedApproval(t);

    const resumed = await t
      .withIdentity({ subject: superAdminId })
      .action(api.workflowRuntime.resumeApprovalStep, {
        executionId,
        nodeId: "approval",
        action: "APPROVED",
      });

    expect(resumed).toBe(true);

    const { steps } = await getRuntimeState(t, executionId);
    expect(steps.find((step) => step.nodeId === "approval")?.status).toBe("SUCCESS");
    expect(steps.some((step) => step.nodeId === "downstream")).toBe(true);
  });

  test("a super admin rejecting fails the execution", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, executionId } = await seedHaltedApproval(t);

    const resumed = await t
      .withIdentity({ subject: superAdminId })
      .action(api.workflowRuntime.resumeApprovalStep, {
        executionId,
        nodeId: "approval",
        action: "REJECTED",
      });

    expect(resumed).toBe(false);

    const { execution } = await getRuntimeState(t, executionId);
    expect(execution?.status).toBe("FAILED");
  });

  test("an execution with no workflow is refused rather than resumed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId } = await seedHaltedApproval(t);

    const orphanExecutionId = await t.run(async (ctx) => {
      const executionId = await ctx.db.insert("workflowExecutions", {
        triggerType: "MANUAL",
        status: "RUNNING",
        state: JSON.stringify({ trigger: {} }),
        startedAt: Date.now(),
        startedBy: superAdminId,
      });
      await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "approval",
        input: JSON.stringify({ trigger: {} }),
        status: "PENDING_APPROVAL",
        startedAt: Date.now(),
      });
      return executionId;
    });

    await expect(
      t.withIdentity({ subject: superAdminId }).action(api.workflowRuntime.resumeApprovalStep, {
        executionId: orphanExecutionId,
        nodeId: "approval",
        action: "APPROVED",
      })
    ).rejects.toThrow(/no workflow/);
  });
});
