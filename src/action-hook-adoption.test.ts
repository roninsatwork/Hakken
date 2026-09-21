import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * A screen that writes must report its failures through the house runner.
 *
 * `useAdminAction` unwraps the real sentence out of a Convex envelope, reports
 * the failure so we find out it happened, and guards a double submit on a ref
 * rather than on state two clicks in one tick both read as false. 105 sites
 * across 62 files were migrated onto it on 2026-08-26.
 *
 * That migration was reported as complete once before, in a form that was not:
 * the count came from grepping two literal setter names, and 105 sites
 * survived it. Worse, the claim implied durability it never had — nothing
 * stopped the next page hand-rolling the same catch, and the adoption floors
 * cannot help, because a brand-new screen has no count to fall below.
 *
 * So this asks the question the other direction, the way the copy and naming
 * rules do: a file that writes and hand-rolls its own failure handling must be
 * listed here with the reason, or use the runner. A new file starts unlisted,
 * which means it must use the runner.
 *
 * ### Three shapes, because counting catches saw only one
 *
 * This guard was written reading `try`, and the survey behind the migration
 * counted `catch` blocks — so both were blind to the two ways a write can fail
 * without a `catch` anywhere near it, and sixteen sites lived in the blind
 * spot:
 *
 *  1. **The hand-rolled catch.** What this guard was built for.
 *  2. **`try`/`finally` with no `catch`.** The busy flag is cleared, the button
 *     comes back to life, the promise rejects into nothing and the reader is
 *     told nothing. The governance evidence export was this: press Export,
 *     watch the button finish, and no file ever appears.
 *  3. **The floating call.** A mutation called and never awaited —
 *     `onClick={() => completeTask({ taskId })}`, or `void dismiss(…)`. The
 *     rejection has nowhere to land, so it becomes an unhandled rejection in
 *     the console and silence on the screen.
 *
 * ### Why the runner is no longer a whole-file exemption
 *
 * This guard used to skip any file that named `useAdminAction` anywhere, which
 * is how a screen could migrate one button and leave five silent — the bell had
 * exactly that shape. The question it asks now is the specific one: is there a
 * `try` *around a write*, is there a `try`/`finally` with no `catch`, is there a
 * write nobody waits for. A file may use the runner and still answer yes.
 *
 * The heuristics stay deliberately coarse — they read text, not a syntax tree,
 * and they cannot tell a deliberate silence from a forgotten one. Coarse is the
 * right trade: the cost of a false positive is one line of thought and, if the
 * answer is "this one is deliberate", an entry with a sentence. The cost of a
 * false negative is a screen that fails silently for a year.
 */

/** Files that write and keep their own catch, with why. May shrink, never grow. */
const HAND_ROLLED: ReadonlyMap<string, string> = new Map([
  [
    'src/ui/components/chat/RealtimeVoiceOverlay.tsx',
    'A live voice call. Every catch here is documented as deliberate: a dropped transcript, an unreadable relay frame or an already-closed socket must not end the conversation, and a toast over a call in progress would be worse than the failure.',
  ],
  [
    'src/ui/components/layout/NotificationBell.tsx',
    'Marking a single notification read as it is opened. Documented as a deliberate swallow — the item stays unread and the next press tries again, which is a better answer than an error over a bell. "Mark all read" is a different action and is on the runner.',
  ],
]);

/** Files whose `try`/`finally` has no `catch` on purpose. May shrink, never grow. */
const NOTHING_LEFT_TO_TELL: ReadonlyMap<string, string> = new Map([
  [
    'src/ui/components/layout/Header.tsx',
    'Signing out. The `finally` is a hard navigation to the front door, so the screen that would carry a message is gone before it could be read — and the sign-out must happen whether or not the logout record was written. Moved here from the hand-rolled list, which had described this file by the geo-IP lookup that no longer uses a try at all.',
  ],
]);

/** Writes nobody waits for, on purpose. May shrink, never grow. */
const NOBODY_IS_WAITING: ReadonlyMap<string, string> = new Map([
  [
    'src/ui/components/chat/RealtimeVoiceOverlay.tsx',
    'A knowledge lookup fired mid-call to colour the next reply. The call is the thing in progress; a lookup that does not come back leaves the assistant answering from what it already had, which is the designed degradation.',
  ],
  [
    'src/ui/components/layout/Header.tsx',
    'Decorating a login record after the geo-IP lookup settles. It runs on mount rather than on a press: nobody asked for it, nobody is waiting for it, and there is nothing for a reader to retry.',
  ],
]);

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];

/**
 * The source with comments, strings and template literals blanked out.
 *
 * Blanked rather than deleted, so every index still points where it did and a
 * reported line number is the real one. This matters more than it looks: the
 * checks below match brackets, and `fetch("https://host/path", { … })` carries
 * a `//` inside a string — a naive comment strip eats the rest of that line,
 * takes an opening brace with it, and every brace after it pairs up wrong.
 */
const blankNonCode = (source: string) => {
  const out = source.split('');
  const blank = (index: number) => {
    if (out[index] !== '\n') out[index] = ' ';
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') blank(index++);
      continue;
    }
    if (char === '/' && next === '*') {
      blank(index++);
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) blank(index++);
      blank(index++);
      blank(index++);
      continue;
    }
    if (char === "'" || char === '"') {
      blank(index++);
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') blank(index++);
        blank(index++);
      }
      blank(index++);
      continue;
    }
    if (char === '`') {
      // Blanked whole, `${…}` included. The interpolation holds real code, but
      // blanking all of it removes matched pairs together, so the balance of
      // what is left is unchanged.
      blank(index++);
      let depth = 0;
      while (index < source.length) {
        if (source[index] === '\\') { blank(index++); blank(index++); continue; }
        if (source[index] === '$' && source[index + 1] === '{') depth += 1;
        else if (source[index] === '}' && depth > 0) depth -= 1;
        else if (source[index] === '`' && depth === 0) break;
        blank(index++);
      }
      blank(index++);
      continue;
    }
    index += 1;
  }

  return out.join('');
};

const OPENERS = '([{';
const CLOSERS = ')]}';

/** The index just past the close matching the bracket opened at `open`. */
const closeOf = (source: string, open: number) => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (OPENERS.includes(source[index])) depth += 1;
    else if (CLOSERS.includes(source[index])) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
};

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length;

type TryBlock = { line: number; body: string; tail: string };

const tryBlocks = (source: string): TryBlock[] =>
  [...source.matchAll(/\btry\s*\{/g)].map((match) => {
    const open = (match.index ?? 0) + match[0].length - 1;
    const close = closeOf(source, open);
    return {
      line: lineOf(source, match.index ?? 0),
      body: source.slice(open, close),
      tail: source.slice(close, close + 40),
    };
  });

/** A `const x = …` initialiser, up to its statement's semicolon. */
const initialiserOf = (source: string, from: number) => {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (OPENERS.includes(char)) depth += 1;
    else if (CLOSERS.includes(char)) depth -= 1;
    else if (char === ';' && depth === 0) return source.slice(from, index);
  }
  return source.slice(from, from + 400);
};

/**
 * Every name in a file that, called, writes to the backend.
 *
 * The handles themselves, and one level of the wrapper this codebase writes
 * constantly — `const dismissQuestion = (id) => companyId ? forCompany(…) :
 * forGlobal(…)`, the two-doors-one-mounted shape. Three of the sixteen were
 * only visible through such a wrapper.
 *
 * A wrapper that hands the write to the runner, or that catches for itself, is
 * not one of these: the first is already answered and the second is the
 * hand-rolled check's business, not this one's.
 */
const writeBindings = (source: string, runners: ReadonlySet<string>) => {
  const names = new Set<string>();
  const handsItToTheRunner = new RegExp(`\\b(?:${[...runners].join('|')})\\s*\\(`);

  for (const match of source.matchAll(/\bconst\s+(\w+)\s*=\s*use(?:Mutation|Action)\s*\(/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\bconst\s+(\w+)\s*=[^;\n]{0,60}?\b\w+\.(?:mutation|action)\s*\(/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/\bconst\s+(\w+)\s*=\s*(?=(?:async\s*)?\()/g)) {
    const body = initialiserOf(source, (match.index ?? 0) + match[0].length);
    if (!/=>/.test(body)) continue;
    if (handsItToTheRunner.test(body) || /\bcatch\b/.test(body)) continue;
    if ([...names].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(body))) names.add(match[1]);
  }

  return names;
};

/** What the runner is called here — `action.run`, or a destructured rename. */
const runnerNames = (source: string) => {
  const names = new Set(['run']);
  for (const match of source.matchAll(/const\s*\{[^}]*\brun\s*:\s*(\w+)[^}]*\}\s*=\s*useAdminAction/g)) {
    names.add(match[1]);
  }
  return names;
};

/** The name of the call whose argument list encloses `index`, if any. */
const enclosingCall = (source: string, index: number) => {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = source[cursor];
    if (CLOSERS.includes(char)) depth += 1;
    else if (OPENERS.includes(char)) {
      if (depth > 0) { depth -= 1; continue; }
      if (char !== '(') return null;
      const name = /([\w.]+)\s*$/.exec(source.slice(0, cursor));
      return name ? name[1] : null;
    }
  }
  return null;
};

const previousCodeChar = (source: string, index: number) => {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(source[cursor])) return source[cursor];
  }
  return '';
};

/**
 * Write calls whose promise nothing holds.
 *
 * Three positions count: the start of a statement, behind a `void`, and as the
 * whole body of an arrow — `onClick={() => cancelTask({ taskId })}`. An `await`
 * or a `return` in front puts the promise in somebody's hands, so neither
 * matches. A `.catch` behind it does the same, and a `.finally` deliberately
 * does not: `void dismiss(…).finally(() => setBusy(false))` clears the spinner
 * and drops the failure, which is the shape this is here for.
 */
const floatingWrites = (source: string) => {
  const runners = runnerNames(source);
  const names = writeBindings(source, runners);
  const found: number[] = [];

  for (const name of names) {
    const pattern = new RegExp(`(^[ \\t]*|\\bvoid\\s+|=>\\s*)${name}\\s*\\(`, 'gm');
    for (const match of source.matchAll(pattern)) {
      const start = match.index ?? 0;
      const callOpen = start + match[0].length - 1;
      const close = closeOf(source, callOpen);
      if (/^\s*\.catch\b/.test(source.slice(close, close + 20))) continue;

      const enclosing = enclosingCall(source, start + match[0].length - name.length - 1);
      const enclosingName = enclosing?.split('.').pop() ?? '';
      if (enclosing !== null && runners.has(enclosingName)) continue;

      // At the start of a line the call may still be an argument or an array
      // element — `Promise.all([\n  mintPreview({ voice }),` — which the await
      // above it is holding. Only a real statement boundary counts.
      if (match[1].trim() === '' && !';{}'.includes(previousCodeChar(source, start))) continue;

      found.push(lineOf(source, start));
    }
  }

  return found;
};

const writesToTheBackend = (contents: string) =>
  /useMutation\(|useAction\(|\w+\.(?:mutation|action)\(/.test(contents);

const callsAWrite = (text: string, names: ReadonlySet<string>) =>
  [...names].some((name) => new RegExp(`\\b${name}\\s*\\(`).test(text));

type Scanned = {
  file: string;
  source: string;
  tries: TryBlock[];
  bindings: ReadonlySet<string>;
};

const scanned: Scanned[] = SCAN_ROOTS.flatMap((root) =>
  walkFiles(path.join(repoRoot, root), new Set(['.ts', '.tsx']))
    .map((filePath) => relativePath(filePath).replaceAll(path.sep, '/'))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => writesToTheBackend(fs.readFileSync(path.join(repoRoot, file), 'utf8')))
    .map((file) => {
      const source = blankNonCode(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
      return {
        file,
        source,
        tries: tryBlocks(source),
        bindings: writeBindings(source, runnerNames(source)),
      };
    })
);

const listing = (files: readonly string[]) => files.join('\n');

describe('screens report their failures through the house runner', () => {
  const handRolled = scanned
    .filter((entry) =>
      entry.tries.some(
        (block) => callsAWrite(block.body, entry.bindings) && !/^\s*finally\b/.test(block.tail)
      )
    )
    .map((entry) => entry.file);

  const finallyOnly = scanned
    .filter((entry) => entry.tries.some((block) => /^\s*finally\b/.test(block.tail)))
    .map((entry) => entry.file);

  const unawaitedLines = new Map(
    scanned
      .map((entry) => [entry.file, floatingWrites(entry.source)] as const)
      .filter(([, lines]) => lines.length > 0)
  );
  const unawaited = [...unawaitedLines.keys()];

  test('every writing screen uses the runner, or says why it does not', () => {
    const offenders = handRolled.filter((file) => !HAND_ROLLED.has(file));

    expect(
      offenders,
      `These call a Convex mutation or action inside their own try/catch, so the failure is neither unwrapped for the reader nor reported to us, and a double click fires twice. Use useAdminAction (src/hooks/useAdminAction.ts). If the catch is genuinely deliberate, add the file to HAND_ROLLED with the reason — that list may shrink, never grow:\n${listing(offenders)}`
    ).toEqual([]);
  });

  test('no writing screen clears its busy flag in a finally and drops the failure', () => {
    const offenders = finallyOnly.filter((file) => !NOTHING_LEFT_TO_TELL.has(file));

    expect(
      offenders,
      `These hold a try that closes on finally with no catch. The finally clears the spinner, so the button finishes and looks done — and the rejection goes nowhere, so nothing is said and nothing is reported. This is how the governance evidence export failed for a year. Move the work inside useAdminAction's run callback and read the outcome. If there is genuinely nothing left to tell anyone, add the file to NOTHING_LEFT_TO_TELL with the reason — that list may shrink, never grow:\n${listing(offenders)}`
    ).toEqual([]);
  });

  test('no writing screen fires a mutation nobody waits for', () => {
    const offenders = unawaited.filter((file) => !NOBODY_IS_WAITING.has(file));

    expect(
      offenders,
      `These call a mutation or action and keep no hold on the promise — no await, no run callback, no .catch. When it rejects there is nobody to tell, so the row does not change and the reader is not told why. Wrap the call in useAdminAction's run. If nobody is genuinely waiting on it, add the file to NOBODY_IS_WAITING with the reason — that list may shrink, never grow:\n${offenders
        .map((file) => `${file}:${(unawaitedLines.get(file) ?? []).join(',')}`)
        .join('\n')}`
    ).toEqual([]);
  });

  /**
   * Frozen at what each list was written with. Every list in this repository
   * says it may shrink and never grow; three of them, this one included, said
   * it without anything checking — so the sentence was a convention, not a
   * rule.
   */
  const CEILINGS: ReadonlyArray<[string, ReadonlyMap<string, string>, number]> = [
    ['HAND_ROLLED', HAND_ROLLED, 2],
    ['NOTHING_LEFT_TO_TELL', NOTHING_LEFT_TO_TELL, 1],
    ['NOBODY_IS_WAITING', NOBODY_IS_WAITING, 2],
  ];

  test.each(CEILINGS)('the %s list only shrinks', (_name, entries, ceiling) => {
    expect(
      [...entries.keys()],
      'A deliberate-silence list grew. A screen that writes belongs on the runner; adding an entry to make a change pass is the one thing these lists forbid:'
    ).toHaveLength(ceiling);
  });

  test('listed files still hand-roll, or still fall silent (drop the entry otherwise)', () => {
    const stale = [
      ...[...HAND_ROLLED.keys()].filter((file) => !handRolled.includes(file)),
      ...[...NOTHING_LEFT_TO_TELL.keys()].filter((file) => !finallyOnly.includes(file)),
      ...[...NOBODY_IS_WAITING.keys()].filter((file) => !unawaited.includes(file)),
    ];

    expect(
      stale,
      `These are listed as deliberately silent but no longer are — they moved onto the runner, stopped writing, or were deleted. Remove their entries:\n${listing(stale)}`
    ).toEqual([]);
  });

  test('the scan reads a real population', () => {
    // Without this the checks above pass identically whether the walk found a
    // hundred writing screens or none at all — which is how a reason guard in
    // convex/ sat green for weeks reading zero declarations. Each check needs
    // its own figure: a `blankNonCode` that blanked everything, or a
    // `writeBindings` that matched nothing, would leave the walk full and the
    // two new checks reading an empty room.
    const tries = scanned.reduce((total, entry) => total + entry.tries.length, 0);
    const bindings = scanned.reduce((total, entry) => total + entry.bindings.size, 0);

    expect(scanned.length, 'no screens that write to the backend were found at all').toBeGreaterThan(50);
    expect(tries, 'no try blocks were found in any writing screen').toBeGreaterThan(10);
    expect(bindings, 'no mutation or action handles were found in any writing screen').toBeGreaterThan(50);
  });
});
