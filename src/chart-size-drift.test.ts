import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, relativePath, walkFiles } from './test/driftUtils';

/**
 * A chart never grows with the screen (Anthony, 2026-11-05: "why is this so huge on full screen"). An `<svg>` with a `viewBox` and
 * `width="100%"` stretches, words and all: on his 3,200-wide screen, Funnel's chart had 33 pixel words and stood 1,410 tall. Draw in
 * real pixels at the measured width (`useElementWidth`). A small icon with a fixed width isn't what this looks for.
 */
const STRETCHED = /<svg\b[^>]*(?:\bviewBox=[^>]*\bwidth="100%"|\bwidth="100%"[^>]*\bviewBox=)/;

describe('a chart is drawn at real size', () => {
  test('no screen stretches a drawing to fill the page', () => {
    const screens = walkFiles(path.join(repoRoot, 'src'), new Set(['.tsx'])).filter((file) => !file.endsWith('.test.tsx'));
    expect(screens.length).toBeGreaterThan(100);
    const stretched = screens.filter((file) => STRETCHED.test(fs.readFileSync(file, 'utf8'))).map((file) => relativePath(file));
    expect(stretched).toEqual([]);
  });

  test('the guard finds a stretched drawing, written either way round', () => {
    expect(STRETCHED.test('<svg role="img" viewBox={`0 0 ${W} ${height}`} width="100%" className="block">')).toBe(true);
    expect(STRETCHED.test('<svg width="100%"\n  viewBox="0 0 10 10">')).toBe(true);
    expect(STRETCHED.test('<svg viewBox={`0 0 ${W} ${height}`} width={W} height={height}>')).toBe(false);
  });
});
