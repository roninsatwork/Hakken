import type { Doc, Id } from "../_generated/dataModel";
import { parseSourceEvidence } from "./skillNormalization";

export function truncateLearningText(value: string | undefined, limit = 180) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}
export function getFixtureSkillEvidence(fixture: Doc<"agentEvalFixtures">) {
  const evidence = parseSourceEvidence(fixture.sourceEvidenceJson);
  return {
    source: typeof evidence.source === "string" ? evidence.source : undefined,
    skillId: typeof evidence.skillId === "string" ? evidence.skillId as Id<"agentSkills"> : undefined,
    skillVersionId: typeof evidence.skillVersionId === "string" ? evidence.skillVersionId as Id<"agentSkillVersions"> : undefined,
  };
}

export function isFixtureForSkill(fixture: Doc<"agentEvalFixtures">, skillId: Id<"agentSkills">) {
  const evidence = getFixtureSkillEvidence(fixture);
  return evidence.source === "agent_skill" && evidence.skillId === skillId;
}
