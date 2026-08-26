import type { Doc } from "../_generated/dataModel";
import { appError } from "./appError";
import { isRecord, stableStringify } from "./lang";
import { SKILL_BUNDLE_FORMAT, SKILL_JSON_LIMIT } from "./skillContracts";
import {
  buildSkillPatch,
  hashValue,
  parseOptionalStoredJson,
  parseStringArray,
  parseSuggestedEvalFixtures,
} from "./skillNormalization";

export function getBundleStringArray(value: unknown, field: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw appError("INVALID_INPUT", `${field} must be an array of strings.`);
  }
  return Array.from(new Set(value.map((entry) => entry.trim()).filter(Boolean))).slice(0, 50);
}

export function getBundleRecord(value: unknown, field: string) {
  if (!isRecord(value)) throw appError("INVALID_INPUT", `${field} must be an object.`);
  return value;
}
export function buildSkillBundle(skill: Doc<"agentSkills">, latestVersion: Doc<"agentSkillVersions"> | null) {
  return {
    format: SKILL_BUNDLE_FORMAT,
    exportedAt: Date.now(),
    source: {
      skillId: skill._id,
      versionNumber: latestVersion?.versionNumber,
      snapshotHash: latestVersion?.snapshotHash,
    },
    skill: {
      name: skill.name,
      description: skill.description,
      category: skill.category,
      riskLevel: skill.riskLevel,
      instruction: skill.instruction,
      requiredToolMappings: parseStringArray(skill.requiredToolMappingsJson),
      recommendedToolMappings: parseStringArray(skill.recommendedToolMappingsJson),
      recommendedKnowledge: parseOptionalStoredJson(skill.recommendedKnowledgeJson),
      defaultRules: parseOptionalStoredJson(skill.defaultRulesJson),
      suggestedEvalFixtures: parseSkillSuggestedFixtures(skill),
    },
  };
}

export function buildSkillPatchFromBundle(bundleJson: string, nameOverride?: string) {
  if (bundleJson.length > SKILL_JSON_LIMIT * 2) throw appError("INVALID_INPUT", "Skill bundle cannot exceed 48000 characters.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bundleJson) as unknown;
  } catch {
    throw appError("INVALID_INPUT", "Skill bundle must be valid JSON.");
  }
  const bundle = getBundleRecord(parsed, "Skill bundle");
  if (bundle.format !== SKILL_BUNDLE_FORMAT) {
    throw appError("INVALID_INPUT", `Skill bundle format must be ${SKILL_BUNDLE_FORMAT}.`);
  }
  const skill = getBundleRecord(bundle.skill, "Skill bundle skill");
  const riskLevel = skill.riskLevel;
  if (riskLevel !== "LOW" && riskLevel !== "MEDIUM" && riskLevel !== "HIGH") {
    throw appError("INVALID_INPUT", "Skill bundle riskLevel is invalid.");
  }
  const recommendedKnowledge = skill.recommendedKnowledge;
  const defaultRules = skill.defaultRules;
  return buildSkillPatch({
    name: nameOverride ?? (typeof skill.name === "string" ? skill.name : undefined),
    description: typeof skill.description === "string" ? skill.description : undefined,
    category: typeof skill.category === "string" ? skill.category : "GENERAL",
    status: "DRAFT",
    riskLevel,
    instruction: typeof skill.instruction === "string" ? skill.instruction : undefined,
    requiredToolMappingsJson: stableStringify(getBundleStringArray(skill.requiredToolMappings, "Skill bundle requiredToolMappings")),
    recommendedToolMappingsJson: stableStringify(getBundleStringArray(skill.recommendedToolMappings, "Skill bundle recommendedToolMappings")),
    recommendedKnowledgeJson: recommendedKnowledge === undefined ? undefined : stableStringify(recommendedKnowledge),
    defaultRulesJson: defaultRules === undefined ? undefined : stableStringify(defaultRules),
    suggestedEvalFixturesJson: stableStringify(Array.isArray(skill.suggestedEvalFixtures) ? skill.suggestedEvalFixtures : []),
  });
}
export function parseSkillSuggestedFixtures(skill: Doc<"agentSkills">) {
  const parsed = parseSuggestedEvalFixtures(skill.suggestedEvalFixturesJson);
  return parsed.fixtures;
}

export function buildSkillSnapshot(skill: Doc<"agentSkills">) {
  const requiredToolMappings = parseStringArray(skill.requiredToolMappingsJson);
  const recommendedToolMappings = parseStringArray(skill.recommendedToolMappingsJson);
  const suggestedEvalFixtures = parseSkillSuggestedFixtures(skill);
  const snapshot = {
    skill: {
      id: skill._id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      status: skill.status,
      riskLevel: skill.riskLevel,
      updatedAt: skill.updatedAt,
    },
    instruction: skill.instruction,
    requiredToolMappings,
    recommendedToolMappings,
    recommendedKnowledgeJson: skill.recommendedKnowledgeJson,
    defaultRulesJson: skill.defaultRulesJson,
    suggestedEvalFixtures,
  };

  return {
    snapshot,
    snapshotJson: stableStringify(snapshot),
    instructionHash: hashValue(skill.instruction),
    toolRequirementHash: hashValue({
      requiredToolMappings,
      recommendedToolMappings,
    }),
    evalHash: hashValue(suggestedEvalFixtures),
  };
}
