import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany, requireAdmin } from "./authz";
import { recordCompanyAiDriftEvent } from "./companyReadiness";

const TEXT_MAX_CHARS = 8000;
const DESCRIPTION_MAX_CHARS = 1200;
const JSON_MAX_CHARS = 16000;
const CATEGORY_MAX_CHARS = 80;
const VERSION_MAX_CHARS = 80;
const CENTRAL_SKILL_ONLY_ERROR = "Company skills must be added from the central Skill Center. Create or edit the skill in Skill Center, then select it for this company.";
const CENTRAL_SKILL_FIELDS = [
  "name",
  "description",
  "category",
  "riskLevel",
  "instruction",
  "requiredToolsJson",
  "recommendedKnowledgeJson",
  "versionLabel",
];

const skillStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("ARCHIVED")
);

const skillRiskValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH")
);

const skillSurfaceValidator = v.union(
  v.literal("COMPANY_CHAT"),
  v.literal("WIDGET"),
  v.literal("AGENT"),
  v.literal("WORKFLOW"),
  v.literal("APP_KIT")
);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function normalizeText(value: string | undefined, label: string, maxChars = TEXT_MAX_CHARS) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxChars) throw new Error(`${label} cannot exceed ${maxChars} characters.`);
  return normalized;
}

function normalizeOptionalText(value: string | undefined, maxChars = TEXT_MAX_CHARS) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxChars) throw new Error(`Text cannot exceed ${maxChars} characters.`);
  return normalized;
}

function normalizeCategory(value: string | undefined) {
  const normalized = (value || "GENERAL").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  return normalized.length > 0 ? normalized.slice(0, CATEGORY_MAX_CHARS) : "GENERAL";
}

function parseJson(value: string | undefined, label: string) {
  const normalized = normalizeOptionalText(value, JSON_MAX_CHARS);
  if (!normalized) return undefined;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function parseStringArrayJson(value: string | undefined, label: string) {
  const parsed = parseJson(value, label);
  if (parsed === undefined) return { json: undefined, values: [] as string[] };
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a JSON array of strings.`);
  }

  const values = Array.from(new Set(parsed.map((entry) => entry.trim()).filter(Boolean))).slice(0, 50);
  return {
    values,
    json: values.length > 0 ? JSON.stringify(values) : undefined,
  };
}

function normalizeOptionalJson(value: string | undefined, label: string) {
  const parsed = parseJson(value, label);
  return parsed === undefined ? undefined : stableStringify(parsed);
}

function parseStoredStringArray(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

function hasStoredJson(value: string | undefined) {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function buildSkillPatch(args: {
  name?: string;
  description?: string;
  category?: string;
  status?: Doc<"companySkills">["status"];
  riskLevel?: Doc<"companySkills">["riskLevel"];
  instruction?: string;
  inputContractJson?: string;
  outputContractJson?: string;
  requiredToolsJson?: string;
  approvalPolicyJson?: string;
  recommendedKnowledgeJson?: string;
  versionLabel?: string;
}) {
  const requiredTools = args.requiredToolsJson !== undefined
    ? parseStringArrayJson(args.requiredToolsJson, "Required tools")
    : undefined;

  return {
    ...(args.name !== undefined ? { name: normalizeText(args.name, "Skill name", 160) } : {}),
    ...(args.description !== undefined ? { description: normalizeOptionalText(args.description, DESCRIPTION_MAX_CHARS) } : {}),
    ...(args.category !== undefined ? { category: normalizeCategory(args.category) } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.riskLevel !== undefined ? { riskLevel: args.riskLevel } : {}),
    ...(args.instruction !== undefined ? { instruction: normalizeText(args.instruction, "Skill instruction") } : {}),
    ...(args.inputContractJson !== undefined ? { inputContractJson: normalizeOptionalJson(args.inputContractJson, "Input contract") } : {}),
    ...(args.outputContractJson !== undefined ? { outputContractJson: normalizeOptionalJson(args.outputContractJson, "Output contract") } : {}),
    ...(args.requiredToolsJson !== undefined ? { requiredToolsJson: requiredTools?.json } : {}),
    ...(args.approvalPolicyJson !== undefined ? { approvalPolicyJson: normalizeOptionalJson(args.approvalPolicyJson, "Approval policy") } : {}),
    ...(args.recommendedKnowledgeJson !== undefined ? { recommendedKnowledgeJson: normalizeOptionalJson(args.recommendedKnowledgeJson, "Recommended knowledge") } : {}),
    ...(args.versionLabel !== undefined ? { versionLabel: normalizeOptionalText(args.versionLabel, VERSION_MAX_CHARS) } : {}),
  };
}

async function requireCompanyAccess(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const { user, userId } = await requireAdmin(ctx);
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");
  assertAdminCanAccessCompany(user, companyId);
  return { userId, company };
}

async function requireSkillAccess(ctx: QueryCtx | MutationCtx, skillId: Id<"companySkills">) {
  const skill = await ctx.db.get(skillId);
  if (!skill) throw new Error("Company skill not found");
  const access = await requireCompanyAccess(ctx, skill.companyId);
  return { ...access, skill };
}

function getSkillReadiness(skill: Doc<"companySkills">) {
  const requiredTools = parseStoredStringArray(skill.requiredToolsJson);
  return {
    requiredTools,
    hasRequiredTools: requiredTools.length > 0,
    hasInputContract: hasStoredJson(skill.inputContractJson),
    hasOutputContract: hasStoredJson(skill.outputContractJson),
    hasApprovalPolicy: hasStoredJson(skill.approvalPolicyJson),
  };
}

export const getSummary = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);

    const skills = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(1000);
    const drafts = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "DRAFT"))
      .take(1000);
    const bindings = await ctx.db
      .query("companySkillBindings")
      .withIndex("by_company_surface_enabled", (q) => q.eq("companyId", args.companyId).eq("surfaceType", "COMPANY_CHAT").eq("isEnabled", true))
      .take(1000);
    const otherEnabledBindings = await Promise.all((["WIDGET", "AGENT", "WORKFLOW", "APP_KIT"] as const).map((surfaceType) =>
      ctx.db
        .query("companySkillBindings")
        .withIndex("by_company_surface_enabled", (q) => q.eq("companyId", args.companyId).eq("surfaceType", surfaceType).eq("isEnabled", true))
        .take(1000)
    ));
    const enabledBindings = [...bindings, ...otherEnabledBindings.flat()];
    const activeSkillIds = new Set(skills.map((skill) => skill._id));
    const boundActiveSkillIds = new Set(enabledBindings.filter((binding) => activeSkillIds.has(binding.skillId)).map((binding) => binding.skillId));
    const missingToolRequirementSkills = skills.filter((skill) => {
      const readiness = getSkillReadiness(skill);
      return boundActiveSkillIds.has(skill._id) && skill.riskLevel !== "LOW" && !readiness.hasRequiredTools;
    });
    const highRiskMissingApproval = skills.filter((skill) =>
      boundActiveSkillIds.has(skill._id)
      && skill.riskLevel === "HIGH"
      && !getSkillReadiness(skill).hasApprovalPolicy
    );

    return {
      activeSkills: skills.length,
      draftSkills: drafts.length,
      enabledBindings: enabledBindings.length,
      boundActiveSkills: boundActiveSkillIds.size,
      highRiskSkills: skills.filter((skill) => skill.riskLevel === "HIGH").length,
      missingToolRequirementSkills: missingToolRequirementSkills.length,
      highRiskMissingApproval: highRiskMissingApproval.length,
      readySkills: skills.filter((skill) => {
        const readiness = getSkillReadiness(skill);
        return boundActiveSkillIds.has(skill._id)
          && (skill.riskLevel === "LOW" || readiness.hasRequiredTools)
          && (skill.riskLevel !== "HIGH" || readiness.hasApprovalPolicy);
      }).length,
    };
  },
});

export const getRuntimePreviewForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
    const activeSkills = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .order("desc")
      .take(100);
    const enabledBindingGroups = await Promise.all((["COMPANY_CHAT", "WIDGET", "AGENT", "WORKFLOW", "APP_KIT"] as const).map((surfaceType) =>
      ctx.db
        .query("companySkillBindings")
        .withIndex("by_company_surface_enabled", (q) => q.eq("companyId", args.companyId).eq("surfaceType", surfaceType).eq("isEnabled", true))
        .take(100)
    ));
    const enabledSkillIds = new Set(enabledBindingGroups.flat().map((binding) => binding.skillId));

    return activeSkills
      .filter((skill) => enabledSkillIds.has(skill._id))
      .slice(0, limit)
      .map((skill) => ({
        skillId: skill._id,
        name: skill.name,
        category: skill.category,
        riskLevel: skill.riskLevel,
        requiredTools: parseStoredStringArray(skill.requiredToolsJson),
      }));
  },
});

export const getSkillsForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    status: v.optional(skillStatusValidator),
    searchTerm: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    const searchTerm = args.searchTerm?.trim();

    // Searching narrows in the database, and the company and status narrow with
    // it, so a page comes back full rather than sifted after the fact.
    if (searchTerm) {
      return await ctx.db
        .query("companySkills")
        .withSearchIndex("search_name", (q) =>
          q.search("name", searchTerm).eq("companyId", args.companyId).eq("status", args.status ?? "ACTIVE"))
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", args.status ?? "ACTIVE"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Central skills this company has not taken yet — searched and paged.
 *
 * `getImportableGlobalSkills` reads the first 250 active skills and filters
 * them in one go, so past 250 a skill simply could not be added to a company
 * and nothing said so. The library is meant to grow to hundreds, which makes
 * that a real ceiling rather than a theoretical one.
 *
 * The exclusion list is the company's own skills, which is a small,
 * company-scoped read; the catalogue side is what pages.
 */
export const searchImportableGlobalSkills = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    const searchTerm = args.searchTerm?.trim();

    const [companyActiveSkills, companyDraftSkills] = await Promise.all([
      ctx.db
        .query("companySkills")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
        .take(1000),
      ctx.db
        .query("companySkills")
        .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "DRAFT"))
        .take(1000),
    ]);
    const alreadyTaken = new Set(
      [...companyActiveSkills, ...companyDraftSkills]
        .map((skill) => skill.sourceAgentSkillId)
        .filter((skillId): skillId is Id<"agentSkills"> => Boolean(skillId)),
    );

    const result = searchTerm
      ? await ctx.db
          .query("agentSkills")
          .withSearchIndex("search_name", (q) => q.search("name", searchTerm).eq("status", "ACTIVE"))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("agentSkills")
          .withIndex("by_status_created", (q) => q.eq("status", "ACTIVE"))
          .order("desc")
          .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.filter((skill) => !alreadyTaken.has(skill._id)),
    };
  },
});

export const getImportableGlobalSkills = adminQuery({
  args: {
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    const activeSkills = await ctx.db
      .query("agentSkills")
      .withIndex("by_status_created", (q) => q.eq("status", "ACTIVE"))
      .order("desc")
      .take(250);
    const companyActiveSkills = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(1000);
    const companyDraftSkills = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "DRAFT"))
      .take(1000);
    const selectedCentralSkillIds = new Set(
      [...companyActiveSkills, ...companyDraftSkills]
        .map((skill) => skill.sourceAgentSkillId)
        .filter((skillId): skillId is Id<"agentSkills"> => Boolean(skillId))
    );

    return activeSkills.filter((skill) => !selectedCentralSkillIds.has(skill._id));
  },
});

export const getBindingsForSkill = adminQuery({
  args: {
    skillId: v.id("companySkills"),
  },
  handler: async (ctx, args) => {
    const { skill } = await requireSkillAccess(ctx, args.skillId);
    return await ctx.db
      .query("companySkillBindings")
      .withIndex("by_company_skill_enabled", (q) => q.eq("companyId", skill.companyId).eq("skillId", args.skillId))
      .take(100);
  },
});

export const createSkill = adminMutation({
  args: {
    companyId: v.id("companies"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    status: skillStatusValidator,
    riskLevel: skillRiskValidator,
    instruction: v.string(),
    inputContractJson: v.optional(v.string()),
    outputContractJson: v.optional(v.string()),
    requiredToolsJson: v.optional(v.string()),
    approvalPolicyJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    versionLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.companyId);
    throw new Error(CENTRAL_SKILL_ONLY_ERROR);
  },
});

export const importGlobalSkill = adminMutation({
  args: {
    companyId: v.id("companies"),
    skillId: v.id("agentSkills"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireCompanyAccess(ctx, args.companyId);
    const globalSkill = await ctx.db.get(args.skillId);
    if (!globalSkill || globalSkill.status !== "ACTIVE") {
      throw new Error("Only active global skills can be imported.");
    }
    const existing = await ctx.db
      .query("companySkills")
      .withIndex("by_company_source_skill", (q) => q.eq("companyId", args.companyId).eq("sourceAgentSkillId", args.skillId))
      .first();
    const now = Date.now();
    const centralSkillPatch = buildSkillPatch({
      name: globalSkill.name,
      description: globalSkill.description,
      category: globalSkill.category,
      status: "ACTIVE",
      riskLevel: globalSkill.riskLevel,
      instruction: globalSkill.instruction,
      requiredToolsJson: globalSkill.requiredToolMappingsJson,
      recommendedKnowledgeJson: globalSkill.recommendedKnowledgeJson,
      versionLabel: "Central skill",
    });

    if (existing) {
      if (existing.status !== "ARCHIVED") return { skillId: existing._id };

      await ctx.db.patch(existing._id, {
        sourceAgentSkillId: args.skillId,
        ...centralSkillPatch,
        status: "ACTIVE",
        archivedBy: undefined,
        archivedAt: undefined,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "ADD_CENTRAL_SKILL_TO_COMPANY",
        entityId: existing._id,
        entityType: "companySkills",
        companyId: args.companyId,
        timestamp: now,
        metadata: JSON.stringify({
          globalSkillId: args.skillId,
          globalSkillName: globalSkill.name,
          status: "ACTIVE",
          revived: true,
        }),
      });
      await recordCompanyAiDriftEvent(ctx, {
        companyId: args.companyId,
        sourceType: "SKILL",
        sourceId: existing._id,
        reason: "Central skill was added to the company.",
        affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
        createdBy: userId,
        createdAt: now,
      });

      return { skillId: existing._id };
    }

    const existingCompanySkills = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "ACTIVE"))
      .take(1000);
    const existingDrafts = await ctx.db
      .query("companySkills")
      .withIndex("by_company_status_updated", (q) => q.eq("companyId", args.companyId).eq("status", "DRAFT"))
      .take(1000);
    const existingNames = new Set([...existingCompanySkills, ...existingDrafts].map((skill) => skill.name.trim().toLowerCase()));
    const importedName = existingNames.has(globalSkill.name.trim().toLowerCase())
      ? `${globalSkill.name} Copy`
      : globalSkill.name;
    const patch = buildSkillPatch({
      name: importedName,
      description: globalSkill.description,
      category: globalSkill.category,
      status: "ACTIVE",
      riskLevel: globalSkill.riskLevel,
      instruction: globalSkill.instruction,
      requiredToolsJson: globalSkill.requiredToolMappingsJson,
      recommendedKnowledgeJson: globalSkill.recommendedKnowledgeJson,
      versionLabel: "Central skill",
    });
    const companySkillId = await ctx.db.insert("companySkills", {
      companyId: args.companyId,
      sourceAgentSkillId: args.skillId,
      name: patch.name ?? importedName,
      description: patch.description,
      category: patch.category ?? globalSkill.category,
      status: "ACTIVE",
      riskLevel: patch.riskLevel ?? globalSkill.riskLevel,
      instruction: patch.instruction ?? globalSkill.instruction,
      requiredToolsJson: patch.requiredToolsJson,
      recommendedKnowledgeJson: patch.recommendedKnowledgeJson,
      versionLabel: patch.versionLabel,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ADD_CENTRAL_SKILL_TO_COMPANY",
      entityId: companySkillId,
      entityType: "companySkills",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        globalSkillId: args.skillId,
        globalSkillName: globalSkill.name,
        status: "ACTIVE",
        riskLevel: globalSkill.riskLevel,
        category: patch.category,
      }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: args.companyId,
      sourceType: "SKILL",
      sourceId: companySkillId,
      reason: "Central skill was added to the company.",
      affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
      createdBy: userId,
      createdAt: now,
    });

    return { skillId: companySkillId };
  },
});

export const updateSkill = adminMutation({
  args: {
    skillId: v.id("companySkills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(skillStatusValidator),
    riskLevel: v.optional(skillRiskValidator),
    instruction: v.optional(v.string()),
    inputContractJson: v.optional(v.string()),
    outputContractJson: v.optional(v.string()),
    requiredToolsJson: v.optional(v.string()),
    approvalPolicyJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    versionLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, skill } = await requireSkillAccess(ctx, args.skillId);
    if (skill.status === "ARCHIVED") throw new Error("Archived skills cannot be edited.");
    if (skill.sourceAgentSkillId) {
      const changedCentralFields = CENTRAL_SKILL_FIELDS.filter((field) => {
        if (field === "name") return args.name !== undefined;
        if (field === "description") return args.description !== undefined;
        if (field === "category") return args.category !== undefined;
        if (field === "riskLevel") return args.riskLevel !== undefined;
        if (field === "instruction") return args.instruction !== undefined;
        if (field === "requiredToolsJson") return args.requiredToolsJson !== undefined;
        if (field === "recommendedKnowledgeJson") return args.recommendedKnowledgeJson !== undefined;
        if (field === "versionLabel") return args.versionLabel !== undefined;
        return false;
      });
      if (changedCentralFields.length > 0) throw new Error(CENTRAL_SKILL_ONLY_ERROR);
    }
    const now = Date.now();
    const patch = buildSkillPatch({
      name: args.name,
      description: args.description,
      category: args.category,
      status: args.status,
      riskLevel: args.riskLevel,
      instruction: args.instruction,
      inputContractJson: args.inputContractJson,
      outputContractJson: args.outputContractJson,
      requiredToolsJson: args.requiredToolsJson,
      approvalPolicyJson: args.approvalPolicyJson,
      recommendedKnowledgeJson: args.recommendedKnowledgeJson,
      versionLabel: args.versionLabel,
    });

    await ctx.db.patch(args.skillId, {
      ...patch,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_COMPANY_SKILL",
      entityId: args.skillId,
      entityType: "companySkills",
      companyId: skill.companyId,
      timestamp: now,
      metadata: JSON.stringify({ fields: Object.keys(patch) }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: skill.companyId,
      sourceType: "SKILL",
      sourceId: args.skillId,
      reason: "Company skill was updated.",
      affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
      createdBy: userId,
      createdAt: now,
    });

    return { skillId: args.skillId };
  },
});

export const archiveSkill = adminMutation({
  args: {
    skillId: v.id("companySkills"),
  },
  handler: async (ctx, args) => {
    const { userId, skill } = await requireSkillAccess(ctx, args.skillId);
    if (skill.status === "ARCHIVED") return { skillId: args.skillId };
    const now = Date.now();
    const enabledBindings = await ctx.db
      .query("companySkillBindings")
      .withIndex("by_company_skill_enabled", (q) => q.eq("companyId", skill.companyId).eq("skillId", args.skillId).eq("isEnabled", true))
      .take(1000);

    await ctx.db.patch(args.skillId, {
      status: "ARCHIVED",
      archivedBy: userId,
      archivedAt: now,
      updatedAt: now,
    });
    await Promise.all(enabledBindings.map((binding) => ctx.db.patch(binding._id, { isEnabled: false, updatedAt: now })));

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ARCHIVE_COMPANY_SKILL",
      entityId: args.skillId,
      entityType: "companySkills",
      companyId: skill.companyId,
      timestamp: now,
      metadata: JSON.stringify({ disabledBindings: enabledBindings.length }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: skill.companyId,
      sourceType: "SKILL",
      sourceId: args.skillId,
      reason: "Company skill was archived.",
      affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
      createdBy: userId,
      createdAt: now,
    });

    return { skillId: args.skillId, disabledBindings: enabledBindings.length };
  },
});

export const setBinding = adminMutation({
  args: {
    skillId: v.id("companySkills"),
    surfaceType: skillSurfaceValidator,
    surfaceId: v.optional(v.string()),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, skill } = await requireSkillAccess(ctx, args.skillId);
    if (skill.status === "ARCHIVED") throw new Error("Archived skills cannot be bound to surfaces.");
    const now = Date.now();
    const surfaceId = normalizeOptionalText(args.surfaceId, 160);
    const existing = await ctx.db
      .query("companySkillBindings")
      .withIndex("by_company_skill_surface", (q) => q.eq("companyId", skill.companyId).eq("skillId", args.skillId).eq("surfaceType", args.surfaceType))
      .filter((q) => surfaceId === undefined ? q.eq(q.field("surfaceId"), undefined) : q.eq(q.field("surfaceId"), surfaceId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        updatedAt: now,
      });

      await ctx.db.insert("auditLogs", {
        actorId: userId,
        actionType: "UPDATE_COMPANY_SKILL_BINDING",
        entityId: existing._id,
        entityType: "companySkillBindings",
        companyId: skill.companyId,
        timestamp: now,
        metadata: JSON.stringify({ skillId: args.skillId, surfaceType: args.surfaceType, surfaceId, isEnabled: args.isEnabled }),
      });
      await recordCompanyAiDriftEvent(ctx, {
        companyId: skill.companyId,
        sourceType: "SKILL",
        sourceId: args.skillId,
        reason: "Company skill binding was updated.",
        affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
        createdBy: userId,
        createdAt: now,
      });

      return existing._id;
    }

    const bindingId = await ctx.db.insert("companySkillBindings", {
      companyId: skill.companyId,
      skillId: args.skillId,
      surfaceType: args.surfaceType,
      surfaceId,
      isEnabled: args.isEnabled,
      assignedBy: userId,
      assignedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_COMPANY_SKILL_BINDING",
      entityId: bindingId,
      entityType: "companySkillBindings",
      companyId: skill.companyId,
      timestamp: now,
      metadata: JSON.stringify({ skillId: args.skillId, surfaceType: args.surfaceType, surfaceId, isEnabled: args.isEnabled }),
    });
    await recordCompanyAiDriftEvent(ctx, {
      companyId: skill.companyId,
      sourceType: "SKILL",
      sourceId: args.skillId,
      reason: "Company skill binding was created.",
      affectedEvalCategories: ["SKILL_ROUTING", "WIDGET_READINESS", "AGENT_INHERITANCE"],
      createdBy: userId,
      createdAt: now,
    });

    return bindingId;
  },
});
