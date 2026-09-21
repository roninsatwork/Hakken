import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath, readRepoFile } from './test/driftUtils';

/**
 * A signal a reader can only decode by hue is not a signal.
 *
 * The owner of this platform cannot tell red from green, so rule 10 of the
 * audit remediation plan is that nothing signals with green-versus-red alone:
 * use the blue/yellow axis, brightness contrast, or a word. Colour *reinforcing*
 * a label is fine and this repo does it constantly — a toast, a pill, a destroy
 * button all pair their tone with the word that means the same thing. The fault
 * is colour carrying the meaning by itself.
 *
 * This is written because the fix without it did nothing. On 2026-08-26 the
 * chart palette's canonical order was rearranged to separate emerald from rose
 * and it reached no chart at all, because nothing imported the array it changed.
 * `chart-palette-drift.test.ts` closed that hole for chart *props*. It cannot
 * see this one: a stacked bar built from `bg-success` and `bg-destructive` is a
 * Tailwind class string, invisible to a guard that reads `fill=` and `stroke=`.
 * The theme-drift ratchet cannot see it either — both classes are correct
 * tokens; it is the pairing that is wrong.
 *
 * What counts as an offence here is narrow on purpose. A *bare swatch* is a
 * self-closing element with a success or destructive fill: self-closing, so it
 * has no children — no word, no icon, nothing inside it but colour. Two shapes
 * of those fail:
 *
 *   - **A flip.** One bare swatch whose class list holds both tones, so the same
 *     element changes meaning by changing hue and nothing else. This was the
 *     observability "worked" meter, which crossed a hidden 95% threshold between
 *     `bg-destructive` and `bg-success` — 94% and 96% drew near-identical bars.
 *   - **A touching pair.** Two bare swatches with nothing between them that a
 *     reader can read: no text, no rendered expression, no component. This was
 *     the seven-day runs chart, which stacked a destructive segment straight on
 *     a success one, same width, no border, no label.
 *
 * Anything with a word or an icon between the two swatches passes, which is why
 * the legend beside that chart — swatch, word, swatch, word — never registered.
 */

const SCAN_ROOTS = ['src/app', 'src/ui'];

/** A tone worn as fill rather than as text: `bg-success`, `fill-destructive/70`. */
const SUCCESS_FILL = /\b(?:bg|fill)-success\b/;
const DESTRUCTIVE_FILL = /\b(?:bg|fill)-destructive\b/;

/**
 * How far apart two swatches can sit and still read as one control.
 *
 * Past this they are separate furniture that happens to share a file, and
 * pairing them would report a fault nobody can see on screen.
 */
const TOUCHING_CHARS = 300;

type Tag = { index: number; end: number; selfClosing: boolean; source: string };

/**
 * Every JSX opening tag in a file, with its exact bounds.
 *
 * A regex cannot find these on its own: a `className` template literal in this
 * codebase routinely contains `>` (`${day.failed > 0 ? …}`) and nested quotes,
 * and `/<[^>]*>/` stops at the first of them, cutting the tag in half. This
 * walks the text tracking brace depth and quote state so a tag ends at the `>`
 * that actually closes it.
 */
function openTags(source: string): Tag[] {
  const tags: Tag[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '<') continue;

    const opening = /^<([A-Za-z][\w.]*)/.exec(source.slice(index, index + 64));
    if (!opening) continue;

    let depth = 0;
    let quote: string | null = null;
    let cursor = index + opening[0].length;

    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor];

      if (quote) {
        if (character === '\\') cursor += 1;
        else if (character === quote) quote = null;
        continue;
      }

      if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth <= 0) break;
    }

    if (cursor >= source.length) continue;

    tags.push({
      index,
      end: cursor + 1,
      selfClosing: source[cursor - 1] === '/',
      source: source.slice(index, cursor + 1),
    });
  }

  return tags;
}

/** A tag nested inside another one, which is how a render prop holds JSX. */
const NESTED_TAG = /[\s\S]<[A-Za-z]/;

/** Drops `{…}` expressions and `<…>` tags, leaving only literal JSX text. */
function literalText(between: string): string {
  let text = '';
  let depth = 0;
  let inTag = false;

  for (const character of between) {
    if (character === '{') { depth += 1; continue; }
    if (character === '}') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (character === '<') { inTag = true; continue; }
    if (character === '>') { inTag = false; continue; }
    if (!inTag) text += character;
  }

  return text;
}

/** A rendered expression: `{label}`, `{t("failed")}`, `{formatCount(day.failed)}`. */
const RENDERED_EXPRESSION = /\{\s*[\w.$]+(?:\([^{}]*\))?\s*\}/;

/** A component, which is how every icon in this codebase is spelled. */
const COMPONENT_TAG = /<[A-Z]/;

/**
 * Whether what sits between two swatches tells the reader which is which.
 *
 * A word, a number, a translated label or an icon all count. Control flow —
 * `)}`, `{day.succeeded > 0 && (` — does not, which is exactly the gap the
 * stacked chart bar fell through.
 */
function carriesMeaning(between: string): boolean {
  return (
    COMPONENT_TAG.test(between) ||
    RENDERED_EXPRESSION.test(between) ||
    /[A-Za-z]/.test(literalText(between))
  );
}

/**
 * Screens allowed to keep a hue-only success/destructive signal, with why.
 * May shrink, never grow — an entry here is a reader who cannot read the screen.
 */
const HUE_ONLY: ReadonlyMap<string, string> = new Map();

/** Frozen at the count the rule was written with: none. */
const HUE_ONLY_CEILING = 0;

function scan() {
  const files = SCAN_ROOTS.flatMap((root) =>
    walkFiles(path.join(repoRoot, root), new Set(['.tsx']))
      .map((file) => relativePath(file).replaceAll(path.sep, '/'))
      .filter((file) => !file.endsWith('.test.tsx'))
  );

  const offences: string[] = [];

  for (const file of files) {
    const source = readRepoFile(file);
    if (!SUCCESS_FILL.test(source) || !DESTRUCTIVE_FILL.test(source)) continue;

    // Self-closing, so nothing is inside it but colour; and holding no tag of
    // its own, so a component passing JSX through a prop is read as the
    // container it is rather than as one enormous swatch.
    const swatches = openTags(source).filter(
      (tag) =>
        tag.selfClosing &&
        !NESTED_TAG.test(tag.source) &&
        (SUCCESS_FILL.test(tag.source) || DESTRUCTIVE_FILL.test(tag.source))
    );

    for (const swatch of swatches) {
      if (!SUCCESS_FILL.test(swatch.source) || !DESTRUCTIVE_FILL.test(swatch.source)) continue;
      offences.push(
        `${file}:${lineOf(source, swatch.index)} — one empty element flips between bg-success and bg-destructive, so only hue says which state it is in`
      );
    }

    for (let i = 0; i < swatches.length; i += 1) {
      for (let j = i + 1; j < swatches.length; j += 1) {
        const [first, second] = [swatches[i], swatches[j]];
        const between = source.slice(first.end, second.index);
        if (between.length > TOUCHING_CHARS) break;

        const opposed =
          (SUCCESS_FILL.test(first.source) && DESTRUCTIVE_FILL.test(second.source)) ||
          (DESTRUCTIVE_FILL.test(first.source) && SUCCESS_FILL.test(second.source));

        if (!opposed || carriesMeaning(between)) continue;

        offences.push(
          `${file}:${lineOf(source, first.index)} — a bg-success and a bg-destructive element sit together with no word, number or icon between them (line ${lineOf(source, second.index)})`
        );
      }
    }
  }

  return { files, offences };
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

describe('no signal is readable by hue alone', () => {
  const { files, offences } = scan();
  const unfrozen = offences.filter((offence) => !HUE_ONLY.has(offence.split(':')[0]));

  test('the scan actually reads screens', () => {
    // A guard that walks nothing reports nothing, and reports it in the same
    // green as a guard that walks everything and finds nothing wrong.
    expect(files.length, 'no screen files were scanned at all').toBeGreaterThan(100);
    expect(
      files.some((file) => readRepoFile(file).includes('bg-destructive')),
      'no scanned file used bg-destructive, so the tone patterns match nothing'
    ).toBe(true);
  });

  test('the exception list only shrinks', () => {
    expect(
      [...HUE_ONLY.keys()],
      'The hue-only exception list grew. Give the signal a word, an icon or the blue/yellow axis instead — adding an entry to make a change pass is what this list exists to prevent:'
    ).toHaveLength(HUE_ONLY_CEILING);
  });

  test('exceptions whose screens are fixed leave the list', () => {
    const offending = new Set(offences.map((offence) => offence.split(':')[0]));
    const stale = [...HUE_ONLY.keys()].filter((file) => !offending.has(file));
    expect(
      stale,
      `These screens no longer carry a hue-only signal — remove them so the rule binds their paths at zero:\n${stale.join('\n')}`
    ).toEqual([]);
  });

  test('no success/destructive signal is left carrying its meaning alone', () => {
    expect(
      unfrozen,
      'The owner of this platform cannot tell red from green. These signal with green-versus-red and nothing else — ' +
        'add a word, an icon, or move to the blue/yellow axis (bg-info against bg-warning) as the seven-day chart and the ' +
        '"worked" meter in admin/agents/[id]/observability do, and as the risk radar in app/reports does. ' +
        `Colour beside a label is fine; colour instead of one is not:\n${unfrozen.join('\n')}`
    ).toEqual([]);
  });
});
