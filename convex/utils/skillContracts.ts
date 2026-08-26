import { v } from "convex/values";

export const SKILL_CATALOG_LIMIT = 250;
export const SKILL_BINDING_LIMIT = 100;
/**
 * The ceiling for an operation that has to touch every agent bound to one
 * skill, rather than a page of them.
 *
 * `SKILL_BINDING_LIMIT` is a page size, and it is the right size where the
 * caller loops over the whole catalogue and can say "partial". It is the wrong
 * size for deleting a skill or moving its agents onto a new version: those
 * promise to act on all of them, and a capped read made the promise false and
 * silent. Deleting left the surplus bindings pointing at a skill that no longer
 * existed; upgrading left the surplus agents running the old instruction text
 * with nothing on screen to say so.
 *
 * This is deliberately far above any real population and still well inside what
 * one Convex transaction can read and write, so the refusal below is a
 * backstop rather than something an operator meets.
 */
export const SKILL_BINDING_WALK_LIMIT = 2000;
export const TOOL_LOOKUP_LIMIT = 500;
export const SKILL_TEXT_LIMIT = 8000;
export const SKILL_JSON_LIMIT = 24000;
export const SKILL_MARKDOWN_LIMIT = 24000;
export const STARTER_SKILL_CATEGORY = "STARTER";
export const SKILL_BUNDLE_FORMAT = "sonae.agentSkillBundle.v1";

export type SkillStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type SkillRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type EvalFixtureType =
  | "HAPPY_PATH"
  | "APPROVAL_PAUSE"
  | "REJECTED_ACTION"
  | "PROMPT_INJECTION"
  | "TENANT_BOUNDARY"
  | "BAD_TOOL_ARGS"
  | "CANCELLATION"
  | "REPLAYED_FAILURE"
  | "TOOL_PLAN"
  | "COST_LATENCY_BUDGET";

export const skillStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("ARCHIVED")
);

export const skillRiskLevelValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH")
);

export const evalFixtureTypes: EvalFixtureType[] = [
  "HAPPY_PATH",
  "TOOL_PLAN",
  "APPROVAL_PAUSE",
  "REJECTED_ACTION",
  "PROMPT_INJECTION",
  "TENANT_BOUNDARY",
  "BAD_TOOL_ARGS",
  "CANCELLATION",
  "REPLAYED_FAILURE",
  "COST_LATENCY_BUDGET",
];

export type SuggestedEvalFixture = {
  type: EvalFixtureType;
  objective: string;
  expectedFinalOutputRubric: string;
  expectedToolMappings?: string[];
  expectedBlockedActionsJson?: string;
  tags?: string[];
};

export type StarterSkillDefinition = {
  name: string;
  description: string;
  riskLevel: SkillRiskLevel;
  instruction: string;
  requiredToolMappings?: string[];
  recommendedToolMappings?: string[];
  suggestedEvalFixtures: SuggestedEvalFixture[];
};

export type ParsedMarkdownSection = {
  title: string;
  normalizedTitle: string;
  body: string;
};

export type MarkdownSkillDraft = {
  sourceFilename?: string;
  sourceHash: string;
  name: string;
  description?: string;
  category: string;
  riskLevel: SkillRiskLevel;
  instruction: string;
  requiredToolMappingsJson: string;
  recommendedToolMappingsJson: string;
  suggestedEvalFixturesJson: string;
  validation: {
    errors: string[];
    warnings: string[];
    suggestions: string[];
  };
};
