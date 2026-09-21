import { describe, expect, test } from 'vitest';
import {
  readRepoFile,
  extractDeclarationBody,
} from './test/driftUtils';

describe('Ask Hakken Safety Drift', () => {

  test('Ask Hakken assistant runtimes keep the shared safety spine', () => {
    const assistantBody = extractDeclarationBody('convex/aiChat.ts', 'generateHakkenResponse');

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
      `generateHakkenResponse must keep preflight refusal, prompt hierarchy, untrusted history, and untrusted RAG helpers:\n${assistantMissing.join('\n')}`
    ).toEqual([]);

    // The agent run is no longer one function. It starts in `runAgentObjective`
    // or resumes in `continueAgentObjective`, both of which build their
    // configuration through `buildLoopExecutionContext` and then enter the
    // shared `executeObjectiveLoop`. Each part is pinned to the safety helper it
    // owns, so a run cannot reach the model down a path that skipped one — in
    // particular, a resumed run must not be a way around tool authorization.
    // The runtime is three files: agentRuntime.ts keeps the registered
    // actions, agentObjectiveLoop.ts runs the loop, and
    // agentObjectiveLoopService.ts sets a run up and closes it out. Each
    // declaration is pinned in the file it actually lives in, so a move shows
    // up here as a failure rather than as a check that quietly reads nothing —
    // which is what the emptiness assertion below is for.
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
        file: 'convex/agentObjectiveLoopService.ts',
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
    for (const file of [
      'convex/agentRuntime.ts',
      'convex/agentObjectiveLoop.ts',
      'convex/agentObjectiveLoopService.ts',
    ]) {
      const source = readRepoFile(file);
      expect(source, `${file} is missing, so the framing checks below read nothing`).not.toBe('');
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

    // Read across both halves. The manager was split on 2026-08-26 and the
    // confirmation dialog moved to KnowledgeModals.tsx, leaving this check
    // reading a file that no longer held the thing it protects. It kept
    // passing on the state variable that happened to stay behind, so nothing
    // went red and nobody looked. A gate and the check on it must not be able
    // to end up on opposite sides of a file boundary again: both files are
    // named here, and each must be non-empty.
    const managerPath = 'src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx';
    const modalsPath = 'src/app/(dashboard)/admin/_features/knowledge/KnowledgeModals.tsx';
    const managerContents = readRepoFile(managerPath);
    const modalsContents = readRepoFile(modalsPath);

    expect(managerContents, `${managerPath} is missing, so the delete gate below tested nothing`).not.toBe('');
    expect(modalsContents, `${modalsPath} is missing, so the delete gate below tested nothing`).not.toBe('');

    const managerAllowsDirectDelete = /onClick=\{\(\) => deleteDocument/.test(managerContents) ||
      !managerContents.includes('documentToDelete');

    // The dialog itself, where it now lives: it must exist, take the document
    // to delete, and only call back on an explicit confirm.
    // Word-bounded on purpose: a plain substring check matched
    // `KnowledgeDocumentDeleteModalRenamed` too, so renaming the dialog away
    // slipped past the check written to notice exactly that.
    const deleteModalMissing = !/export function KnowledgeDocumentDeleteModal\b/.test(modalsContents) ||
      !/\bonConfirm\b/.test(modalsContents);

    // And the manager must still be rendering it, rather than deleting inline.
    const managerSkipsTheDialog = !/<KnowledgeDocumentDeleteModal\b/.test(managerContents);

    expect(offenders, `Knowledge pages drifted away from the shared knowledge manager:\n${offenders.join('\n')}`).toEqual([]);
    expect(managerAllowsDirectDelete, 'Shared knowledge manager must keep document deletes confirmation-gated.').toBe(false);
    expect(deleteModalMissing, `${modalsPath} must keep a confirmation dialog for document deletes.`).toBe(false);
    expect(managerSkipsTheDialog, 'Shared knowledge manager must render KnowledgeDocumentDeleteModal rather than deleting inline.').toBe(false);
  });
});
