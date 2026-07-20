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
  'tmp/',
  'tsconfig.tsbuildinfo',
];

const isIgnoredRepoFile = (filePath: string) => {
  const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

  return ignoredRepoPathPrefixes.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(prefix));
};

const platformScaleBroadReadAllowlist = [
  { filePath: 'convex/aiModels.ts', exportName: 'internalBatchUpsert', table: 'aiModels', category: 'maintenance', phase: 'Phase 7', reason: 'provider sync upsert is internal maintenance and will be quarantined or bounded' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAICosts', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'analytics cost calculation reads model catalogue while resolving configured costs' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAICosts', table: 'messages', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'bounded live-day analytics overlay is protected by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getPlatformOverview', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'platform overview reads model catalogue for configured cost resolution' },
  { filePath: 'convex/analytics.ts', exportName: 'getPlatformOverview', table: 'messages', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'platform overview recent-cost read is bounded by analytics-specific drift checks' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostOverview', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'user cost overview reads model catalogue for configured cost resolution' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostOverview', table: 'analyticsDailySnapshots', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'snapshot-first aggregate read is protected by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostOverview', table: 'messages', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'user live overlay is bounded and protected by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostThreads', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'thread detail cost calculation reads model catalogue for configured costs' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostThreads', table: 'threads', category: 'analytics_detail', phase: 'Analytics Plan', reason: 'thread-level cost details are split from aggregate user cost metrics' },
  { filePath: 'convex/analytics.ts', exportName: 'getUserCostThreads', table: 'messages', category: 'analytics_detail', phase: 'Analytics Plan', reason: 'thread-scoped message detail remains split from aggregate user cost metrics' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'company analytics cost calculation reads model catalogue for configured costs' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'users', category: 'inventory_overlay', phase: 'Phase 5', reason: 'company inventory overlay remains exact until inventory rollups are introduced' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'messages', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'company live message overlay is bounded by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'agentTransactions', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'company live transaction overlay is indexed and analytics-protected' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'knowledgeDocuments', category: 'knowledge_inventory', phase: 'Phase 2', reason: 'knowledge document count is scheduled for document-level rollup or bounded pagination' },
  { filePath: 'convex/analytics.ts', exportName: 'getCompanyMetrics', table: 'analyticsDailySnapshots', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'company snapshot read is protected by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'global analytics reads model catalogue for configured cost resolution' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics', table: 'messages', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'global live message overlay is bounded by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics', table: 'agentTransactions', category: 'analytics_live_overlay', phase: 'Analytics Plan', reason: 'global live transaction overlay is bounded by analytics-specific drift tests' },
  { filePath: 'convex/analytics.ts', exportName: 'getGlobalAnalytics', table: 'analyticsDailySnapshots', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'global snapshot read is protected by analytics-specific drift tests' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'moduleScope', table: 'analyticsDailySnapshots', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'snapshot health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'moduleScope', table: 'messages', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'message dimension health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'moduleScope', table: 'agentTransactions', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'transaction health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'backfillMessageAnalyticsDimensions', table: 'messages', category: 'maintenance', phase: 'Analytics Plan', reason: 'paginated analytics backfill is retained for historical repair and validation' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'generateDailySnapshots', table: 'messages', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'daily snapshot generation reads bounded day windows for analytics snapshots' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'generateDailySnapshots', table: 'agentTransactions', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'daily transaction snapshot generation reads bounded day windows' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'generateDailySnapshots', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'daily snapshot generation reads model catalogue for configured cost resolution' },
  { filePath: 'convex/analyticsCron.ts', exportName: 'wipeSnapshots', table: 'analyticsDailySnapshots', category: 'maintenance', phase: 'Analytics Plan', reason: 'internal destructive snapshot maintenance remains explicitly allowlisted' },
  { filePath: 'convex/arcade.ts', exportName: 'getPaginatedLeaderboard', table: 'arcadeScores', category: 'low_priority_product', phase: 'Phase 1', reason: 'arcade leaderboard uses a capped list and needs pagination if it becomes a real scale surface' },
  { filePath: 'convex/arcade.ts', exportName: 'getScoresCount', table: 'arcadeScores', category: 'low_priority_product', phase: 'Phase 1', reason: 'arcade score count uses capped reads and needs count strategy if it becomes a real scale surface' },
  { filePath: 'convex/chat.ts', exportName: 'getThreads', table: 'threads', category: 'chat_logs', phase: 'Phase 3', reason: 'chat thread list is scheduled for bounded date and pagination contracts' },
  { filePath: 'convex/chat.ts', exportName: 'getMessages', table: 'messages', category: 'chat_logs', phase: 'Phase 3', reason: 'chat message timeline is thread-scoped but needs pagination for long conversations' },
  { filePath: 'convex/chat.ts', exportName: 'getMessagesForAI', table: 'messages', category: 'chat_runtime', phase: 'Phase 3', reason: 'AI context message fetch is thread-scoped but needs bounded context-window contracts' },
  { filePath: 'convex/chat.ts', exportName: 'sendMessage', table: 'messages', category: 'chat_runtime', phase: 'Phase 3', reason: 'chat send context fetch is thread-scoped but needs bounded context-window contracts' },
  { filePath: 'convex/chat.ts', exportName: 'deleteThread', table: 'messages', category: 'chat_maintenance', phase: 'Phase 3', reason: 'thread delete cascade should become explicitly batch bounded in chat hardening' },
  { filePath: 'convex/chatAdmin.ts', exportName: 'getOffsetPaginatedThreads', table: 'threads', category: 'chat_logs', phase: 'Phase 3', reason: 'global admin chat logs need indexed date-bounded server pagination' },
  { filePath: 'convex/chatAdmin.ts', exportName: 'getOffsetPaginatedCompanyThreads', table: 'threads', category: 'chat_logs', phase: 'Phase 3', reason: 'company admin chat logs need indexed date-bounded server pagination' },
  { filePath: 'convex/chatAdmin.ts', exportName: 'getAdminThreadMessages', table: 'messages', category: 'chat_logs', phase: 'Phase 3', reason: 'admin thread message details need pagination for long conversations' },
  { filePath: 'convex/companies.ts', exportName: 'getCompanies', table: 'companies', category: 'admin_inventory', phase: 'Phase 1', reason: 'admin company inventory list is scheduled for paginated indexed contracts' },
  { filePath: 'convex/companies.ts', exportName: 'getCompanies', table: 'users', category: 'admin_inventory', phase: 'Phase 1', reason: 'company user counts need rollup or bounded lookup during admin inventory hardening' },
  { filePath: 'convex/inventoryRollups.ts', exportName: 'rebuildGlobalInventoryRollupData', table: 'users', category: 'maintenance', phase: 'Phase 5', reason: 'super-admin rollup rebuild helper is an explicit repair path for existing inventory data' },
  { filePath: 'convex/inventoryRollups.ts', exportName: 'rebuildGlobalInventoryRollupData', table: 'companies', category: 'maintenance', phase: 'Phase 5', reason: 'super-admin rollup rebuild helper is an explicit repair path for existing inventory data' },
  { filePath: 'convex/inventoryRollups.ts', exportName: 'rebuildGlobalInventoryRollupData', table: 'plans', category: 'maintenance', phase: 'Phase 5', reason: 'super-admin rollup rebuild helper is an explicit repair path for existing inventory data' },
  { filePath: 'convex/knowledge.ts', exportName: 'getDocuments', table: 'knowledgeDocuments', category: 'knowledge', phase: 'Phase 2', reason: 'knowledge document list is scheduled for paginated status/date contracts' },
  { filePath: 'convex/knowledge.ts', exportName: 'getThreadDocuments', table: 'knowledgeDocuments', category: 'knowledge', phase: 'Phase 2', reason: 'thread knowledge lookup needs bounded document-scoped behavior' },
  { filePath: 'convex/knowledge.ts', exportName: 'getThreadDocumentsInternal', table: 'knowledgeDocuments', category: 'knowledge', phase: 'Phase 2', reason: 'internal thread knowledge lookup needs bounded document-scoped behavior' },
  { filePath: 'convex/knowledge.ts', exportName: 'garbageCollectThreadVectors', table: 'knowledgeDocuments', category: 'knowledge_maintenance', phase: 'Phase 2', reason: 'thread vector garbage collection should remain document-scoped and batch bounded' },
  { filePath: 'convex/knowledge.ts', exportName: 'getNextPendingUrlInternal', table: 'knowledgeDocuments', category: 'knowledge_ingestion', phase: 'Phase 2', reason: 'website ingestion queue needs indexed status/date reads' },
  { filePath: 'convex/knowledge.ts', exportName: 'deleteWebsiteBulk', table: 'knowledgeDocuments', category: 'knowledge_maintenance', phase: 'Phase 2', reason: 'bulk website delete needs company/status/date bounded batches' },
  { filePath: 'convex/knowledge.ts', exportName: 'purgeDocumentChunksInternal', table: 'knowledgeChunks', category: 'knowledge_maintenance', phase: 'Phase 2', reason: 'chunk purge is document-scoped but should become explicitly batch bounded' },
  { filePath: 'convex/knowledge.ts', exportName: 'debugCount', table: 'knowledgeChunks', category: 'debug', phase: 'Phase 7', reason: 'knowledge debug chunk count is scheduled for debug quarantine or rollup comparison only' },
  { filePath: 'convex/knowledge.ts', exportName: 'debugCount', table: 'knowledgeDocuments', category: 'debug', phase: 'Phase 7', reason: 'knowledge debug count is scheduled for debug quarantine or rollup comparison only' },
  { filePath: 'convex/movements.ts', exportName: 'list', table: 'movements', category: 'frozen_movement_demo', phase: 'Frozen', reason: 'movement demo is explicitly frozen and out of scope unless user requests it' },
  { filePath: 'convex/properties.ts', exportName: 'listProperties', table: 'properties', category: 'admin_inventory', phase: 'Phase 1', reason: 'property list needs bounded indexed pagination if this surface grows' },
  { filePath: 'convex/properties.ts', exportName: 'getPropertiesCount', table: 'properties', category: 'inventory_rollup', phase: 'Phase 5', reason: 'property count reads need indexed count strategy or rollup when data grows' },
  { filePath: 'convex/purges.ts', exportName: 'getPipelineConfig', table: 'systemConfig', category: 'maintenance', phase: 'Phase 7', reason: 'purge pipeline config is internal maintenance and remains classified' },
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'workflowExecutionSteps', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'messages', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'threads', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'swarmLogs', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
  { filePath: 'convex/salesReports.ts', exportName: 'getAgentKnowledgeDocumentsQuery', table: 'knowledgeDocuments', category: 'knowledge', phase: 'Phase 2', reason: 'agent knowledge report lookup needs bounded knowledge document pagination' },
  { filePath: 'convex/salesReports.ts', exportName: 'getLatestReport', table: 'salesReports', category: 'admin_inventory', phase: 'Phase 1', reason: 'latest sales report lookup needs indexed latest-by-scope behavior if report volume grows' },
  { filePath: 'convex/swarmRuntime.ts', exportName: 'getSwarmLogs', table: 'swarmLogs', category: 'workflow_runtime', phase: 'Phase 4', reason: 'swarm runtime logs need bounded runtime log pagination' },
  { filePath: 'convex/swarmRuntime.ts', exportName: 'clearSwarmLogs', table: 'swarmLogs', category: 'maintenance', phase: 'Phase 7', reason: 'swarm log clear is maintenance and should remain bounded or quarantined' },
  { filePath: 'convex/swarmRuntime.ts', exportName: 'getDemoAgents', table: 'agents', category: 'maintenance', phase: 'Phase 7', reason: 'demo agent lookup is maintenance/demo-only pending legacy quarantine' },
  { filePath: 'convex/users.ts', exportName: 'getPaginatedUsers', table: 'users', category: 'admin_inventory', phase: 'Phase 1', reason: 'user pagination currently reads a capped user set before server-side filtering hardening' },
  { filePath: 'convex/users.ts', exportName: 'getMyLoginsCount', table: 'logins', category: 'admin_inventory', phase: 'Phase 1', reason: 'login count needs indexed count strategy rather than capped reads' },
  { filePath: 'convex/users.ts', exportName: 'recordLogin', table: 'logins', category: 'maintenance', phase: 'Phase 7', reason: 'login duplicate cleanup should become bounded by user/session indexes' },
  { filePath: 'convex/users.ts', exportName: 'getUnassignedSuperAdmins', table: 'users', category: 'admin_inventory', phase: 'Phase 1', reason: 'unassigned super-admin selector needs bounded role/company lookup before large admin growth' },
  { filePath: 'convex/widgets.ts', exportName: 'generateWidgetUploadUrl', table: 'messages', category: 'chat_runtime', phase: 'Phase 3', reason: 'widget upload thread lookup should be indexed and bounded in chat hardening' },
  { filePath: 'convex/workflows.ts', exportName: 'list', table: 'workflows', category: 'admin_inventory', phase: 'Phase 1', reason: 'workflow admin inventory list is scheduled for paginated indexed contracts' },
] as const;

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

const exportNameAtOffset = (contents: string, offset: number) => {
  const exportPattern = /export const (\w+)\s*=|export (?:async )?function (\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  let exportName = 'moduleScope';

  while ((match = exportPattern.exec(contents)) && match.index < offset) {
    exportName = match[1] ?? match[2] ?? exportName;
  }

  return exportName;
};

const findConvexBroadReads = () => {
  const files = walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
    .filter((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      return !normalizedPath.includes('/_generated/') && !normalizedPath.endsWith('.test.ts');
    });
  const broadOperationPattern = /\.(take\(10000\)|collect\(\))/g;

  return files.flatMap((filePath) => {
    const contents = fs.readFileSync(filePath, 'utf8');
    const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

    return Array.from(contents.matchAll(broadOperationPattern)).flatMap((match) => {
      const operationOffset = match.index ?? 0;
      const statementStart = Math.max(
        contents.lastIndexOf(';', operationOffset) + 1,
        contents.lastIndexOf('{', operationOffset) + 1
      );
      const statementEndIndex = contents.indexOf(';', operationOffset);
      const statementEnd = statementEndIndex === -1 ? contents.length : statementEndIndex + 1;
      const statement = contents.slice(statementStart, statementEnd);
      const queryMatch = /ctx\.db\s*\.query\(\s*(?:"([^"]+)"|(table))\s*\)/.exec(statement);

      if (!queryMatch) {
        return [];
      }

      return [{
        filePath: normalizedPath,
        exportName: exportNameAtOffset(contents, operationOffset),
        table: queryMatch[1] ?? '__dynamic__',
        operation: match[1],
        lineNumber: contents.slice(0, operationOffset).split('\n').length,
        statement: statement.replace(/\s+/g, ' ').trim(),
      }];
    });
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
        (!contents.includes('AdminPaginationFooter') && !contents.includes('AdminLoadMoreFooter')) ||
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

  test('Ask Sonae assistant runtimes keep the shared safety spine', () => {
    const assistantBody = extractExportBody('convex/ai.ts', 'generateSonaeResponse');
    const agentBody = extractExportBody('convex/agentRuntime.ts', 'runAgentObjective');

    const assistantRequirements = [
      'evaluateAssistantSafety',
      'saveAssistantSafetyRefusal',
      'buildAssistantSystemInstruction',
      'buildUntrustedConversationHistory',
      'buildUntrustedKnowledgeContext',
    ];
    const agentRequirements = [
      'evaluateAssistantSafety',
      'saveAssistantSafetyRefusal',
      'buildAgentSystemInstruction',
      'buildUntrustedKnowledgeContext',
      'canExecuteTool',
    ];
    const assistantMissing = assistantRequirements.filter((needle) => !assistantBody.includes(needle));
    const agentMissing = agentRequirements.filter((needle) => !agentBody.includes(needle));

    expect(
      assistantMissing,
      `generateSonaeResponse must keep preflight refusal, prompt hierarchy, untrusted history, and untrusted RAG helpers:\n${assistantMissing.join('\n')}`
    ).toEqual([]);
    expect(
      agentMissing,
      `runAgentObjective must keep preflight refusal, agent prompt hierarchy, untrusted RAG, and tool authorization helpers:\n${agentMissing.join('\n')}`
    ).toEqual([]);
    expect(assistantBody).not.toContain('Previous Conversation History:');
    expect(assistantBody).not.toContain('[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]');
    expect(agentBody).not.toContain('[SYSTEM INJECTION: RELEVANT KNOWLEDGE BASE DATA]');
    expect(agentBody).not.toContain('You MUST refer to these when answering');
  });

  test('admin AI rule forms keep prompt-injection warning panels', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/rules/new/page.tsx',
      'src/app/(dashboard)/admin/ai/rules/[id]/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/new/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/rules/new/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/rules/[ruleId]/page.tsx',
    ];
    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AiRuleSafetyWarningPanel') ||
        !contents.includes('trigger=') ||
        !contents.includes('instruction=');
    });

    expect(
      offenders,
      `AI rule forms must keep visible prompt-injection safety warnings before save:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('admin AI prompt editors keep prompt-injection warning panels', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/system-prompt/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/system-prompt/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/system-prompt/page.tsx',
    ];
    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AiRuleSafetyWarningPanel') ||
        !contents.includes('instruction={promptValue}') ||
        !contents.includes('subject="prompt"');
    });

    expect(
      offenders,
      `AI prompt editors must keep visible prompt-injection safety warnings before save:\n${offenders.join('\n')}`
    ).toEqual([]);
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
      'docs/plans/completed/code-quality-95-plan.md',
      'docs/plans/completed/current-cleanup-checklist.md',
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
    const deploymentDocs = readRepoFile('docs/developer/deployment.md');
    const requiredGateCommands = [
      'npm audit --audit-level=high',
      'npm run lint',
      'npm run typecheck',
      'npm run test:run',
      'npm run build',
    ];

    const missingCommands = requiredGateCommands.flatMap((command) => {
      const missingFromWorkflow = workflow.includes(command) ? [] : [`.github/workflows/deploy.yml: ${command}`];
      const missingFromDocs = deploymentDocs.includes(command) ? [] : [`docs/developer/deployment.md: ${command}`];

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

  test('global inventory metrics stay rollup-backed', () => {
    const inventoryBody = extractExportBody('convex/analytics.ts', 'getGlobalInventoryMetrics');
    const forbiddenPatterns = [
      /ctx\.db\s*\.query\("users"\)/,
      /ctx\.db\s*\.query\("companies"\)/,
      /ctx\.db\s*\.query\("plans"\)/,
      /\.take\(10000\)/,
      /\.collect\(\)/,
    ];
    const offenders = forbiddenPatterns
      .filter((pattern) => pattern.test(inventoryBody))
      .map((pattern) => pattern.source);

    expect(inventoryBody).toContain('getGlobalInventoryRollup');
    expect(
      offenders,
      `getGlobalInventoryMetrics must read the inventory rollup instead of exact raw inventory scans:\n${offenders.join('\n')}`
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

  test('platform broad reads stay classified by scale-hardening phase', () => {
    const allowed = new Map(
      platformScaleBroadReadAllowlist.map((entry) => [
        `${entry.filePath}:${entry.exportName}:${entry.table}`,
        entry,
      ])
    );
    const broadReads = findConvexBroadReads();
    const offenders = broadReads
      .filter(({ filePath, exportName, table }) => !allowed.has(`${filePath}:${exportName}:${table}`))
      .map(({ filePath, lineNumber, exportName, table, operation, statement }) =>
        `${filePath}:${lineNumber}: ${exportName}:${table}:${operation}: ${statement}`
      );
    const weakAllowlistEntries = platformScaleBroadReadAllowlist
      .filter(({ category, phase, reason }) => category.length < 4 || phase.length < 5 || reason.length < 40)
      .map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`);

    expect(
      offenders,
      `Unclassified Convex broad reads found. Remove them, bound them, or classify them in the platform scale plan:\n${offenders.join('\n')}`
    ).toEqual([]);
    expect(
      weakAllowlistEntries,
      `Platform scale broad-read allowlist entries need category, phase, and useful reasons:\n${weakAllowlistEntries.join('\n')}`
    ).toEqual([]);
  });

  test('legacy debug and hybrid modules stay quarantined from the API surface', () => {
    const deletedLegacyFiles = [
      'convex/analyticsHybrid.ts',
      'convex/analyticsHybrid.test.ts',
      'convex/debug.ts',
      'convex/debugModels.ts',
      'convex/migrations.ts',
      'convex/seedAgents.ts',
      'convex/testQuery.ts',
    ];
    const existingLegacyFiles = deletedLegacyFiles.filter((filePath) => fs.existsSync(path.join(repoRoot, filePath)));
    const generatedApi = readRepoFile('convex/_generated/api.d.ts');
    const generatedLegacyReferences = [
      'analyticsHybrid',
      'debugModels',
      'testQuery',
      'seedAgents',
      'migrations',
      'type * as debug from "../debug.js"',
    ].filter((legacyReference) => generatedApi.includes(legacyReference));

    expect(
      existingLegacyFiles,
      `Deleted legacy/debug files must not come back without a new documented plan:\n${existingLegacyFiles.join('\n')}`
    ).toEqual([]);
    expect(
      generatedLegacyReferences,
      `Deleted legacy/debug modules must not be exposed in generated Convex API types:\n${generatedLegacyReferences.join('\n')}`
    ).toEqual([]);
  });

  test('configuration catalogue reads stay explicitly bounded', () => {
    const staleCatalogueExceptions = platformScaleBroadReadAllowlist
      .filter(({ category, phase }) => String(category) === 'configuration_catalogue' || String(phase) === 'Phase 6')
      .map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`);
    const catalogueExports = [
      { filePath: 'convex/agents.ts', exportName: 'list' },
      { filePath: 'convex/agents.ts', exportName: 'createAgent' },
      { filePath: 'convex/agents.ts', exportName: 'deleteAgent' },
      { filePath: 'convex/agents.ts', exportName: 'getAgentToolsInternal' },
      { filePath: 'convex/agents.ts', exportName: 'getForCompanyInternal' },
      { filePath: 'convex/agents.ts', exportName: 'createInlineAgent' },
      { filePath: 'convex/aiModels.ts', exportName: 'getModels' },
      { filePath: 'convex/aiModels.ts', exportName: 'getOffsetPaginatedModels' },
      { filePath: 'convex/aiModels.ts', exportName: 'resolveModelForExecution' },
      { filePath: 'convex/aiModels.ts', exportName: 'setDefaultModel' },
      { filePath: 'convex/aiModels.ts', exportName: 'getAllModelsInternal' },
      { filePath: 'convex/aiRules.ts', exportName: 'getRules' },
      { filePath: 'convex/aiRules.ts', exportName: 'getOffsetPaginatedRules' },
      { filePath: 'convex/aiRules.ts', exportName: 'getActiveRulesInternal' },
      { filePath: 'convex/aiTools.ts', exportName: 'getTools' },
      { filePath: 'convex/aiTools.ts', exportName: 'deleteTool' },
      { filePath: 'convex/aiTools.ts', exportName: 'getAgentTools' },
      { filePath: 'convex/invites.ts', exportName: 'getActiveTemplate' },
      { filePath: 'convex/invites.ts', exportName: 'getInvitesByCompany' },
      { filePath: 'convex/plans.ts', exportName: 'getPlans' },
      { filePath: 'convex/plans.ts', exportName: 'getActivePlans' },
      { filePath: 'convex/widgets.ts', exportName: 'getWidgetsByCompany' },
      { filePath: 'convex/widgets.ts', exportName: 'getGlobalWidgets' },
    ];
    const broadCatalogueReads = catalogueExports.flatMap(({ filePath, exportName }) => {
      const contents = extractExportBody(filePath, exportName);

      return Array.from(contents.matchAll(/\.(take\(10000\)|collect\(\))/g)).map((match) => {
        const lineNumber = contents.slice(0, match.index ?? 0).split('\n').length;
        return `${filePath}:${exportName}:${lineNumber}:${match[1]}`;
      });
    });

    expect(
      staleCatalogueExceptions,
      `Configuration catalogue broad-read exceptions should be retired or moved to a later phase:\n${staleCatalogueExceptions.join('\n')}`
    ).toEqual([]);
    expect(
      broadCatalogueReads,
      `Configuration catalogue files must use named bounded limits instead of broad reads:\n${broadCatalogueReads.join('\n')}`
    ).toEqual([]);
  });

  test('admin companies page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/companies/page.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.companies.getPaginatedCompanies');
    expect(contents).not.toContain('api.companies.getCompanies');
  });

  test('admin agents page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/agents/page.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.agents.getPaginatedAgents');
    expect(contents).not.toContain('api.agents.list');
  });

  test('admin workflows page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/workflows/page.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.workflows.getPaginatedWorkflows');
    expect(contents).not.toContain('api.workflows.list');
    expect(contents).not.toContain('ChevronLeft');
    expect(contents).not.toContain('ChevronRight');
  });

  test('admin tools page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/ai/tools/page.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.aiTools.getPaginatedTools');
    expect(contents).not.toContain('api.aiTools.getTools');
  });

  test('admin plans page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/settings/plans/page.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.plans.getPaginatedPlans');
    expect(contents).not.toContain('api.plans.getPlans');
    expect(contents).not.toContain('paginateAdminItems');
  });

  test('widget config pages use primary widget queries instead of full widget catalogues', () => {
    const globalWidgetPage = readRepoFile('src/app/(dashboard)/admin/ai/widget/page.tsx');
    const companyWidgetPage = readRepoFile('src/app/(dashboard)/admin/companies/[id]/widget/page.tsx');

    expect(globalWidgetPage).toContain('api.widgets.getPrimaryGlobalWidget');
    expect(globalWidgetPage).not.toContain('api.widgets.getGlobalWidgets');
    expect(companyWidgetPage).toContain('api.widgets.getPrimaryWidgetByCompany');
    expect(companyWidgetPage).not.toContain('api.widgets.getWidgetsByCompany');
  });

  test('knowledge manager uses the paginated document inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx');

    expect(contents).toContain('usePaginatedQuery');
    expect(contents).toContain('api.knowledge.getPaginatedDocuments');
    expect(contents).not.toContain('api.knowledge.getDocuments');
  });

  test('admin chat log pages use cursor-paginated thread rosters', () => {
    const globalChatLogs = readRepoFile('src/app/(dashboard)/admin/ai/chat-logs/page.tsx');
    const companyChatLogs = readRepoFile('src/app/(dashboard)/admin/companies/[id]/chat-logs/page.tsx');

    expect(globalChatLogs).toContain('usePaginatedQuery');
    expect(globalChatLogs).toContain('api.chatAdmin.getPaginatedThreads');
    expect(globalChatLogs).not.toContain('api.chatAdmin.getOffsetPaginatedThreads');
    expect(companyChatLogs).toContain('usePaginatedQuery');
    expect(companyChatLogs).toContain('api.chatAdmin.getPaginatedCompanyThreads');
    expect(companyChatLogs).not.toContain('api.chatAdmin.getOffsetPaginatedCompanyThreads');
  });

  test('new Gemini-era language must be classified before it spreads', () => {
    const allowedGeminiReferenceFiles = new Set([
      'convex/aiModelService.ts',
      'convex/aiModelsActions.ts',
      'convex/aiModels.test.ts',
      'convex/seedWorkflows.ts',
      'docs/plans/completed/code-quality-95-plan.md',
      'docs/developer/future-agent-maintenance-plan.md',
      'docs/index.md',
      'docs/plans/completed/model-provider-agnostic-plan.md',
      'messages/en.json',
      'messages/it.json',
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
  }, 15_000);

  test('provider SDK imports remain classified while adapters mature', () => {
    const allowedProviderSdkImportFiles = new Set([
      'convex/agentRuntime.ts',
      'convex/ai.ts',
      'convex/googleProviderAdapter.ts',
      'convex/orchestrator.ts',
      'convex/salesReportActions.ts',
      'convex/swarmActions.ts',
      'convex/vertexProviderService.test.ts',
      'convex/vertexProviderService.ts',
      'src/quality-drift.test.ts',
    ]);

    const files = [
      ...walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts'])),
      ...walkFiles(path.join(repoRoot, 'src'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !relativePath(filePath).replaceAll(path.sep, '/').includes('/_generated/'));
    const providerSdkImport = /from\s+["']@google\/genai["']|new\s+GoogleGenAI\s*\(/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedProviderSdkImportFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          providerSdkImport.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified provider SDK imports found. Keep provider SDK usage in adapters or explicitly classified transitional runtime files:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('raw provider model calls stay behind retry wrappers', () => {
    const allowedRawProviderCallFiles = new Set([
      'convex/vertexProviderService.ts',
      'src/quality-drift.test.ts',
    ]);

    const files = [
      ...walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts'])),
      ...walkFiles(path.join(repoRoot, 'src'), new Set(['.ts', '.tsx'])),
    ].filter((filePath) => !relativePath(filePath).replaceAll(path.sep, '/').includes('/_generated/'));
    const rawProviderCall = /\b(?:ai|client)\.models\.(?:generateContent|embedContent)\s*\(/;
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedRawProviderCallFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          rawProviderCall.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Raw provider model calls must go through retry wrappers before they reach provider SDKs:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  test('provider model ID literals remain classified', () => {
    const allowedProviderModelLiteralFiles = new Set([
      'convex/aiModelService.ts',
      'convex/aiModelService.test.ts',
      'convex/aiModels.test.ts',
      'convex/aiModelsActions.test.ts',
      'convex/aiModelsActions.ts',
      'convex/anthropicProviderService.test.ts',
      'convex/chat.test.ts',
      'convex/globalSystems.test.ts',
      'convex/knowledge.test.ts',
      'convex/openaiProviderService.test.ts',
      'convex/seedWorkflows.ts',
      'docs/plans/completed/model-provider-agnostic-plan.md',
      'src/app/(dashboard)/admin/ai/costs/_components/AICostCharts.test.tsx',
      'src/quality-drift.test.ts',
    ]);

    const providerModelLiteral = /\b(?:gemini-[a-z0-9.-]+|text-embedding-\d(?:-[a-z]+)?|gpt-[a-z0-9.-]+|claude-[a-z0-9.-]+)\b/;
    const files = walkRepoFiles(repoRoot, repoTextExtensions);
    const offenders = files.flatMap((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      if (allowedProviderModelLiteralFiles.has(normalizedPath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          providerModelLiteral.test(line)
            ? [`${normalizedPath}:${index + 1}: ${line.trim()}`]
            : []
        );
    });

    expect(
      offenders,
      `Unclassified provider model ID literals found. Store runtime model choices in the model catalogue/defaults instead of hardcoding IDs:\n${offenders.join('\n')}`
    ).toEqual([]);
  }, 15_000);
});
