import { internalQuery } from "./_generated/server";

// Read-only. Counts how much real content sits in the eval fields the AI Checks
// plan retires in Phase 1, so the decision to drop them is taken against the live
// numbers rather than against an assumption. Nothing here writes.
//
// Run it against whichever deployment matters before the migration. A field that
// reads 0 everywhere can be dropped; a field with content needs its content moved
// or deliberately abandoned, in the open.
//
// Internal rather than admin-facing: it is an operational check run from the CLI
// before a migration, not a screen, and it reads across every tenant, which no
// company admin should be able to do.
//
//   npx convex run evalFieldRetirementAudit:getEvalFieldRetirementAudit
//   npx convex run evalFieldRetirementAudit:getEvalFieldRetirementAudit --prod

const AUDIT_LIMIT = 5000;

// `category` is retired because `affectedEvalCategoriesJson` — the only thing it
// feeds — is written and never read. It is counted anyway: if an admin has been
// using it to organise their cases, that is a real loss even though no code cares.
type CompanyFieldCounts = {
  category: number;
  targetId: number;
  fixtureContextJson: number;
  expectedModelUseCase: number;
  expectedOutputFormat: number;
  judgeRubric: number;
  requiredSourcesJson: number;
  requiredMemoriesJson: number;
  requiredSkillsJson: number;
  nonWidgetNonChatSurface: number;
  advisoryOrWarningSeverity: number;
};

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

// A JSON array field holding "[]" is set but empty, which is not content worth
// migrating. Counting it as content would overstate what a deletion costs.
function hasJsonArrayContent(value: string | undefined) {
  if (!hasText(value)) return false;
  try {
    const parsed = JSON.parse(value as string) as unknown;
    return Array.isArray(parsed) ? parsed.length > 0 : true;
  } catch {
    return true;
  }
}

export const getEvalFieldRetirementAudit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const companyCases = await ctx.db.query("companyEvalCases").take(AUDIT_LIMIT);
    const agentFixtures = await ctx.db.query("agentEvalFixtures").take(AUDIT_LIMIT);

    const companyFields: CompanyFieldCounts = {
      category: 0,
      targetId: 0,
      fixtureContextJson: 0,
      expectedModelUseCase: 0,
      expectedOutputFormat: 0,
      judgeRubric: 0,
      requiredSourcesJson: 0,
      requiredMemoriesJson: 0,
      requiredSkillsJson: 0,
      nonWidgetNonChatSurface: 0,
      advisoryOrWarningSeverity: 0,
    };

    for (const evalCase of companyCases) {
      if (hasText(evalCase.category)) companyFields.category += 1;
      if (hasText(evalCase.targetId)) companyFields.targetId += 1;
      if (hasText(evalCase.fixtureContextJson)) companyFields.fixtureContextJson += 1;
      if (hasText(evalCase.expectedModelUseCase)) companyFields.expectedModelUseCase += 1;
      if (hasText(evalCase.expectedOutputFormat)) companyFields.expectedOutputFormat += 1;
      if (hasText(evalCase.judgeRubric)) companyFields.judgeRubric += 1;
      if (hasJsonArrayContent(evalCase.requiredSourcesJson)) companyFields.requiredSourcesJson += 1;
      if (hasJsonArrayContent(evalCase.requiredMemoriesJson)) companyFields.requiredMemoriesJson += 1;
      if (hasJsonArrayContent(evalCase.requiredSkillsJson)) companyFields.requiredSkillsJson += 1;
      if (evalCase.targetSurface !== "WIDGET" && evalCase.targetSurface !== "COMPANY_CHAT") {
        companyFields.nonWidgetNonChatSurface += 1;
      }
      if (evalCase.severity !== "BLOCKER") companyFields.advisoryOrWarningSeverity += 1;
    }

    let agentBlockedActions = 0;
    let agentMemoryUsage = 0;
    let agentFreeTextTags = 0;

    for (const fixture of agentFixtures) {
      if (hasText(fixture.expectedBlockedActionsJson)) agentBlockedActions += 1;
      if (hasText(fixture.expectedMemoryUsageJson)) agentMemoryUsage += 1;
      // The fixture type is force-added as a tag on write, so a fixture whose only
      // tags are derivable from its type has no hand-written grouping to preserve.
      if (fixture.tags.some((tag) => tag !== fixture.type.toLowerCase())) agentFreeTextTags += 1;
    }

    return {
      truncated: companyCases.length >= AUDIT_LIMIT || agentFixtures.length >= AUDIT_LIMIT,
      company: {
        totalCases: companyCases.length,
        activeCases: companyCases.filter((evalCase) => evalCase.status === "ACTIVE").length,
        fieldsWithContent: companyFields,
      },
      agent: {
        totalFixtures: agentFixtures.length,
        activeFixtures: agentFixtures.filter((fixture) => fixture.status === "ACTIVE").length,
        fieldsWithContent: {
          expectedBlockedActionsJson: agentBlockedActions,
          expectedMemoryUsageJson: agentMemoryUsage,
          handWrittenTags: agentFreeTextTags,
        },
      },
    };
  },
});
