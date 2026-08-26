import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/** What a company's own skill screens hand back. */

const skillFields = schema.tables.companySkills.validator.fields;

export const companySkillSummaryShape = v.object({
  activeSkills: v.number(),
  draftSkills: v.number(),
  enabledBindings: v.number(),
  boundActiveSkills: v.number(),
  highRiskSkills: v.number(),
  missingToolRequirementSkills: v.number(),
  highRiskMissingApproval: v.number(),
  readySkills: v.number(),
});

export const companySkillRuntimePreviewShape = v.array(v.object({
  skillId: v.id("companySkills"),
  name: skillFields.name,
  category: skillFields.category,
  riskLevel: skillFields.riskLevel,
  requiredTools: v.array(v.string()),
}));

export const companySkillPageShape = paginationResultValidator(v.object({
  ...rowShape.companySkills.fields,
  surfaces: v.object({ chat: v.boolean(), widget: v.boolean() }),
}));

export const importableGlobalSkillPageShape = paginationResultValidator(rowShape.agentSkills);

export const importableGlobalSkillListShape = v.array(rowShape.agentSkills);

export const companySkillBindingListShape = v.array(rowShape.companySkillBindings);

export const companySkillStampShape = v.object({ skillId: v.id("companySkills") });

export const companySkillArchiveShape = v.object({
  skillId: v.id("companySkills"),
  disabledBindings: v.optional(v.number()),
});
