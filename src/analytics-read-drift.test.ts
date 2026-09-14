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
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'analyticsDailySnapshots', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'snapshot health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'messages', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'message dimension health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentTransactions', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'transaction health helper is analytics maintenance protected by analytics plan' },
  { filePath: 'convex/arcade.ts', exportName: 'getScoresCount', table: 'arcadeScores', category: 'low_priority_product', phase: 'Phase 1', reason: 'arcade score count uses capped reads and needs count strategy if it becomes a real scale surface' },
  { filePath: 'convex/companies.ts', exportName: 'getCompanies', table: 'companies', category: 'admin_inventory', phase: 'Phase 1', reason: 'admin company inventory list is scheduled for paginated indexed contracts' },
  { filePath: 'convex/companies.ts', exportName: 'getCompanies', table: 'users', category: 'admin_inventory', phase: 'Phase 1', reason: 'company user counts need rollup or bounded lookup during admin inventory hardening' },
  { filePath: 'convex/governanceRollups.ts', exportName: 'rebuildGovernanceRollups', table: 'governanceDayRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'the rebuild reads its own buckets — rows per scope per day, bounded by construction, and the read is what lets it zero a scope that went quiet' },
  { filePath: 'convex/governanceRollups.ts', exportName: 'rebuildGovernanceRollups', table: 'governanceEstateRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'one estate row per scope; read whole so rows for vanished scopes can be deleted rather than lingering' },
  { filePath: 'convex/governanceRollups.ts', exportName: 'readBucketsForWindow', table: 'governanceDayRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'the screens read at most ninety days of per-scope buckets — the bounded read the rollup exists to make possible' },
  { filePath: 'convex/governanceDashboard.ts', exportName: 'getGovernanceDashboard', table: 'governanceEstateRollups', category: 'governance_rollup', phase: 'Phase 5', reason: 'one row per scope, replacing the estate-wide count the dashboard used to run on every visit' },
  { filePath: 'convex/dataMigrations.ts', exportName: 'moduleScope', table: 'governanceDayRollups', category: 'maintenance', phase: 'Phase 5', reason: 'the backfill rewrites one day per batch set-style, so it must read that day whole to converge instead of double-counting' },
  { filePath: 'convex/knowledge.ts', exportName: 'debugCount', table: 'knowledgeChunks', category: 'debug', phase: 'Phase 7', reason: 'knowledge debug chunk count is scheduled for debug quarantine or rollup comparison only' },
  { filePath: 'convex/knowledge.ts', exportName: 'debugCount', table: 'knowledgeDocuments', category: 'debug', phase: 'Phase 7', reason: 'knowledge debug count is scheduled for debug quarantine or rollup comparison only' },
// template:remove:start properties
  { filePath: 'convex/properties.ts', exportName: 'getPropertiesCount', table: 'properties', category: 'inventory_rollup', phase: 'Phase 5', reason: 'property count reads need indexed count strategy or rollup when data grows' },
// template:remove:end
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'workflowExecutionSteps', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
  { filePath: 'convex/purges.ts', exportName: 'executePurgeRecursive', table: 'swarmLogs', category: 'maintenance', phase: 'Phase 7', reason: 'recursive purge is internal destructive maintenance and should remain quarantined' },
// template:remove:start salesData
  { filePath: 'convex/salesData.ts', exportName: 'listSalesFilterOptions', table: 'salesDataRows', category: 'low_priority_product', phase: 'Phase 1', reason: 'the sales table filter dropdowns are built from the rows so they cannot drift from the data; bounded by one import and cached until the next one, and the fix at larger scale is to store the distinct values on the import record' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataCategoryLinks', category: 'low_priority_product', phase: 'Phase 1', reason: 'the categories tab dropdown is built from the rows so it cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataAreasOfInterest', category: 'low_priority_product', phase: 'Phase 1', reason: 'the areas-of-interest tab dropdown is built from the rows so it cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesData.ts', exportName: 'listTableFilterOptions', table: 'salesDataFrequencies', category: 'low_priority_product', phase: 'Phase 1', reason: 'the frequency tab dropdowns are built from the rows so they cannot drift from the data; bounded by one import, read only while that tab is open, and capping it would silently drop filter values and read as the full list' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/dataMigrations.ts', exportName: 'moduleScope', table: 'salesDataAccounts', category: 'maintenance', phase: 'Phase 7', reason: 'the customer directory backfill reads the accounts already built for one import to decide whether that import still needs building; bounded by one row per account, and the migration is operator-run rather than on a request path' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'moduleScope', table: 'salesDataCustomers', category: 'low_priority_product', phase: 'Phase 1', reason: 'the customer list searches typed-in details as well as imported ones, and a scan predicate cannot go back to the database mid-scan; bounded by the customers somebody has filled details in for, which is at most the account count' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'moduleScope', table: 'salesDataCustomerResearch', category: 'low_priority_product', phase: 'Phase 1', reason: 'the missing-details filter must not count a detail the agent already searched for and found unpublished, and a scan predicate cannot go back to the database mid-scan; read only when that filter is on, and bounded by customers times researchable fields — a few hundred rows for the file seen' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'listCustomerFilterOptions', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'the customer list dropdowns are built from the accounts so they cannot drift from the data; bounded by one import at one row per account — 39 for the file seen — and capping it would silently drop filter values' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataMarketDiscovery.ts', exportName: 'startMarketDiscoveryJob', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'market discovery starts from every imported customer type, so the type list must not be capped; bounded by one import at one row per account, and the larger-scale fix is to store distinct customer types on the import record' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'countCustomers', table: 'salesDataAccounts', category: 'low_priority_product', phase: 'Phase 1', reason: 'counting customers and how many have details is the point of the read; bounded by one import at one row per account, and the fix at larger scale is a stored count on the import record' },
// template:remove:end
// template:remove:start salesData
  { filePath: 'convex/salesDataCustomers.ts', exportName: 'countCustomers', table: 'salesDataProspects', category: 'low_priority_product', phase: 'Phase 1', reason: 'the prospect count sits above the list so the gap is visible without anybody changing the filter to discover it exists; bounded by the sites found across the groups in one import, and the fix at larger scale is the same stored count as the customer total' },
// template:remove:end
  { filePath: 'convex/swarmRuntime.ts', exportName: 'getSwarmLogs', table: 'swarmLogs', category: 'workflow_runtime', phase: 'Phase 4', reason: 'swarm runtime logs need bounded runtime log pagination' },
  { filePath: 'convex/swarmRuntime.ts', exportName: 'clearSwarmLogs', table: 'swarmLogs', category: 'maintenance', phase: 'Phase 7', reason: 'swarm log clear is maintenance and should remain bounded or quarantined' },
  { filePath: 'convex/swarmRuntime.ts', exportName: 'getDemoAgents', table: 'agents', category: 'maintenance', phase: 'Phase 7', reason: 'demo agent lookup is maintenance/demo-only pending legacy quarantine' },
  { filePath: 'convex/users.ts', exportName: 'getMyLoginsCount', table: 'logins', category: 'admin_inventory', phase: 'Phase 1', reason: 'login count needs indexed count strategy rather than capped reads' },
  { filePath: 'convex/users.ts', exportName: 'getUnassignedSuperAdmins', table: 'users', category: 'admin_inventory', phase: 'Phase 1', reason: 'unassigned super-admin selector needs bounded role/company lookup before large admin growth' },
  { filePath: 'convex/workflows.ts', exportName: 'list', table: 'workflows', category: 'admin_inventory', phase: 'Phase 1', reason: 'workflow admin inventory list is scheduled for paginated indexed contracts' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentRuns', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Health signals read at 10,000 rows. Truncation understates a problem count, which is the safe direction for an alert that already exists — but it can also hide one, so it is listed rather than excused' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentLogs', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Recent agent logs at 10,000 rows, read for the error-rate signal' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentRunApprovals', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Pending approvals at 10,000 rows, read for the waiting-on-a-person signal' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'workflowExecutionSteps', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Halted workflow steps at 10,000 rows, filtered to scope in memory afterwards — so the cap bites before the filter, and a busy platform could hide the halted step of one company behind those of another' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'agentToolCalls', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Failed tool calls in the window at 10,000 rows' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'workflowExecutions', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Recent and latest executions at 10,000 rows, read for the schedule-health signals' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'schedules', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Overdue and active schedules at 10,000 rows' },
  { filePath: 'convex/systemHealth.ts', exportName: 'moduleScope', table: 'companies', category: 'analytics_maintenance', phase: 'Analytics Plan', reason: 'Invisible to this register until 2026-08-26, when the matcher started resolving constants instead of matching the digits 10000. Every company at 10,000 rows when the health check runs platform-wide' },
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

/**
 * A read counts as broad at or above this many rows, whether the number is
 * written out or hidden behind a constant.
 *
 * The register used to match the literal `.take(10000)`, which meant a site
 * could leave it by being renamed rather than fixed. Constants are resolved
 * now, so it tracks the size of the read rather than how it is spelled, and
 * twenty-three reads at ten and twenty thousand rows that had never once been
 * visible — `LOGIN_SCAN_LIMIT` and `MESSAGE_LIMIT` among them — came into it.
 *
 * Be precise about what that did and did not catch. Seven model-catalogue
 * reads in `convex/analytics.ts` were "fixed" the same morning by swapping
 * `10000` for `MODEL_CATALOG_LIMIT`, which is **2,000** — so resolving the
 * constant puts them *below* this threshold, not back in the register. They
 * are counted anonymously in the mid-sized band below, still truncating, with
 * no `+ 1` probe and no partial marker. Lowering a cap is not the same as
 * paging a read, and the register saying nothing about them is the honest
 * position rather than the reassuring one.
 */
const BROAD_READ_THRESHOLD = 10000;

/** The lower band: bounded, not yet triaged, and held to a shrinking count. */
const UNTRIAGED_READ_THRESHOLD = 1000;

/**
 * Frozen at the measured count on 2026-08-26. Shrink-only, like every other
 * baseline in this repo — it may fall as reads are paged and may never rise.
 *
 * Lowered from 126 to 118 the same day, when the money view's four
 * read-then-filter counts and the platform overview's caps moved to the
 * read-one-past pattern. Eight units of slack in a ratchet is eight reads that
 * could appear without anything noticing.
 */
const MID_SIZED_READ_CEILING = 118;

const numericConstants = (() => {
  const constants = new Map<string, number>();
  const declarationPattern = /const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*number)?\s*=\s*([0-9_]+)\s*;/g;

  for (const filePath of convexSourceFiles()) {
    const contents = fs.readFileSync(filePath, 'utf8');

    for (const match of contents.matchAll(declarationPattern)) {
      constants.set(match[1], Number(match[2].replaceAll('_', '')));
    }
  }

  return constants;
})();

/** The row cap of a `.take(...)` argument, or null when it cannot be read statically. */
const resolveTakeSize = (argument: string) => {
  if (/^[0-9_]+$/.test(argument)) {
    return Number(argument.replaceAll('_', ''));
  }

  return numericConstants.get(argument) ?? null;
};

function convexSourceFiles() {
  return walkFiles(path.join(repoRoot, 'convex'), new Set(['.ts']))
    .filter((filePath) => {
      const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

      return !normalizedPath.includes('/_generated/') && !normalizedPath.endsWith('.test.ts');
    });
}

/**
 * Reads bounded between the untriaged threshold and the broad-read threshold.
 *
 * The register proper starts at ten thousand rows. Without this, a read could
 * leave it by dropping its cap to 9,999 — the same move that hid seven reads
 * behind a constant name on 2026-08-26, one threshold lower. There is no
 * register entry to write for each of these and no claim being made that they
 * are safe: only a count that may fall and may not rise, so the population is
 * visible and shrinking rather than invisible and growing.
 */
const findMidSizedReads = () => {
  const pattern = /\.take\(\s*([A-Za-z0-9_]+)\s*(\+\s*1\s*)?\)/g;

  return convexSourceFiles().flatMap((filePath) => {
    const contents = fs.readFileSync(filePath, 'utf8');
    const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

    return Array.from(contents.matchAll(pattern)).flatMap((match) => {
      if (match[2]) {
        return [];
      }

      const size = resolveTakeSize(match[1]);

      if (size === null || size < UNTRIAGED_READ_THRESHOLD || size >= BROAD_READ_THRESHOLD) {
        return [];
      }

      return [`${normalizedPath}:${contents.slice(0, match.index ?? 0).split('\n').length}:${match[1]}`];
    });
  });
};

const findConvexBroadReads = () => {
  const files = convexSourceFiles();
  // `.take(LIMIT + 1)` is the refuse-or-mark-partial pattern, not a silent cap:
  // the extra row exists to detect the overflow the code then acts on.
  const broadOperationPattern = /\.(take\(\s*([A-Za-z0-9_]+)\s*(\+\s*1\s*)?\)|collect\(\))/g;

  return files.flatMap((filePath) => {
    const contents = fs.readFileSync(filePath, 'utf8');
    const normalizedPath = relativePath(filePath).replaceAll(path.sep, '/');

    return Array.from(contents.matchAll(broadOperationPattern)).flatMap((match) => {
      if (match[2] !== undefined) {
        if (match[3]) {
          return [];
        }

        const size = resolveTakeSize(match[2]);

        if (size === null || size < BROAD_READ_THRESHOLD) {
          return [];
        }
      }

      const operationOffset = match.index ?? 0;
      const statementStart = Math.max(
        contents.lastIndexOf(';', operationOffset) + 1,
        contents.lastIndexOf('{', operationOffset) + 1
      );
      const statementEndIndex = contents.indexOf(';', operationOffset);
      const statementEnd = statementEndIndex === -1 ? contents.length : statementEndIndex + 1;
      const statement = contents.slice(statementStart, statementEnd);
      // The query this read belongs to is the last one opened before it, not
      // the first one in the statement: a `Promise.all([...])` holds several,
      // and taking the first filed every read in the block under the first
      // table's name — `platformOverview`'s twenty-thousand-row message scan
      // was recorded against `companies`.
      const queryMatches = Array.from(
        contents.slice(statementStart, operationOffset).matchAll(/ctx\.db\s*\.query\(\s*(?:"([^"]+)"|(table))\s*\)/g),
      );
      const queryMatch = queryMatches.at(-1);

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
    // Read by declaration name, not by the builder that happens to follow it.
    // This split on the literal `= query({` until 2026-08-26; the function had
    // moved to `superAdminQuery({`, so the split missed, the body was the empty
    // string, and every pattern below passed against nothing for as long as
    // that was true. Hence the emptiness assertion — this check is worthless
    // unless it is reading the function.
    const globalAnalyticsBody = extractExportBody('convex/analytics.ts', 'getGlobalAnalytics');

    expect(
      globalAnalyticsBody,
      'getGlobalAnalytics was not found in convex/analytics.ts, so the scan check below tested nothing',
    ).not.toBe('');

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


  test('the daily snapshot reads the day in pages and still refuses what it cannot total', () => {
    const body = extractExportBody('convex/analyticsSnapshots.ts', 'generateDailySnapshots');

    expect(
      body,
      'The generator must page the day rather than take a fixed slice of it. A single take cannot tell a full read from a truncated one, which is how a busy day came to be recorded short and stayed that way.'
    ).toMatch(/readDayInteractionsPage[\s\S]*?continueCursor/);
    expect(
      body,
      'Paging must not remove the refusal. Above the hard ceiling the day is left without a snapshot — which the analytics health check reports — rather than totalled from part of itself.'
    ).toMatch(/>\s*SNAPSHOT_DAY_HARD_CEILING[\s\S]*?throw appError/);
    expect(
      body,
      'The generator must not go back to a fixed take.'
    ).not.toMatch(/\.take\(/);
  });

  test('mid-sized bounded reads stay a shrinking population', () => {
    const midSized = findMidSizedReads();

    expect(midSized.length, 'no mid-sized reads found at all, so this check is reading nothing').toBeGreaterThan(0);
    expect(
      midSized.length,
      `Bounded reads between ${UNTRIAGED_READ_THRESHOLD} and ${BROAD_READ_THRESHOLD} rows rose above the frozen count. Either page the new read or take it below ${UNTRIAGED_READ_THRESHOLD}; lowering a ten-thousand-row read into this band to leave the register is the move this count exists to catch:\n${midSized.sort().join('\n')}`,
    ).toBeLessThanOrEqual(MID_SIZED_READ_CEILING);
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
    const present = new Set(
      broadReads.map(({ filePath, exportName, table }) => `${filePath}:${exportName}:${table}`)
    );
    const staleAllowlistEntries = [...allowed.keys()].filter((key) => !present.has(key));

    expect(
      offenders,
      `Unclassified Convex broad reads found. Remove them, bound them, or classify them in the platform scale plan:\n${offenders.join('\n')}`
    ).toEqual([]);
    expect(
      staleAllowlistEntries,
      `These reads are no longer broad, so their exemptions are dead. Delete the entries — the register only shrinks, and an entry nothing matches hides the next regression at that site:\n${staleAllowlistEntries.join('\n')}`
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
      { filePath: 'convex/aiModels.ts', exportName: 'getPaginatedModels' },
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
    const missingCatalogueExports = catalogueExports
      .filter(({ filePath, exportName }) => !readRepoFile(filePath).includes(`export const ${exportName} =`))
      .map(({ filePath, exportName }) => `${filePath}:${exportName}`);

    const broadCatalogueReads = catalogueExports.flatMap(({ filePath, exportName }) => {
      const contents = extractExportBody(filePath, exportName);

      return Array.from(contents.matchAll(/\.(take\(10000\)|collect\(\))/g)).map((match) => {
        const lineNumber = contents.slice(0, match.index ?? 0).split('\n').length;
        return `${filePath}:${exportName}:${lineNumber}:${match[1]}`;
      });
    });

    expect(
      missingCatalogueExports,
      `These catalogue exports do not exist, so nothing about them is being checked. A renamed export must be renamed here too — an entry that matches nothing reads as coverage and is not:\n${missingCatalogueExports.join('\n')}`
    ).toEqual([]);
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
