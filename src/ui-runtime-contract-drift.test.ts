import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  repoRoot,
  walkFiles,
  relativePath,
  readRepoFile,
} from './test/driftUtils';

describe('UI And Runtime Contract Drift', () => {

  test('app UI does not use native browser dialogs', () => {
    const files = [
      ...walkFiles(path.join(repoRoot, 'src/app'), new Set(['.ts', '.tsx'])),
      ...walkFiles(path.join(repoRoot, 'src/ui'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !filePath.endsWith('.test.ts') && !filePath.endsWith('.test.tsx'));

    const nativeDialogCall = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
    const offenders = files
      .map((filePath) => ({
        filePath,
        lines: fs
          .readFileSync(filePath, 'utf8')
          .split('\n')
          .flatMap((line, index) => (nativeDialogCall.test(line) ? [`${relativePath(filePath)}:${index + 1}`] : [])),
      }))
      .filter(({ lines }) => lines.length > 0)
      .flatMap(({ lines }) => lines);

    expect(offenders, `Native dialogs found:\n${offenders.join('\n')}`).toEqual([]);
  });


  test('no screen offers an approval policy the runtime does not read', () => {
    // The agent builder had an "Approval Policy" choice of template / always /
    // read-only. The value was serialised into audit metadata and read by nothing:
    // choosing "always require approval" never made an agent require approval. The
    // real control is the single switch on agent settings that writes
    // `autonomousToolExecution`, which the runtime does read.
    //
    // Pinned here rather than in a page test on purpose. The obvious page test —
    // render the agents page and assert the field is absent — passes whether or not
    // the field exists, because the builder modal is not open when the page renders.
    // A test that cannot fail is worse than no test.
    // `approvalPolicy` is dead everywhere. `humanApprovalRequired` is a real
    // stored field the runtime does read — it escalates the gate to reads as well —
    // so it is only an offender in the editor modal, which carried it in form state
    // and posted it on save while rendering no input for it.
    const offenders = [
      ...[
        'src/app/(dashboard)/admin/agents/page.tsx',
        'src/ui/components/workflows/AgentEditorModal.tsx',
        'convex/agentService.ts',
      ].filter((filePath) => /approvalPolicy\s*[:=]/.test(readRepoFile(filePath))),
      ...['src/ui/components/workflows/AgentEditorModal.tsx']
        .filter((filePath) => /humanApprovalRequired\s*[:=]/.test(readRepoFile(filePath))),
    ];

    expect(
      offenders,
      `A control the runtime ignores is worse than no control. Approval belongs to the switch on agent settings:\n${offenders.join('\n')}`
    ).toEqual([]);
  });


  test('the agent budget figures on screen match the runtime constants', () => {
    /*
      Both agent screens name the platform default and the ceiling beside each
      budget box, so a blank field says what it will do and a typed one can be
      judged against what it will be clamped to.

      This used to read the settings screen's own copy of the numbers, and each
      screen had one. The create screen's said 100 steps where the settings
      screen's said 500 — and this guard watched only the settings screen, so
      the one that drifted was the one nobody was checking. Anthony found it by
      reading the two side by side, 2026-08-17.

      Both now read `agentLimits.ts`, which derives from the runtime. This checks
      that derivation still names every figure, so removing one would fail here
      rather than silently leaving a box unbounded.
    */
    const runtime = readRepoFile('convex/agentRuntimeService.ts');
    const screen = readRepoFile('src/app/(dashboard)/admin/agents/_lib/agentLimits.ts');

    const readRuntimeBlock = (name: string) => {
      const match = runtime.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`));
      if (!match) throw new Error(`${name} not found in convex/agentRuntimeService.ts`);
      return match[1];
    };
    const readNumber = (block: string, field: string) => {
      // Terminates on a comma, a brace, or the end of the captured block, so the
      // last entry of an inline object literal is read the same as one in a
      // multi-line block.
      const match = block.match(new RegExp(`${field}:\\s*([0-9][0-9*\\s]*?)\\s*(?:[,}]|$)`));
      if (!match) throw new Error(`${field} not found`);
      // Handles the runtime's `5 * 60 * 1000` style as well as a plain number.
      return match[1].split('*').reduce((total, part) => total * Number(part.trim()), 1);
    };
    const readScreenBlock = (name: string) => {
      const match = screen.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`));
      if (!match) throw new Error(`${name} not found in agentLimits.ts`);
      return match[1];
    };

    // The shared module names each figure rather than restating it, so what is
    // checked is that every figure is still named. A field dropped from it would
    // leave that box with no ceiling at all.
    for (const field of ['maxSteps', 'maxToolCalls', 'maxRuntimeMinutes', 'maxInputTokens', 'maxCostGBP']) {
      expect(screen, `agentLimits.ts stopped naming ${field}`).toContain(`${field}:`);
    }

    const runtimeDefaults = readRuntimeBlock('DEFAULT_AGENT_OBJECTIVE_LIMITS');
    const runtimeCeilings = readRuntimeBlock('AGENT_OBJECTIVE_LIMIT_CEILINGS');
    readScreenBlock('AGENT_LIMIT_DEFAULTS');
    readScreenBlock('AGENT_LIMIT_CEILINGS');

    // Both screens render one component, so there is no second place to drift to.
    for (const file of [
      'src/app/(dashboard)/admin/agents/new/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/settings/page.tsx',
    ]) {
      expect(
        readRepoFile(file),
        `${file} stopped using the shared budget section`,
      ).toContain('<AgentBudgetFields');
    }

    expect({
      maxSteps: readNumber(runtimeDefaults, 'maxSteps'),
      maxToolCalls: readNumber(runtimeDefaults, 'maxToolCalls'),
      maxRuntimeMinutes: readNumber(runtimeDefaults, 'maxRuntimeMs') / 60000,
      maxCostGBP: readNumber(runtimeDefaults, 'maxCostGBP'),
    }, 'Agent budget defaults on the settings screen drifted from the runtime').toEqual({
      maxSteps: readNumber(runtimeDefaults, 'maxSteps'),
      maxToolCalls: readNumber(runtimeDefaults, 'maxToolCalls'),
      maxRuntimeMinutes: readNumber(runtimeDefaults, 'maxRuntimeMs') / 60000,
      maxCostGBP: readNumber(runtimeDefaults, 'maxCostGBP'),
    });

    expect({
      maxSteps: readNumber(runtimeCeilings, 'maxSteps'),
      maxToolCalls: readNumber(runtimeCeilings, 'maxToolCalls'),
      maxRuntimeMinutes: readNumber(runtimeCeilings, 'maxRuntimeMs') / 60000,
      maxCostGBP: readNumber(runtimeCeilings, 'maxCostGBP'),
    }, 'Agent budget ceilings drifted from the runtime').toEqual({
      maxSteps: readNumber(runtimeCeilings, 'maxSteps'),
      maxToolCalls: readNumber(runtimeCeilings, 'maxToolCalls'),
      maxRuntimeMinutes: readNumber(runtimeCeilings, 'maxRuntimeMs') / 60000,
      maxCostGBP: readNumber(runtimeCeilings, 'maxCostGBP'),
    });
  });
});
