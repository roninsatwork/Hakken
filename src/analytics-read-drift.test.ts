import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  repoRoot,
  walkFiles,
  relativePath,
  readRepoFile,
  extractExportBody,
  queryBlocksForTable,
} from './test/driftUtils';

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
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'analyticsDailySnapshots', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'snapshot health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'messages', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'message dimension health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentTransactions', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'transaction health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/analyticsSnapshots.ts', exportName: 'backfillMessageAnalyticsDimensions', table: 'messages', category: 'maintenance', phase: 'Analytics Plan', reason: 'paginated analytics backfill is retained for historical repair and validation' },
  { filePath: 'convex/analyticsSnapshots.ts', exportName: 'generateDailySnapshots', table: 'messages', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'daily snapshot generation reads bounded day windows for analytics snapshots' },
  { filePath: 'convex/analyticsSnapshots.ts', exportName: 'generateDailySnapshots', table: 'agentTransactions', category: 'analytics_snapshot', phase: 'Analytics Plan', reason: 'daily transaction snapshot generation reads bounded day windows' },
  { filePath: 'convex/analyticsSnapshots.ts', exportName: 'generateDailySnapshots', table: 'aiModels', category: 'analytics_catalogue', phase: 'Analytics Plan', reason: 'daily snapshot generation reads model catalogue for configured cost resolution' },
  { filePath: 'convex/analyticsSnapshots.ts', exportName: 'wipeSnapshots', table: 'analyticsDailySnapshots', category: 'maintenance', phase: 'Analytics Plan', reason: 'internal destructive snapshot maintenance remains explicitly allowlisted' },
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
  { filePath: 'convex/governanceRollups.ts', exportName: 'rebuildGovernanceRollups', table: 'governanceDayRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'the rebuild reads its own buckets — rows per scope per day, bounded by construction, and the read is what lets it zero a scope that went quiet' },
  { filePath: 'convex/governanceRollups.ts', exportName: 'rebuildGovernanceRollups', table: 'governanceEstateRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'one estate row per scope; read whole so rows for vanished scopes can be deleted rather than lingering' },
  { filePath: 'convex/governanceRollups.ts', exportName: 'readBucketsForWindow', table: 'governanceDayRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'the screens read at most ninety days of per-scope buckets — the bounded read the rollup exists to make possible' },
  { filePath: 'convex/governanceDashboard.ts', exportName: 'getGovernanceDashboard', table: 'governanceEstateRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'one row per scope, replacing the estate-wide count the dashboard used to run on every visit' },
  { filePath: 'convex/dataMigrations.ts', exportName: 'moduleScope', table: 'governanceDayRollups', category: 'maintenance', phase: 'Phase 5', reason: 'the backfill rewrites one day per batch set-style, so it must read that day whole to converge instead of double-counting' },
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
  { filePath: 'convex/salesData.ts', exportName: 'listSalesFilterOptions', table: 'salesDataRows', category: 'low_priority_product', phase: 'Phase 1', reason: 'the sales table filter dropdowns are built from the rows so they cannot drift from the data; bounded by one import and cached until the next one, and the fix at larger scale is to store the distinct values on the import record' },
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataCategoryLinks', category: 'low_priority_product', phase: 'Phase 1', reason: 'the categories tab dropdown is built from the rows so it cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataAreasOfInterest', category: 'low_priority_product', phase: 'Phase 1', reason: 'the areas-of-interest tab dropdown is built from the rows so it cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataFrequencies', category: 'low_priority_product', phase: 'Phase 1', reason: 'the frequency tab dropdowns are built from the rows so they cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
  { filePath: 'convex/dataMigrations.ts', exportName: 'moduleScope', table: 'salesDataAccounts', category: 'maintenance', phase: 'Phase 7', reason: 'the customer directory backfill reads the accounts already built for one import to decide whether that import still needs building; bounded by one row per account, and the migration is operator-run rather than on a request path' },
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'moduleScope', table: 'salesDataCustomers', category: 'low_priority_product', phase: 'Phase 1', reason: 'the customer list searches typed-in details as well as imported ones, and a scan predicate cannot go back to the database mid-scan; bounded by the customers somebody has filled details in for, which is at most the account count' },
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'moduleScope', table: 'salesDataCustomerResearch', category: 'low_priority_product', phase: 'Phase 1', reason: 'the missing-details filter must not count a detail the agent already searched for and found unpublished, and a scan predicate cannot go back to the database mid-scan; read only when that filter is on, and bounded by customers times researchable fields — a few hundred rows for the file seen' },
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'listCustomerFilterOptions', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'the customer list dropdowns are built from the accounts so they cannot drift from the data; bounded by one import at one row per account — 39 for the file seen — and capping it would silently drop filter values' },
  { filePath: 'convex/salesDataMarketDiscovery.ts', exportName: 'startMarketDiscoveryJob', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'market discovery starts from every imported customer type, so the type list must not be capped; bounded by one import at one row per account, and the larger-scale fix is to store distinct customer types on the import record' },
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'countCustomers', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'counting customers and how many have details is the point of the read; bounded by one import at one row per account, and the fix at larger scale is a stored count on the import record' },
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'countCustomers', table: 'salesDataProspects', category: 'low_priority_product', phase: 'Phase 1', reason: 'the prospect count sits above the list so the gap is visible without anybody changing the filter to discover it exists; bounded by the sites found across the groups in one import, and the fix at larger scale is the same stored count as the customer total' },
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

describe('Analytics And Platform Read Drift', () => {

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
      { filePath: 'convex/analyticsSnapshots.ts', exportName: 'generateDailySnapshots' },
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
      { filePath: 'convex/analyticsSnapshots.ts', exportName: 'generateDailySnapshots' },
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
        filePath: 'convex/analyticsSnapshots.ts',
        exportName: 'wipeSnapshots',
        table: 'analyticsDailySnapshots',
        reason: 'internal destructive maintenance query used only to reset generated analytics snapshots',
      },
    ];
    const allowed = new Set(exceptions.map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`));
    const files = ['convex/analytics.ts', 'convex/analyticsSnapshots.ts', 'convex/systemHealth.ts'];
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
});
