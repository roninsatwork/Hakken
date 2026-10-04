import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  repoRoot,
  walkFiles,
  relativePath,
} from './test/driftUtils';

describe('Chart Drift', () => {

  test('dashboard Recharts containers have stable parent heights', () => {
    const dashboardFiles = [
      ...walkFiles(path.join(repoRoot, 'src/app/(dashboard)/admin'), new Set(['.tsx'])),
      ...walkFiles(path.join(repoRoot, 'src/app/(dashboard)/app/settings'), new Set(['.tsx'])),
    ].filter((filePath) => !filePath.endsWith('.test.tsx'));

    const forbiddenChartParentPatterns = [
      /className="[^"]*\bw-full flex-1 min-h-\[[^\]]+\][^"]*"/,
      /className="[^"]*\bflex-1 w-full flex items-center justify-center p-4\b[^"]*"/,
    ];

    const offenders = dashboardFiles.flatMap((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      if (!contents.includes('ResponsiveContainer')) {
        return [];
      }

      return contents.split('\n').flatMap((line, index) =>
        forbiddenChartParentPatterns.some((pattern) => pattern.test(line))
          ? [`${relativePath(filePath)}:${index + 1}: ${line.trim()}`]
          : []
      );
    });
    const percentageHeightContainers = dashboardFiles.flatMap((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      if (!contents.includes('ResponsiveContainer')) {
        return [];
      }

      return contents.split('\n').flatMap((line, index) =>
        /<ResponsiveContainer width="100%" height="100%"/.test(line)
          ? [`${relativePath(filePath)}:${index + 1}: ${line.trim()}`]
          : []
      );
    });

    expect(
      offenders,
      `Dashboard chart containers need explicit heights/aspects so Recharts can measure them:\n${offenders.join('\n')}`
    ).toEqual([]);
    expect(
      percentageHeightContainers,
      `Dashboard ResponsiveContainer usage needs numeric heights so Recharts can render immediately:\n${percentageHeightContainers.join('\n')}`
    ).toEqual([]);
  });

  /**
   * Every chart comes in the same way (Anthony, 2026-10-03: "the charts in
   * the app are static and load flat"): drawn whole, with `ChartReveal`
   * playing its entrance over it. Recharts' own entrance stays off, since it
   * wedged charts blank on React 19 (GovernanceRunsChart.tsx, 2026-08-18).
   */
  test('every chart plays its entrance through ChartReveal, never Recharts', () => {
    const chartFiles = walkFiles(path.join(repoRoot, 'src'), new Set(['.tsx']))
      .filter((filePath) => !filePath.endsWith('.test.tsx'));

    const count = (contents: string, pattern: RegExp) => (contents.match(pattern) ?? []).length;
    const unrevealed = chartFiles.flatMap((filePath) => {
      const contents = fs.readFileSync(filePath, 'utf8');
      const charts = count(contents, /<ResponsiveContainer\b/g);
      const reveals = count(contents, /<ChartReveal\b/g);
      return charts > reveals ? [`${relativePath(filePath)}: ${charts} charts, ${reveals} inside ChartReveal`] : [];
    });
    const recharts = chartFiles.flatMap((filePath) =>
      fs.readFileSync(filePath, 'utf8').split('\n').flatMap((line, index) =>
        /isAnimationActive(?!=\{false\})/.test(line) && !/^\s*(\/\/|\*|\{\/\*)/.test(line)
          ? [`${relativePath(filePath)}:${index + 1}: ${line.trim()}`]
          : []
      )
    );

    expect(unrevealed, `Wrap each ResponsiveContainer in ChartReveal (src/ui/components/screens/ChartReveal.tsx):\n${unrevealed.join('\n')}`).toEqual([]);
    expect(recharts, `Keep isAnimationActive={false} on every series; ChartReveal plays the entrance:\n${recharts.join('\n')}`).toEqual([]);
  });
});
