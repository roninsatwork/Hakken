import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const paginationOpts = { numItems: 10, cursor: null };

describe("Agent Run Approvals", () => {
  test("the approval queue is super-admin only, and every decision is audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const {
      adminAId,
      adminBId,
      superAdminId,
      approvalAId,
      approvalBId,
      toolCallAId,
      runAId,
      runBId,
    } = await t.run(async (ctx) => {
      const companyAId = await ctx.db.insert("companies", { name: "Company A", createdAt: Date.now() });
      const companyBId = await ctx.db.insert("companies", { name: "Company B", createdAt: Date.now() });
      const adminAId = await ctx.db.insert("users", {
        email: "admin-a@example.com",
        role: "ADMIN",
        companyId: companyAId,
      });
      const adminBId = await ctx.db.insert("users", {
        email: "admin-b@example.com",
        role: "ADMIN",
        companyId: companyBId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Approval Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const runAId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyAId,
        userId: adminAId,
        triggerType: "CHAT",
        objective: "Company A approval",
        status: "PENDING_APPROVAL",
        startedAt: 100,
        updatedAt: 100,
      });
      const stepAId = await ctx.db.insert("agentRunSteps", {
        runId: runAId,
        agentId,
        companyId: companyAId,
        stepIndex: 1,
        kind: "APPROVAL_REQUEST",
        status: "PENDING",
        startedAt: 101,
      });
      const toolCallAId = await ctx.db.insert("agentToolCalls", {
        runId: runAId,
        stepId: stepAId,
        agentId,
        normalizedToolName: "knowledge_search",
        handlerMapping: "knowledge.search",
        argumentsJson: '{"query":"policy"}',
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: true,
        companyId: companyAId,
        userId: adminAId,
        startedAt: 101,
      });
      const approvalAId = await ctx.db.insert("agentRunApprovals", {
        runId: runAId,
        stepId: stepAId,
        toolCallId: toolCallAId,
        agentId,
        companyId: companyAId,
        requestedBy: adminAId,
        status: "PENDING",
        message: "Approve A?",
        requestedAt: 102,
      });

      const runBId = await ctx.db.insert("agentRuns", {
        agentId,
        companyId: companyBId,
        userId: adminBId,
        triggerType: "CHAT",
        objective: "Company B approval",
        status: "PENDING_APPROVAL",
        startedAt: 200,
        updatedAt: 200,
      });
      const stepBId = await ctx.db.insert("agentRunSteps", {
        runId: runBId,
        agentId,
        companyId: companyBId,
        stepIndex: 1,
        kind: "APPROVAL_REQUEST",
        status: "PENDING",
        startedAt: 201,
      });
      const toolCallBId = await ctx.db.insert("agentToolCalls", {
        runId: runBId,
        stepId: stepBId,
        agentId,
        normalizedToolName: "external_sync",
        handlerMapping: "external.sync",
        argumentsJson: "{}",
        status: "APPROVAL_REQUIRED",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: true,
        companyId: companyBId,
        userId: adminBId,
        startedAt: 201,
      });
      const approvalBId = await ctx.db.insert("agentRunApprovals", {
        runId: runBId,
        stepId: stepBId,
        toolCallId: toolCallBId,
        agentId,
        companyId: companyBId,
        requestedBy: adminBId,
        status: "PENDING",
        message: "Approve B?",
        requestedAt: 202,
      });

      return { adminAId, adminBId, superAdminId, approvalAId, approvalBId, toolCallAId, runAId, runBId };
    });

    const adminAClient = t.withIdentity({ subject: adminAId });
    const adminBClient = t.withIdentity({ subject: adminBId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    // A company admin used to be authorised here, with a company-scoped branch,
    // while the nav hid the page from them — a live permission with no screen
    // behind it. Approvals are run on a client's behalf, so the API says so.
    await expect(
      adminAClient.query(api.agentRunApprovals.getPendingApprovals, { paginationOpts })
    ).rejects.toThrow();
    await expect(
      adminAClient.query(api.agentRunApprovals.getPendingApprovalCount, {})
    ).rejects.toThrow();
    await expect(
      adminAClient.mutation(api.agentRunApprovals.decideApproval, {
        approvalId: approvalAId,
        decision: "APPROVED",
        decisionReason: "Own tenant",
      })
    ).rejects.toThrow();
    await expect(
      adminBClient.mutation(api.agentRunApprovals.decideApproval, {
        approvalId: approvalAId,
        decision: "REJECTED",
        decisionReason: "Wrong tenant",
      })
    ).rejects.toThrow();

    const superAdminPending = await superAdminClient.query(api.agentRunApprovals.getPendingApprovals, { paginationOpts });
    expect(superAdminPending.page.map((entry) => entry.approval._id)).toEqual([approvalBId, approvalAId]);

    // The badge counts across companies, and counts everything pending rather
    // than only what has gone stale.
    expect(await superAdminClient.query(api.agentRunApprovals.getPendingApprovalCount, {}))
      .toEqual({ count: 2, atLimit: false });

    await superAdminClient.mutation(api.agentRunApprovals.decideApproval, {
      approvalId: approvalAId,
      decision: "APPROVED",
      decisionReason: "Looks safe",
    });

    const approvedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalAId),
      toolCall: await ctx.db.get(toolCallAId),
      run: await ctx.db.get(runAId),
    }));
    expect(approvedState.approval).toMatchObject({ status: "APPROVED", reviewedBy: superAdminId });
    expect(approvedState.toolCall).toMatchObject({ status: "PENDING" });
    expect(approvedState.toolCall?.confirmationGrantedAt).toEqual(expect.any(Number));
    expect(approvedState.run).toMatchObject({ status: "RUNNING" });

    // Deciding one takes it out of the count, which is what makes the badge
    // trustworthy enough to act on.
    expect(await superAdminClient.query(api.agentRunApprovals.getPendingApprovalCount, {}))
      .toEqual({ count: 1, atLimit: false });

    await superAdminClient.mutation(api.agentRunApprovals.decideApproval, {
      approvalId: approvalBId,
      decision: "REJECTED",
      decisionReason: "Not approved",
    });

    const rejectedState = await t.run(async (ctx) => ({
      approval: await ctx.db.get(approvalBId),
      run: await ctx.db.get(runBId),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", runBId)).collect(),
      toolCalls: await ctx.db.query("agentToolCalls").withIndex("by_run_started", (q) => q.eq("runId", runBId)).collect(),
    }));
    expect(rejectedState.approval).toMatchObject({ status: "REJECTED", reviewedBy: superAdminId });
    // A rejection is told to the agent rather than ending the run: the reviewer
    // means "not that way", and the objective may be most of the way done.
    // Stopping a run outright is `cancelRun`.
    expect(rejectedState.run?.status).not.toBe("FAILED");
    expect(rejectedState.run?.completedAt).toBeUndefined();
    // The refusal is recorded as the call's result, which is what the model reads.
    expect(rejectedState.toolCalls.at(-1)).toMatchObject({ status: "DENIED" });
    expect(rejectedState.toolCalls.at(-1)?.resultJson).toContain("refused it");
    expect(rejectedState.steps.at(-1)).toMatchObject({ kind: "TOOL_RESULT", status: "FAILED" });
    // And it is remembered, so the model cannot put the same decision back in
    // front of the reviewer.
    expect(rejectedState.run?.refusedToolCallsJson).toContain("external_sync");
    expect(await superAdminClient.query(api.agentRunApprovals.getPendingApprovalCount, {}))
      .toEqual({ count: 0, atLimit: false });

    // Approving a tool call is exactly the event an audit log exists for, and this
    // used to write none — while `cancelRun` next door always did. The test that
    // covered this was even titled "and audited" and asserted the absence.
    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    const decisions = audit.filter((entry) => entry.entityType === "agentRunApprovals");
    expect(decisions.map((entry) => entry.actionType).sort())
      .toEqual(["AGENT_APPROVAL_APPROVED", "AGENT_APPROVAL_REJECTED"]);
    expect(decisions.every((entry) => entry.actorId === superAdminId)).toBe(true);
    // The side-effect level is on the row, because a reader most wants to know
    // whether what was waved through was a lookup or a deletion.
    const approvedEntry = decisions.find((entry) => entry.actionType === "AGENT_APPROVAL_APPROVED");
    expect(JSON.parse(approvedEntry!.metadata!)).toMatchObject({
      runId: runAId,
      sideEffectLevel: "READ",
      reason: "Looks safe",
    });
  });

  test("an approval nobody answers expires, and its whole run stops", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const dayInMs = 24 * 60 * 60 * 1000;

    const { superAdminId, staleApprovalId, staleSiblingId, freshApprovalId, staleRunId, freshRunId, threadId } =
      await t.run(async (ctx) => {
        const superAdminId = await ctx.db.insert("users", {
          email: "expiry-super@example.com",
          role: "SUPER_ADMIN",
        });
        const agentId = await ctx.db.insert("agents", {
          name: "Expiry Agent",
          modelId: "model-test",
          thinkingMode: false,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const threadId = await ctx.db.insert("threads", {
          title: "Expiry thread",
          userId: superAdminId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        const seedRun = async (requestedAt: number, withThread: boolean) => {
          const runId = await ctx.db.insert("agentRuns", {
            agentId,
            userId: superAdminId,
            ...(withThread ? { threadId } : {}),
            triggerType: "CHAT",
            objective: "Waiting on a person",
            status: "PENDING_APPROVAL",
            startedAt: requestedAt,
            updatedAt: requestedAt,
          });
          const toolCallId = await ctx.db.insert("agentToolCalls", {
            runId,
            agentId,
            normalizedToolName: "email_send",
            handlerMapping: "email.send",
            argumentsJson: "{}",
            status: "APPROVAL_REQUIRED",
            requiredRole: "ADMIN",
            sideEffectLevel: "WRITE",
            confirmationRequired: true,
            startedAt: requestedAt,
            turnIndex: 0,
          });
          const approvalId = await ctx.db.insert("agentRunApprovals", {
            runId,
            toolCallId,
            agentId,
            status: "PENDING",
            requestedAt,
          });
          await ctx.db.insert("agentRunCheckpoints", {
            runId,
            agentId,
            threadId,
            status: "AWAITING_APPROVAL",
            transcriptJson: "[]",
            loopIndex: 1,
            stepIndex: 1,
            toolCallCount: 1,
            inputTokens: 0,
            outputTokens: 0,
            segmentCount: 1,
            resumeAttempts: 0,
            createdAt: requestedAt,
            updatedAt: requestedAt,
          });
          return { runId, approvalId, toolCallId };
        };

        // Waited two days, which is past the 24-hour default.
        const stale = await seedRun(Date.now() - 2 * dayInMs, true);
        // A sibling from the same model turn: the batch has to go together, or the
        // run parks again with nothing able to settle it.
        const staleSiblingId = await ctx.db.insert("agentRunApprovals", {
          runId: stale.runId,
          agentId,
          status: "PENDING",
          requestedAt: Date.now() - 2 * dayInMs,
        });
        const fresh = await seedRun(Date.now() - 60 * 1000, false);

        return {
          superAdminId,
          staleApprovalId: stale.approvalId,
          staleSiblingId,
          freshApprovalId: fresh.approvalId,
          staleRunId: stale.runId,
          freshRunId: fresh.runId,
          threadId,
        };
      });

    const result = await t.mutation(internal.agentRunApprovals.expireStalePendingApprovals, {});
    expect(result.expiredRuns).toBe(1);

    const state = await t.run(async (ctx) => ({
      stale: await ctx.db.get(staleApprovalId),
      sibling: await ctx.db.get(staleSiblingId),
      fresh: await ctx.db.get(freshApprovalId),
      staleRun: await ctx.db.get(staleRunId),
      freshRun: await ctx.db.get(freshRunId),
      checkpoints: await ctx.db.query("agentRunCheckpoints").collect(),
      steps: await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", staleRunId)).collect(),
    }));

    // Its own status, so "nobody answered" stays distinguishable from "someone
    // decided against it".
    expect(state.stale?.status).toBe("EXPIRED");
    expect(state.sibling?.status).toBe("EXPIRED");
    // Cancelled, never approved: an unattended yes to a deletion is the one
    // outcome worse than a stuck run.
    expect(state.staleRun?.status).toBe("CANCELLED");
    expect(state.staleRun?.finalOutput).toContain("without a decision");
    expect(state.steps.at(-1)).toMatchObject({ kind: "FINAL", status: "SKIPPED" });
    // The parked position is gone, which nothing else would ever have cleared.
    expect(state.checkpoints.filter((entry) => entry.runId === staleRunId)).toHaveLength(0);

    // One inside the window is untouched.
    expect(state.fresh?.status).toBe("PENDING");
    expect(state.freshRun?.status).toBe("PENDING_APPROVAL");

    // A stale browser tab cannot approve what the platform has already closed.
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    await expect(
      superAdminClient.mutation(api.agentRunApprovals.decideApproval, {
        approvalId: staleApprovalId,
        decision: "APPROVED",
      })
    ).rejects.toThrow(/expired/);

    void threadId;
  });

  test("an agent may be less patient than the platform", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { patientApprovalId, impatientApprovalId } = await t.run(async (ctx) => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const seed = async (approvalExpiryHours?: number) => {
        const agentId = await ctx.db.insert("agents", {
          name: approvalExpiryHours ? "Impatient Agent" : "Patient Agent",
          modelId: "model-test",
          thinkingMode: false,
          isActive: true,
          ...(approvalExpiryHours ? { approvalExpiryHours } : {}),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const runId = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "CHAT",
          objective: "Waiting",
          status: "PENDING_APPROVAL",
          startedAt: twoHoursAgo,
          updatedAt: twoHoursAgo,
        });
        return await ctx.db.insert("agentRunApprovals", {
          runId,
          agentId,
          status: "PENDING",
          requestedAt: twoHoursAgo,
        });
      };

      return {
        patientApprovalId: await seed(undefined),
        impatientApprovalId: await seed(1),
      };
    });

    await t.mutation(internal.agentRunApprovals.expireStalePendingApprovals, {});

    const state = await t.run(async (ctx) => ({
      patient: await ctx.db.get(patientApprovalId),
      impatient: await ctx.db.get(impatientApprovalId),
    }));

    // A daily reconciliation agent and one that fires monthly do not deserve the
    // same patience.
    expect(state.patient?.status).toBe("PENDING");
    expect(state.impatient?.status).toBe("EXPIRED");
  });

  test("the platform expiry window is configurable and floored", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => await ctx.db.insert("users", {
      email: "config-super@example.com",
      role: "SUPER_ADMIN",
    }));
    const client = t.withIdentity({ subject: superAdminId });

    expect(await client.query(api.agentRunApprovals.getApprovalExpiryConfig, {}))
      .toMatchObject({ expiryHours: 24, defaultHours: 24, minHours: 1 });

    await client.mutation(api.agentRunApprovals.updateApprovalExpiryConfig, { expiryHours: 6 });
    expect((await client.query(api.agentRunApprovals.getApprovalExpiryConfig, {})).expiryHours).toBe(6);

    // Floored by name, so the screen can say why rather than silently accepting a
    // window that makes the queue unanswerable.
    await expect(
      client.mutation(api.agentRunApprovals.updateApprovalExpiryConfig, { expiryHours: 0 })
    ).rejects.toThrow(/at least 1 hour/);

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLogs").collect());
    expect(audit.some((entry) => entry.entityId === "APPROVAL_EXPIRY_CONFIG")).toBe(true);
  });

  test("the approval queue is searchable by agent and tool name, server-side", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, emailApprovalId, lookupApprovalId } = await t.run(async (ctx) => {
      const superAdminId = await ctx.db.insert("users", {
        email: "search-super@example.com",
        role: "SUPER_ADMIN",
      });
      const emailAgentId = await ctx.db.insert("agents", {
        name: "Renewals Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const lookupAgentId = await ctx.db.insert("agents", {
        name: "Reporting Agent",
        modelId: "model-test",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const seedApproval = async (agentId: typeof emailAgentId, toolName: string) => {
        const runId = await ctx.db.insert("agentRuns", {
          agentId,
          triggerType: "CHAT",
          objective: `Objective for ${toolName}`,
          status: "PENDING_APPROVAL",
          startedAt: 100,
          updatedAt: 100,
        });
        const toolCallId = await ctx.db.insert("agentToolCalls", {
          runId,
          agentId,
          normalizedToolName: toolName,
          handlerMapping: `handler.${toolName}`,
          argumentsJson: "{}",
          status: "APPROVAL_REQUIRED",
          requiredRole: "ADMIN",
          sideEffectLevel: "WRITE",
          confirmationRequired: true,
          startedAt: 101,
        });
        return { runId, toolCallId, agentId };
      };

      const emailSeed = await seedApproval(emailAgentId, "email_send");
      const lookupSeed = await seedApproval(lookupAgentId, "report_read");

      // Inserted through the internal mutation, because that is what populates
      // the denormalised search text the index reads.
      const emailApprovalId = await ctx.runMutation(internal.agentRunApprovals.insertApprovalInternal, {
        runId: emailSeed.runId,
        toolCallId: emailSeed.toolCallId,
        agentId: emailSeed.agentId,
        status: "PENDING",
      });
      const lookupApprovalId = await ctx.runMutation(internal.agentRunApprovals.insertApprovalInternal, {
        runId: lookupSeed.runId,
        toolCallId: lookupSeed.toolCallId,
        agentId: lookupSeed.agentId,
        status: "PENDING",
      });

      return { superAdminId, emailApprovalId, lookupApprovalId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const byAgent = await superAdminClient.query(api.agentRunApprovals.getPendingApprovals, {
      paginationOpts,
      searchTerm: "Renewals",
    });
    expect(byAgent.page.map((entry) => entry.approval._id)).toEqual([emailApprovalId]);

    const byTool = await superAdminClient.query(api.agentRunApprovals.getPendingApprovals, {
      paginationOpts,
      searchTerm: "report_read",
    });
    expect(byTool.page.map((entry) => entry.approval._id)).toEqual([lookupApprovalId]);

    // No term means the whole queue, not an empty result.
    const unfiltered = await superAdminClient.query(api.agentRunApprovals.getPendingApprovals, { paginationOpts });
    expect(unfiltered.page).toHaveLength(2);

    const noMatch = await superAdminClient.query(api.agentRunApprovals.getPendingApprovals, {
      paginationOpts,
      searchTerm: "nothing matches this",
    });
    expect(noMatch.page).toHaveLength(0);
  });
});
