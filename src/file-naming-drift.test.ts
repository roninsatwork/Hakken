import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Component files are PascalCase, and new ones cannot drift.
 *
 * The 2026-08-24 review called the tree a three-way split — kebab, camel,
 * Pascal in similar numbers. Measured properly it is not: kebab lives entirely
 * in Next's structural names (page.tsx, route segments), camel in hooks and
 * test harnesses, both of which are their own correct conventions. Among
 * actual component files PascalCase leads 234 to 7 (non-test .tsx under src/, which is what this guard reads — an earlier figure of 302 counted test files, a different population from the one being ruled on), so PascalCase is the rule
 * — it already was, in everything but writing.
 *
 * The rule, as enforced here: a .tsx file is PascalCase unless it is a Next
 * structural name, a use-prefixed hook, or a .test file. The seven files
 * below predate the rule and are frozen: the list may shrink, never grow, and
 * an entry whose file conforms or is gone must leave. Most of the seven are
 * test harnesses and mocks rather than components; they stay frozen rather
 * than renamed because typography.tsx is imported by the frozen movement
 * demos, and a case-only rename on a case-insensitive filesystem is exactly
 * the change that deserves better justification than tidiness.
 */

const STRUCTURAL = new Set([
  'page', 'layout', 'error', 'loading', 'route', 'not-found', 'global-error',
  'template', 'default', 'middleware', 'opengraph-image', 'icon',
]);

const FROZEN = new Set([
  'src/ui/components/screens/typography.tsx',
  'src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils.tsx',
  'src/test/standardTableScreen.tsx',
  'src/test/renderWithProviders.tsx',
  'src/test/standardFormScreen.tsx',
  'src/test/screenMocks.tsx',
  'src/e2e/convexReactMock.tsx',
]);

/**
 * Next.js reserves these names, but only where Next reads them: inside the app
 * router tree. Matching on the basename alone exempted them anywhere under
 * `src/` — and `error`, `template`, `default`, `icon` and `loading` are all
 * attractive names for an ordinary component, so the rule had a hole shaped
 * like its own exemption list.
 */
function isStructural(file: string, basename: string): boolean {
  if (!STRUCTURAL.has(basename)) return false;
  return file.startsWith('src/app/') || basename === 'middleware';
}

function conforms(file: string, basename: string): boolean {
  if (isStructural(file, basename)) return true;
  if (/^use[A-Z]/.test(basename)) return true;
  return /^[A-Z][A-Za-z0-9]*$/.test(basename);
}

describe('component file naming holds', () => {
  const nonConforming = walkFiles(path.join(repoRoot, 'src'), new Set(['.tsx']))
    .map((file) => relativePath(file).replaceAll(path.sep, '/'))
    .filter((file) => !file.endsWith('.test.tsx'))
    .filter((file) => !conforms(file, path.basename(file, '.tsx')));

  /**
   * Frozen at the 7 the rule was written with. The docblock above has said
   * this list may shrink and never grow since the day it was written, and
   * nothing checked — growing it by one passed green, which is the single thing
   * the sentence forbids.
   */
  const FROZEN_CEILING = 7;

  test('the frozen list only shrinks', () => {
    expect(
      [...FROZEN],
      'The frozen naming list grew. Rename the file instead — adding an entry to make a change pass is what this list exists to prevent:'
    ).toHaveLength(FROZEN_CEILING);
  });

  test('no new non-PascalCase component file appears', () => {
    const offenders = nonConforming.filter((file) => !FROZEN.has(file));
    expect(
      offenders,
      `Name component files in PascalCase (hooks keep use*, Next structural names are exempt). The frozen list may shrink, never grow:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('frozen entries whose files conform or are gone leave the list', () => {
    const present = new Set(nonConforming);
    const stale = [...FROZEN].filter((file) => !present.has(file));
    expect(
      stale,
      `These entries no longer match a non-conforming file — remove them so the rule binds their paths at zero:\n${stale.join('\n')}`
    ).toEqual([]);
  });
});
