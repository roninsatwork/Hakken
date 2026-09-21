import { describe, expect, test } from 'vitest';
import {
  readRepoFile,
} from './test/driftUtils';

describe('Repository Documentation Drift', () => {




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
