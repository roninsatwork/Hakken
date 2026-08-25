import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  repoRoot,
  walkFiles,
  relativePath,
} from './test/driftUtils';

/**
 * Kept alongside the ESLint `no-restricted-imports` rule, which does not
 * replace it.
 *
 * ESLint matches the specifier's shape — anything under `@/convex/` that is not
 * `utils/`, `_generated/` or a `*Service` — and only one import deep. This walks
 * the whole chain from every client file and asks what the module at the end
 * actually contains, so it also catches a leak arriving through an innocent
 * intermediate, through a relative specifier, or through a `*Service` file that
 * has quietly started defining functions. Neither surface contains the other,
 * so the belt-and-braces pair stays.
 */
describe('Client Layering Drift', () => {

  /**
   * No file under src/ may reach a Convex module that defines functions.
   *
   * Importing one value from such a module pulls the whole module — every query
   * and mutation in it — into the client bundle. Convex logs "Convex functions
   * should not be imported in the browser" for each one and has said it will
   * throw in a future version, so what looks like log noise today is a page
   * that stops loading on an upgrade. Two skills screens borrowed their "max 2"
   * cap straight from agentSkills.ts and companySkills.ts and put 48 errors a
   * reload into the dev log.
   *
   * An ESLint rule bans the direct import (see eslint.config.mjs), but it only
   * sees the import in front of it. This walks the whole graph, so the case it
   * cannot see is covered too: a shared `convex/utils/*` or `convex/*Service`
   * file that later grows an import of a function module and quietly reopens
   * the same hole for every page downstream of it.
   *
   * Type-only imports are skipped because they are erased before bundling.
   */
  test('client code never reaches a Convex module that defines functions', () => {
    const convexFunctionDefinition =
      /^export const \w+ = (?:query|mutation|action|internalQuery|internalMutation|internalAction|adminQuery|adminMutation|superAdminQuery|superAdminMutation|httpAction)\(/m;
    const valueImport = /^\s*import\s+(?!type\b)[^;]*?from\s+'([^']+)'|^\s*import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm;

    const resolveImport = (fromFile: string, specifier: string) => {
      let base: string;

      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        base = path.resolve(path.dirname(fromFile), specifier);
      } else if (specifier.startsWith('@/convex/')) {
        base = path.resolve(repoRoot, 'convex', specifier.slice('@/convex/'.length));
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

    /** The import chain from `file` to a function module, or null if there is none. */
    const chainToFunctionModule = (
      file: string,
      trail: string[],
      cache: Map<string, string[] | null>
    ): string[] | null => {
      const cached = cache.get(file);
      if (cached !== undefined) {
        return cached;
      }

      // Seeded before recursing so an import cycle terminates.
      cache.set(file, null);

      const contents = fs.readFileSync(file, 'utf8');
      const here = [...trail, file];

      if (convexFunctionDefinition.test(contents)) {
        cache.set(file, here);
        return here;
      }

      let leak: string[] | null = null;

      for (const match of contents.matchAll(valueImport)) {
        const resolved = resolveImport(file, match[1] ?? match[2]);
        if (!resolved) {
          continue;
        }

        const found = chainToFunctionModule(resolved, here, cache);
        if (found && !leak) {
          leak = found;
        }
      }

      cache.set(file, leak);
      return leak;
    };

    const clientFiles = walkFiles(path.join(repoRoot, 'src'), new Set(['.ts', '.tsx'])).filter(
      (filePath) => !/\.test\.tsx?$/.test(filePath)
    );

    const offenders = clientFiles.flatMap((filePath) => {
      const leak = chainToFunctionModule(filePath, [], new Map());
      return leak ? [leak.map((step) => relativePath(step).replaceAll(path.sep, '/')).join('\n     -> ')] : [];
    });

    expect(
      offenders,
      `Client code reaches a Convex module that defines functions, which ships the backend to the browser. Move the shared value into convex/utils/ and import it from there:\n\n${offenders.join('\n\n')}`
    ).toEqual([]);
  }, 30_000);
});
