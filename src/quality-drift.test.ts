import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { ADMIN_PAGE_SIZE } from './app/(dashboard)/admin/_lib/pagination';

const repoRoot = process.cwd();

const walkFiles = (dir: string, extensions: ReadonlySet<string>): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};

const relativePath = (filePath: string) => path.relative(repoRoot, filePath);
const readRepoFile = (relativeFilePath: string) => fs.readFileSync(path.join(repoRoot, relativeFilePath), 'utf8');

describe('Quality Drift Guardrails', () => {
  test('admin pagination standard stays at 15 rows', () => {
    expect(ADMIN_PAGE_SIZE).toBe(15);
  });

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

  test('admin pagination uses the 15-row standard', () => {
    const adminFiles = walkFiles(path.join(repoRoot, 'src/app/(dashboard)/admin'), new Set(['.tsx']))
      .filter((filePath) => !filePath.endsWith('.test.tsx'));

    const forbiddenPageSizePatterns = [
      /\binitialNumItems\s*:\s*(?!15\b)\d+/,
      /\bloadMore\(\s*(?!15\b)\d+\s*\)/,
      /\b(?:pageSize|itemsPerPage)\s*=\s*(?!15\b)\d+/,
      /\bpageSize\s*:\s*(?!15\b)\d+/,
    ];

    const offenders = adminFiles.flatMap((filePath) => {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');

      return lines.flatMap((line, index) =>
        forbiddenPageSizePatterns.some((pattern) => pattern.test(line))
          ? [`${relativePath(filePath)}:${index + 1}: ${line.trim()}`]
          : []
      );
    });

    expect(offenders, `Non-standard admin pagination found:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('admin list pages keep using shared table primitives after cleanup', () => {
    const pages = [
      'src/app/(dashboard)/admin/agents/page.tsx',
      'src/app/(dashboard)/admin/companies/page.tsx',
      'src/app/(dashboard)/admin/settings/plans/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AdminSearchBar') ||
        !contents.includes('AdminTableShell') ||
        !contents.includes('AdminPaginationFooter') ||
        contents.includes('ChevronLeft') ||
        contents.includes('ChevronRight');
    });

    expect(offenders, `Admin pages drifted away from shared table primitives:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('admin rules list pages keep using the shared rules table', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/rules/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/rules/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AdminRulesTable') || /getPriorityColor|deleteRuleMutation\(\{\s*id:\s*rule\._id/.test(contents);
    });

    expect(offenders, `Rules pages drifted away from shared table/delete-confirmation patterns:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('knowledge document deletes remain confirmation-gated', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/global-knowledge/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return /onClick=\{\(\) => deleteDocument/.test(contents) || !contents.includes('documentToDelete');
    });

    expect(offenders, `Knowledge pages allow direct document deletion:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('cleanup checklist keeps movement demo files out of scope', () => {
    const checklist = readRepoFile('docs/current-cleanup-checklist.md');
    const requiredNoTouchPaths = [
      'src/app/(dashboard)/demos/movements/**',
      'src/app/(dashboard)/demos/movement-capture/page.tsx',
      'convex/movements.ts',
    ];

    const missingPaths = requiredNoTouchPaths.filter((demoPath) => !checklist.includes(demoPath));

    expect(missingPaths, `Movement demo no-touch paths missing from cleanup checklist:\n${missingPaths.join('\n')}`).toEqual([]);
  });
});
