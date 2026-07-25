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
    expect(templates.every((template) => template.recommendedSkills.length > 0)).toBe(true);
    expect(templates.some((template) => template.recommendedSkills.includes("Approval Handoff"))).toBe(true);
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
    expect(supportTemplate?.recommendedSkills).toEqual(expect.arrayContaining(["Document Extraction", "Approval Handoff"]));
    expect(supportTemplate?.extensionPoints).toContain("Support tool handlers");
    expect(supportTemplate?.implementationPointers.some((pointer) => pointer.filePath === "convex/aiToolExecutionService.ts")).toBe(true);
  });

  test("super admins can sync and edit the persisted app kit registry", async () => {
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

    await expect(adminClient.mutation(api.appTemplates.syncAppTemplateCatalogRegistry, {})).rejects.toThrow("Unauthorized");

    const beforeSync = await superAdminClient.query(api.appTemplates.getAppTemplateCatalogRegistry, {});
    expect(beforeSync.every((item) => item.registry === null)).toBe(true);

    const syncResult = await superAdminClient.mutation(api.appTemplates.syncAppTemplateCatalogRegistry, {});
    expect(syncResult).toMatchObject({
      createdCount: getAppTemplates().length,
      updatedCount: 0,
      totalCount: getAppTemplates().length,
    });

    const itemId = await superAdminClient.mutation(api.appTemplates.updateAppTemplateCatalogItem, {
      templateId: "support-desk-ai",
      lifecycleStatus: "NEEDS_REVIEW",
      ownerEmail: "catalog@example.com",
      editorialNotes: "Review support positioning.",
    });
    const afterUpdate = await superAdminClient.query(api.appTemplates.getAppTemplateCatalogRegistry, {});
    const supportRegistry = afterUpdate.find((item) => item.templateId === "support-desk-ai");

    expect(itemId).toBeTruthy();
    expect(supportRegistry).toMatchObject({
      templateName: "Support Desk AI",
      registry: {
        lifecycleStatus: "NEEDS_REVIEW",
        ownerEmail: "catalog@example.com",
        editorialNotes: "Review support positioning.",
      },
      isSynced: true,
    });

    await expect(superAdminClient.mutation(api.appTemplates.syncAppTemplateCatalogRegistry, {})).resolves.toMatchObject({
      createdCount: 0,
      updatedCount: getAppTemplates().length,
    });
    const afterResync = await superAdminClient.query(api.appTemplates.getAppTemplateCatalogRegistry, {});
    expect(afterResync.find((item) => item.templateId === "support-desk-ai")?.registry).toMatchObject({
      lifecycleStatus: "NEEDS_REVIEW",
      ownerEmail: "catalog@example.com",
      editorialNotes: "Review support positioning.",
    });
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
      setupOverrides: {
        brandProductName: "Acme Help",
        brandAccentHex: "#0f766e",
        firstAdminEmail: "owner@acme.example",
        invitePolicyNotes: "Platform owner sends the first invite.",
        modelDefaultUseCases: ["agent", "workflow", "chat"],
        targetPlanName: "Scale",
        connectorOwnerEmail: "integrations@acme.example",
        selectedConnectorKeys: ["zendesk", "sonae-knowledge"],
        connectorBundleNotes: "Zendesk OAuth needs customer approval.",
        knowledgeOwnerEmail: "docs@acme.example",
        starterKnowledgeSources: ["Help Center", "Refund SOP"],
        knowledgeSourceNotes: "Missing billing edge cases.",
        surfaceOwnerEmail: "surfaces@acme.example",
        selectedPublishTargets: ["Internal app", "Support widget"],
        publishSurfaceNotes: "Widget embed needs branded QA.",
      },
    });
    const knowledgeConnectorId = await superAdminClient.mutation(api.aiTools.installConnector, {
      key: "sonae-knowledge",
    });
    await superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, {
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
      recommendedConnectorKeys: ["zendesk", "sonae-knowledge"],
      workspaceSetup: {
        brand: {
          title: "Brand and theme",
          savedInputs: ["Product name: Acme Help", "Brand accent candidate: #0f766e"],
        },
        invitePolicy: {
          firstAdminRole: "ADMIN",
          savedInputs: ["First admin candidate: owner@acme.example", "Invite policy note: Platform owner sends the first invite."],
        },
        modelDefaults: {
          useCases: ["agent", "workflow", "chat"],
          savedInputs: ["Requested defaults: agent, workflow, chat"],
        },
        planAssignment: {
          title: "Plan assignment",
          savedInputs: ["Target plan candidate: Scale"],
        },
      },
      connectorBundle: {
        title: "Connector bundle plan",
        connectorKeys: ["zendesk", "sonae-knowledge"],
        savedInputs: [
          "Connector owner: integrations@acme.example",
          "Selected connectors: zendesk, sonae-knowledge",
          "Connector note: Zendesk OAuth needs customer approval.",
        ],
      },
      knowledgeImport: {
        title: "Starter knowledge import",
        scopes: expect.arrayContaining(["Help center", "Refund policy"]),
        savedInputs: [
          "Knowledge owner: docs@acme.example",
          "Import note: Missing billing edge cases.",
          "Source candidates: Help Center, Refund SOP",
        ],
      },
      publishSurface: {
        title: "Publish surface plan",
        targets: ["Internal app", "Support widget"],
        dashboardCards: expect.arrayContaining(["Open high-risk cases"]),
        savedInputs: [
          "Surface owner: surfaces@acme.example",
          "Selected targets: Internal app, Support widget",
          "Surface note: Widget embed needs branded QA.",
        ],
      },
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
        recommendedSkills: expect.arrayContaining(["Document Extraction", "Approval Handoff"]),
      },
    });
    expect(connectorReadiness.find((connector) => connector.key === "sonae-knowledge")).toMatchObject({
      installed: true,
      testStatus: "SUCCESS",
    });
    expect(connectorReadiness.find((connector) => connector.key === "zendesk")).toMatchObject({
      installed: false,
    });
    expect(details?.readinessSummary).toMatchObject({
      status: "IN_PROGRESS",
      plannedAgentCount: 3,
      createdAgentCount: 0,
      connectorReadyCount: 1,
      connectorTotalCount: 2,
    });
    expect(details?.developerHandoff).toMatchObject({
      status: "NEEDS_SCAFFOLDING",
      followUpCount: 3,
      extensionPointCount: 7,
      implementationPointerCount: 7,
      publishTargetCount: 3,
    });
    expect(details?.developerHandoff?.checklist).toContain("Create or link the tenant workspace for this build plan.");
    expect(details?.developerHandoff?.checklist).toContain("Review workspace brand, first-admin invite policy, model defaults, and plan assignment before handoff.");
    expect(details?.developerHandoff?.checklist).toContain("Confirm connector bundle ownership, auth mode, tenant scope, and Marketplace setup before activation.");
    expect(details?.developerTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Workspace",
          status: "PENDING",
          title: "Create or link workspace",
          actionLabel: "Create workspace below",
        }),
        expect.objectContaining({
          category: "Brand",
          status: "BLOCKED",
          title: "Confirm workspace brand",
          actionLabel: "Create workspace first",
        }),
        expect.objectContaining({
          category: "Access",
          status: "BLOCKED",
          title: "Invite first admin",
        }),
        expect.objectContaining({
          category: "Models",
          status: "BLOCKED",
          title: "Set tenant model defaults",
          actionHref: "/admin/ai/models",
        }),
        expect.objectContaining({
          category: "Plan",
          status: "BLOCKED",
          title: "Assign billing plan",
        }),
        expect.objectContaining({
          category: "Connectors",
          status: "BLOCKED",
          title: "Set up recommended connectors",
          actionHref: "/admin/ai/tools",
        }),
        expect.objectContaining({
          category: "Surfaces",
          status: "PENDING",
          title: "Plan publish surfaces",
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
      blockedCount: 5,
      pendingCount: 6,
      readyCount: 0,
      nextTaskCategory: "Brand",
      nextTaskTitle: "Confirm workspace brand",
      nextTaskStatus: "BLOCKED",
    });
    expect(details?.workspaceSetupActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "brand",
          title: "Apply brand and profile intent",
          status: "BLOCKED",
          actionLabel: "Create workspace first",
          savedInputs: ["Product name: Acme Help", "Brand accent candidate: #0f766e"],
        }),
        expect.objectContaining({
          key: "modelDefaults",
          title: "Review model defaults",
          status: "PENDING",
          actionLabel: "Open global model defaults",
          actionHref: "/admin/ai/models",
        }),
      ])
    );
    expect(details?.surfaceImplementationActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "target-internal-app",
          kind: "target",
          title: "Review Internal app",
          status: "PENDING",
          actionHref: "/app",
        }),
        expect.objectContaining({
          key: "target-support-widget",
          kind: "target",
          title: "Review Support widget",
          actionHref: "/admin/ai/widget",
        }),
        expect.objectContaining({
          key: "dashboard-open-high-risk-cases",
          kind: "dashboardCard",
          title: "Map dashboard card: Open high-risk cases",
          actionHref: "/app/reports",
        }),
      ])
    );
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
    await superAdminClient.mutation(api.agentSkills.seedStarterSkills, {});

    const resources = await superAdminClient.mutation(api.appTemplates.materializeLaunchPlan, { planId });
    const details = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const state = await t.run(async (ctx) => {
      const agents = await Promise.all(resources.agentIds.map((id) => ctx.db.get(id)));
      const workflows = await Promise.all(resources.workflowIds.map((id) => ctx.db.get(id)));
      const fixtures = await Promise.all(resources.fixtureIds.map((id) => ctx.db.get(id)));
      const skillBindings = await Promise.all((resources.skillBindingIds ?? []).map((id) => ctx.db.get(id)));
      const skills = await Promise.all(skillBindings.flatMap((binding) => binding ? [ctx.db.get(binding.skillId)] : []));
      return { agents, workflows, fixtures, skillBindings, skills };
    });

    expect(details?.plan.status).toBe("MATERIALIZED");
    expect(details?.createdResources?.agentIds).toEqual(resources.agentIds);
    expect(details?.createdResources?.skillBindingIds).toEqual(resources.skillBindingIds);
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
    expect(resources.skillBindingIds).toHaveLength(4);
    expect(state.agents.every((agent) => agent?.isActive === false)).toBe(true);
    expect(state.workflows.every((workflow) => workflow?.isActive === false)).toBe(true);
    expect(state.fixtures.every((fixture) => fixture?.status === "ACTIVE")).toBe(true);
    expect(state.skillBindings).toHaveLength(4);
    expect(state.skillBindings.every((binding) => binding?.isEnabled === true)).toBe(true);
    expect(new Set(state.skills.map((skill) => skill?.name))).toEqual(new Set(["Research Briefing", "Document Extraction"]));
    expect(details?.createdResourceDetails?.skillBindingCount).toBe(4);

    await expect(superAdminClient.mutation(api.appTemplates.materializeLaunchPlan, { planId })).resolves.toEqual(resources);
  });

  test("super admins can create and link a workspace from a launch plan", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { superAdminId, existingCompanyId } = await t.run(async (ctx) => {
      const existingCompanyId = await ctx.db.insert("companies", {
        name: "Existing Support Workspace",
        createdAt: Date.now(),
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      return { superAdminId, existingCompanyId };
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const planId = await superAdminClient.mutation(api.appTemplates.createLaunchPlan, {
      templateId: "support-desk-ai",
      targetCompanyName: "Acme Support",
    });
    const createPlanId = await superAdminClient.mutation(api.appTemplates.createLaunchPlan, {
      templateId: "internal-knowledge-portal",
      targetCompanyName: "Knowledge Workspace",
    });

    const createdCompanyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId: createPlanId });
    const secondCreatedCompanyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId: createPlanId });
    const createdDetails = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId: createPlanId });

    const linkedExistingId = await superAdminClient.mutation(api.appTemplates.linkWorkspaceToLaunchPlan, {
      planId,
      companyId: existingCompanyId,
    });
    const linkedExistingDetails = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const companyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId });
    const secondCallCompanyId = await superAdminClient.mutation(api.appTemplates.createWorkspaceForLaunchPlan, { planId });
    const details = await superAdminClient.query(api.appTemplates.getLaunchPlanDetails, { planId });
    const { company, createdCompany, linkAudits } = await t.run(async (ctx) => {
      const company = await ctx.db.get(companyId);
      const createdCompany = await ctx.db.get(createdCompanyId);
      const linkAudits = await ctx.db
        .query("auditLogs")
        .withIndex("by_timestamp")
        .collect()
        .then((logs) => logs.filter((log) => log.actionType === "LINK_APP_LAUNCH_PLAN_WORKSPACE"));
      return { company, createdCompany, linkAudits };
    });

    expect(secondCreatedCompanyId).toBe(createdCompanyId);
    expect(createdCompany).toMatchObject({
      name: "Knowledge Workspace",
    });
    expect(createdDetails?.linkedWorkspace).toMatchObject({
      id: createdCompanyId,
      name: "Knowledge Workspace",
    });
    expect(linkedExistingId).toBe(existingCompanyId);
    expect(linkedExistingDetails?.linkedWorkspace).toMatchObject({
      id: existingCompanyId,
      name: "Existing Support Workspace",
    });
    expect(linkedExistingDetails?.workspaceSetupActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "brand",
          status: "PENDING",
          actionHref: `/admin/companies/${existingCompanyId}`,
        }),
        expect.objectContaining({
          key: "invitePolicy",
          status: "PENDING",
          actionHref: `/admin/companies/${existingCompanyId}/directory/invites`,
        }),
        expect.objectContaining({
          key: "modelDefaults",
          actionHref: `/admin/companies/${existingCompanyId}/models`,
        }),
      ])
    );
    expect(companyId).toBe(existingCompanyId);
    expect(secondCallCompanyId).toBe(existingCompanyId);
    expect(company).toMatchObject({
      name: "Existing Support Workspace",
    });
    expect(details?.plan.targetCompanyId).toBe(existingCompanyId);
    expect(details?.linkedWorkspace).toMatchObject({
      id: existingCompanyId,
      name: "Existing Support Workspace",
    });
    expect(linkAudits.length).toBeGreaterThanOrEqual(1);
  });
});
