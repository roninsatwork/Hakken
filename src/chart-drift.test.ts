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
});
