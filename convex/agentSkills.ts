import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany } from "./authz";
import { adminQuery, superAdminMutation, superAdminQuery } from "./tenantFunctions";
import {
  emptyAgentSkillRollup,
  getAgentSkillRollup,
  replaceAgentSkillRollup,
} from "./utils/agentSkillRollupService";
import { appError } from "./utils/appError";
import { MAX_SKILLS_PER_AGENT } from "./utils/skillLimits";
import { stableStringify } from "./utils/lang";
import { SKILL_BINDING_LIMIT, SKILL_BINDING_WALK_LIMIT, SKILL_CATALOG_LIMIT, STARTER_SKILL_CATEGORY, TOOL_LOOKUP_LIMIT, skillRiskLevelValidator, skillStatusValidator } from "./utils/skillContracts";
import type { MarkdownSkillDraft, SkillRiskLevel } from "./utils/skillContracts";
import { starterSkillDefinitions } from "./utils/starterSkills";
import { buildExpectedToolPlanJson, buildSkillPatch, hashString, normalizeCategory, parseSourceEvidence, parseStringArray } from "./utils/skillNormalization";
import { buildSkillBundle, buildSkillPatchFromBundle, buildSkillSnapshot, parseSkillSuggestedFixtures } from "./utils/skillBundleService";
import { parseSkillMarkdown } from "./utils/skillMarkdownService";
import { getFixtureSkillEvidence, isFixtureForSkill, truncateLearningText } from "./utils/skillLearningService";




/**
 * Every binding for one skill, or a refusal naming what would have been missed.
 *
 * For callers that act on all of them. Reading one past the ceiling is what
 * makes the difference detectable: `.take(n)` returning n rows cannot tell a
 * skill with exactly n agents from one with far more, so the cap has to be
 * exceeded to be seen.
 *
 * It throws rather than returning a flag because the callers are mid-write. A
 * flag they could ignore is how this went wrong in the first place — and
 * refusing before the first `delete` or `patch` means a refusal leaves the
 * skill exactly as it was, rather than half-detached.
 */
async function readEverySkillBinding(
  ctx: Pick<MutationCtx, "db">,
  skillId: Id<"agentSkills">,
  action: string,
) {
  const bindings = await ctx.db
    .query("agentSkillBindings")
    .withIndex("by_skill_enabled", (q) => q.eq("skillId", skillId))
    .take(SKILL_BINDING_WALK_LIMIT + 1);

  if (bindings.length > SKILL_BINDING_WALK_LIMIT) {
    throw appError(
      "INVALID_INPUT",
      `This skill is bound to more than ${SKILL_BINDING_WALK_LIMIT} agents, which is more than one ${action} can safely cover. Detach some agents from it first.`,
    );
  }

  return bindings;
}









export async function ensureAgentSkillVersionSnapshot(ctx: Pick<MutationCtx, "db">, skillId: Id<"agentSkills">) {
  const skill = await ctx.db.get(skillId);
  if (!skill) throw appError("NOT_FOUND", "Skill not found.");

  const snapshot = buildSkillSnapshot(skill);
  const snapshotHash = hashString(snapshot.snapshotJson);
  const existing = await ctx.db
    .query("agentSkillVersions")
    .withIndex("by_skill_hash", (q) => q.eq("skillId", skillId).eq("snapshotHash", snapshotHash))
    .first();
  if (existing) return existing._id;

  const latest = await ctx.db
    .query("agentSkillVersions")
    .withIndex("by_skill_created", (q) => q.eq("skillId", skillId))
    .order("desc")
    .first();
  return await ctx.db.insert("agentSkillVersions", {
    skillId,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    snapshotHash,
    snapshotJson: snapshot.snapshotJson,
    instructionHash: snapshot.instructionHash,
    toolRequirementHash: snapshot.toolRequirementHash,
    evalHash: snapshot.evalHash,
    createdAt: Date.now(),
  });
}

async function getActiveToolMappings(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">) {
  const tools = await ctx.db
    .query("aiTools")
    .withIndex("by_createdAt")
    .order("desc")
    .take(TOOL_LOOKUP_LIMIT);
  return new Map(
    tools
      .filter((tool) => tool.isActive !== false)
      .map((tool) => [tool.handlerMapping, tool])
  );
}

async function addMarkdownImportCatalogWarnings(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">, draft: MarkdownSkillDraft) {
  const [skills, activeTools] = await Promise.all([
    ctx.db
      .query("agentSkills")
      .withIndex("by_category_created")
      .order("desc")
      .take(SKILL_CATALOG_LIMIT),
    getActiveToolMappings(ctx),
  ]);
  const duplicateSkill = skills.find((skill) => skill.name.trim().toLowerCase() === draft.name.trim().toLowerCase());
  const requiredMappings = parseStringArray(draft.requiredToolMappingsJson);
  const recommendedMappings = parseStringArray(draft.recommendedToolMappingsJson);
  const unresolvedMappings = [...requiredMappings, ...recommendedMappings].filter((mapping) => !activeTools.has(mapping));
  const warnings = [...draft.validation.warnings];
  const suggestions = [...draft.validation.suggestions];

  if (duplicateSkill) {
    warnings.push(`A skill named "${duplicateSkill.name}" already exists.`);
    suggestions.push("Review whether this should be a new draft, a clone, or an update to the existing skill.");
  }
  if (unresolvedMappings.length > 0) {
    warnings.push(`Some tool hints do not match active platform tool mappings: ${unresolvedMappings.slice(0, 6).join(", ")}.`);
    suggestions.push("Map imported tool names to active AI tool handler mappings before production use.");
  }

  return {
    ...draft,
    validation: {
      ...draft.validation,
      warnings: Array.from(new Set(warnings)),
      suggestions: Array.from(new Set(suggestions)),
    },
  };
}

export const previewSkillMarkdownImport = superAdminMutation({
  args: {
    markdown: v.string(),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const draft = parseSkillMarkdown(args.markdown, args.filename);
    return await addMarkdownImportCatalogWarnings(ctx, draft);
  },
});

async function getBindingToolReadiness(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">, skill: Doc<"agentSkills">) {
  const requiredToolMappings = parseStringArray(skill.requiredToolMappingsJson);
  const recommendedToolMappings = parseStringArray(skill.recommendedToolMappingsJson);
  const activeTools = await getActiveToolMappings(ctx);
  return {
    requiredToolMappings,
    recommendedToolMappings,
    missingRequiredToolMappings: requiredToolMappings.filter((mapping) => !activeTools.has(mapping)),
    missingRecommendedToolMappings: recommendedToolMappings.filter((mapping) => !activeTools.has(mapping)),
  };
}

async function getSkillEvalCoverage(ctx: Pick<QueryCtx, "db">, args: {
  agentId: Id<"agents">;
  skillId: Id<"agentSkills">;
  skillVersionId: Id<"agentSkillVersions">;
}) {
  const fixtures = await ctx.db
    .query("agentEvalFixtures")
    .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "ACTIVE"))
    .take(500);
  const skillFixtures = fixtures.filter((fixture) => isFixtureForSkill(fixture, args.skillId));
  const fixtureIds = new Set(skillFixtures.map((fixture) => fixture._id));
  const recentSmokeRuns = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", args.agentId))
    .order("desc")
    .take(300);

  let latestRun: (Doc<"agentRuns"> & { isCurrent: boolean }) | null = null;
  let latestPassedRun: (Doc<"agentRuns"> & { isCurrent: boolean }) | null = null;
  for (const run of recentSmokeRuns) {
    if (!run.objective.startsWith("Smoke eval:")) continue;
    const steps = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_step", (q) => q.eq("runId", run._id))
      .order("asc")
      .take(25);
    const observeStep = steps.find((step) => step.kind === "OBSERVE");
    const metadata = parseSourceEvidence(observeStep?.output);
    const fixtureId = typeof metadata.fixtureId === "string" ? metadata.fixtureId as Id<"agentEvalFixtures"> : undefined;
    if (!fixtureId || !fixtureIds.has(fixtureId)) continue;
    const fixture = skillFixtures.find((entry) => entry._id === fixtureId);
    const fixtureEvidence = fixture ? getFixtureSkillEvidence(fixture) : undefined;
    const runEvidence = typeof metadata.sourceEvidenceJson === "string"
      ? parseSourceEvidence(metadata.sourceEvidenceJson)
      : {};
    const runSkillVersionId = typeof runEvidence.skillVersionId === "string"
      ? runEvidence.skillVersionId as Id<"agentSkillVersions">
      : undefined;
    const isCurrent = Boolean(
      fixture
      && fixtureEvidence?.skillVersionId === args.skillVersionId
      && runSkillVersionId === args.skillVersionId
      && run.startedAt >= fixture.updatedAt
    );
    const runWithCurrency = { ...run, isCurrent };
    latestRun ??= runWithCurrency;
    if (!latestPassedRun && run.status === "SUCCESS" && isCurrent) latestPassedRun = runWithCurrency;
    if (latestRun && latestPassedRun) break;
  }

  return {
    activeFixtureCount: skillFixtures.length,
    latestRun: latestRun ? {
      runId: latestRun._id,
      status: latestRun.status,
      completedAt: latestRun.completedAt,
      startedAt: latestRun.startedAt,
      isCurrent: latestRun.isCurrent,
    } : null,
    latestPassedRun: latestPassedRun ? {
      runId: latestPassedRun._id,
      completedAt: latestPassedRun.completedAt,
      startedAt: latestPassedRun.startedAt,
      isCurrent: latestPassedRun.isCurrent,
    } : null,
  };
}

async function seedSkillEvalFixtures(ctx: Pick<MutationCtx, "db">, args: {
  agentId: Id<"agents">;
  skill: Doc<"agentSkills">;
  skillVersionId: Id<"agentSkillVersions">;
  userId: Id<"users">;
  companyId?: Id<"companies">;
  now: number;
}) {
  const fixtures = parseSkillSuggestedFixtures(args.skill);
  if (fixtures.length === 0) return { sourceRunId: undefined, fixtureIds: [] as Id<"agentEvalFixtures">[] };

  const existingFixtures = await ctx.db
    .query("agentEvalFixtures")
    .withIndex("by_agent_status_created", (q) => q.eq("agentId", args.agentId).eq("status", "ACTIVE"))
    .take(500);
  const existingSkillFixtureObjectives = new Set(existingFixtures
    .filter((fixture) => {
      try {
        const evidence = JSON.parse(fixture.sourceEvidenceJson) as { source?: string; skillId?: string };
        return evidence.source === "agent_skill" && evidence.skillId === args.skill._id;
      } catch {
        return false;
      }
    })
    .map((fixture) => `${fixture.type}:${fixture.objective}`));

  const sourceRunId = await ctx.db.insert("agentRuns", {
    agentId: args.agentId,
    triggerType: "MANUAL",
    objective: `Skill setup: ${args.skill.name}`,
    status: "SUCCESS",
    companyId: args.companyId,
    userId: args.userId,
    startedAt: args.now,
    completedAt: args.now,
    updatedAt: args.now,
    finalOutput: "Skill starter eval fixtures seeded.",
  });

  const fixtureIds: Id<"agentEvalFixtures">[] = [];
  for (const fixture of fixtures) {
    const key = `${fixture.type}:${fixture.objective}`;
    const sourceEvidenceJson = JSON.stringify({
      source: "agent_skill",
      skillId: args.skill._id,
      skillVersionId: args.skillVersionId,
      skillName: args.skill.name,
    });
    const existingFixture = existingFixtures.find((entry) => {
      if (`${entry.type}:${entry.objective}` !== key) return false;
      const evidence = getFixtureSkillEvidence(entry);
      return evidence.source === "agent_skill" && evidence.skillId === args.skill._id;
    });
    if (existingFixture) {
      await ctx.db.patch(existingFixture._id, {
        sourceRunId,
        expectedToolPlanJson: buildExpectedToolPlanJson(fixture.expectedToolMappings),
        expectedBlockedActionsJson: fixture.expectedBlockedActionsJson,
        expectedFinalOutputRubric: fixture.expectedFinalOutputRubric,
        sourceEvidenceJson,
        tags: Array.from(new Set([...(fixture.tags ?? []), "skill", `skill-${args.skill._id}`])).slice(0, 12),
        updatedAt: args.now,
      });
      fixtureIds.push(existingFixture._id);
      continue;
    }
    if (existingSkillFixtureObjectives.has(key)) continue;
    const fixtureId = await ctx.db.insert("agentEvalFixtures", {
      agentId: args.agentId,
      agentVersionId: undefined,
      companyId: args.companyId,
      sourceRunId,
      createdBy: args.userId,
      type: fixture.type,
      objective: fixture.objective,
      expectedToolPlanJson: buildExpectedToolPlanJson(fixture.expectedToolMappings),
      expectedBlockedActionsJson: fixture.expectedBlockedActionsJson,
      expectedFinalOutputRubric: fixture.expectedFinalOutputRubric,
      sourceEvidenceJson,
      tags: Array.from(new Set([...(fixture.tags ?? []), "skill", `skill-${args.skill._id}`])).slice(0, 12),
      status: "ACTIVE",
      createdAt: args.now,
      updatedAt: args.now,
    });
    fixtureIds.push(fixtureId);
  }

  return { sourceRunId, fixtureIds };
}

export async function refreshSkillBindingsAndEvalFixtures(ctx: Pick<MutationCtx, "db">, args: {
  skillId: Id<"agentSkills">;
  skillVersionId: Id<"agentSkillVersions">;
  userId: Id<"users">;
  now: number;
}) {
  const skill = await ctx.db.get(args.skillId);
  if (!skill) throw appError("NOT_FOUND", "Skill not found.");
  const bindings = await readEverySkillBinding(ctx, args.skillId, "upload");
  let seededEvalFixtureCount = 0;

  for (const binding of bindings) {
    await ctx.db.patch(binding._id, {
      skillVersionId: args.skillVersionId,
      updatedAt: args.now,
    });
    if (binding.isEnabled) {
      const seeded = await seedSkillEvalFixtures(ctx, {
        agentId: binding.agentId,
        skill,
        skillVersionId: args.skillVersionId,
        userId: args.userId,
        companyId: binding.companyId,
        now: args.now,
      });
      seededEvalFixtureCount += seeded.fixtureIds.length;
    }
  }

  return {
    refreshedBindingCount: bindings.length,
    seededEvalFixtureCount,
  };
}

export const getPaginatedSkills = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    status: v.optional(skillStatusValidator),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    if (searchTerm) {
      // The status narrows inside the index. This used to filter the page after
      // it had been paginated, so asking for fifteen could return three — and
      // there was no way for the reader to tell a filtered answer from the end
      // of the results.
      return await ctx.db
        .query("agentSkills")
        .withSearchIndex("search_name", (q) => {
          const search = q.search("name", searchTerm);
          return args.status ? search.eq("status", args.status) : search;
        })
        .paginate(args.paginationOpts);
    }

    if (args.status) {
      return await ctx.db
        .query("agentSkills")
        .withIndex("by_status_created", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("agentSkills")
      .withIndex("by_category_created")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Active skills, capped.
 *
 * Kept for callers that genuinely want a short list to render inline — the
 * agent editor modal and the app-kit builder both show a handful. It stops at
 * `SKILL_CATALOG_LIMIT`, so it must not be used anywhere the reader is expected
 * to find a *specific* skill: past that many, the one they want may simply not
 * be in the answer, and nothing about a truncated array says so.
 *
 * For choosing a skill, use `searchActiveSkills`, which pages and has no
 * ceiling.
 */
export const getActiveSkills = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agentSkills")
      .withIndex("by_status_created", (q) => q.eq("status", "ACTIVE"))
      .order("desc")
      .take(SKILL_CATALOG_LIMIT);
  },
});

/**
 * Active skills for a picker: searched and paged in the database, so the
 * catalogue can grow without the caller ever seeing a ceiling.
 *
 * This replaces "fetch the first 250 and filter them in the browser", which
 * failed in the way that is hardest to notice — at 300 skills the fifty the
 * reader could not attach were not marked as missing, they were absent.
 *
 * `excludeSkillIds` carries the skills already attached to the agent. Filtering
 * after the page is read means a page can come back short, which is why the
 * caller is given `pageSize` worth of candidates and told whether more exist,
 * rather than being left to infer it from a short page.
 */
export const searchActiveSkills = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
    category: v.optional(v.string()),
    riskLevel: v.optional(skillRiskLevelValidator),
    excludeSkillIds: v.optional(v.array(v.id("agentSkills"))),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();
    const category = args.category?.trim() ? normalizeCategory(args.category) : undefined;
    const excluded = new Set(args.excludeSkillIds ?? []);

    // Both the search path and the browse path narrow in the database. The only
    // filtering left for the page below is the exclusion list, which depends on
    // the agent rather than the catalogue and so cannot be indexed.
    const result = searchTerm
      ? await ctx.db
          .query("agentSkills")
          .withSearchIndex("search_name", (q) => {
            let search = q.search("name", searchTerm).eq("status", "ACTIVE");
            if (category) search = search.eq("category", category);
            if (args.riskLevel) search = search.eq("riskLevel", args.riskLevel);
            return search;
          })
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("agentSkills")
          .withIndex("by_status_created", (q) => q.eq("status", "ACTIVE"))
          .order("desc")
          .filter((q) => {
            const clauses = [
              ...(category ? [q.eq(q.field("category"), category)] : []),
              ...(args.riskLevel ? [q.eq(q.field("riskLevel"), args.riskLevel)] : []),
            ];
            return clauses.length === 0 ? q.eq(q.field("status"), "ACTIVE") : q.and(...clauses);
          })
          .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.filter((skill) => !excluded.has(skill._id)),
    };
  },
});

/**
 * Walk the catalogue and total it up.
 *
 * This is the expensive part — up to `SKILL_CATALOG_LIMIT` skills, each with up
 * to `SKILL_BINDING_LIMIT` bindings — and it used to run on every page load of
 * the Skill Center. It now runs on a schedule and on demand, writing its answer
 * to a rollup document that the screen reads in a single lookup.
 *
 * It reports `skillsCounted` and `isPartial` rather than presenting a truncated
 * walk as a complete count. That distinction is the whole point: the previous
 * version stopped at 250 skills and said nothing.
 *
 * `isPartial` covers both ceilings, not just the catalogue one. A skill bound to
 * more than `SKILL_BINDING_LIMIT` agents is the reachable case — 100 is a number
 * a real customer passes — and every binding total below is short the moment one
 * does. Marked rather than refused: the panel already carries the caveat, and one
 * over-bound skill should not blank the health of the whole catalogue.
 */
export async function computeAgentSkillRollup(ctx: Pick<MutationCtx, "db">) {
  {
    const skills = await ctx.db
      .query("agentSkills")
      .withIndex("by_category_created")
      .order("desc")
      .take(SKILL_CATALOG_LIMIT + 1);
    const catalogueIsPartial = skills.length > SKILL_CATALOG_LIMIT;
    if (catalogueIsPartial) skills.length = SKILL_CATALOG_LIMIT;
    let bindingsIsPartial = false;
    const latestVersionPairs = await Promise.all(skills.map(async (skill) => {
      const latestVersion = await ctx.db
        .query("agentSkillVersions")
        .withIndex("by_skill_created", (q) => q.eq("skillId", skill._id))
        .order("desc")
        .first();
      return [skill._id, latestVersion] as const;
    }));
    const latestVersionBySkillId = new Map(latestVersionPairs);

    let totalBindings = 0;
    let enabledBindings = 0;
    let activeAgentBindings = 0;
    let outdatedBindings = 0;
    let currentBindings = 0;
    let validatedBindings = 0;
    let needsSmokeBindings = 0;
    let highRiskNeedsSmokeBindings = 0;
    const needsAttention: Array<{
      skillId: Id<"agentSkills">;
      name: string;
      category: string;
      riskLevel: SkillRiskLevel;
      boundAgents: number;
      enabledAgents: number;
      outdatedAgents: number;
      needsSmokeAgents: number;
      validatedAgents: number;
    }> = [];

    for (const skill of skills) {
      const latestVersion = latestVersionBySkillId.get(skill._id);
      const scannedBindings = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_skill_enabled", (q) => q.eq("skillId", skill._id))
        .take(SKILL_BINDING_LIMIT + 1);
      if (scannedBindings.length > SKILL_BINDING_LIMIT) bindingsIsPartial = true;
      const bindings = scannedBindings.slice(0, SKILL_BINDING_LIMIT);
      let skillEnabledBindings = 0;
      let skillOutdatedBindings = 0;
      let skillNeedsSmokeBindings = 0;
      let skillValidatedBindings = 0;

      totalBindings += bindings.length;
      for (const binding of bindings) {
        if (!binding.isEnabled) continue;
        enabledBindings += 1;
        skillEnabledBindings += 1;
        const agent = await ctx.db.get(binding.agentId);
        if (agent?.isActive) {
          activeAgentBindings += 1;
        }
        const hasAvailableUpdate = Boolean(latestVersion && latestVersion._id !== binding.skillVersionId);
        if (hasAvailableUpdate) {
          outdatedBindings += 1;
          skillOutdatedBindings += 1;
          continue;
        }

        currentBindings += 1;
        const evalCoverage = await getSkillEvalCoverage(ctx, {
          agentId: binding.agentId,
          skillId: skill._id,
          skillVersionId: binding.skillVersionId,
        });
        if (evalCoverage.latestPassedRun) {
          validatedBindings += 1;
          skillValidatedBindings += 1;
        } else {
          needsSmokeBindings += 1;
          skillNeedsSmokeBindings += 1;
          if (skill.riskLevel === "HIGH") highRiskNeedsSmokeBindings += 1;
        }
      }

      if (skillOutdatedBindings > 0 || skillNeedsSmokeBindings > 0) {
        needsAttention.push({
          skillId: skill._id,
          name: skill.name,
          category: skill.category,
          riskLevel: skill.riskLevel,
          boundAgents: bindings.length,
          enabledAgents: skillEnabledBindings,
          outdatedAgents: skillOutdatedBindings,
          needsSmokeAgents: skillNeedsSmokeBindings,
          validatedAgents: skillValidatedBindings,
        });
      }
    }

    needsAttention.sort((left, right) => {
      const leftPriority = (left.riskLevel === "HIGH" ? 100 : 0) + left.outdatedAgents * 10 + left.needsSmokeAgents;
      const rightPriority = (right.riskLevel === "HIGH" ? 100 : 0) + right.outdatedAgents * 10 + right.needsSmokeAgents;
      return rightPriority - leftPriority;
    });

    return {
      skills: skills.length,
      activeSkills: skills.filter((skill) => skill.status === "ACTIVE").length,
      draftSkills: skills.filter((skill) => skill.status === "DRAFT").length,
      archivedSkills: skills.filter((skill) => skill.status === "ARCHIVED").length,
      highRiskSkills: skills.filter((skill) => skill.riskLevel === "HIGH").length,
      totalBindings,
      enabledBindings,
      activeAgentBindings,
      outdatedBindings,
      currentBindings,
      validatedBindings,
      needsSmokeBindings,
      highRiskNeedsSmokeBindings,
      needsAttention: needsAttention.slice(0, 8),
      skillsCounted: skills.length,
      isPartial: catalogueIsPartial || bindingsIsPartial,
    };
  }
}

/**
 * The Skill Center health panel: one document, no fan-out.
 *
 * Returns `computedAt: null` when no rebuild has run, so the screen can say
 * "not measured yet" instead of showing five confident zeros — which is how the
 * old panel managed to read as broken on a brand new account.
 */
export const getSkillCatalogAnalytics = superAdminQuery({
  args: {},
  handler: async (ctx) => {
    const rollup = await getAgentSkillRollup(ctx);
    const totals = rollup ?? { ...emptyAgentSkillRollup, computedAt: null };

    return {
      totals: {
        skills: totals.skills,
        activeSkills: totals.activeSkills,
        draftSkills: totals.draftSkills,
        archivedSkills: totals.archivedSkills,
        highRiskSkills: totals.highRiskSkills,
        totalBindings: totals.totalBindings,
        enabledBindings: totals.enabledBindings,
        activeAgentBindings: totals.activeAgentBindings,
        outdatedBindings: totals.outdatedBindings,
        currentBindings: totals.currentBindings,
        validatedBindings: totals.validatedBindings,
        needsSmokeBindings: totals.needsSmokeBindings,
        highRiskNeedsSmokeBindings: totals.highRiskNeedsSmokeBindings,
      },
      needsAttention: totals.needsAttention,
      computedAt: rollup?.computedAt ?? null,
      skillsCounted: totals.skillsCounted,
      isPartial: totals.isPartial,
    };
  },
});

/** Recompute the Skill Center counts now. Also runs on a schedule. */
export const rebuildSkillCatalogRollup = superAdminMutation({
  args: {},
  handler: async (ctx) => {
    const totals = await computeAgentSkillRollup(ctx);
    await replaceAgentSkillRollup(ctx, totals, Date.now());
    return { skillsCounted: totals.skillsCounted, isPartial: totals.isPartial };
  },
});

export const rebuildSkillCatalogRollupInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const totals = await computeAgentSkillRollup(ctx);
    await replaceAgentSkillRollup(ctx, totals, Date.now());
    return null;
  },
});

export const getSkill = superAdminQuery({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return null;
    const latestVersion = await ctx.db
      .query("agentSkillVersions")
      .withIndex("by_skill_created", (q) => q.eq("skillId", args.skillId))
      .order("desc")
      .first();
    const readiness = await getBindingToolReadiness(ctx, skill);
    return { skill, latestVersion, readiness };
  },
});

export const exportSkillBundle = superAdminQuery({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");
    const latestVersion = await ctx.db
      .query("agentSkillVersions")
      .withIndex("by_skill_created", (q) => q.eq("skillId", args.skillId))
      .order("desc")
      .first();
    const bundle = buildSkillBundle(skill, latestVersion);
    return {
      bundle,
      bundleJson: JSON.stringify(bundle, null, 2),
      filename: `${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent-skill"}-bundle.json`,
    };
  },
});

export const getSkillLearningAnalytics = superAdminQuery({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");

    const suggestionStatuses = ["PROPOSED", "APPROVED", "REJECTED", "APPLIED"] as const;
    const candidateStatuses = ["PROPOSED", "APPROVED", "REJECTED", "APPLIED"] as const;
    const [suggestionPages, candidatePages] = await Promise.all([
      Promise.all(suggestionStatuses.map((status) =>
        ctx.db
          .query("agentImprovementSuggestions")
          .withIndex("by_skill_status_created", (q) => q.eq("sourceSkillId", args.skillId).eq("status", status))
          .order("desc")
          .take(50)
      )),
      Promise.all(candidateStatuses.map((status) =>
        ctx.db
          .query("agentMemoryCandidates")
          .withIndex("by_skill_status_created", (q) => q.eq("sourceSkillId", args.skillId).eq("status", status))
          .order("desc")
          .take(50)
      )),
    ]);
    const suggestions = suggestionPages.flat();
    const candidates = candidatePages.flat();
    const suggestionStatusCounts = Object.fromEntries(suggestionStatuses.map((status) => [
      status,
      suggestions.filter((suggestion) => suggestion.status === status).length,
    ])) as Record<typeof suggestionStatuses[number], number>;
    const candidateStatusCounts = Object.fromEntries(candidateStatuses.map((status) => [
      status,
      candidates.filter((candidate) => candidate.status === status).length,
    ])) as Record<typeof candidateStatuses[number], number>;
    const recentLearning = [
      ...suggestions.map((suggestion) => ({
        kind: "suggestion" as const,
        id: suggestion._id,
        status: suggestion.status,
        riskLevel: suggestion.riskLevel,
        label: suggestion.type,
        title: suggestion.title,
        summary: truncateLearningText(suggestion.description),
        createdAt: suggestion.createdAt,
      })),
      ...candidates.map((candidate) => ({
        kind: "memory" as const,
        id: candidate._id,
        status: candidate.status,
        riskLevel: candidate.riskLevel,
        label: candidate.kind,
        title: `${candidate.kind.toLowerCase()} memory candidate`,
        summary: truncateLearningText(candidate.content),
        createdAt: candidate.createdAt,
      })),
    ].sort((left, right) => right.createdAt - left.createdAt).slice(0, 8);

    return {
      totals: {
        suggestions: suggestions.length,
        openSuggestions: suggestionStatusCounts.PROPOSED + suggestionStatusCounts.APPROVED,
        appliedSuggestions: suggestionStatusCounts.APPLIED,
        rejectedSuggestions: suggestionStatusCounts.REJECTED,
        memoryCandidates: candidates.length,
        openMemoryCandidates: candidateStatusCounts.PROPOSED + candidateStatusCounts.APPROVED,
        appliedMemoryCandidates: candidateStatusCounts.APPLIED,
        rejectedMemoryCandidates: candidateStatusCounts.REJECTED,
        highRiskOpenItems: suggestions.filter((suggestion) =>
          suggestion.riskLevel === "HIGH" && (suggestion.status === "PROPOSED" || suggestion.status === "APPROVED")
        ).length + candidates.filter((candidate) =>
          candidate.riskLevel === "HIGH" && (candidate.status === "PROPOSED" || candidate.status === "APPROVED")
        ).length,
      },
      suggestionStatusCounts,
      candidateStatusCounts,
      recentLearning,
    };
  },
});

export const getBindingsForSkill = superAdminQuery({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");
    const latestVersion = await ctx.db
      .query("agentSkillVersions")
      .withIndex("by_skill_created", (q) => q.eq("skillId", args.skillId))
      .order("desc")
      .first();
    const bindings = await ctx.db
      .query("agentSkillBindings")
      .withIndex("by_skill_enabled", (q) => q.eq("skillId", args.skillId))
      .take(SKILL_BINDING_LIMIT);

    const rows = [];
    for (const binding of bindings) {
      const [agent, version] = await Promise.all([
        ctx.db.get(binding.agentId),
        ctx.db.get(binding.skillVersionId),
      ]);
      if (!agent) continue;
      rows.push({
        binding,
        agent: {
          _id: agent._id,
          name: agent.name,
          isActive: agent.isActive,
        },
        version,
        latestVersion,
        hasAvailableUpdate: Boolean(latestVersion && latestVersion._id !== binding.skillVersionId),
        evalCoverage: await getSkillEvalCoverage(ctx, {
          agentId: binding.agentId,
          skillId: skill._id,
          skillVersionId: binding.skillVersionId,
        }),
      });
    }

    return rows.sort((left, right) => {
      if (left.hasAvailableUpdate !== right.hasAvailableUpdate) return left.hasAvailableUpdate ? -1 : 1;
      return right.binding.updatedAt - left.binding.updatedAt;
    });
  },
});

export const createSkill = superAdminMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(skillStatusValidator),
    riskLevel: v.optional(skillRiskLevelValidator),
    instruction: v.string(),
    requiredToolMappingsJson: v.optional(v.string()),
    recommendedToolMappingsJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    defaultRulesJson: v.optional(v.string()),
    suggestedEvalFixturesJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const now = Date.now();
    const patch = buildSkillPatch({
      ...args,
      category: args.category ?? "GENERAL",
      status: args.status ?? "DRAFT",
      riskLevel: args.riskLevel ?? "MEDIUM",
    });
    const skillId = await ctx.db.insert("agentSkills", {
      name: patch.name!,
      description: patch.description,
      category: patch.category!,
      status: patch.status!,
      riskLevel: patch.riskLevel!,
      instruction: patch.instruction!,
      requiredToolMappingsJson: patch.requiredToolMappingsJson,
      recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
      recommendedKnowledgeJson: patch.recommendedKnowledgeJson,
      defaultRulesJson: patch.defaultRulesJson,
      suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_AGENT_SKILL",
      entityId: skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        name: patch.name,
        status: patch.status,
        riskLevel: patch.riskLevel,
        skillVersionId,
      }),
    });
    return skillId;
  },
});

export const seedStarterSkills = superAdminMutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = ctx;
    const now = Date.now();
    const existingStarterSkills = await ctx.db
      .query("agentSkills")
      .withIndex("by_category_created", (q) => q.eq("category", STARTER_SKILL_CATEGORY))
      .take(SKILL_CATALOG_LIMIT);
    const existingNames = new Set(existingStarterSkills.map((skill) => skill.name.trim().toLowerCase()));
    const created: Array<{ skillId: Id<"agentSkills">; name: string; skillVersionId: Id<"agentSkillVersions"> }> = [];
    const skipped: string[] = [];

    for (const definition of starterSkillDefinitions) {
      if (existingNames.has(definition.name.trim().toLowerCase())) {
        skipped.push(definition.name);
        continue;
      }
      const patch = buildSkillPatch({
        name: definition.name,
        description: definition.description,
        category: STARTER_SKILL_CATEGORY,
        status: "ACTIVE",
        riskLevel: definition.riskLevel,
        instruction: definition.instruction,
        requiredToolMappingsJson: JSON.stringify(definition.requiredToolMappings ?? []),
        recommendedToolMappingsJson: JSON.stringify(definition.recommendedToolMappings ?? []),
        suggestedEvalFixturesJson: stableStringify(definition.suggestedEvalFixtures),
      });
      const skillId = await ctx.db.insert("agentSkills", {
        name: patch.name!,
        description: patch.description,
        category: patch.category!,
        status: patch.status!,
        riskLevel: patch.riskLevel!,
        instruction: patch.instruction!,
        requiredToolMappingsJson: patch.requiredToolMappingsJson,
        recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
        recommendedKnowledgeJson: patch.recommendedKnowledgeJson,
        defaultRulesJson: patch.defaultRulesJson,
        suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
      created.push({ skillId, name: definition.name, skillVersionId });
      existingNames.add(definition.name.trim().toLowerCase());
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "SEED_STARTER_AGENT_SKILLS",
      entityId: "agentSkills",
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        createdCount: created.length,
        skippedCount: skipped.length,
        created,
        skipped,
      }),
    });

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    };
  },
});

export const updateSkill = superAdminMutation({
  args: {
    skillId: v.id("agentSkills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(skillStatusValidator),
    riskLevel: v.optional(skillRiskLevelValidator),
    instruction: v.optional(v.string()),
    requiredToolMappingsJson: v.optional(v.string()),
    recommendedToolMappingsJson: v.optional(v.string()),
    recommendedKnowledgeJson: v.optional(v.string()),
    defaultRulesJson: v.optional(v.string()),
    suggestedEvalFixturesJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const existing = await ctx.db.get(args.skillId);
    if (!existing) throw appError("NOT_FOUND", "Skill not found.");

    const { skillId, ...updates } = args;
    const patch = buildSkillPatch(updates);
    const now = Date.now();
    await ctx.db.patch(skillId, {
      ...patch,
      updatedAt: now,
    });
    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
    const pinnedBindingCount = await readEverySkillBinding(ctx, skillId, "edit");
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_AGENT_SKILL",
      entityId: skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        updatedFields: Object.keys(patch),
        skillVersionId,
        pinnedBindingCount: pinnedBindingCount.length,
      }),
    });
    return skillId;
  },
});

export const cloneSkill = superAdminMutation({
  args: {
    skillId: v.id("agentSkills"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const source = await ctx.db.get(args.skillId);
    if (!source) throw appError("NOT_FOUND", "Skill not found.");
    const now = Date.now();
    const patch = buildSkillPatch({
      name: args.name ?? `${source.name} Copy`,
      description: source.description,
      category: source.category,
      status: "DRAFT",
      riskLevel: source.riskLevel,
      instruction: source.instruction,
      requiredToolMappingsJson: source.requiredToolMappingsJson,
      recommendedToolMappingsJson: source.recommendedToolMappingsJson,
      recommendedKnowledgeJson: source.recommendedKnowledgeJson,
      defaultRulesJson: source.defaultRulesJson,
      suggestedEvalFixturesJson: source.suggestedEvalFixturesJson,
    });
    const clonedSkillId = await ctx.db.insert("agentSkills", {
      name: patch.name!,
      description: patch.description,
      category: patch.category!,
      status: "DRAFT",
      riskLevel: patch.riskLevel!,
      instruction: patch.instruction!,
      requiredToolMappingsJson: patch.requiredToolMappingsJson,
      recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
      recommendedKnowledgeJson: patch.recommendedKnowledgeJson,
      defaultRulesJson: patch.defaultRulesJson,
      suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, clonedSkillId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CLONE_AGENT_SKILL",
      entityId: clonedSkillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        sourceSkillId: args.skillId,
        sourceName: source.name,
        clonedName: patch.name,
        skillVersionId,
      }),
    });
    return { skillId: clonedSkillId, skillVersionId };
  },
});

export const importSkillBundle = superAdminMutation({
  args: {
    bundleJson: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const patch = buildSkillPatchFromBundle(args.bundleJson, args.name);
    const now = Date.now();
    const skillId = await ctx.db.insert("agentSkills", {
      name: patch.name!,
      description: patch.description,
      category: patch.category!,
      status: "DRAFT",
      riskLevel: patch.riskLevel!,
      instruction: patch.instruction!,
      requiredToolMappingsJson: patch.requiredToolMappingsJson,
      recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
      recommendedKnowledgeJson: patch.recommendedKnowledgeJson,
      defaultRulesJson: patch.defaultRulesJson,
      suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "IMPORT_AGENT_SKILL_BUNDLE",
      entityId: skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        name: patch.name,
        status: "DRAFT",
        riskLevel: patch.riskLevel,
        skillVersionId,
      }),
    });
    return { skillId, skillVersionId };
  },
});

/**
 * Move every agent using a skill onto the version just uploaded.
 *
 * An agent binding points at a version snapshot rather than at the skill, which
 * is what stops a live agent's instructions changing underneath it. The cost is
 * that a re-uploaded file reached the Skill Center and stopped: agents carried
 * on with the old text until someone noticed an "out of date" badge and pressed
 * upgrade.
 *
 * With the file as the single source of what a skill says, that is the wrong
 * default. Uploading is now the deliberate act, so the agents follow it, and the
 * snapshot stays underneath as the record of what each agent was actually
 * given.
 */
async function rollAgentsOntoLatestSkillVersion(
  ctx: Pick<MutationCtx, "db">,
  skillId: Id<"agentSkills">,
  latestVersionId: Id<"agentSkillVersions">,
) {
  const bindings = await readEverySkillBinding(ctx, skillId, "upload");

  const now = Date.now();
  let moved = 0;
  for (const binding of bindings) {
    if (binding.skillVersionId === latestVersionId) continue;
    await ctx.db.patch(binding._id, { skillVersionId: latestVersionId, updatedAt: now });
    moved += 1;
  }
  return moved;
}


/**
 * Import a SKILL.md file, updating the skill it already produced rather than
 * creating another one.
 *
 * The workflow this serves is: edit the file, upload it again. Before this,
 * every upload inserted a new row, so an edited file produced "Data Enrichment"
 * twice with nothing to say which was current — and the filename went to an
 * audit log while the markdown itself was discarded.
 *
 * **Identity is the frontmatter name, not the filename.** By convention these
 * files are all called `SKILL.md`, so matching on filename would collapse every
 * skill into one.
 *
 * An archived skill is deliberately not matched. Someone archived it on
 * purpose, and silently reviving it on the next upload would undo that
 * decision without saying so; a new skill is created instead.
 */
export const importSkillMarkdown = superAdminMutation({
  args: {
    sourceFilename: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    sourceMarkdown: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    riskLevel: skillRiskLevelValidator,
    instruction: v.string(),
    requiredToolMappingsJson: v.optional(v.string()),
    recommendedToolMappingsJson: v.optional(v.string()),
    suggestedEvalFixturesJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const patch = buildSkillPatch({
      name: args.name,
      description: args.description,
      category: args.category ?? "IMPORTED",
      status: "DRAFT",
      riskLevel: args.riskLevel,
      instruction: args.instruction,
      requiredToolMappingsJson: args.requiredToolMappingsJson,
      recommendedToolMappingsJson: args.recommendedToolMappingsJson,
      suggestedEvalFixturesJson: args.suggestedEvalFixturesJson,
    });
    const now = Date.now();
    const sourceFields = {
      sourceFilename: args.sourceFilename,
      sourceHash: args.sourceHash,
      sourceMarkdown: args.sourceMarkdown,
    };

    // Bounded rather than collected: the index pins this to one exact name, and
    // only the first live match is used. A handful is plenty of room for
    // archived namesakes without letting the read grow with the table.
    const sameName = await ctx.db
      .query("agentSkills")
      .withIndex("by_name", (q) => q.eq("name", patch.name!))
      .take(10);
    const existing = sameName.find((skill) => skill.status !== "ARCHIVED");

    let skillId: Id<"agentSkills">;
    let outcome: "CREATED" | "UPDATED" | "UNCHANGED";

    if (!existing) {
      skillId = await ctx.db.insert("agentSkills", {
        name: patch.name!,
        description: patch.description,
        category: patch.category!,
        status: "DRAFT",
        riskLevel: patch.riskLevel!,
        instruction: patch.instruction!,
        requiredToolMappingsJson: patch.requiredToolMappingsJson,
        recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
        ...sourceFields,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      outcome = "CREATED";
    } else if (args.sourceHash && existing.sourceHash === args.sourceHash) {
      // Byte-identical to what produced this skill. Patching would touch
      // updatedAt and tell the reader something changed when nothing did.
      skillId = existing._id;
      outcome = "UNCHANGED";
    } else {
      skillId = existing._id;
      await ctx.db.patch(existing._id, {
        description: patch.description,
        category: patch.category!,
        riskLevel: patch.riskLevel!,
        instruction: patch.instruction!,
        requiredToolMappingsJson: patch.requiredToolMappingsJson,
        recommendedToolMappingsJson: patch.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: patch.suggestedEvalFixturesJson,
        ...sourceFields,
        updatedAt: now,
        // `status` is deliberately absent: re-uploading a file must not quietly
        // pull a live skill back to draft and stop the agents using it.
      });
      outcome = "UPDATED";
    }

    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, skillId);
    const refreshedAgents = outcome === "UPDATED"
      ? await rollAgentsOntoLatestSkillVersion(ctx, skillId, skillVersionId)
      : 0;
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "IMPORT_AGENT_SKILL_MARKDOWN",
      entityId: skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        name: patch.name,
        outcome,
        status: existing?.status ?? "DRAFT",
        riskLevel: patch.riskLevel,
        category: patch.category,
        sourceFilename: args.sourceFilename,
        sourceHash: args.sourceHash,
        skillVersionId,
        refreshedAgents,
      }),
    });
    return { skillId, skillVersionId, outcome, refreshedAgents };
  },
});

/**
 * Delete a skill outright, with everything that belongs to it.
 *
 * Archiving already existed and is the gentler option: it keeps the record and
 * leaves history auditable. Deleting is what someone means when they uploaded
 * the wrong file and want it gone, so it removes the skill, its version
 * snapshots and its agent attachments.
 *
 * It reports how many agents lose the skill rather than refusing when any do.
 * Refusing would send the reader hunting through agents to detach it by hand;
 * telling them the consequence before they confirm, and again afterwards, is
 * more useful and less patronising. The audit entry keeps the record of what
 * was removed after the rows themselves are gone.
 */
export const deleteSkill = superAdminMutation({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");

    const bindings = await readEverySkillBinding(ctx, args.skillId, "deletion");
    for (const binding of bindings) await ctx.db.delete(binding._id);

    const versions = await ctx.db
      .query("agentSkillVersions")
      .withIndex("by_skill_created", (q) => q.eq("skillId", args.skillId))
      .take(SKILL_CATALOG_LIMIT);
    for (const version of versions) await ctx.db.delete(version._id);

    await ctx.db.delete(args.skillId);

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "DELETE_AGENT_SKILL",
      entityId: args.skillId,
      entityType: "agentSkills",
      timestamp: Date.now(),
      metadata: JSON.stringify({
        name: skill.name,
        sourceFilename: skill.sourceFilename,
        detachedAgents: bindings.length,
        deletedVersions: versions.length,
      }),
    });

    return { detachedAgents: bindings.length };
  },
});

export const archiveSkill = superAdminMutation({
  args: { skillId: v.id("agentSkills") },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw appError("NOT_FOUND", "Skill not found.");
    const now = Date.now();
    await ctx.db.patch(args.skillId, {
      status: "ARCHIVED",
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ARCHIVE_AGENT_SKILL",
      entityId: args.skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({ name: skill.name }),
    });
    return args.skillId;
  },
});

export const getForAgent = adminQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw appError("NOT_FOUND", "Agent not found.");

    const bindings = await ctx.db
      .query("agentSkillBindings")
      .withIndex("by_agent_enabled", (q) => q.eq("agentId", args.agentId))
      .take(SKILL_BINDING_LIMIT);
    const rows = [];
    for (const binding of bindings) {
      assertAdminCanAccessCompany(user, binding.companyId);
      const [skill, version] = await Promise.all([
        ctx.db.get(binding.skillId),
        ctx.db.get(binding.skillVersionId),
      ]);
      if (!skill) continue;
      const latestVersion = await ctx.db
        .query("agentSkillVersions")
        .withIndex("by_skill_created", (q) => q.eq("skillId", skill._id))
        .order("desc")
        .first();
      rows.push({
        binding,
        skill,
        version,
        latestVersion,
        hasAvailableUpdate: Boolean(latestVersion && latestVersion._id !== binding.skillVersionId),
        readiness: await getBindingToolReadiness(ctx, skill),
        evalCoverage: await getSkillEvalCoverage(ctx, {
          agentId: args.agentId,
          skillId: skill._id,
          skillVersionId: binding.skillVersionId,
        }),
      });
    }

    return rows.sort((left, right) => right.binding.assignedAt - left.binding.assignedAt);
  },
});

export const upgradeSkillBindingToLatest = superAdminMutation({
  args: {
    bindingId: v.id("agentSkillBindings"),
    seedEvalFixtures: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const binding = await ctx.db.get(args.bindingId);
    if (!binding) throw appError("NOT_FOUND", "Skill binding not found.");
    const skill = await ctx.db.get(binding.skillId);
    if (!skill || skill.status !== "ACTIVE") throw appError("INVALID_INPUT", "Only active skills can be upgraded on agents.");
    const now = Date.now();
    const latestVersionId = await ensureAgentSkillVersionSnapshot(ctx, skill._id);
    await ctx.db.patch(args.bindingId, {
      skillVersionId: latestVersionId,
      updatedAt: now,
    });
    const seededEvalFixtures = args.seedEvalFixtures === false
      ? { fixtureIds: [] as Id<"agentEvalFixtures">[] }
      : await seedSkillEvalFixtures(ctx, {
          agentId: binding.agentId,
          skill,
          skillVersionId: latestVersionId,
          userId,
          companyId: binding.companyId,
          now,
        });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPGRADE_AGENT_SKILL_BINDING",
      entityId: args.bindingId,
      entityType: "agentSkillBindings",
      companyId: binding.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: binding.agentId,
        skillId: skill._id,
        skillVersionId: latestVersionId,
        seededEvalFixtureCount: seededEvalFixtures.fixtureIds.length,
      }),
    });
    return {
      bindingId: args.bindingId,
      skillVersionId: latestVersionId,
      seededEvalFixtureIds: seededEvalFixtures.fixtureIds,
    };
  },
});

export const upgradeSkillBindingsForSkill = superAdminMutation({
  args: {
    skillId: v.id("agentSkills"),
    bindingIds: v.optional(v.array(v.id("agentSkillBindings"))),
    seedEvalFixtures: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const skill = await ctx.db.get(args.skillId);
    if (!skill || skill.status !== "ACTIVE") throw appError("INVALID_INPUT", "Only active skills can be upgraded on agents.");
    const now = Date.now();
    const latestVersionId = await ensureAgentSkillVersionSnapshot(ctx, args.skillId);
    const requestedBindingIds = new Set(args.bindingIds ?? []);
    const bindings = await readEverySkillBinding(ctx, args.skillId, "upgrade");
    const targetBindings = bindings.filter((binding) =>
      binding.skillVersionId !== latestVersionId
      && (requestedBindingIds.size === 0 || requestedBindingIds.has(binding._id))
    );

    const upgraded: Array<{
      bindingId: Id<"agentSkillBindings">;
      agentId: Id<"agents">;
      seededEvalFixtureCount: number;
    }> = [];
    for (const binding of targetBindings) {
      await ctx.db.patch(binding._id, {
        skillVersionId: latestVersionId,
        updatedAt: now,
      });
      const seededEvalFixtures = args.seedEvalFixtures === false
        ? { fixtureIds: [] as Id<"agentEvalFixtures">[] }
        : await seedSkillEvalFixtures(ctx, {
            agentId: binding.agentId,
            skill,
            skillVersionId: latestVersionId,
            userId,
            companyId: binding.companyId,
            now,
          });
      upgraded.push({
        bindingId: binding._id,
        agentId: binding.agentId,
        seededEvalFixtureCount: seededEvalFixtures.fixtureIds.length,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "BULK_UPGRADE_AGENT_SKILL_BINDINGS",
      entityId: args.skillId,
      entityType: "agentSkills",
      timestamp: now,
      metadata: JSON.stringify({
        skillId: args.skillId,
        skillVersionId: latestVersionId,
        requestedBindingCount: requestedBindingIds.size,
        upgradedCount: upgraded.length,
        upgraded,
      }),
    });

    return {
      skillVersionId: latestVersionId,
      upgradedCount: upgraded.length,
      upgraded,
    };
  },
});

export const bindSkillToAgent = superAdminMutation({
  args: {
    agentId: v.id("agents"),
    skillId: v.id("agentSkills"),
    isEnabled: v.optional(v.boolean()),
    seedEvalFixtures: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw appError("NOT_FOUND", "Agent not found.");
    const skill = await ctx.db.get(args.skillId);
    if (!skill || skill.status !== "ACTIVE") throw appError("INVALID_INPUT", "Only active skills can be attached to agents.");

    const now = Date.now();
    const skillVersionId = await ensureAgentSkillVersionSnapshot(ctx, args.skillId);
    const existing = await ctx.db
      .query("agentSkillBindings")
      .withIndex("by_agent_skill", (q) => q.eq("agentId", args.agentId).eq("skillId", args.skillId))
      .first();
    // Enforced on the way in. Adding a third and having it quietly not apply is
    // the same fault as a silent cap, so the attempt fails and says why.
    if (!existing) {
      const attached = await ctx.db
        .query("agentSkillBindings")
        .withIndex("by_agent_enabled", (q) => q.eq("agentId", args.agentId).eq("isEnabled", true))
        .take(MAX_SKILLS_PER_AGENT + 1);
      if (attached.length >= MAX_SKILLS_PER_AGENT) {
        throw appError("INVALID_INPUT", 
          `An agent can have ${MAX_SKILLS_PER_AGENT} skills. Remove one before adding another.`,
        );
      }
    }

    const isEnabled = args.isEnabled ?? true;
    const bindingId = existing
      ? (await ctx.db.patch(existing._id, {
          skillVersionId,
          companyId: undefined,
          isEnabled,
          updatedAt: now,
        }), existing._id)
      : await ctx.db.insert("agentSkillBindings", {
          agentId: args.agentId,
          skillId: args.skillId,
          skillVersionId,
          companyId: undefined,
          isEnabled,
          assignedBy: userId,
          assignedAt: now,
          updatedAt: now,
        });

    const seededEvalFixtures = args.seedEvalFixtures === false
      ? { fixtureIds: [] as Id<"agentEvalFixtures">[] }
      : await seedSkillEvalFixtures(ctx, {
          agentId: args.agentId,
          skill,
          skillVersionId,
          userId,
          companyId: undefined,
          now,
        });
    const readiness = await getBindingToolReadiness(ctx, skill);

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: existing ? "UPDATE_AGENT_SKILL_BINDING" : "BIND_AGENT_SKILL",
      entityId: bindingId,
      entityType: "agentSkillBindings",
      companyId: undefined,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: args.agentId,
        skillId: args.skillId,
        skillVersionId,
        isEnabled,
        seededEvalFixtureCount: seededEvalFixtures.fixtureIds.length,
        missingRequiredToolMappings: readiness.missingRequiredToolMappings,
      }),
    });

    return {
      bindingId,
      skillVersionId,
      seededEvalFixtureIds: seededEvalFixtures.fixtureIds,
      readiness,
    };
  },
});

export const setBindingEnabled = superAdminMutation({
  args: {
    bindingId: v.id("agentSkillBindings"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const binding = await ctx.db.get(args.bindingId);
    if (!binding) throw appError("NOT_FOUND", "Skill binding not found.");
    const now = Date.now();
    await ctx.db.patch(args.bindingId, {
      isEnabled: args.isEnabled,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UPDATE_AGENT_SKILL_BINDING",
      entityId: args.bindingId,
      entityType: "agentSkillBindings",
      companyId: binding.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        agentId: binding.agentId,
        skillId: binding.skillId,
        isEnabled: args.isEnabled,
      }),
    });
    return args.bindingId;
  },
});

export const unbindSkillFromAgent = superAdminMutation({
  args: { bindingId: v.id("agentSkillBindings") },
  handler: async (ctx, args) => {
    const { userId } = ctx;
    const binding = await ctx.db.get(args.bindingId);
    if (!binding) throw appError("NOT_FOUND", "Skill binding not found.");
    await ctx.db.delete(args.bindingId);
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "UNBIND_AGENT_SKILL",
      entityId: args.bindingId,
      entityType: "agentSkillBindings",
      companyId: binding.companyId,
      timestamp: Date.now(),
      metadata: JSON.stringify({
        agentId: binding.agentId,
        skillId: binding.skillId,
        skillVersionId: binding.skillVersionId,
      }),
    });
    return true;
  },
});

export const getRuntimeSkillsInternal = internalQuery({
  args: {
    agentId: v.id("agents"),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const bindings = await ctx.db
      .query("agentSkillBindings")
      .withIndex("by_agent_enabled", (q) => q.eq("agentId", args.agentId).eq("isEnabled", true))
      .take(SKILL_BINDING_LIMIT);
    const rows = [];
    for (const binding of bindings) {
      if (binding.companyId && binding.companyId !== args.companyId) continue;
      const [skill, version] = await Promise.all([
        ctx.db.get(binding.skillId),
        ctx.db.get(binding.skillVersionId),
      ]);
      if (!skill || skill.status !== "ACTIVE") continue;
      rows.push({
        bindingId: binding._id,
        skillId: skill._id,
        skillVersionId: binding.skillVersionId,
        versionNumber: version?.versionNumber,
        name: skill.name,
        category: skill.category,
        riskLevel: skill.riskLevel,
        instruction: skill.instruction,
        requiredToolMappings: parseStringArray(skill.requiredToolMappingsJson),
        recommendedToolMappings: parseStringArray(skill.recommendedToolMappingsJson),
        snapshotHash: version?.snapshotHash,
      });
    }
    return rows.sort((left, right) => left.name.localeCompare(right.name));
  },
});
