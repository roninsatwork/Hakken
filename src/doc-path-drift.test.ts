import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * A path named in a developer document has to exist.
 *
 * The docs were swept clean of dead references on 2026-08-26 and regressed
 * within the hour: a file split deleted `ConfigDrawerPanels.tsx` and three
 * guides carried on naming it, one of them instructing the reader to add a
 * panel to it. That is the whole case for this file. A sweep is a day's work
 * that decays; a check is the same work made permanent.
 *
 * The worst instance was not a broken link but a copy-paste sample importing
 * three components that had never existed under those names — the first thing
 * a new contributor would run, and it could not compile.
 *
 * Deliberately narrow. It reads paths that look like real repository paths —
 * a known top-level directory, a real file extension — and nothing else. A doc
 * discussing `page.tsx` in the abstract, or naming a file that deliberately no
 * longer exists, says so in prose and is not a path this recognises.
 */
describe('developer docs name files that exist', () => {
  const DOCS_DIR = path.join(repoRoot, 'docs/developer');

  /** Where a real repository path can start. */
  const ROOTS = ['src/', 'convex/', 'scripts/', 'e2e/', 'services/', 'docs/', 'public/', 'messages/'];

  /**
   * Paths a document names to say they are gone.
   *
   * Each entry is a deliberate negation — "there is no root middleware.ts",
   * "the old header/footer pair no longer exists" — so the path being absent is
   * the point being made. May shrink, never grow.
   */
  const DELIBERATE_ABSENCES: ReadonlyMap<string, string> = new Map([
    [
      'src/ui/atoms/',
      'frontend.md and screen-kit.md both say the atoms tier was folded into screens/ and that there is no atoms directory any more.',
    ],
    [
      'middleware.ts',
      'frontend.md states there is currently no root middleware.ts, so route protection lives elsewhere.',
    ],
    [
      'src/ui/components/header.tsx',
      'frontend.md notes the old public-shell header/footer pair no longer exists.',
    ],
    [
      'src/ui/components/footer.tsx',
      'the other half of the same note.',
    ],
  ]);

  const docFiles = walkFiles(DOCS_DIR, new Set(['.md'])).map((filePath) =>
    relativePath(filePath).replaceAll(path.sep, '/')
  );

  const looksLikeARepositoryPath = (candidate: string) => {
    // Not a pattern. Docs legitimately write `convex/agent*.test.ts` to mean a
    // family and `convex/<provider>ProviderService.ts` to mean "yours goes
    // here"; neither is a path that should exist, and reading them as one
    // would make this guard cry wolf on its first run.
    if (/[*<>{}|\s]/.test(candidate)) return false;

    return ROOTS.some((root) => candidate.startsWith(root)) && /\.(tsx?|mjs|json|md|css|sql)$/.test(candidate);
  };

  const deadReferences = docFiles.flatMap((doc) => {
    const contents = fs.readFileSync(path.join(repoRoot, doc), 'utf8');

    // Backticked spans and import specifiers are where this codebase writes paths.
    const candidates = [
      ...[...contents.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]),
      ...[...contents.matchAll(/from\s+["']([^"'\n]+)["']/g)].map((match) => match[1]),
      ...[...contents.matchAll(/import\(\s*["']([^"'\n]+)["']\s*\)/g)].map((match) => match[1]),
    ].map((candidate) => candidate.replace(/^@\//, '').trim());

    return [...new Set(candidates)]
      .filter(looksLikeARepositoryPath)
      .filter((candidate) => !DELIBERATE_ABSENCES.has(candidate))
      .filter((candidate) => !fs.existsSync(path.join(repoRoot, candidate)))
      .map((candidate) => `${doc}: names ${candidate}, which does not exist`);
  });

  test('the scan reads a real population of docs and paths', () => {
    // A walk that stopped returning files, or a matcher that stopped matching,
    // would leave the check below asserting nothing — which is how the sweep
    // this file replaces came to be believed in the first place.
    expect(docFiles.length, 'no developer docs were found at all').toBeGreaterThan(20);

    const namedPaths = docFiles.flatMap((doc) =>
      [...fs.readFileSync(path.join(repoRoot, doc), 'utf8').matchAll(/`([^`\n]+)`/g)]
        .map((match) => match[1].replace(/^@\//, '').trim())
        .filter(looksLikeARepositoryPath)
    );

    expect(namedPaths.length, 'no repository paths were recognised in any doc').toBeGreaterThan(100);
  });

  test('no developer doc points at a file that is not there', () => {
    expect(
      deadReferences,
      `A developer document names a path that does not exist. Repoint it at the file that holds the thing now, or — if the point being made is that it is gone — add it to DELIBERATE_ABSENCES with the sentence that says so:\n${deadReferences.join('\n')}`
    ).toEqual([]);
  });

  test('every deliberate absence is still absent (drop the entry otherwise)', () => {
    const returned = [...DELIBERATE_ABSENCES.keys()].filter((candidate) =>
      fs.existsSync(path.join(repoRoot, candidate))
    );

    expect(
      returned,
      `These are listed as deliberately gone but exist again. Remove their entries and correct the prose that says they are missing:\n${returned.join('\n')}`
    ).toEqual([]);
  });
});
