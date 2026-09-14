import { describe, expect, test } from 'vitest';
import {
  readRepoFile,
} from './test/driftUtils';

describe('Repository Documentation Drift', () => {

  // template:remove:start movement
  test('handoff and platform plans keep movement demo files out of scope', () => {
    const guardrailFiles = [
      'AGENTS.md',
      'docs/plans/completed/code-quality-95-plan.md',
      'docs/plans/completed/current-cleanup-checklist.md',
    ];
    const requiredNoTouchPaths = [
      'src/app/(dashboard)/demos/movements/**',
      'src/app/(dashboard)/demos/movement-capture/page.tsx',
      'convex/movements.ts',
    ];

    const missingPaths = guardrailFiles.flatMap((filePath) => {
      const contents = readRepoFile(filePath);

      return requiredNoTouchPaths
        .filter((demoPath) => !contents.includes(demoPath))
        .map((demoPath) => `${filePath}: ${demoPath}`);
    });

    expect(missingPaths, `Movement demo no-touch paths missing from guardrail docs:\n${missingPaths.join('\n')}`).toEqual([]);
  });
// template:remove:end



  test('deployment docs match the production GitHub Actions gate', () => {
    const workflow = readRepoFile('.github/workflows/deploy.yml');
    const deploymentDocs = readRepoFile('docs/developer/deployment.md');
    const requiredGateCommands = [
      // Scoped to runtime deps: devDependencies are not in the deployed image,
      // and the ESLint 9 toolchain transitively pins an unpatchable
      // brace-expansion@1. See the comment in deploy.yml and the weekly
      // security-audit workflow, which tracks the dev chain separately.
      'npm audit --omit=dev --audit-level=high',
      // The guards and coverage gate joined the deploy firewall on 2026-08-19
      // (maintenance plan M3.2): production had been skipping the checks that
      // gate every PR.
      'npm run check:guards',
      'npm run lint',
      'npm run typecheck',
      'npm run test:coverage',
      'npm run coverage:check',
      'npm run build',
    ];

    const missingCommands = requiredGateCommands.flatMap((command) => {
      const missingFromWorkflow = workflow.includes(command) ? [] : [`.github/workflows/deploy.yml: ${command}`];
      const missingFromDocs = deploymentDocs.includes(command) ? [] : [`docs/developer/deployment.md: ${command}`];

      return [...missingFromWorkflow, ...missingFromDocs];
    });

    expect(missingCommands, `Production gate commands are out of sync:\n${missingCommands.join('\n')}`).toEqual([]);
    expect(workflow).toContain('branches:\n      - main');
    expect(deploymentDocs).toContain('Pushing to `main` triggers a production deployment');
  });
});
