import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { ADMIN_PAGE_SIZE } from './app/(dashboard)/admin/_lib/pagination';

const repoRoot = process.cwd();

const walkFiles = (dir: string, extensions: ReadonlySet<string>): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(fullPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};

const relativePath = (filePath: string) => path.relative(repoRoot, filePath);
const readRepoFile = (relativeFilePath: string) => fs.readFileSync(path.join(repoRoot, relativeFilePath), 'utf8');
const extractExportBody = (relativeFilePath: string, exportName: string) => {
  const contents = readRepoFile(relativeFilePath);
  const startNeedle = `export const ${exportName} =`;
  const startIndex = contents.indexOf(startNeedle);

  if (startIndex === -1) {
    return '';
  }

  const body = contents.slice(startIndex);
  const nextExportMatch = /\nexport (?:const|async function|function) \w+/.exec(body.slice(startNeedle.length));

  return nextExportMatch ? body.slice(0, startNeedle.length + nextExportMatch.index) : body;
};
const queryBlocksForTable = (body: string, tableName: string) => {
  const queryPattern = new RegExp(`ctx\\.db\\s*\\.query\\("${tableName}"\\)`, 'g');

  return Array.from(body.matchAll(queryPattern)).map((match) => {
    const startIndex = match.index ?? 0;
    const rest = body.slice(startIndex);
    const endIndex = rest.indexOf(';');

    return endIndex === -1 ? rest : rest.slice(0, endIndex + 1);
  });
};
const repoTextExtensions = new Set(['.js', '.jsx', '.json', '.md', '.mjs', '.ts', '.tsx', '.zsh']);
const ignoredRepoPathPrefixes = [
  '.git/',
  '.agent/',
  '.next/',
  'adk-python/',
  'node_modules/',
  'package-lock.json',
  'playwright-report/',
  'public/models/',
  'tsconfig.tsbuildinfo',
];

const isIgnoredRepoFile = (filePath: string) => {
  const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

  return ignoredRepoPathPrefixes.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(prefix));
};

const walkRepoFiles = (dir: string, extensions: ReadonlySet<string>): string[] => {
  if (!fs.existsSync(dir) || isIgnoredRepoFile(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (isIgnoredRepoFile(fullPath)) {
      return [];
    }

    if (entry.isDirectory()) {
      return walkRepoFiles(fullPath, extensions);
    }

    return extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
};

describe('Quality Drift Guardrails', () => {
  test('admin pagination standard stays at 15 rows', () => {
    expect(ADMIN_PAGE_SIZE).toBe(15);
  });

  test('app UI does not use native browser dialogs', () => {
    const files = [
      ...walkFiles(path.join(repoRoot, 'src/app'), new Set(['.ts', '.tsx'])),
      ...walkFiles(path.join(repoRoot, 'src/ui'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !filePath.endsWith('.test.ts') && !filePath.endsWith('.test.tsx'));

    const nativeDialogCall = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
    const offenders = files
      .map((filePath) => ({
        filePath,
        lines: fs
          .readFileSync(filePath, 'utf8')
          .split('\n')
          .flatMap((line, index) => (nativeDialogCall.test(line) ? [`${relativePath(filePath)}:${index + 1}`] : [])),
      }))
      .filter(({ lines }) => lines.length > 0)
      .flatMap(({ lines }) => lines);

    expect(offenders, `Native dialogs found:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('admin pagination uses the 15-row standard', () => {
    const adminFiles = walkFiles(path.join(repoRoot, 'src/app/(dashboard)/admin'), new Set(['.tsx']))
      .filter((filePath) => !filePath.endsWith('.test.tsx'));

    const forbiddenPageSizePatterns = [
      /\binitialNumItems\s*:\s*(?!15\b)\d+/,
      /\bloadMore\(\s*(?!15\b)\d+\s*\)/,
      /\b(?:pageSize|itemsPerPage)\s*=\s*(?!15\b)\d+/,
      /\bpageSize\s*:\s*(?!15\b)\d+/,
    ];

    const offenders = adminFiles.flatMap((filePath) => {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');

      return lines.flatMap((line, index) =>
        forbiddenPageSizePatterns.some((pattern) => pattern.test(line))
          ? [`${relativePath(filePath)}:${index + 1}: ${line.trim()}`]
          : []
      );
    });

    expect(offenders, `Non-standard admin pagination found:\n${offenders.join('\n')}`).toEqual([]);
  });

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

  test('admin list pages keep using shared table primitives after cleanup', () => {
    const pages = [
      'src/app/(dashboard)/admin/agents/page.tsx',
      'src/app/(dashboard)/admin/companies/page.tsx',
      'src/app/(dashboard)/admin/settings/plans/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AdminSearchBar') ||
        !contents.includes('AdminTableShell') ||
        !contents.includes('AdminPaginationFooter') ||
        contents.includes('ChevronLeft') ||
        contents.includes('ChevronRight');
    });

    expect(offenders, `Admin pages drifted away from shared table primitives:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('admin rules list pages keep using the shared rules table', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/rules/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/rules/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AdminRulesTable') || /getPriorityColor|deleteRuleMutation\(\{\s*id:\s*rule\._id/.test(contents);
    });

    expect(offenders, `Rules pages drifted away from shared table/delete-confirmation patterns:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('knowledge document deletes remain confirmation-gated', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/global-knowledge/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/knowledge/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);
      return !contents.includes('KnowledgeManager');
    });

    const managerContents = readRepoFile('src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx');
    const managerAllowsDirectDelete = /onClick=\{\(\) => deleteDocument/.test(managerContents) ||
      !managerContents.includes('documentToDelete');

    expect(offenders, `Knowledge pages drifted away from the shared knowledge manager:\n${offenders.join('\n')}`).toEqual([]);
    expect(managerAllowsDirectDelete, 'Shared knowledge manager must keep document deletes confirmation-gated.').toBe(false);
  });

  test('handoff and platform plans keep movement demo files out of scope', () => {
    const guardrailFiles = [
      'AGENTS.md',
      'docs/code-quality-95-plan.md',
      'docs/current-cleanup-checklist.md',
    ];
    const requiredNoTouchPaths = [
      'src/app/(dashboard)/demos/movements/**',
      'src/app/(dashboard)/demos/movement-capture/page.tsx',
      'convex/movements.ts',
    ];

    const missingPaths = guardrailFiles.flatMap((filePath) => {
      const contents = readRepoFile(filePath);

      return requiredNoTouchPaths
        .filter((demoPath) => !contents.includes(demoPath))
        .map((demoPath) => `${filePath}: ${demoPath}`);
    });

    expect(missingPaths, `Movement demo no-touch paths missing from guardrail docs:\n${missingPaths.join('\n')}`).toEqual([]);
  });

  test('deployment docs match the production GitHub Actions gate', () => {
    const workflow = readRepoFile('.github/workflows/deploy.yml');
    const deploymentDocs = readRepoFile('docs/deployment.md');
    const requiredGateCommands = [
      'npm audit --audit-level=high',
      'npm run lint',
      'npm run typecheck',
      'npm run test:run',
      'npm run build',
    ];

    const missingCommands = requiredGateCommands.flatMap((command) => {
      const missingFromWorkflow = workflow.includes(command) ? [] : [`.github/workflows/deploy.yml: ${command}`];
      const missingFromDocs = deploymentDocs.includes(command) ? [] : [`docs/deployment.md: ${command}`];

      return [...missingFromWorkflow, ...missingFromDocs];
    });

    expect(missingCommands, `Production gate commands are out of sync:\n${missingCommands.join('\n')}`).toEqual([]);
    expect(workflow).toContain('branches:\n      - main');
    expect(deploymentDocs).toContain('Pushing to `main` triggers a production deployment');
  });

  test('global analytics hot path stays separate from broad inventory scans', () => {
    const analyticsContents = readRepoFile('convex/analytics.ts');
    const globalAnalyticsBody = analyticsContents.split('export const getGlobalAnalytics = query({')[1]?.split('export const debugTime = internalQuery({')[0] || '';
    const forbiddenPatterns = [
      /ctx\.db\s*\.query\("threads"\)\s*\.take\(10000\)/,
      /ctx\.db\s*\.query\("users"\)\s*\.take\(10000\)/,
      /ctx\.db\s*\.query\("companies"\)\s*\.take\(10000\)/,
      /ctx\.db\s*\.query\("agents"\)\s*\.take\(10000\)/,
      /ctx\.db\s*\.query\("plans"\)/,
    ];

    const offenders = forbiddenPatterns
      .filter((pattern) => pattern.test(globalAnalyticsBody))
      .map((pattern) => pattern.source);

    expect(
      offenders,
      `getGlobalAnalytics drifted back into broad inventory/table scans. Move inventory fields to getGlobalInventoryMetrics or use bounded observed-ID lookups:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('user cost aggregate stays separate from per-thread message scans', () => {
    const userCostOverviewBody = extractExportBody('convex/analytics.ts', 'getUserCostOverview');
    const forbiddenPatterns = [
      /\.withIndex\("by_thread"/,
      /\.query\("threads"\)[\s\S]*\.map\(async \(thread\)/,
    ];

    const offenders = forbiddenPatterns
      .filter((pattern) => pattern.test(userCostOverviewBody))
      .map((pattern) => pattern.source);

    expect(
      offenders,
      `getUserCostOverview drifted back into per-thread message aggregation. Keep aggregate totals snapshot/index based and use getUserCostThreads for paginated detail rows:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('analytics transaction reads stay indexed in dashboard and snapshot paths', () => {
    const protectedExports = [
      { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics' },
      { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics' },
      { filePath: 'convex/analyticsCron.ts', exportName: 'generateDailySnapshots' },
    ];

    const offenders = protectedExports.flatMap(({ filePath, exportName }) => {
      const body = extractExportBody(filePath, exportName);

      return queryBlocksForTable(body, 'agentTransactions')
        .filter((block) => !/\.withIndex\("by_(?:createdAt|company_created)"/.test(block))
        .map((block) => `${filePath}:${exportName}: ${block.replace(/\s+/g, ' ').trim()}`);
    });

    expect(
      offenders,
      `agentTransactions reads in analytics hot paths must use created-at or company/date indexes:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('analytics snapshot reads are date-bounded before dashboard aggregation', () => {
    const protectedExports = [
      { filePath: 'convex/analytics.ts', exportName: 'getGlobalAICosts' },
      { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics' },
      { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics' },
      { filePath: 'convex/analytics.ts', exportName: 'getUserCostOverview' },
    ];

    const offenders = protectedExports.flatMap(({ filePath, exportName }) => {
      const body = extractExportBody(filePath, exportName);

      return queryBlocksForTable(body, 'analyticsDailySnapshots')
        .filter((block) => {
          const hasSnapshotIndex = /\.withIndex\("by_(?:company_date|type_date|user_date)"/.test(block);
          const hasDateUpperBound = /\.filter\(\(q\) => q\.lt\(q\.field\("date"\), todayDate\)\)/.test(block) ||
            /\.filter\(q => q\.lt\(q\.field\("date"\), todayDate\)\)/.test(block);
          const hasDateLowerBound = /\.gte\("date", snapshotStartDate\)/.test(block);
          const lowerBoundRequired = exportName !== 'getUserCostOverview';

          return !hasSnapshotIndex || !hasDateUpperBound || (lowerBoundRequired && !hasDateLowerBound);
        })
        .map((block) => `${filePath}:${exportName}: ${block.replace(/\s+/g, ' ').trim()}`);
    });

    expect(
      offenders,
      `Dashboard snapshot reads must be indexed and bounded by snapshot dates before aggregation:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('analytics live message reads use indexed created-at bounds', () => {
    const protectedExports = [
      { filePath: 'convex/analytics.ts', exportName: 'getPlatformOverview' },
      { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics' },
      { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics' },
      { filePath: 'convex/analytics.ts', exportName: 'getUserCostOverview' },
      { filePath: 'convex/analyticsCron.ts', exportName: 'generateDailySnapshots' },
    ];

    const offenders = protectedExports.flatMap(({ filePath, exportName }) => {
      const body = extractExportBody(filePath, exportName);

      return queryBlocksForTable(body, 'messages')
        .filter((block) => !/\.withIndex\("by_(?:role_created|company_role_created|user_role_created)"/.test(block) ||
          !/\.gte\("createdAt",/.test(block))
        .map((block) => `${filePath}:${exportName}: ${block.replace(/\s+/g, ' ').trim()}`);
    });

    expect(
      offenders,
      `Live analytics message reads must be indexed and lower-bounded by createdAt:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('analytics broad-scan exceptions stay explicitly allowlisted', () => {
    const exceptions = [
      {
        filePath: 'convex/analytics.ts',
        exportName: 'getGlobalInventoryMetrics',
        table: 'users',
        reason: 'explicit inventory query split away from hot-path analytics',
      },
      {
        filePath: 'convex/analytics.ts',
        exportName: 'getGlobalInventoryMetrics',
        table: 'companies',
        reason: 'explicit inventory query split away from hot-path analytics',
      },
      {
        filePath: 'convex/analytics.ts',
        exportName: 'debugDb',
        table: 'plans',
        reason: 'internal debug query only',
      },
      {
        filePath: 'convex/analytics.ts',
        exportName: 'debugDb',
        table: 'companies',
        reason: 'internal debug query only',
      },
      {
        filePath: 'convex/analyticsCron.ts',
        exportName: 'wipeSnapshots',
        table: 'analyticsDailySnapshots',
        reason: 'internal destructive maintenance query used only to reset generated analytics snapshots',
      },
    ];
    const allowed = new Set(exceptions.map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`));
    const files = ['convex/analytics.ts', 'convex/analyticsCron.ts'];
    const broadScanPattern = /ctx\.db\s*\.query\("(threads|users|companies|agents|plans|analyticsDailySnapshots)"\)\s*(?![\s\S]*?\.withIndex\()[\s\S]*?\.take\(10000\)/g;
    const offenders = files.flatMap((filePath) => {
      const contents = readRepoFile(filePath);

      return Array.from(contents.matchAll(/\nexport const (\w+) =/g)).flatMap((match) => {
        const exportName = match[1];
        const body = extractExportBody(filePath, exportName);

        return Array.from(body.matchAll(broadScanPattern))
          .filter((broadScanMatch) => !allowed.has(`${filePath}:${exportName}:${broadScanMatch[1]}`))
          .map((broadScanMatch) => `${filePath}:${exportName}:${broadScanMatch[1]}: ${broadScanMatch[0].replace(/\s+/g, ' ').trim()}`);
      });
    });
    const weakExceptionReasons = exceptions
      .filter(({ reason }) => reason.length < 24)
      .map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`);

    expect(
      offenders,
      `Broad analytics scans must be removed, indexed, or explicitly allowlisted with a reason:\n${offenders.join('\n')}`
    ).toEqual([]);
    expect(weakExceptionReasons, `Analytics scale exceptions need useful reasons:\n${weakExceptionReasons.join('\n')}`).toEqual([]);
  });

  test('new Gemini-era language must be classified before it spreads', () => {
    const allowedGeminiReferenceFiles = new Set([
      'convex/aiModelService.ts',
      'convex/aiModelsActions.ts',
      'convex/debug.ts',
      'convex/seedAgents.ts',
      'convex/seedWorkflows.ts',
      'docs/code-quality-95-plan.md',
      'docs/future-agent-maintenance-plan.md',
      'src/quality-drift.test.ts',
    ]);

    const files = walkRepoFiles(repoRoot, repoTextExtensions);
    const geminiReference = /gemini/i;
    const legacyAgentFileReference = /GEMINI\.md/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedGeminiReferenceFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          geminiReference.test(line) && !legacyAgentFileReference.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified Gemini-era references found. Keep actual model IDs/provider docs allowlisted, but rename stale platform language:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
