import path from 'path';
import { describe, expect, test } from 'vitest';
import { extractDeclarationBody, readRepoFile, relativePath, repoRoot, walkFiles } from './test/driftUtils';

/**
 * One brain, many doors (docs/plans/active/assistant-foundation-plan.md,
 * item 3).
 *
 * What Hakken knows — the platform's and the company's prompts, the rules,
 * the skills, the memories, the asker's private note, and what is read for
 * each question — is put together in one place, `convex/assistantKnowledge.ts`,
 * and every door that answers a person reads it there. Until 2026-10-06 it was
 * put together in three places, each a little different, and the same question
 * got a different answer depending on the door. Anthony: "we cannot have two
 * AI giving two different answers."
 *
 * A fresh copy always compiles and a duplicate never announces itself, so
 * this is what notices one. It fails a file outside the shared one that reads
 * a piece of what Hakken knows, and a door that stops reading it through the
 * shared one.
 *
 * The files below that may still read a piece are not doors: each is named
 * with what it is instead. The list may shrink, never grow — a new door reads
 * through `gatherInstructions` and `gatherReading`, and adding an entry here
 * is not the fix.
 */

/** The one place, and the files the pieces are defined in. */
const SHARED = new Set([
  'convex/assistantKnowledge.ts',
  'convex/aiPromptAssembly.ts',
  'convex/knowledgeRetrieval.ts',
  'convex/libraryArticleSearch.ts',
]);

/** Work that reads a piece of what Hakken knows but answers nobody in a conversation. */
const NOT_DOORS: Record<string, string> = {
  'convex/agentRuntime.ts':
    "runTriggeredAgentObjective: an agent's scheduled, workflow, webhook or replay run, which nobody waits on in a conversation",
  'convex/agentObjectiveLoopService.ts':
    "buildTriggeredAgentInstruction: the same runs' instructions — the agent's own, with the company's always memories",
  'convex/knowledgeActions.ts':
    "testRetrieval: the knowledge screen's Test retrieval, a diagnostic of one shelf that reads with the shared allowance",
};

/** A piece of what Hakken knows, as the code reads it. */
const PIECES = [
  // Instructions.
  'buildAssistantSystemInstruction(',
  'buildAgentSystemInstruction(',
  'internal.system.getInternalSystemPrompt',
  'internal.aiRules.getActiveRulesInternal',
  'internal.companySkills.getRuntimeCompanySkillsInternal',
  'internal.companyMemories.getAlwaysMemoriesInternal',
  'internal.userMemories.getActiveForUserInternal',
  // Reading.
  'searchKnowledgeScope(',
  'selectKnowledgeChunksWithinBudget(',
  'searchHelpfulContent(',
  'internal.wikiActions.selectWikiContextForQuery',
  'internal.companyMemories.getRuntimeMemoriesInternal',
  'internal.agentMemories.searchMemoryInternal',
  'internal.wikiPages.getRenderedPageForWidgetThread',
];

/** Comments say what a piece is; only code reads one. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const backendFiles = walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
  .map((file) => relativePath(file).replaceAll(path.sep, '/'))
  .filter((file) => !file.includes('.test.') && !file.includes('_generated'));

const piecesIn = (file: string) => {
  const code = withoutComments(readRepoFile(file));
  return PIECES.filter((piece) => code.includes(piece));
};

/** Every door that answers a person, and what it must read through. */
const DOORS: Array<{ file: string; declaration: string; reads: string[] }> = [
  { file: 'convex/aiVoiceSession.ts', declaration: 'createRealtimeVoiceSession', reads: ['gatherInstructions'] },
  { file: 'convex/aiVoiceSession.ts', declaration: 'buildSpokenSessionInstructions', reads: ['gatherInstructions'] },
  { file: 'convex/aiVoiceSession.ts', declaration: 'searchKnowledgeForVoiceInternal', reads: ['gatherReading'] },
  { file: 'convex/agentRuntime.ts', declaration: 'runAgentObjective', reads: ['gatherReading'] },
  { file: 'convex/agentObjectiveLoopService.ts', declaration: 'buildLoopExecutionContext', reads: ['gatherInstructions'] },
  // The phone line and reception start their sessions here.
  { file: 'convex/aiVoiceSession.ts', declaration: 'createVoiceTicketForCompany', reads: ['buildSpokenSessionInstructions'] },
  { file: 'convex/kioskActions.ts', declaration: 'createKioskVoiceSession', reads: ['buildSpokenSessionInstructions'] },
];

describe('one brain, many doors', () => {
  test('the guard read the backend', () => {
    // A guard that reads nothing passes exactly as happily as one that works.
    expect(backendFiles.length).toBeGreaterThan(250);
    expect(piecesIn('convex/assistantKnowledge.ts').length).toBeGreaterThan(10);
  });

  test('no file outside the shared one reads a piece of what Hakken knows', () => {
    const offenders = backendFiles
      .filter((file) => !SHARED.has(file) && !(file in NOT_DOORS))
      .flatMap((file) => piecesIn(file).map((piece) => `${file} reads ${piece}`));

    expect(
      offenders,
      `Put together what Hakken knows only in convex/assistantKnowledge.ts: a door calls gatherInstructions and gatherReading.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('every file named as not a door still reads a piece, so the list can only shrink', () => {
    const stale = Object.keys(NOT_DOORS).filter((file) => !backendFiles.includes(file) || piecesIn(file).length === 0);

    expect(stale, `Remove these from NOT_DOORS — they no longer read a piece:\n${stale.join('\n')}`).toEqual([]);
  });

  test('every door reads through the shared one', () => {
    const missing = DOORS.flatMap(({ file, declaration, reads }) => {
      const body = extractDeclarationBody(file, declaration);
      if (!body) return [`${declaration} not found in ${file}`];
      return reads.filter((needle) => !body.includes(needle)).map((needle) => `${file} ${declaration} does not call ${needle}`);
    });

    expect(missing).toEqual([]);
  });
});
