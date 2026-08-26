import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";
import { SKILL_BINDING_LIMIT, SKILL_BINDING_WALK_LIMIT, SKILL_CATALOG_LIMIT, TOOL_LOOKUP_LIMIT } from "./utils/skillContracts";
import type { MarkdownSkillDraft, SkillRiskLevel } from "./utils/skillContracts";
import { buildExpectedToolPlanJson, hashString, parseSourceEvidence, parseStringArray } from "./utils/skillNormalization";
import { buildSkillSnapshot, parseSkillSuggestedFixtures } from "./utils/skillBundleService";
import { getFixtureSkillEvidence, isFixtureForSkill } from "./utils/skillLearningService";

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
export async function readEverySkillBinding(
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

export async function getActiveToolMappings(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">) {
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

export async function addMarkdownImportCatalogWarnings(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">, draft: MarkdownSkillDraft) {
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

export async function getBindingToolReadiness(ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">, skill: Doc<"agentSkills">) {
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

export async function getSkillEvalCoverage(ctx: Pick<QueryCtx, "db">, args: {
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

export async function seedSkillEvalFixtures(ctx: Pick<MutationCtx, "db">, args: {
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
export async function rollAgentsOntoLatestSkillVersion(
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
