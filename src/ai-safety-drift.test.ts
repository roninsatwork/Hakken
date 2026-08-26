import { describe, expect, test } from 'vitest';
import {
  readRepoFile,
  extractDeclarationBody,
} from './test/driftUtils';

describe('Ask Sonae Safety Drift', () => {

  test('Ask Sonae assistant runtimes keep the shared safety spine', () => {
    const assistantBody = extractDeclarationBody('convex/aiChat.ts', 'generateSonaeResponse');

    // The safety check and refusal write moved behind `guardModelTurn` in
    // `convex/modelTurnService.ts` (maintenance plan, Phase 8), so the spine
    // is now pinned by that one name; `convex/modelTurnService.test.ts` holds
    // the fuller guard that neither runtime re-grows a private copy.
    const assistantRequirements = [
      'guardModelTurn',
      'runModelTurn',
      'finishAssistantReply',
      'buildAssistantSystemInstruction',
      'buildUntrustedConversationHistory',
      'buildUntrustedKnowledgeContext',
    ];
    const assistantMissing = assistantRequirements.filter((needle) => !assistantBody.includes(needle));

    expect(
      assistantMissing,
      `generateSonaeResponse must keep preflight refusal, prompt hierarchy, untrusted history, and untrusted RAG helpers:\n${assistantMissing.join('\n')}`
    ).toEqual([]);

    // The agent run is no longer one function. It starts in `runAgentObjective`
    // or resumes in `continueAgentObjective`, both of which build their
    // configuration through `buildLoopExecutionContext` and then enter the
    // shared `executeObjectiveLoop`. Each part is pinned to the safety helper it
    // owns, so a run cannot reach the model down a path that skipped one — in
    // particular, a resumed run must not be a way around tool authorization.
    // The loop and its context builder moved to convex/agentObjectiveLoop.ts
    // (WP04, 2026-08-26); the registered actions stayed. Each declaration is
    // pinned in the file it lives in — the requirement set is unchanged.
    const agentSpine: Array<{ file: string; declaration: string; requirements: string[] }> = [
      {
        file: 'convex/agentRuntime.ts',
        declaration: 'runAgentObjective',
        requirements: [
          'guardModelTurn',
          'buildUntrustedKnowledgeContext',
          'buildLoopExecutionContext',
          'executeObjectiveLoop',
        ],
      },
      {
        file: 'convex/agentRuntime.ts',
        declaration: 'continueAgentObjective',
        requirements: ['buildLoopExecutionContext', 'executeObjectiveLoop'],
      },
      {
        file: 'convex/agentObjectiveLoop.ts',
        declaration: 'buildLoopExecutionContext',
        requirements: ['buildAgentSystemInstruction'],
      },
      {
        file: 'convex/agentObjectiveLoop.ts',
        declaration: 'executeObjectiveLoop',
        requirements: ['canExecuteTool'],
      },
    ];

    for (const { file, declaration, requirements } of agentSpine) {
      const body = extractDeclarationBody(file, declaration);
      expect(body, `${declaration} not found in ${file}`).not.toBe('');

      const missing = requirements.filter((needle) => !body.includes(needle));
      expect(
        missing,
        `${declaration} must keep the agent runtime safety spine:\n${missing.join('\n')}`
      ).toEqual([]);
    }

    expect(assistantBody).not.toContain('Previous Conversation History:');
    expect(assistantBody).not.toContain('[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]');

    // Checked across the whole runtime, not one function: the unsafe framing
    // these guard against would be just as harmful in the resumption path.
    for (const file of ['convex/agentRuntime.ts', 'convex/agentObjectiveLoop.ts']) {
      const source = readRepoFile(file);
      expect(source).not.toContain('[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]');
      expect(source).not.toContain('You MUST refer to these when answering');
    }
  });


  test('admin AI rule forms keep prompt-injection warning panels', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/rules/new/page.tsx',
      // Both scoped edit pages are thin wrappers over the shared screen
      // since the admin-clone-readiness plan's phase 2 (2026-08-21), so the
      // warning contract lives in one file.
      'src/app/(dashboard)/admin/_features/rules/EditRuleScreen.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/new/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/ai/rules/new/page.tsx',
    ];
    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AiRuleSafetyWarningPanel') ||
        !contents.includes('trigger=') ||
        !contents.includes('instruction=');
    });

    expect(
      offenders,
      `AI rule forms must keep visible prompt-injection safety warnings before save:\n${offenders.join('\n')}`
    ).toEqual([]);
  });


  test('admin AI prompt editors keep prompt-injection warning panels', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/system-prompt/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/system-prompt/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/ai/prompt/page.tsx',
    ];
    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AiRuleSafetyWarningPanel') ||
        !contents.includes('instruction={promptValue}') ||
        !contents.includes('subject="prompt"');
    });

    expect(
      offenders,
      `AI prompt editors must keep visible prompt-injection safety warnings before save:\n${offenders.join('\n')}`
    ).toEqual([]);
  });


  test('knowledge document deletes remain confirmation-gated', () => {
    // The old global knowledge screen was folded into the platform wiki
    // (global-wiki-plan.md, phase 3); its address must stay a redirect
    // rather than growing a second document manager.
    const globalRedirect = readRepoFile('src/app/(dashboard)/admin/ai/global-knowledge/page.tsx');
    expect(globalRedirect).toContain('redirect("/admin/ai/knowledge")');

    const pages = [
      'src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);
      return !contents.includes('KnowledgeManager');
    });

    const managerContents = readRepoFile('src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx');
    const managerAllowsDirectDelete = /onClick=\{\(\) => deleteDocument/.test(managerContents) ||
      !managerContents.includes('documentToDelete');

    expect(offenders, `Knowledge pages drifted away from the shared knowledge manager:\n${offenders.join('\n')}`).toEqual([]);
    expect(managerAllowsDirectDelete, 'Shared knowledge manager must keep document deletes confirmation-gated.').toBe(false);
  });
});
