import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { TABLE_PAGE_SIZE } from './ui/components/screens/pagination';
import {
  repoRoot,
  PAGES_ON_THE_SERVER,
  walkFiles,
  relativePath,
  readRepoFile,
} from './test/driftUtils';

describe('Pagination And Shared Table Drift', () => {
  test('admin pagination standard stays at 15 rows', () => {
    expect(TABLE_PAGE_SIZE).toBe(15);
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


  test('admin list pages keep using shared table primitives after cleanup', () => {
    const pages = [
      'src/app/(dashboard)/admin/agents/page.tsx',
      // The last card grid in the admin area, and the one the skills page's own
      // migration comment wrongly claimed was already using the shared table.
      // Nothing caught that, because this list did not name it.
      'src/app/(dashboard)/admin/governance/approvals/page.tsx',
      'src/app/(dashboard)/admin/companies/page.tsx',
      'src/app/(dashboard)/admin/settings/plans/page.tsx',
    ];

    // The executions list has no search bar: it is a chronological log rather than
    // a catalogue, and the thing worth finding on it — a run waiting on a person —
    // is flagged on the row and counted in the nav. Checked separately so it still
    // has to use the shared table and footer.
    // Matched as JSX tags rather than bare substrings. `includes('TableShell')`
    // is satisfied by `AdminTableShellX`, so a renamed or hand-rolled lookalike
    // would slip straight past — which it did, when this guard was checked by
    // deliberately breaking it.
    const listPagesWithoutSearch = ['src/app/(dashboard)/admin/workflows/executions/page.tsx']
      .filter((filePath) => {
        const contents = readRepoFile(filePath);
        // A screen on `DataTable` satisfies all of this at once: it owns the
        // shell and both footers, so naming the parts is no longer how a screen
        // proves it is on the kit. Added 2026-08-17, when the first converted
        // screens failed this guard for having done exactly the right thing —
        // it was checking a spelling rather than the behaviour it is named for.
        if (/<DataTable[\s<>]/.test(contents)) return false;
        return !/<TableShell[\s>]/.test(contents)
          // Either house footer satisfies this — the rule is that the screen
          // wears one of them rather than drawing its own. It moved from the
          // load-more footer to the numbered one on 2026-08-17, when the load-more
          // footer was settled as drift rather than a variant.
          || !/<(LoadMoreFooter|PaginationFooter)[\s>]/.test(contents)
          || contents.includes('ChevronLeft')
          || contents.includes('ChevronRight');
      });
    expect(
      listPagesWithoutSearch,
      `Workflow execution pages drifted away from shared table primitives:\n${listPagesWithoutSearch.join('\n')}`
    ).toEqual([]);

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      // Same reason as above: `DataTable` is the shell, the search box and both
      // footers in one part.
      if (/<DataTable[\s<>]/.test(contents)) return false;

      return !contents.includes('SearchBar') ||
        !contents.includes('TableShell') ||
        (!contents.includes('PaginationFooter') && !contents.includes('LoadMoreFooter')) ||
        contents.includes('ChevronLeft') ||
        contents.includes('ChevronRight');
    });

    expect(offenders, `Admin pages drifted away from shared table primitives:\n${offenders.join('\n')}`).toEqual([]);
  });


  test('admin rules list pages keep using the shared rules table', () => {
    const pages = [
      'src/app/(dashboard)/admin/ai/rules/page.tsx',
      'src/app/(dashboard)/admin/agents/[id]/rules/page.tsx',
      'src/app/(dashboard)/admin/companies/[id]/ai/rules/page.tsx',
    ];

    const offenders = pages.filter((filePath) => {
      const contents = readRepoFile(filePath);

      return !contents.includes('AdminRulesTable') || /getPriorityColor|deleteRuleMutation\(\{\s*id:\s*rule\._id/.test(contents);
    });

    expect(offenders, `Rules pages drifted away from shared table/delete-confirmation patterns:\n${offenders.join('\n')}`).toEqual([]);
  });


  test('admin companies page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/companies/page.tsx');

    // Either the hook itself or the shared wrapper around it: the wrapper
    // exists so the house footer (Previous / Page X of Y / Next) can sit over
    // a query that still pages on the server, and it calls usePaginatedQuery.
    expect(
      contents.includes('usePaginatedQuery') || contents.includes('useServerPagedTable')
    ).toBe(true);
    expect(contents).toContain('api.companies.getPaginatedCompanies');
    expect(contents).not.toContain('api.companies.getCompanies');
  });


  test('admin agents page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/agents/page.tsx');

    expect(contents).toMatch(PAGES_ON_THE_SERVER);
    expect(contents).toContain('api.agents.getPaginatedAgents');
    expect(contents).not.toContain('api.agents.list');
  });


  test('admin workflows page uses the paginated inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/workflows/page.tsx');

    expect(contents).toMatch(PAGES_ON_THE_SERVER);
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

    expect(contents).toMatch(PAGES_ON_THE_SERVER);
    expect(contents).toContain('api.plans.getPaginatedPlans');
    expect(contents).not.toContain('api.plans.getPlans');
    expect(contents).not.toContain('paginateItems');
  });


  test('widget config pages use primary widget queries instead of full widget catalogues', () => {
    // Both routes render the shared WidgetConfigScreen (admin-clone-readiness
    // plan, phase 2, 2026-08-21), so the query contract lives in one file.
    const widgetScreen = readRepoFile('src/app/(dashboard)/admin/_features/widget-config/WidgetConfigScreen.tsx');

    expect(widgetScreen).toContain('api.widgets.getPrimaryGlobalWidget');
    expect(widgetScreen).not.toContain('api.widgets.getGlobalWidgets');
    expect(widgetScreen).toContain('api.widgets.getPrimaryWidgetByCompany');
    expect(widgetScreen).not.toContain('api.widgets.getWidgetsByCompany');
  });


  test('knowledge manager uses the paginated document inventory query', () => {
    const contents = readRepoFile('src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx');

    expect(contents).toMatch(PAGES_ON_THE_SERVER);
    expect(contents).toContain('api.knowledge.getPaginatedDocuments');
    expect(contents).not.toContain('api.knowledge.getDocuments');
  });


  test('admin chat log pages use cursor-paginated thread rosters', () => {
    // Both routes render the shared ChatLogsScreen (maintenance plan, phase
    // 5), so the roster's pagination contract lives in one file now.
    const chatLogsScreen = readRepoFile('src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen.tsx');

    expect(chatLogsScreen).toMatch(PAGES_ON_THE_SERVER);
    expect(chatLogsScreen).toContain('api.chatAdmin.getPaginatedThreads');
    expect(chatLogsScreen).not.toContain('api.chatAdmin.getOffsetPaginatedThreads');
    expect(chatLogsScreen).toContain('api.chatAdmin.getPaginatedCompanyThreads');
    expect(chatLogsScreen).not.toContain('api.chatAdmin.getOffsetPaginatedCompanyThreads');
  });
});
