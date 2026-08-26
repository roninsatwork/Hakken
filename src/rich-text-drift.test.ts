import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath, readRepoFile } from './test/driftUtils';

/**
 * A `t.rich` argument given a function must correspond to a tag in the message.
 *
 * `t.rich` calls a function argument only for a rich-text *tag* — `<name>…</name>`
 * in the catalogue entry. Given a plain `{name}` placeholder it does not call the
 * function, does not substitute anything, and does not complain: the value simply
 * vanishes from the sentence.
 *
 * Eight screens did this. What they rendered was "Are you sure you want to delete
 * the plan ?" — a confirmation dialog for a destructive action, with the name of
 * the thing being destroyed missing. Seven were admin screens and one was a
 * customer one, and every one of them was a delete confirmation, because that is
 * the shape that wants a name in bold.
 *
 * Their unit tests could not catch it: each mocks `next-intl` and replaces
 * `t.rich` with something that does call its function arguments, so the tests
 * asserted the sentence the mock produced rather than the one the library does.
 * That is why this reads the catalogue instead of rendering.
 *
 * The fix at each site is to make the tag real: `<highlight>{name}</highlight>`
 * in both catalogues, with the call passing `name` (the value) and `highlight`
 * (the renderer).
 */
describe('rich text arguments match the tags in their message', () => {
  const catalogue = JSON.parse(readRepoFile('messages/en.json')) as Record<string, unknown>;

  const lookup = (dottedPath: string): string | null => {
    let node: unknown = catalogue;
    for (const part of dottedPath.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in node)) return null;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : null;
  };

  const screenFiles = walkFiles(path.join(repoRoot, 'src'), new Set(['.tsx']))
    .map((filePath) => relativePath(filePath).replaceAll(path.sep, '/'))
    .filter((file) => !file.includes('/demos/') && !/\.test\.tsx$/.test(file));

  const readCalls = screenFiles.flatMap((file) => {
    const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    if (!contents.includes('.rich(')) return [];

    // Which translator variable reads which namespace.
    const namespaces = new Map(
      [...contents.matchAll(/const (\w+)\s*=\s*useTranslations\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map(
        (match) => [match[1], match[2]] as const
      )
    );

    // Either quote, and backticks too. The first version wanted a double-quoted
    // key, which left ten call sites invisible — all of them in the workflow
    // drawer, which happens to be written with single quotes. A blind spot the
    // exact size of one feature is still a blind spot.
    return [...contents.matchAll(/(\w+)\.rich\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{([\s\S]*?)\n\s*\}\)/g)].flatMap(
      (match) => {
        const [, variable, key, argumentBlock] = match;
        const namespace = namespaces.get(variable);
        if (!namespace) return [];

        const message = lookup(`${namespace}.${key}`);
        if (message === null) return [];

        const tags = new Set([...message.matchAll(/<(\w+)>/g)].map((tag) => tag[1]));
        // An argument written as a function is being offered as a tag renderer.
        const functionArguments = [...argumentBlock.matchAll(/(\w+)\s*:\s*\(/g)].map((arg) => arg[1]);

        return functionArguments
          .filter((argument) => !tags.has(argument))
          .map(
            (argument) =>
              `${file}: ${namespace}.${key} passes "${argument}" as a renderer, but the message has no <${argument}> tag — the value will not appear.\n    message: ${message}`
          );
      }
    );
  });

  test('the scan reads a real population of rich-text calls', () => {
    const callers = screenFiles.filter((file) =>
      fs.readFileSync(path.join(repoRoot, file), 'utf8').includes('.rich(')
    );

    expect(callers.length, 'no t.rich calls were found at all, so the check below reads nothing').toBeGreaterThan(5);
  });

  test('no rich-text value is silently dropped', () => {
    expect(
      readCalls,
      `A t.rich argument is only called for a tag in the message, never for a plain {placeholder} — so these render the sentence with the value missing, and their own tests cannot see it because they mock t.rich. Wrap the placeholder in a tag in both catalogues and pass the value alongside the renderer:\n${readCalls.join('\n')}`
    ).toEqual([]);
  });
});
