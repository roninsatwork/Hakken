import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { GOOGLE_VERTEX_PROVIDER_KEY, GOOGLE_VERTEX_EMBEDDING_MODEL_ID, SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";
import { getAgentTemplateById } from "./agentTemplates";
import { buildGlobalAgentRecord, buildCreateAgentFromTemplateAuditMetadata } from "./agentService";
import { ensureAgentVersionSnapshot } from "./agentVersioningService";
import { getAppTemplateById } from "./appTemplates";

const DEMO_COMPANY_NAME = "Sonae Demo Company";
const DEMO_SUPER_ADMIN_EMAIL = "demo-super-admin@sonae.test";
const DEMO_COMPANY_ADMIN_EMAIL = "demo-company-admin@sonae.test";
const DEMO_MODEL_ID = SYSTEM_FAILSAFE_MODEL_ID;
const DEMO_TEMPLATE_ID = "internal-knowledge-assistant";
const DEMO_KNOWLEDGE_TITLE = "Demo Knowledge Handbook";
const DEMO_TOOL_MAPPING = "knowledge.search";
const DEMO_TOOL_NAME = "Knowledge Search";
const DEMO_AGENT_NAME = "Demo Knowledge Assistant";
const DEMO_LAUNCH_PLAN_NAME = "Demo Launch Support Workspace";
const DEFAULT_USE_CASES = ["agent", "workflow", "chat", "report", "embedding"];

function assertLocalDemoSeedEnabled(secret: string) {
  if (process.env.LOCAL_DEMO_SEED_ENVIRONMENT === "production") {
    throw new Error("Local demo seed is not available in production.");
  }

  if (process.env.LOCAL_DEMO_SEED_ENABLED !== "1") {
    throw new Error("Local demo seed is disabled.");
  }

  const expectedSecret = process.env.LOCAL_DEMO_SEED_SECRET;
  if (!expectedSecret) {
    throw new Error("Local demo seed secret is not configured.");
  }

  if (secret !== expectedSecret) {
    throw new Error("Invalid local demo seed secret.");
  }
}

async function upsertCompany(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("companies")
    .withIndex("by_name", (q) => q.eq("name", DEMO_COMPANY_NAME))
    .first();
  const patch = {
    description: "Local seeded tenant for trying the agentic app foundation without production credentials.",
    overview: "Demo tenant with model defaults, starter knowledge, a knowledge search tool, and a draft template agent.",
    systemPrompt: "Demo tenant context: answer from approved knowledge and keep all actions tenant-scoped.",
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return { companyId: existing._id, action: "updated" as const };
  }

  return {
    companyId: await ctx.db.insert("companies", {
      name: DEMO_COMPANY_NAME,
      ...patch,
      createdAt: Date.now(),
    }),
    action: "created" as const,
  };
}

async function upsertUser(ctx: MutationCtx, args: {
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN";
  companyId?: Id<"companies">;
}) {
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", args.email))
    .first();
  const fields = {
    email: args.email,
    name: args.name,
    role: args.role,
    companyId: args.companyId,
    image: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(args.email)}`,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { userId: existing._id, email: args.email, action: "updated" as const };
  }

  return {
    userId: await ctx.db.insert("users", {
      ...fields,
      createdAt: Date.now(),
    }),
    email: args.email,
    action: "created" as const,
  };
}

async function upsertProvider(ctx: MutationCtx) {
  const now = Date.now();
  const existing = await ctx.db
    .query("aiProviders")
    .withIndex("by_provider_key", (q) => q.eq("providerKey", GOOGLE_VERTEX_PROVIDER_KEY))
    .first();
  const fields = {
    displayName: "Google Vertex AI",
    isEnabled: true,
    authMode: "environment",
    status: "unknown" as const,
    syncStatus: "local-demo-seeded",
    lastSyncedAt: now,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { providerKey: GOOGLE_VERTEX_PROVIDER_KEY, action: "updated" as const };
  }

  await ctx.db.insert("aiProviders", {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    ...fields,
    createdAt: now,
  });
  return { providerKey: GOOGLE_VERTEX_PROVIDER_KEY, action: "created" as const };
}

async function upsertModel(ctx: MutationCtx, args: {
  modelId: string;
  displayName: string;
  supportedUseCases: string[];
  providerModelId?: string;
}) {
  const now = Date.now();
  const existing = await ctx.db
    .query("aiModels")
    .withIndex("by_model_id", (q) => q.eq("modelId", args.modelId))
    .first();
  const fields = {
    modelId: args.modelId,
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    providerModelId: args.providerModelId ?? args.modelId,
    displayName: args.displayName,
    isEnabled: true,
    isDefault: args.modelId === DEMO_MODEL_ID,
    status: "local-demo-seeded",
    supportedUseCases: args.supportedUseCases,
    lastSyncedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { modelId: args.modelId, action: "updated" as const };
  }

  await ctx.db.insert("aiModels", fields);
  return { modelId: args.modelId, action: "created" as const };
}

async function upsertGlobalModelDefault(ctx: MutationCtx, args: {
  useCase: string;
  modelId: string;
  updatedBy: Id<"users">;
}) {
  const existing = await ctx.db
    .query("aiModelDefaults")
    .withIndex("by_scope_use_case", (q) => q.eq("scope", "global").eq("useCase", args.useCase))
    .first();
  const fields = {
    providerKey: GOOGLE_VERTEX_PROVIDER_KEY,
    modelId: args.modelId,
    updatedAt: Date.now(),
    updatedBy: args.updatedBy,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { useCase: args.useCase, action: "updated" as const };
  }

  await ctx.db.insert("aiModelDefaults", {
    scope: "global",
    useCase: args.useCase,
    ...fields,
  });
  return { useCase: args.useCase, action: "created" as const };
}

async function upsertKnowledgeTool(ctx: MutationCtx, createdBy: Id<"users">) {
  const tools = await ctx.db.query("aiTools").withIndex("by_createdAt").order("desc").take(250);
  const existing = tools.find((tool) => tool.handlerMapping === DEMO_TOOL_MAPPING);
  const fields = {
    name: DEMO_TOOL_NAME,
    description: "Search tenant-scoped and agent-linked knowledge documents.",
    handlerMapping: DEMO_TOOL_MAPPING,
    requiredRole: "ADMIN" as const,
    sideEffectLevel: "READ" as const,
    confirmationRequired: false,
    isActive: true,
    version: 1,
    updatedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { toolId: existing._id, action: "updated" as const };
  }

  return {
    toolId: await ctx.db.insert("aiTools", {
      ...fields,
      createdAt: Date.now(),
      createdBy,
    }),
    action: "created" as const,
  };
}

async function upsertDemoAgent(ctx: MutationCtx, createdBy: Id<"users">) {
  const template = getAgentTemplateById(DEMO_TEMPLATE_ID);
  if (!template) throw new Error("Demo agent template is missing.");

  const existing = await ctx.db
    .query("agents")
    .withIndex("by_name", (q) => q.eq("name", DEMO_AGENT_NAME))
    .first();
  const record = buildGlobalAgentRecord({
    name: DEMO_AGENT_NAME,
    description: "Draft local demo agent created from the internal knowledge assistant template.",
    modelId: DEMO_MODEL_ID,
    modelSelectionMode: "inherit",
    systemPrompt: template.systemPrompt,
    isActive: false,
    temperature: template.temperature,
    humanApprovalRequired: template.humanApprovalRequired,
    reasoningEffort: template.reasoningEffort,
    triggerType: template.triggerType,
  });

  if (existing) {
    await ctx.db.patch(existing._id, {
      ...record,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    });
    return { agentId: existing._id, template, action: "updated" as const };
  }

  const agentId = await ctx.db.insert("agents", record);
  await ctx.db.insert("auditLogs", {
    actorId: createdBy,
    actionType: "CREATE_AGENT_FROM_TEMPLATE",
    entityId: agentId,
    entityType: "agents",
    timestamp: Date.now(),
    metadata: buildCreateAgentFromTemplateAuditMetadata({
      name: DEMO_AGENT_NAME,
      templateId: template.id,
      builderIntent: {
        objective: "Try the governed agentic app foundation locally.",
        audience: "Developers and demo operators",
        approvalPolicy: "template",
        modelBehavior: "inherit",
        knowledgePlan: "seeded-demo",
        toolPlan: "seeded-demo",
        smokeEvalRequired: true,
        readinessAcknowledged: false,
      },
    }),
  });
  return { agentId, template, action: "created" as const };
}

async function upsertKnowledgeDocument(ctx: MutationCtx, args: {
  companyId: Id<"companies">;
  agentId: Id<"agents">;
  createdBy: Id<"users">;
}) {
  const existing = await ctx.db
    .query("knowledgeDocuments")
    .withIndex("by_agent_company", (q) => q.eq("agentId", args.agentId).eq("companyId", args.companyId))
    .filter((q) => q.eq(q.field("title"), DEMO_KNOWLEDGE_TITLE))
    .first();
  const fields = {
    title: DEMO_KNOWLEDGE_TITLE,
    textContent: [
      "Sonae Demo Company support policy:",
      "Use tenant-scoped knowledge before answering.",
      "Escalate billing, refunds, account changes, and destructive operations to a human admin.",
      "If the answer is not present in approved knowledge, say what is missing and ask for the right source document.",
    ].join("\n"),
    companyId: args.companyId,
    agentId: args.agentId,
    status: "ready" as const,
    format: "text/plain",
    embeddingProviderKey: GOOGLE_VERTEX_PROVIDER_KEY,
    embeddingModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
    embeddingProviderModelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
    embeddingDimensions: 768,
    createdBy: args.createdBy,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { documentId: existing._id, action: "updated" as const };
  }

  return {
    documentId: await ctx.db.insert("knowledgeDocuments", {
      ...fields,
      createdAt: Date.now(),
    }),
    action: "created" as const,
  };
}

async function ensureAgentToolBinding(ctx: MutationCtx, args: {
  agentId: Id<"agents">;
  toolId: Id<"aiTools">;
}) {
  const existing = await ctx.db
    .query("agentTools")
    .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
    .filter((q) => q.eq(q.field("toolId"), args.toolId))
    .first();
  if (existing) return { action: "existing" as const };

  await ctx.db.insert("agentTools", {
    agentId: args.agentId,
    toolId: args.toolId,
    assignedAt: Date.now(),
  });
  return { action: "created" as const };
}

async function ensureTemplateFixtures(ctx: MutationCtx, args: {
  agentId: Id<"agents">;
  companyId: Id<"companies">;
  createdBy: Id<"users">;
  template: NonNullable<ReturnType<typeof getAgentTemplateById>>;
}) {
  const activeFixtures = await ctx.db
    .query("agentEvalFixtures")
    .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "ACTIVE"))
    .take(50);
  const existingByObjective = new Set(activeFixtures.map((fixture) => fixture.objective));
  const now = Date.now();
  const agentVersionId = await ensureAgentVersionSnapshot(ctx, {
    agentId: args.agentId,
    companyId: args.companyId,
  });
  const sourceRunId = await ctx.db.insert("agentRuns", {
    agentId: args.agentId,
    agentVersionId,
    triggerType: "MANUAL",
    objective: `Template setup: ${args.template.name}`,
    status: "SUCCESS",
    companyId: args.companyId,
    userId: args.createdBy,
    startedAt: now,
    completedAt: now,
    updatedAt: now,
    finalOutput: "Local demo starter eval fixtures verified.",
  });

  const fixtureIds = [];
  for (const fixture of args.template.suggestedEvalFixtures) {
    if (existingByObjective.has(fixture.objective)) continue;
    fixtureIds.push(await ctx.db.insert("agentEvalFixtures", {
      agentId: args.agentId,
      agentVersionId,
      companyId: args.companyId,
      sourceRunId,
      createdBy: args.createdBy,
      type: fixture.type,
      objective: fixture.objective,
      expectedToolPlanJson: fixture.expectedToolPlanJson,
      expectedBlockedActionsJson: fixture.expectedBlockedActionsJson,
      expectedFinalOutputRubric: fixture.expectedFinalOutputRubric,
      sourceEvidenceJson: JSON.stringify({
        source: "local_demo_seed",
        templateId: args.template.id,
      }),
      tags: Array.from(new Set(["local-demo", ...fixture.tags])),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    }));
  }

  return { fixtureIds, action: fixtureIds.length > 0 ? "created" as const : "existing" as const };
}

function createDemoLaunchPlanPayload(templateId: string) {
  const template = getAppTemplateById(templateId);
  if (!template) throw new Error(`Demo app template is missing: ${templateId}`);

  return {
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    riskProfile: template.riskProfile,
    primaryUsers: template.primaryUsers,
    recommendedConnectorKeys: template.recommendedConnectorKeys,
    draftResources: {
      agents: template.agents,
      knowledgeScopes: template.knowledgeScopes,
      workflows: template.workflows,
      evalFixtures: template.evalFixtures,
      dashboardCards: template.dashboardCards,
      publishTargets: template.publishTargets,
    },
    readinessChecks: template.readinessChecks,
    safetyDefaults: {
      resourceStatus: "DRAFT",
      externalActionsRequireApproval: true,
      releaseGateRequired: true,
    },
  };
}

async function upsertLaunchPlan(ctx: MutationCtx, args: {
  templateId: string;
  targetCompanyName: string;
  notes: string;
  createdBy: Id<"users">;
  targetCompanyId?: Id<"companies">;
  createdResourceJson?: string;
  status?: "DRAFT" | "MATERIALIZED";
}) {
  const template = getAppTemplateById(args.templateId);
  if (!template) throw new Error(`Demo app template is missing: ${args.templateId}`);
  const existing = await ctx.db
    .query("appLaunchPlans")
    .withIndex("by_template_created", (q) => q.eq("templateId", args.templateId))
    .take(100)
    .then((plans) => plans.find((plan) => plan.targetCompanyName === args.targetCompanyName));
  const now = Date.now();
  const fields = {
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    riskProfile: template.riskProfile,
    status: args.status ?? "DRAFT" as const,
    targetCompanyId: args.targetCompanyId,
    targetCompanyName: args.targetCompanyName,
    notes: args.notes,
    planJson: JSON.stringify(createDemoLaunchPlanPayload(template.id)),
    createdResourceJson: args.createdResourceJson,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return { planId: existing._id, templateId: template.id, action: "updated" as const };
  }

  return {
    planId: await ctx.db.insert("appLaunchPlans", {
      ...fields,
      createdBy: args.createdBy,
      createdAt: now,
    }),
    templateId: template.id,
    action: "created" as const,
  };
}

export const seed = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertLocalDemoSeedEnabled(args.secret);

    const company = await upsertCompany(ctx);
    const superAdmin = await upsertUser(ctx, {
      email: DEMO_SUPER_ADMIN_EMAIL,
      name: "Demo Super Admin",
      role: "SUPER_ADMIN",
    });
    const companyAdmin = await upsertUser(ctx, {
      email: DEMO_COMPANY_ADMIN_EMAIL,
      name: "Demo Company Admin",
      role: "ADMIN",
      companyId: company.companyId,
    });
    const provider = await upsertProvider(ctx);
    const model = await upsertModel(ctx, {
      modelId: DEMO_MODEL_ID,
      displayName: "Default Generation Model (Local Demo)",
      supportedUseCases: ["agent", "workflow", "chat", "report", "router", "title"],
    });
    const embeddingModel = await upsertModel(ctx, {
      modelId: GOOGLE_VERTEX_EMBEDDING_MODEL_ID,
      displayName: "Text Embedding 004 (Local Demo)",
      supportedUseCases: ["embedding"],
    });
    const defaults = await Promise.all(DEFAULT_USE_CASES.map((useCase) =>
      upsertGlobalModelDefault(ctx, {
        useCase,
        modelId: useCase === "embedding" ? GOOGLE_VERTEX_EMBEDDING_MODEL_ID : DEMO_MODEL_ID,
        updatedBy: superAdmin.userId,
      })
    ));
    const tool = await upsertKnowledgeTool(ctx, superAdmin.userId);
    const agent = await upsertDemoAgent(ctx, superAdmin.userId);
    const knowledge = await upsertKnowledgeDocument(ctx, {
      companyId: company.companyId,
      agentId: agent.agentId,
      createdBy: superAdmin.userId,
    });
    await ctx.db.patch(agent.agentId, {
      knowledgeDocumentIds: [knowledge.documentId],
      updatedAt: Date.now(),
    });
    const binding = await ensureAgentToolBinding(ctx, {
      agentId: agent.agentId,
      toolId: tool.toolId,
    });
    const fixtures = await ensureTemplateFixtures(ctx, {
      agentId: agent.agentId,
      companyId: company.companyId,
      createdBy: superAdmin.userId,
      template: agent.template,
    });
    const materializedLaunchPlan = await upsertLaunchPlan(ctx, {
      templateId: "support-desk-ai",
      targetCompanyName: DEMO_LAUNCH_PLAN_NAME,
      notes: "Seeded demo plan with an existing linked workspace and draft knowledge assistant foundation.",
      createdBy: superAdmin.userId,
      targetCompanyId: company.companyId,
      createdResourceJson: JSON.stringify({
        agentIds: [agent.agentId],
        workflowIds: [],
        fixtureIds: fixtures.fixtureIds,
        sourceRunIds: [],
      }),
      status: "MATERIALIZED",
    });
    const draftLaunchPlan = await upsertLaunchPlan(ctx, {
      templateId: "sales-research-copilot",
      targetCompanyName: "Demo Sales Research Workspace",
      notes: "Seeded draft plan for showing the review flow before workspace and resource creation.",
      createdBy: superAdmin.userId,
    });

    return {
      company: {
        companyId: company.companyId,
        name: DEMO_COMPANY_NAME,
        action: company.action,
      },
      users: [
        { email: superAdmin.email, userId: superAdmin.userId, action: superAdmin.action },
        { email: companyAdmin.email, userId: companyAdmin.userId, action: companyAdmin.action },
      ],
      provider,
      models: [model, embeddingModel],
      defaults,
      tool: {
        toolId: tool.toolId,
        handlerMapping: DEMO_TOOL_MAPPING,
        action: tool.action,
      },
      agent: {
        agentId: agent.agentId,
        name: DEMO_AGENT_NAME,
        templateId: agent.template.id,
        action: agent.action,
      },
      knowledge: {
        documentId: knowledge.documentId,
        title: DEMO_KNOWLEDGE_TITLE,
        action: knowledge.action,
      },
      toolBinding: binding,
      evalFixtures: fixtures,
      launchPlans: [materializedLaunchPlan, draftLaunchPlan],
    };
  },
});
