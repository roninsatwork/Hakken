import { convexTest } from "convex-test";
import { expect, test, describe, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";


describe("OWASP: Broken Access Control - Workflows", () => {
  test("Standard USER cannot execute any Workflow CRUD operations", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const hackerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "hacker@test.com",
        role: "USER"
      });
    });

    const maliciousClient = t.withIdentity({ subject: hackerUserId });

    await expect(
      maliciousClient.query(api.workflows.list)
    ).rejects.toThrow("Unauthorized");

    await expect(
      maliciousClient.mutation(api.workflows.createWorkflow, { name: "Rogue Workflow" })
    ).rejects.toThrow("Unauthorized");
  });

  test("Workflow Webhook Secret Generation & Access Controls", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN"
      });
    });

    const companyAId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
    });

    const adminAId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "adminA@test.com",
        role: "ADMIN",
        companyId: companyAId
      });
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminAClient = t.withIdentity({ subject: adminAId });

    // 1. Create a workflow manually
    const workflowId = await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Webhook Integration Workflow",
    });

    // Verify webhookSecret is initially undefined/null
    const createdWorkflow = await t.run(async (ctx) => {
      return await ctx.db.get(workflowId);
    });
    expect(createdWorkflow?.webhookSecret).toBeUndefined();

    // 2. Update the workflow to triggerType: "WEBHOOK"
    await superAdminClient.mutation(api.workflows.updateWorkflow, {
      id: workflowId,
      triggerType: "WEBHOOK",
    });

    // Verify webhookSecret is now generated
    const updatedWorkflow = await t.run(async (ctx) => {
      return await ctx.db.get(workflowId);
    });
    const webhookSecret = updatedWorkflow?.webhookSecret;
    expect(typeof webhookSecret).toBe("string");
    if (typeof webhookSecret !== "string") {
      throw new Error("Expected webhook secret to be generated");
    }
    expect(webhookSecret.length).toBeGreaterThan(10);

    // 3. Test access controls on getWebhookSecret query
    // Super Admin should be allowed
    const secret = await superAdminClient.query(api.workflows.getWebhookSecret, { id: workflowId });
    expect(secret).toBe(updatedWorkflow?.webhookSecret);

    // Admin of Company A should be rejected
    await expect(
      adminAClient.query(api.workflows.getWebhookSecret, { id: workflowId })
    ).rejects.toThrow("Unauthorized");
  });

  test("Super admins can list, get, update schedules, trigger, and delete workflows", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const workflowId = await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Lifecycle Workflow",
      description: "Initial",
    });
    expect(await superAdminClient.query(api.workflows.get, { id: workflowId })).toMatchObject({
      name: "Lifecycle Workflow",
      description: "Initial",
      triggerType: "MANUAL",
      isActive: true,
    });
    expect((await superAdminClient.query(api.workflows.list)).map((workflow) => workflow._id)).toContain(workflowId);

    const scheduleNodes = JSON.stringify([
      {
        id: "trigger",
        type: "triggerNode",
        data: { _triggerType: "SCHEDULE", _scheduleInterval: "weekly" },
      },
    ]);
    await superAdminClient.mutation(api.workflows.updateWorkflow, {
      id: workflowId,
      name: "Scheduled Lifecycle Workflow",
      description: "Updated",
      isActive: false,
      nodes: scheduleNodes,
    });
    let schedule = await t.run(async (ctx) =>
      ctx.db.query("schedules").withIndex("by_workflow", (q) => q.eq("workflowId", workflowId)).first()
    );
    expect(schedule).toMatchObject({
      workflowId,
      intervalStr: "weekly",
      isActive: false,
      createdBy: superAdminId,
    });

    await superAdminClient.mutation(api.workflows.updateWorkflow, {
      id: workflowId,
      nodes: JSON.stringify([{ id: "trigger", type: "triggerNode", data: { _triggerType: "MANUAL" } }]),
    });
    schedule = await t.run(async (ctx) =>
      ctx.db.query("schedules").withIndex("by_workflow", (q) => q.eq("workflowId", workflowId)).first()
    );
    expect(schedule).toBeNull();

    const executionId = await superAdminClient.mutation(api.workflows.triggerManualRun, {
      id: workflowId,
      initialInput: JSON.stringify({ source: "test" }),
    });
    expect(await t.run(async (ctx) => ctx.db.get(executionId))).toMatchObject({
      workflowId,
      triggerType: "MANUAL",
      startedBy: superAdminId,
    });

    await expect(superAdminClient.mutation(api.workflows.deleteWorkflow, { id: workflowId })).resolves.toBe(true);
    expect(await t.run(async (ctx) => ctx.db.get(workflowId))).toBeNull();
    await expect(superAdminClient.query(api.workflows.get, { id: workflowId })).rejects.toThrow("Workflow not found");
    const auditActions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).map((log) => log.actionType)
    );
    expect(auditActions).toEqual(
      expect.arrayContaining(["CREATE_WORKFLOW", "UPDATE_WORKFLOW", "DELETE_WORKFLOW"])
    );
  });

  test("public workflow trigger creates tenant-scoped webhook executions only for active webhook workflows", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, creatorId, webhookWorkflowId, manualWorkflowId, inactiveWorkflowId, otherCompanyWorkflowId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Public Workflow Tenant", createdAt: Date.now() });
      const otherCompanyId = await ctx.db.insert("companies", { name: "Other Public Workflow Tenant", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "workflow-owner@example.com",
        role: "SUPER_ADMIN",
      });
      const webhookWorkflowId = await ctx.db.insert("workflows", {
        name: "Public Webhook Workflow",
        companyId,
        isActive: true,
        triggerType: "WEBHOOK",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });
      const manualWorkflowId = await ctx.db.insert("workflows", {
        name: "Manual Workflow",
        companyId,
        isActive: true,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });
      const inactiveWorkflowId = await ctx.db.insert("workflows", {
        name: "Inactive Webhook Workflow",
        companyId,
        isActive: false,
        triggerType: "WEBHOOK",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });
      const otherCompanyWorkflowId = await ctx.db.insert("workflows", {
        name: "Other Company Webhook Workflow",
        companyId: otherCompanyId,
        isActive: true,
        triggerType: "WEBHOOK",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });

      return { companyId, creatorId, webhookWorkflowId, manualWorkflowId, inactiveWorkflowId, otherCompanyWorkflowId };
    });

    const created = await t.mutation(internal.workflows.createPublicWorkflowRunInternal, {
      workflowId: webhookWorkflowId,
      companyId,
      initialInput: JSON.stringify({ source: "public-api" }),
    });
    expect(created.status).toBe("RUNNING");

    const execution = await t.run(async (ctx) => await ctx.db.get(created.executionId));
    expect(execution).toMatchObject({
      workflowId: webhookWorkflowId,
      companyId,
      triggerType: "WEBHOOK",
      status: "RUNNING",
      startedBy: creatorId,
    });

    await expect(t.mutation(internal.workflows.createPublicWorkflowRunInternal, {
      workflowId: manualWorkflowId,
      companyId,
      initialInput: "{}",
    })).rejects.toThrow("Workflow not found or not configured for public triggers");

    await expect(t.mutation(internal.workflows.createPublicWorkflowRunInternal, {
      workflowId: inactiveWorkflowId,
      companyId,
      initialInput: "{}",
    })).rejects.toThrow("Workflow not found or not configured for public triggers");

    await expect(t.mutation(internal.workflows.createPublicWorkflowRunInternal, {
      workflowId: otherCompanyWorkflowId,
      companyId,
      initialInput: "{}",
    })).rejects.toThrow("Workflow not found or not configured for public triggers");
  });

  test("direct workflow webhook rejects oversized payloads before creating executions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Webhook Tenant", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "workflow-owner@example.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Direct Webhook Workflow",
        companyId,
        isActive: true,
        triggerType: "WEBHOOK",
        webhookSecret: "webhook-secret",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });
      return { workflowId };
    });

    const response = await t.fetch(`/api/webhooks/workflow?workflowId=${workflowId}`, {
      method: "POST",
      headers: { "x-hakken-secret": "webhook-secret" },
      body: "x".repeat(20_001),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Workflow input cannot exceed 20000 bytes.",
    });

    const executions = await t.run(async (ctx) => await ctx.db.query("workflowExecutions").collect());
    expect(executions).toEqual([]);
  });

  test("direct workflow webhook cancels an oversized chunked stream", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const workflowId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Stream Tenant", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "stream-owner@example.com",
        role: "SUPER_ADMIN",
      });
      return await ctx.db.insert("workflows", {
        name: "Chunked Webhook Workflow",
        companyId,
        isActive: true,
        triggerType: "WEBHOOK",
        webhookSecret: "stream-secret",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
      });
    });

    const cancel = vi.fn();
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads === 1) controller.enqueue(new TextEncoder().encode("x".repeat(20_001)));
        else controller.error(new Error("Oversized workflow input must not be drained"));
      },
      cancel,
    }, { highWaterMark: 0 });

    const response = await t.fetch(`/api/webhooks/workflow?workflowId=${workflowId}`, {
      method: "POST",
      headers: { "x-hakken-secret": "stream-secret" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reads).toBe(1);
    const executions = await t.run(async (ctx) => await ctx.db.query("workflowExecutions").collect());
    expect(executions).toEqual([]);
  });

  test("a workflow's webhook allowance refuses the excess with 429 and schedules nothing", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { workflowId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Webhook Tenant", createdAt: Date.now() });
      const creatorId = await ctx.db.insert("users", {
        email: "workflow-owner@example.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Replayed Webhook Workflow",
        companyId,
        isActive: true,
        triggerType: "WEBHOOK",
        webhookSecret: "webhook-secret",
        nodes: "[]",
        edges: "[]",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: creatorId,
        // The hour's allowance is already spent.
        webhookWindowStart: Date.now() - 60_000,
        webhookCountInWindow: 60,
      });
      return { workflowId };
    });

    for (let i = 0; i < 2; i++) {
      const response = await t.fetch(`/api/webhooks/workflow?workflowId=${workflowId}`, {
        method: "POST",
        headers: { "x-hakken-secret": "webhook-secret" },
        body: "{}",
      });
      expect(response.status).toBe(429);
      expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    }

    const { executions, limitedEntries } = await t.run(async (ctx) => ({
      executions: await ctx.db.query("workflowExecutions").collect(),
      limitedEntries: (await ctx.db.query("auditLogs").collect()).filter(
        (entry) => entry.actionType === "RATE_LIMITED_WORKFLOW_WEBHOOK"
      ),
    }));
    expect(executions).toEqual([]);
    // The throttling decision is recorded — once per window, not per attempt.
    expect(limitedEntries).toHaveLength(1);

    // An expired window admits triggers again, proven at the gate itself so
    // the test does not have to run a real workflow.
    await t.run(async (ctx) => {
      await ctx.db.patch(workflowId, { webhookWindowStart: Date.now() - 2 * 60 * 60 * 1000 });
    });
    await expect(
      t.mutation(internal.workflows.reserveWebhookTrigger, { workflowId })
    ).resolves.toEqual({ ok: true });
  });

  test("Super admins can page and search workflows without loading the full table", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      })
    );
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const leadWorkflowId = await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Lead Router Workflow",
      description: "Routes inbound leads.",
    });
    await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Daily Digest Workflow",
      description: "Builds a daily digest.",
    });

    const firstPage = await superAdminClient.query(api.workflows.getPaginatedWorkflows, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    const searchPage = await superAdminClient.query(api.workflows.getPaginatedWorkflows, {
      searchTerm: "Lead",
      paginationOpts: { numItems: 15, cursor: null },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(searchPage.page.map((workflow) => workflow._id)).toEqual([leadWorkflowId]);
  });

  test("Workflow graph updates reject malformed node and edge contracts", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN"
      });
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const workflowId = await superAdminClient.mutation(api.workflows.createWorkflow, {
      name: "Contract Test Workflow",
    });

    await expect(
      superAdminClient.mutation(api.workflows.updateWorkflow, {
        id: workflowId,
        nodes: JSON.stringify([{ type: "agentNode" }]),
      })
    ).rejects.toThrow("Workflow node at index 0 must include a string id");

    await expect(
      superAdminClient.mutation(api.workflows.updateWorkflow, {
        id: workflowId,
        edges: JSON.stringify([{ source: "trigger-1" }]),
      })
    ).rejects.toThrow("Workflow edge at index 0 must include string source and target node ids.");
  });

  test("Workflow execution initialization tolerates malformed trigger input", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { executionId, workflowId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Malformed Trigger Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([{ id: "start", type: "triggerNode" }]),
        edges: JSON.stringify([]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "MANUAL",
        status: "RUNNING",
        startedAt: Date.now(),
        startedBy: superAdminId,
      });

      return { executionId, workflowId };
    });

    await t.mutation(internal.workflowEngine.initExecution, {
      workflowId,
      executionId,
      initialInput: "not json",
    });

    const { execution, steps } = await t.run(async (ctx) => {
      const execution = await ctx.db.get(executionId);
      const steps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId))
        .collect();

      return { execution, steps };
    });

    expect(execution?.state).toBe(JSON.stringify({ trigger: {} }));
    expect(steps).toHaveLength(1);
    expect(steps[0].input).toBe(JSON.stringify({ trigger: {} }));
  });

  test("Workflow finalization fans out iterator items and merges fan-in dependencies", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { executionId, workflowId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Iterator Merge Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([
          { id: "iterator", type: "iteratorNode" },
          { id: "worker", type: "actionNode" },
          { id: "manual-a", type: "actionNode" },
          { id: "manual-b", type: "actionNode" },
          { id: "merge", type: "mergeNode" },
        ]),
        edges: JSON.stringify([
          { source: "iterator", target: "worker" },
          { source: "manual-a", target: "merge" },
          { source: "manual-b", target: "merge" },
        ]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
        triggerType: "MANUAL",
        status: "RUNNING",
        state: JSON.stringify({ trigger: {} }),
        startedAt: Date.now(),
        startedBy: superAdminId,
      });

      await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "iterator",
        input: JSON.stringify({ trigger: {} }),
        status: "RUNNING",
        startedAt: 1,
      });
      await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "manual-a",
        input: JSON.stringify({ trigger: {} }),
        status: "RUNNING",
        startedAt: 2,
      });
      await ctx.db.insert("workflowExecutionSteps", {
        executionId,
        nodeId: "manual-b",
        input: JSON.stringify({ trigger: {} }),
        status: "RUNNING",
        startedAt: 3,
      });

      return { executionId, workflowId };
    });

    const iteratorReady = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "iterator",
      outputData: JSON.stringify({ _system: { isIterator: true }, items: ["one", "two"] }),
    });

    // One scheduled worker per fanned-out step. `executeNode` claims a single
    // PENDING step per invocation, so scheduling "worker" once for two items
    // ran only the first and left the second PENDING forever.
    expect(iteratorReady).toEqual(["worker", "worker"]);

    const workerInputs = await t.run(async (ctx) => {
      const steps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "worker"))
        .collect();

      return steps.map((step) => JSON.parse(step.input));
    });

    expect(workerInputs).toHaveLength(2);
    expect(workerInputs.map((input) => input.nodes.iterator.output.item)).toEqual(["one", "two"]);
    expect(workerInputs.map((input) => input.nodes.iterator.output.index)).toEqual([0, 1]);

    const firstMergeReady = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "manual-a",
      outputData: JSON.stringify({ ok: "a" }),
    });
    expect(firstMergeReady).toEqual([]);

    const secondMergeReady = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "manual-b",
      outputData: JSON.stringify({ ok: "b" }),
    });
    expect(secondMergeReady).toEqual(["merge"]);

    const mergeSteps = await t.run(async (ctx) => {
      return await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "merge"))
        .collect();
    });

    expect(workflowId).toBeDefined();
    expect(mergeSteps).toHaveLength(1);
    expect(mergeSteps[0].status).toBe("PENDING");
  });

  test("Workflow approval halt blocks downstream until resumed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { executionId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "super@test.com",
        role: "SUPER_ADMIN",
      });
      const workflowId = await ctx.db.insert("workflows", {
        name: "Approval Resume Workflow",
        isActive: true,
        triggerType: "MANUAL",
        nodes: JSON.stringify([
          { id: "approval", type: "approvalNode" },
          { id: "after-approval", type: "actionNode" },
        ]),
        edges: JSON.stringify([{ source: "approval", target: "after-approval" }]),
        createdBy: superAdminId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const executionId = await ctx.db.insert("workflowExecutions", {
        workflowId,
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
        status: "RUNNING",
        startedAt: 1,
      });

      return { executionId };
    });

    const haltedReady = await t.mutation(internal.workflowEngine.finalizeNodeStep, {
      executionId,
      nodeId: "approval",
      outputData: JSON.stringify({ _system: { halt: true }, message: "Review" }),
    });
    expect(haltedReady).toEqual([]);

    const haltedState = await t.run(async (ctx) => {
      const approvalSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "approval"))
        .collect();
      const downstreamSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "after-approval"))
        .collect();

      return { approvalStep: approvalSteps[0], downstreamSteps };
    });

    expect(haltedState.approvalStep.status).toBe("PENDING_APPROVAL");
    expect(haltedState.downstreamSteps).toHaveLength(0);

    const resumedReady = await t.mutation(internal.workflowEngine.resumeNodeStep, {
      executionId,
      nodeId: "approval",
    });
    expect(resumedReady).toEqual(["after-approval"]);

    const resumedState = await t.run(async (ctx) => {
      const approvalSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "approval"))
        .collect();
      const downstreamSteps = await ctx.db
        .query("workflowExecutionSteps")
        .withIndex("by_execution", (q) => q.eq("executionId", executionId).eq("nodeId", "after-approval"))
        .collect();

      return { approvalStep: approvalSteps[0], downstreamSteps };
    });

    expect(resumedState.approvalStep.status).toBe("SUCCESS");
    expect(resumedState.downstreamSteps).toHaveLength(1);
    expect(resumedState.downstreamSteps[0].status).toBe("PENDING");
  });

});

describe("the workflow list never carries the webhook secret", () => {
  /**
   * `list` and `get` were narrowed through `toClientWorkflow`. The paged read
   * was not — and the paged read is the one the workflow list screen calls, so
   * a workflow with a webhook trigger handed its secret to the browser on every
   * page of that list. No test reached the paged read at all, so removing the
   * narrowing left the suite green.
   */
  test("a webhook workflow is listed, and its secret is not", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "wf-super@test.com", role: "SUPER_ADMIN" }));
    const client = t.withIdentity({ subject: superAdminId });

    const workflowId = await client.mutation(api.workflows.createWorkflow, { name: "Webhook Flow" });
    await client.mutation(api.workflows.updateWorkflow, { id: workflowId, triggerType: "WEBHOOK" });

    const listed = await client.query(api.workflows.getPaginatedWorkflows, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    // Proof the read had something to be wrong about: a listed workflow, and a
    // secret sitting on it in the database.
    expect(listed.page.map((workflow) => workflow.name)).toEqual(["Webhook Flow"]);
    expect(await t.run(async (ctx) => (await ctx.db.get(workflowId))?.webhookSecret))
      .toEqual(expect.any(String));
    expect(listed.page.filter((workflow) => "webhookSecret" in workflow)).toEqual([]);
  });
});
