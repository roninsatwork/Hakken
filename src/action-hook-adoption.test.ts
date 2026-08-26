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
 * rules do: a file that calls `useMutation` or `useAction` and hand-rolls a
 * `try` must be listed here with the reason, or use the runner. A new file
 * starts unlisted, which means it must use the runner.
 *
 * The heuristic is deliberately coarse — it cannot tell a mutation's catch
 * from a JSON parse in the same file — and coarse is the right trade here: the
 * cost of a false positive is one line of thought and, if the answer is "this
 * one is deliberate", an entry with a sentence. The cost of a false negative
 * is a screen that fails silently for a year.
 */

/** Files that write and keep their own try, with why. May shrink, never grow. */
const HAND_ROLLED: ReadonlyMap<string, string> = new Map([
  [
    'src/ui/components/chat/RealtimeVoiceOverlay.tsx',
    'A live voice call. Every catch here is documented as deliberate: a dropped transcript, an unreadable relay frame or an already-closed socket must not end the conversation, and a toast over a call in progress would be worse than the failure.',
  ],
  [
    'src/ui/components/layout/Header.tsx',
    'The geo-IP lookup that decorates a login record. Third-party enrichment that degrades to "Unknown IP" by design; the login itself does not depend on it.',
  ],
  [
    'src/ui/components/layout/NotificationBell.tsx',
    'Marking a notification read. Documented as a deliberate swallow — the item stays unread and the next press tries again, which is a better answer than an error over a bell.',
  ],
]);

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];

const writesToTheBackend = (contents: string) => /useMutation\(|useAction\(/.test(contents);
const handRollsATry = (contents: string) => /\btry\s*\{/.test(contents);
const usesTheRunner = (contents: string) => contents.includes('useAdminAction');

describe('screens report their failures through the house runner', () => {
  const measured = SCAN_ROOTS.flatMap((root) =>
    walkFiles(path.join(repoRoot, root), new Set(['.ts', '.tsx']))
      .map((filePath) => relativePath(filePath).replaceAll(path.sep, '/'))
      .filter((file) => !file.includes('/demos/') && !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const contents = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        return writesToTheBackend(contents) && handRollsATry(contents) && !usesTheRunner(contents);
      })
  );

  test('every writing screen uses the runner, or says why it does not', () => {
    const offenders = measured.filter((file) => !HAND_ROLLED.has(file));

    expect(
      offenders,
      `These call a Convex mutation or action and hand-roll their own try/catch, so the failure is neither unwrapped for the reader nor reported to us, and a double click fires twice. Use useAdminAction (src/hooks/useAdminAction.ts). If the catch is genuinely deliberate, add the file to HAND_ROLLED with the reason — that list may shrink, never grow:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('listed files still write and still hand-roll (drop the entry otherwise)', () => {
    const stale = [...HAND_ROLLED.keys()].filter((file) => !measured.includes(file));

    expect(
      stale,
      `These are listed as deliberately hand-rolled but no longer are — they moved onto the runner, stopped writing, or were deleted. Remove their entries:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  test('the scan reads a real population', () => {
    // Without this the two checks above pass identically whether the walk found
    // a hundred writing screens or none at all — which is how a reason guard in
    // convex/ sat green for weeks reading zero declarations.
    const writingScreens = SCAN_ROOTS.flatMap((root) =>
      walkFiles(path.join(repoRoot, root), new Set(['.ts', '.tsx']))
        .filter((filePath) => !relativePath(filePath).includes('/demos/'))
        .filter((filePath) => writesToTheBackend(fs.readFileSync(filePath, 'utf8')))
    ).length;

    expect(writingScreens, 'no screens that write to the backend were found at all').toBeGreaterThan(50);
  });
});
