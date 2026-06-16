import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { getAppTemplates } from "./appTemplates";

describe("app template catalogue", () => {
  test("provides varied launch templates with draft planning metadata", () => {
    const templates = getAppTemplates();
    const ids = new Set(templates.map((template) => template.id));
    const categories = new Set(templates.map((template) => template.category));

    expect(templates.length).toBeGreaterThanOrEqual(10);
    expect(ids.size).toBe(templates.length);
    expect(categories.size).toBeGreaterThanOrEqual(6);
    expect(templates.some((template) => template.recommendedConnectorKeys.includes("gmail"))).toBe(true);
    expect(templates.every((template) => template.agents.length > 0)).toBe(true);
    expect(templates.every((template) => template.evalFixtures.length > 0)).toBe(true);
    expect(templates.every((template) => template.readinessChecks.length > 0)).toBe(true);
    expect(templates.every((template) => template.developerFollowUps.length > 0)).toBe(true);
    expect(templates.every((template) => template.extensionPoints.length > 0)).toBe(true);
    expect(templates.every((template) => template.implementationPointers.length > 0)).toBe(true);
  });

  test("gallery query returns developer-ready app kits", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const templates = await superAdminClient.query(api.appTemplates.getAppTemplateGallery, {});
    const supportTemplate = templates.find((template) => template.id === "support-desk-ai");

    expect(supportTemplate?.developerFollowUps.length).toBeGreaterThan(0);
    expect(supportTemplate?.extensionPoints).toContain("Support tool handlers");
    expect(supportTemplate?.implementationPointers.some((pointer) => pointer.filePath === "convex/aiToolExecutionService.ts")).toBe(true);
  });

  test("super admins can persist draft launch plans from templates", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Acme",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      return { adminId, superAdminId };
    });

    const adminClient = t.withIdentity({ subject: adminId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      adminClient.mutation(api.appTemplates.createLaunchPlan, {
        templateId: "support-desk-ai",
      })
    ).rejects.toThrow("Unauthorized");

    const planId = await superAdminClient.mutation(api.appTemplates.createLaunchPlan, {
      templateId: "support-desk-ai",
      targetCompanyName: "Acme Support",
      notes: "First draft",
    });
    const knowledgeConnectorId = await superAdminClient.mutation(api.aiTools.installConnector, {
      key: "sonae-knowledge",
    });
    await superAdminClient.mutation(api.aiTools.testConnectorConnection, {
      connectorId: knowledgeConnectorId,
    });
    const plans = await superAdminClient.query(api.appTemplates.getRecentLaunchPlans, {});
    const persisted = plans.find((plan) => plan._id === planId);
    const details = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const connectorReadiness = details?.connectorReadiness ?? [];

    expect(persisted).toMatchObject({
      templateId: "support-desk-ai",
      templateName: "Support Desk AI",
      status: "DRAFT",
      targetCompanyName: "Acme Support",
      notes: "First draft",
    });
    const persistedPayload = JSON.parse(persisted?.planJson || "{}");

    expect(persistedPayload).toMatchObject({
      templateId: "support-desk-ai",
      safetyDefaults: {
        resourceStatus: "DRAFT",
        externalActionsRequireApproval: true,
        releaseGateRequired: true,
      },
    });
    expect(persistedPayload.developerFollowUps.length).toBeGreaterThan(0);
    expect(persistedPayload.extensionPoints).toContain("Support tool handlers");
    expect(persistedPayload.implementationPointers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: "convex/aiToolExecutionService.ts",
        }),
      ])
    );
    expect(details?.parsedPlan).toMatchObject({
      templateId: "support-desk-ai",
      draftResources: {
        agents: expect.arrayContaining(["Support Triage Agent"]),
      },
    });
    expect(connectorReadiness.find((connector) => connector.key === "sonae-knowledge")).toMatchObject({
      installed: true,
      testStatus: "SUCCESS",
    });
    expect(connectorReadiness.find((connector) => connector.key === "gmail")).toMatchObject({
      installed: false,
    });
    expect(details?.readinessSummary).toMatchObject({
      status: "IN_PROGRESS",
      plannedAgentCount: 3,
      createdAgentCount: 0,
      connectorReadyCount: 1,
      connectorTotalCount: 4,
    });
    expect(details?.developerHandoff).toMatchObject({
      status: "NEEDS_SCAFFOLDING",
      followUpCount: 3,
      extensionPointCount: 7,
      implementationPointerCount: 7,
      publishTargetCount: 3,
    });
    expect(details?.developerHandoff?.checklist).toContain("Create or link the tenant workspace for this build plan.");
    expect(details?.developerTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Workspace",
          status: "PENDING",
          title: "Create or link workspace",
          actionLabel: "Create workspace below",
        }),
        expect.objectContaining({
          category: "Connectors",
          status: "BLOCKED",
          title: "Set up recommended connectors",
          actionHref: "/admin/ai/tools",
        }),
        expect.objectContaining({
          category: "Code",
          status: "PENDING",
          title: "Complete product-specific implementation",
          actionLabel: "Review code pointers below",
        }),
      ])
    );
    expect(details?.developerTaskSummary).toMatchObject({
      blockedCount: 1,
      pendingCount: 5,
      readyCount: 0,
      nextTaskCategory: "Connectors",
      nextTaskTitle: "Set up recommended connectors",
      nextTaskStatus: "BLOCKED",
    });
    expect(details?.readinessSummary?.blockers).toContain("Draft resources have not been created.");

    await expect(superAdminClient.mutation(api.appTemplates.archiveLaunchPlan, { planId })).resolves.toBe(planId);
    const archived = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    expect(archived?.plan.status).toBe("ARCHIVED");
  });

  test("super admins can materialize draft launch plans into inactive resources", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const planId = await superAdminClient.mutation(api.appTemplates.createLaunchPlan, {
      templateId: "internal-knowledge-portal",
    });

    const resources = await superAdminClient.mutation(api.appTemplates.materializeLaunchPlan, { planId });
    const details = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const state = await t.run(async (ctx) => {
      const agents = await Promise.all(resources.agentIds.map((id) => ctx.db.get(id)));
      const workflows = await Promise.all(resources.workflowIds.map((id) => ctx.db.get(id)));
      const fixtures = await Promise.all(resources.fixtureIds.map((id) => ctx.db.get(id)));
      return { agents, workflows, fixtures };
    });

    expect(details?.plan.status).toBe("MATERIALIZED");
    expect(details?.createdResources?.agentIds).toEqual(resources.agentIds);
    expect(details?.readinessSummary).toMatchObject({
      status: "IN_PROGRESS",
      plannedAgentCount: 2,
      createdAgentCount: 2,
      plannedWorkflowCount: 2,
      createdWorkflowCount: 2,
    });
    expect(resources.agentIds.length).toBeGreaterThan(0);
    expect(resources.workflowIds.length).toBeGreaterThan(0);
    expect(resources.fixtureIds.length).toBeGreaterThan(0);
    expect(state.agents.every((agent) => agent?.isActive === false)).toBe(true);
    expect(state.workflows.every((workflow) => workflow?.isActive === false)).toBe(true);
    expect(state.fixtures.every((fixture) => fixture?.status === "ACTIVE")).toBe(true);

    await expect(superAdminClient.mutation(api.appTemplates.materializeLaunchPlan, { planId })).resolves.toEqual(resources);
  });

  test("super admins can create and link a workspace from a launch plan", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const planId = await superAdminClient.mutation(api.appTemplates.createLaunchPlan, {
      templateId: "support-desk-ai",
      targetCompanyName: "Acme Support",
    });

    const companyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId });
    const secondCallCompanyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId });
    const details = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const company = await t.run(async (ctx) => ctx.db.get(companyId));

    expect(secondCallCompanyId).toBe(companyId);
    expect(company).toMatchObject({
      name: "Acme Support",
    });
    expect(details?.plan.targetCompanyId).toBe(companyId);
    expect(details?.linkedWorkspace).toMatchObject({
      id: companyId,
      name: "Acme Support",
    });
  });
});
