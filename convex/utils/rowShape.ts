import { v } from "convex/values";

import schema from "../schema";

/**
 * The declared shape of a whole row, taken from the schema rather than copied.
 *
 * Some surfaces genuinely hand back a complete record — a detail screen that
 * shows every field of one thing. Those still need a declared shape, because a
 * surface that declares nothing is a surface where a new column added to the
 * table silently starts travelling to the browser. That is how
 * `users.tokenIdentifier` and `workflows.webhookSecret` reached screens that
 * had no use for them.
 *
 * Hand-writing the field list would have created a second copy of the schema
 * to keep in step, and the copy always loses. Deriving it means a column added
 * to the table is declared here the same day, and a column that should *not*
 * travel has to be omitted deliberately rather than forgotten — which is the
 * decision worth making explicit.
 */
const whole = <T extends keyof typeof schema.tables>(table: T) =>
  ({ ...schema.tables[table].validator.fields, _creationTime: v.number() });

export const rowShape = {
  agentEvalFixtures: v.object({ ...whole("agentEvalFixtures"), _id: v.id("agentEvalFixtures") }),
  agentEvalSuitePresets: v.object({ ...whole("agentEvalSuitePresets"), _id: v.id("agentEvalSuitePresets") }),
  agentLogs: v.object({ ...whole("agentLogs"), _id: v.id("agentLogs") }),
  agentImprovementSuggestions: v.object({ ...whole("agentImprovementSuggestions"), _id: v.id("agentImprovementSuggestions") }),
  agentMemoryCandidates: v.object({ ...whole("agentMemoryCandidates"), _id: v.id("agentMemoryCandidates") }),
  agentSkillBindings: v.object({ ...whole("agentSkillBindings"), _id: v.id("agentSkillBindings") }),
  agentRunFeedback: v.object({ ...whole("agentRunFeedback"), _id: v.id("agentRunFeedback") }),
  agentRunReflections: v.object({ ...whole("agentRunReflections"), _id: v.id("agentRunReflections") }),
  agentSkillVersions: v.object({ ...whole("agentSkillVersions"), _id: v.id("agentSkillVersions") }),
  agentSkills: v.object({ ...whole("agentSkills"), _id: v.id("agentSkills") }),
  aiRules: v.object({ ...whole("aiRules"), _id: v.id("aiRules") }),
  aiTools: v.object({ ...whole("aiTools"), _id: v.id("aiTools") }),
  companies: v.object({ ...whole("companies"), _id: v.id("companies") }),
  companyEvalCases: v.object({ ...whole("companyEvalCases"), _id: v.id("companyEvalCases") }),
  companyEvalRuns: v.object({ ...whole("companyEvalRuns"), _id: v.id("companyEvalRuns") }),
  companyMemories: v.object({ ...whole("companyMemories"), _id: v.id("companyMemories") }),
  companyMemoryCandidates: v.object({ ...whole("companyMemoryCandidates"), _id: v.id("companyMemoryCandidates") }),
  companySkillBindings: v.object({ ...whole("companySkillBindings"), _id: v.id("companySkillBindings") }),
  companySkills: v.object({ ...whole("companySkills"), _id: v.id("companySkills") }),
  knowledgeDocuments: v.object({ ...whole("knowledgeDocuments"), _id: v.id("knowledgeDocuments") }),
  logins: v.object({ ...whole("logins"), _id: v.id("logins") }),
  purgeHistory: v.object({ ...whole("purgeHistory"), _id: v.id("purgeHistory") }),
  widgets: v.object({ ...whole("widgets"), _id: v.id("widgets") }),
  messages: v.object({ ...whole("messages"), _id: v.id("messages") }),
  phoneCalls: v.object({ ...whole("phoneCalls"), _id: v.id("phoneCalls") }),
  plans: v.object({ ...whole("plans"), _id: v.id("plans") }),
  salesDataAreasOfInterest: v.object({ ...whole("salesDataAreasOfInterest"), _id: v.id("salesDataAreasOfInterest") }),
  salesDataCategoryLinks: v.object({ ...whole("salesDataCategoryLinks"), _id: v.id("salesDataCategoryLinks") }),
  salesDataFrequencies: v.object({ ...whole("salesDataFrequencies"), _id: v.id("salesDataFrequencies") }),
  salesDataRows: v.object({ ...whole("salesDataRows"), _id: v.id("salesDataRows") }),
  schedules: v.object({ ...whole("schedules"), _id: v.id("schedules") }),
  workflowExecutionSteps: v.object({ ...whole("workflowExecutionSteps"), _id: v.id("workflowExecutionSteps") }),
  workflowExecutions: v.object({ ...whole("workflowExecutions"), _id: v.id("workflowExecutions") }),
};
