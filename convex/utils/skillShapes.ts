import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";
import { skillBundleValidator } from "./skillBundleService";

/**
 * What each Skill Center surface hands back, declared away from the handlers.
 *
 * The shapes live here rather than inline for two reasons. Half of them are
 * shared — a skill version, a binding's readiness and its eval coverage each
 * appear on three surfaces — and inline copies of a shared shape drift apart
 * one edit at a time. The other half are long enough that reading
 * `agentSkills.ts` became reading validators rather than reading behaviour.
 *
 * Every field type is taken from `convex/schema.ts` where the value comes from
 * a table, so a column that changes type is a compile error here rather than a
 * runtime refusal in front of a user.
 */

const agentFields = schema.tables.agents.validator.fields;
const runFields = schema.tables.agentRuns.validator.fields;
const suggestionFields = schema.tables.agentImprovementSuggestions.validator.fields;
const candidateFields = schema.tables.agentMemoryCandidates.validator.fields;

const {
  key,
  computedAt,
  needsAttention,
  skillsCounted,
  isPartial,
  ...skillCatalogCounts
} = schema.tables.agentSkillRollups.validator.fields;

const reviewStatusCountsShape = v.object({
  PROPOSED: v.number(),
  APPROVED: v.number(),
  REJECTED: v.number(),
  APPLIED: v.number(),
});

export const skillVersionOrNull = v.union(rowShape.agentSkillVersions, v.null());

export const toolReadinessShape = v.object({
  requiredToolMappings: v.array(v.string()),
  recommendedToolMappings: v.array(v.string()),
  missingRequiredToolMappings: v.array(v.string()),
  missingRecommendedToolMappings: v.array(v.string()),
});

export const evalCoverageShape = v.object({
  activeFixtureCount: v.number(),
  latestRun: v.union(v.null(), v.object({
    runId: v.id("agentRuns"),
    status: runFields.status,
    completedAt: runFields.completedAt,
    startedAt: runFields.startedAt,
    isCurrent: v.boolean(),
  })),
  latestPassedRun: v.union(v.null(), v.object({
    runId: v.id("agentRuns"),
    completedAt: runFields.completedAt,
    startedAt: runFields.startedAt,
    isCurrent: v.boolean(),
  })),
});

export const skillPageShape = paginationResultValidator(rowShape.agentSkills);

export const skillListShape = v.array(rowShape.agentSkills);

export const skillCatalogAnalyticsShape = v.object({
  totals: v.object(skillCatalogCounts),
  needsAttention,
  computedAt: v.union(computedAt, v.null()),
  skillsCounted,
  isPartial,
});

export const skillRollupRebuildShape = v.object({ skillsCounted, isPartial });

export const skillDetailShape = v.union(v.null(), v.object({
  skill: rowShape.agentSkills,
  latestVersion: skillVersionOrNull,
  readiness: toolReadinessShape,
}));

export const skillBundleExportShape = v.object({
  bundle: skillBundleValidator,
  bundleJson: v.string(),
  filename: v.string(),
});

export const skillLearningAnalyticsShape = v.object({
  totals: v.object({
    suggestions: v.number(),
    openSuggestions: v.number(),
    appliedSuggestions: v.number(),
    rejectedSuggestions: v.number(),
    memoryCandidates: v.number(),
    openMemoryCandidates: v.number(),
    appliedMemoryCandidates: v.number(),
    rejectedMemoryCandidates: v.number(),
    highRiskOpenItems: v.number(),
  }),
  suggestionStatusCounts: reviewStatusCountsShape,
  candidateStatusCounts: reviewStatusCountsShape,
  recentLearning: v.array(v.union(
    v.object({
      kind: v.literal("suggestion"),
      id: v.id("agentImprovementSuggestions"),
      status: suggestionFields.status,
      riskLevel: suggestionFields.riskLevel,
      label: suggestionFields.type,
      title: v.string(),
      summary: v.string(),
      createdAt: v.number(),
    }),
    v.object({
      kind: v.literal("memory"),
      id: v.id("agentMemoryCandidates"),
      status: candidateFields.status,
      riskLevel: candidateFields.riskLevel,
      label: candidateFields.kind,
      title: v.string(),
      summary: v.string(),
      createdAt: v.number(),
    }),
  )),
});

export const skillBindingRowsShape = v.array(v.object({
  binding: rowShape.agentSkillBindings,
  agent: v.object({
    _id: v.id("agents"),
    name: agentFields.name,
    isActive: agentFields.isActive,
  }),
  version: skillVersionOrNull,
  latestVersion: skillVersionOrNull,
  hasAvailableUpdate: v.boolean(),
  evalCoverage: evalCoverageShape,
}));

export const agentSkillRowsShape = v.array(v.object({
  binding: rowShape.agentSkillBindings,
  skill: rowShape.agentSkills,
  version: skillVersionOrNull,
  latestVersion: skillVersionOrNull,
  hasAvailableUpdate: v.boolean(),
  readiness: toolReadinessShape,
  evalCoverage: evalCoverageShape,
}));

export const starterSkillSeedShape = v.object({
  createdCount: v.number(),
  skippedCount: v.number(),
  created: v.array(v.object({
    skillId: v.id("agentSkills"),
    name: v.string(),
    skillVersionId: v.id("agentSkillVersions"),
  })),
  skipped: v.array(v.string()),
});

export const skillVersionStampShape = v.object({
  skillId: v.id("agentSkills"),
  skillVersionId: v.id("agentSkillVersions"),
});

export const skillMarkdownImportShape = v.object({
  ...skillVersionStampShape.fields,
  outcome: v.union(v.literal("CREATED"), v.literal("UPDATED"), v.literal("UNCHANGED")),
  refreshedAgents: v.number(),
});

export const skillDeletionShape = v.object({ detachedAgents: v.number() });

export const skillBindingUpgradeShape = v.object({
  bindingId: v.id("agentSkillBindings"),
  skillVersionId: v.id("agentSkillVersions"),
  seededEvalFixtureIds: v.array(v.id("agentEvalFixtures")),
});

export const skillBindingBulkUpgradeShape = v.object({
  skillVersionId: v.id("agentSkillVersions"),
  upgradedCount: v.number(),
  upgraded: v.array(v.object({
    bindingId: v.id("agentSkillBindings"),
    agentId: v.id("agents"),
    seededEvalFixtureCount: v.number(),
  })),
});

export const skillBindingShape = v.object({
  bindingId: v.id("agentSkillBindings"),
  skillVersionId: v.id("agentSkillVersions"),
  seededEvalFixtureIds: v.array(v.id("agentEvalFixtures")),
  readiness: toolReadinessShape,
});
