import { appError } from "./appError";
import { isRecord, stableStringify } from "./lang";
import { SKILL_JSON_LIMIT, SKILL_TEXT_LIMIT, evalFixtureTypes } from "./skillContracts";
import type {
  EvalFixtureType,
  SkillRiskLevel,
  SkillStatus,
  SuggestedEvalFixture,
} from "./skillContracts";

export function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

export function hashValue(value: unknown) {
  return hashString(stableStringify(value));
}

export function normalizeText(value: string | undefined, field: string, limit = SKILL_TEXT_LIMIT) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw appError("INVALID_INPUT", `${field} is required.`);
  if (trimmed.length > limit) throw appError("INVALID_INPUT", `${field} cannot exceed ${limit} characters.`);
  return trimmed;
}

export function normalizeOptionalText(value: string | undefined, limit = SKILL_TEXT_LIMIT) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > limit) throw appError("INVALID_INPUT", `Text cannot exceed ${limit} characters.`);
  return trimmed;
}

export function normalizeCategory(value: string | undefined) {
  const category = (value || "GENERAL").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  return category.length > 0 ? category.slice(0, 80) : "GENERAL";
}

export function parseJson(value: string | undefined, label: string) {
  const trimmed = normalizeOptionalText(value, SKILL_JSON_LIMIT);
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw appError("INVALID_INPUT", `${label} must be valid JSON.`);
  }
}

export function getStringArrayJson(value: string | undefined, label: string) {
  const parsed = parseJson(value, label);
  if (parsed === undefined) return { json: undefined, values: [] as string[] };
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw appError("INVALID_INPUT", `${label} must be a JSON array of strings.`);
  }

  const values = Array.from(new Set(parsed.map((entry) => entry.trim()).filter(Boolean))).slice(0, 50);
  return {
    values,
    json: values.length > 0 ? JSON.stringify(values) : undefined,
  };
}

export function validateOptionalJson(value: string | undefined, label: string) {
  const parsed = parseJson(value, label);
  if (parsed === undefined) return undefined;
  return stableStringify(parsed);
}


export function normalizeTags(tags: unknown, fixtureType: EvalFixtureType) {
  const rawTags = Array.isArray(tags) ? tags : [];
  return Array.from(new Set([
    fixtureType.toLowerCase(),
    ...rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-"))
      .filter(Boolean),
  ])).slice(0, 12);
}

export function parseSuggestedEvalFixtures(value: string | undefined) {
  const parsed = parseJson(value, "Suggested eval fixtures");
  if (parsed === undefined) return { json: undefined, fixtures: [] as SuggestedEvalFixture[] };
  if (!Array.isArray(parsed)) throw appError("INVALID_INPUT", "Suggested eval fixtures must be a JSON array.");

  const fixtures = parsed.slice(0, 50).map((entry, index): SuggestedEvalFixture => {
    if (!isRecord(entry)) throw appError("INVALID_INPUT", `Suggested eval fixture ${index + 1} must be an object.`);
    const type = entry.type;
    if (typeof type !== "string" || !evalFixtureTypes.includes(type as EvalFixtureType)) {
      throw appError("INVALID_INPUT", `Suggested eval fixture ${index + 1} has an invalid type.`);
    }
    const objective = normalizeText(
      typeof entry.objective === "string" ? entry.objective : undefined,
      `Suggested eval fixture ${index + 1} objective`,
      2000
    );
    const expectedFinalOutputRubric = normalizeText(
      typeof entry.expectedFinalOutputRubric === "string" ? entry.expectedFinalOutputRubric : undefined,
      `Suggested eval fixture ${index + 1} rubric`,
      2000
    );
    const expectedToolMappings = Array.isArray(entry.expectedToolMappings)
      ? Array.from(new Set(entry.expectedToolMappings
        .filter((mapping): mapping is string => typeof mapping === "string")
        .map((mapping) => mapping.trim())
        .filter(Boolean)
      )).slice(0, 25)
      : undefined;
    const expectedBlockedActionsJson = typeof entry.expectedBlockedActionsJson === "string"
      ? validateOptionalJson(entry.expectedBlockedActionsJson, `Suggested eval fixture ${index + 1} blocked actions`)
      : undefined;

    return {
      type: type as EvalFixtureType,
      objective,
      expectedFinalOutputRubric,
      expectedToolMappings,
      expectedBlockedActionsJson,
      tags: normalizeTags(entry.tags, type as EvalFixtureType),
    };
  });

  return {
    fixtures,
    json: fixtures.length > 0 ? stableStringify(fixtures) : undefined,
  };
}

export function buildExpectedToolPlanJson(mappings: string[] | undefined) {
  const normalized = Array.from(new Set((mappings || []).map((mapping) => mapping.trim()).filter(Boolean)));
  return normalized.length > 0
    ? JSON.stringify(normalized.map((handlerMapping) => ({ handlerMapping })))
    : undefined;
}

export function buildSkillPatch(args: {
  name?: string;
  description?: string;
  category?: string;
  status?: SkillStatus;
  riskLevel?: SkillRiskLevel;
  instruction?: string;
  requiredToolMappingsJson?: string;
  recommendedToolMappingsJson?: string;
  recommendedKnowledgeJson?: string;
  defaultRulesJson?: string;
  suggestedEvalFixturesJson?: string;
}) {
  const requiredTools = getStringArrayJson(args.requiredToolMappingsJson, "Required tool mappings");
  const recommendedTools = getStringArrayJson(args.recommendedToolMappingsJson, "Recommended tool mappings");
  const suggestedFixtures = parseSuggestedEvalFixtures(args.suggestedEvalFixturesJson);

  return {
    ...(args.name !== undefined ? { name: normalizeText(args.name, "Skill name", 160) } : {}),
    ...(args.description !== undefined ? { description: normalizeOptionalText(args.description, 1000) } : {}),
    ...(args.category !== undefined ? { category: normalizeCategory(args.category) } : {}),
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.riskLevel !== undefined ? { riskLevel: args.riskLevel } : {}),
    ...(args.instruction !== undefined ? { instruction: normalizeText(args.instruction, "Skill instruction") } : {}),
    ...(args.requiredToolMappingsJson !== undefined ? { requiredToolMappingsJson: requiredTools.json } : {}),
    ...(args.recommendedToolMappingsJson !== undefined ? { recommendedToolMappingsJson: recommendedTools.json } : {}),
    ...(args.recommendedKnowledgeJson !== undefined ? { recommendedKnowledgeJson: validateOptionalJson(args.recommendedKnowledgeJson, "Recommended knowledge") } : {}),
    ...(args.defaultRulesJson !== undefined ? { defaultRulesJson: validateOptionalJson(args.defaultRulesJson, "Default rules") } : {}),
    ...(args.suggestedEvalFixturesJson !== undefined ? { suggestedEvalFixturesJson: suggestedFixtures.json } : {}),
  };
}
export function parseStringArray(value: string | undefined) {
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

export function parseSourceEvidence(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function parseOptionalStoredJson(value: string | undefined) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
