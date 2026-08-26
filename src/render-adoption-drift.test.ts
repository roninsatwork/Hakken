import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * A form that seeds itself during render keys on a value, never on a record.
 *
 * The pattern itself is right and the React docs recommend it: when a screen
 * must adopt what the server says, doing it during render beats doing it in an
 * effect, because an effect runs after paint and the reader sees a frame of the
 * stale form first. It needs a sentinel — a piece of state remembering what has
 * already been adopted — and the sentinel is where it goes wrong.
 *
 * If the sentinel holds the record itself, the comparison is by reference. That
 * survives only while something upstream keeps the reference stable, which is a
 * promise no component can make about its own props. A parent that writes
 * `?? []`, or derives the row with a `.find`, hands down a fresh object every
 * render: the adoption fires, sets state, renders, fires again. On 2026-08-26
 * the model pricing screen did exactly this and rendered until React gave up,
 * and five more sites were found holding the same shape — safe that morning
 * only because their parents happened to keep the value in state.
 *
 * Keying on a string, a number or a boolean removes the dependency. `entry.id`
 * changes when the row changes and not otherwise; a joined list of module keys
 * changes when the modules change and not otherwise. Both are true regardless
 * of what the parent does.
 *
 * Not covered, deliberately: adoption inside a custom hook that takes the
 * record as an argument, and sentinels assigned through a helper. Both are rare
 * here and neither can be read without a type checker.
 */
describe('render-time adoption keys on a value, not a record', () => {
  const SCAN_ROOTS = ['src/app', 'src/ui', 'src/hooks'];

  /**
   * Annotations that do not visibly promise a primitive.
   *
   * `typeof someQueryResult` is included even though it is sometimes a string,
   * because it hides which — and "nobody noticed it was a record" is the whole
   * bug. Writing `string | null` costs nothing and makes the safety readable.
   */
  const HOLDS_A_RECORD = /typeof\s|\[\]|\{|Doc</;

  /**
   * Sentinels that hold a record and are compared during render, with why.
   * May shrink, never grow.
   */
  const RECORD_SENTINELS: ReadonlyMap<string, string> = new Map();

  const files = SCAN_ROOTS.flatMap((root) =>
    walkFiles(path.join(repoRoot, root), new Set(['.tsx', '.ts']))
      .map((filePath) => relativePath(filePath).replaceAll(path.sep, '/'))
      .filter((file) => !file.includes('/demos/') && !/\.test\.tsx?$/.test(file))
  );

  /** Every `const [name, setName] = useState<Type>(…)` in a file. */
  const sentinelDeclarations = (contents: string) => {
    const declarations = new Map<string, string>();
    for (const match of contents.matchAll(
      /const \[(\w+), set(\w+)\] = useState(<([^>]*)>)?\s*\(/g
    )) {
      declarations.set(match[1], match[4] ?? '');
    }
    return declarations;
  };

  /**
   * Adoption sites: an `if` whose body opens by setting a state variable that
   * the condition also tests. That shape is what makes it an adoption rather
   * than an ordinary branch — it is comparing against, and then advancing, its
   * own sentinel.
   */
  const adoptionSites = (contents: string) =>
    [...contents.matchAll(/if\s*\(([^{]{0,200}?)\)\s*\{\s*\n\s*set(\w+)\(/g)]
      .map((match) => ({
        condition: match[1],
        sentinel: match[2].charAt(0).toLowerCase() + match[2].slice(1),
        index: match.index ?? 0,
      }))
      .filter((site) => site.condition.includes(site.sentinel));

  const scanned = files.map((file) => {
    const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    return { file, declarations: sentinelDeclarations(contents), sites: adoptionSites(contents), contents };
  });

  const offenders = scanned.flatMap(({ file, declarations, sites, contents }) =>
    sites
      .filter((site) => HOLDS_A_RECORD.test(declarations.get(site.sentinel) ?? ''))
      .filter(() => !RECORD_SENTINELS.has(file))
      .map(
        (site) =>
          `${file}:${contents.slice(0, site.index).split('\n').length} — ${site.sentinel} holds ` +
          `${declarations.get(site.sentinel)}, so the adoption compares object identity`
      )
  );

  test('the scan reads a real population of screens and adoption sites', () => {
    // Without this, a walk that stopped returning files or a matcher that
    // stopped matching would leave the rule below asserting nothing — which is
    // how a guard comes to be believed while reading zero of what it covers.
    expect(files.length, 'no screen files were scanned at all').toBeGreaterThan(200);

    const totalSites = scanned.reduce((count, entry) => count + entry.sites.length, 0);
    expect(totalSites, 'no render-time adoption sites were recognised anywhere').toBeGreaterThan(8);
  });

  test('no sentinel compared during render holds a record', () => {
    expect(
      offenders,
      `A screen adopts server state during render but its sentinel is not declared as a primitive. If it holds the record itself the comparison is by reference, which only works while something upstream keeps that reference stable — a parent adding \`?? []\` or a \`.find\` is enough to break it, at which point the screen re-seeds over what the reader is typing and renders until React gives up. Key on a string instead — the record's id, or the contents joined — and declare it as \`string | null\` rather than \`typeof …\`, so that the safety is visible without chasing the type:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('every listed record sentinel is still one (drop the entry otherwise)', () => {
    const fixed = [...RECORD_SENTINELS.keys()].filter(
      (file) => !offenders.some((offender) => offender.startsWith(`${file}:`))
    );

    expect(
      fixed,
      `These are listed as holding a record but no longer do. Remove their entries so the list keeps shrinking:\n${fixed.join('\n')}`
    ).toEqual([]);
  });
});
