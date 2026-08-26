import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * A customer-facing `/app` route must not reach into `admin/`.
 *
 * The ESLint rule in `eslint.config.mjs` bans the alias form
 * (`@/src/app/(dashboard)/admin/...`) and is kept — but it could not have
 * caught the violation it was written for. The line actually removed on
 * 2026-08-25 was a **dynamic** import:
 *
 *     import("@/src/app/(dashboard)/admin/settings/_components/AuditLogsTable")
 *
 * and `no-restricted-imports` does not inspect `import()` expressions. The
 * fixed page still uses that shape for its own lazily-loaded table, so it is
 * the form anyone copying that page reaches for first. Reverting the fix would
 * have passed CI. A relative specifier — `../../admin/_components/Foo` —
 * escaped it too, and neither surface saw a leak arriving through an innocent
 * intermediate in `src/ui/`.
 *
 * So this walks the graph instead, exactly as the sibling Convex rule in
 * `client-layering-drift.test.ts` does, and for the same stated reason: ESLint
 * sees the import in front of it, and one import is not the boundary.
 */
describe('Admin Boundary Drift', () => {
  const ADMIN_DIR = path.join(repoRoot, 'src/app/(dashboard)/admin');
  const APP_DIR = path.join(repoRoot, 'src/app/(dashboard)/app');

  /**
   * Every shape an import can take.
   *
   * Static `from '…'`, dynamic `import('…')`, `require('…')`, a bare
   * side-effect `import '…'`, and the same three written with a template
   * literal. The first version wanted `from`, `import(` or `require(` in front
   * of the quote, which let a side-effect import and a backtick specifier
   * through — narrow shapes, but the whole point of this file is that the
   * shape is not the boundary.
   */
  const SPECIFIER =
    /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)['"`]([^'"`]+)['"`]/g;

  const resolveImport = (fromFile: string, specifier: string) => {
    let base: string;

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      base = path.resolve(path.dirname(fromFile), specifier);
    } else if (specifier.startsWith('@/')) {
      base = path.resolve(repoRoot, specifier.slice('@/'.length));
    } else {
      return null;
    }

    for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      const candidate = `${base}${suffix}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    return null;
  };

  const isAdminFile = (file: string) => file.startsWith(`${ADMIN_DIR}${path.sep}`);

  /** The import chain from `file` into `admin/`, or null if there is none. */
  const chainIntoAdmin = (
    file: string,
    trail: string[],
    cache: Map<string, string[] | null>
  ): string[] | null => {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;

    // Seeded before recursing so an import cycle terminates.
    cache.set(file, null);

    const here = [...trail, file];

    if (isAdminFile(file)) {
      cache.set(file, here);
      return here;
    }

    let leak: string[] | null = null;

    for (const match of fs.readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const resolved = resolveImport(file, match[1]);
      if (!resolved) continue;

      const found = chainIntoAdmin(resolved, here, cache);
      if (found && !leak) leak = found;
    }

    cache.set(file, leak);
    return leak;
  };

  test('no customer route reaches admin, however the import is written', () => {
    const appFiles = walkFiles(APP_DIR, new Set(['.ts', '.tsx'])).filter(
      (filePath) => !/\.test\.tsx?$/.test(filePath)
    );

    expect(appFiles.length, 'no customer route files found, so this check is reading nothing').toBeGreaterThan(0);

    const offenders = appFiles.flatMap((filePath) => {
      const leak = chainIntoAdmin(filePath, [], new Map());
      return leak
        ? [leak.map((step) => relativePath(step).replaceAll(path.sep, '/')).join('\n     -> ')]
        : [];
    });

    expect(
      offenders,
      `A customer-facing /app route reaches admin internals. Promote the shared part — src/ui/components/screens/ for generic screen-kit material, or a shared feature directory such as src/ui/components/governance/:\n${offenders.join('\n\n')}`
    ).toEqual([]);
  });
});
