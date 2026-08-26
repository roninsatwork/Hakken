import fs from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Screen copy stays in the catalogue — including in pages that do not exist yet.
 *
 * The adoption floors in admin-i18n-adoption.test.ts count components that use
 * the catalogue, so they defend the migration but cannot see a brand-new page
 * written in hardcoded English: it never joins the count it would need to
 * lower. This guard closes that gap from the other side, the way the raw-button
 * rule does for hand-drawn buttons: every sentence-shaped literal in screen JSX
 * is counted per file, today's counts are frozen below, and counts may FALL,
 * NEVER RISE. A new file starts at zero, so its first hardcoded sentence fails
 * here — which is what binds pages written after the migration.
 *
 * What counts as a sentence: an eight-plus-character text node or copy-bearing
 * attribute (title, label, placeholder, alt, description, aria-label, and the
 * action hook's message options) containing a space and mostly letters.
 * Interpolations ({...}) are invisible to the scan, so a translated page
 * scores zero. The heuristic can miss copy assembled in variables — review
 * still owns that — but it cannot be fooled by the case that actually
 * happened: whole pages of inline English.
 *
 * When you translate a file, its count falls; move the entry down or delete it
 * at zero — the check tells you which. Adding or raising an entry is never the
 * fix. The frozen movement demos are excluded (owner decision), as is the
 * public marketing site, which is deliberately single-language.
 */

const COPY_ATTRS =
  /(?:title|label|placeholder|alt|description|aria-label|successMessage|fallbackMessage)="([^"]+)"/g;

/**
 * Re-measured 2026-08-26: 201 files, 675 sentences.
 *
 * The previous list read 72 sentences across 35 files. Nothing was added in
 * between — the scanner below was fixed. It matched line by line, so a JSX
 * sentence on its own line between its tags, which is what Prettier produces
 * and therefore what almost every file here contains, was invisible. Four
 * fully-English pages scored zero under the old count, and a probe page
 * written entirely in hardcoded English passed the check that exists to stop
 * exactly that.
 *
 * So this is the first honest baseline, not a regression. It is large because
 * the problem is large. Every entry is work; the list may only fall.
 */
const FROZEN: ReadonlyMap<string, number> = new Map([
  ['src/app/(dashboard)/_features/auth-diagnostics/AuthDiagnosticsPage.tsx', 3],
  ['src/app/(dashboard)/_features/user-directory/UserDirectoryDialogs.tsx', 1],
  ['src/app/(dashboard)/_features/user-directory/UserDirectoryScreen.tsx', 10],
  ['src/app/(dashboard)/admin/_components/CompanySkillCheckboxPicker.tsx', 2],
  ['src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen.tsx', 6],
  ['src/app/(dashboard)/admin/_features/evals/EditEvalScreen.tsx', 5],
  ['src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen.tsx', 2],
  ['src/app/(dashboard)/admin/_features/evals/EvalDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/_features/evals/EvalsScreen.tsx', 3],
  ['src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx', 13],
  ['src/app/(dashboard)/admin/_features/knowledge/KnowledgeModals.tsx', 10],
  ['src/app/(dashboard)/admin/_features/rules/EditRuleScreen.tsx', 2],
  ['src/app/(dashboard)/admin/_features/widget-config/WidgetConfigScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/widget-config/WidgetPreviewPanel.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/UnansweredScreen.tsx', 3],
  ['src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/WikiImportBox.tsx', 2],
  ['src/app/(dashboard)/admin/_features/wiki/WikiLocalGraph.tsx', 2],
  ['src/app/(dashboard)/admin/_features/wiki/WikiMapScreen.tsx', 4],
  ['src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen.tsx', 6],
  ['src/app/(dashboard)/admin/_features/wiki/WikiProse.tsx', 2],
  ['src/app/(dashboard)/admin/_features/work/CompanyCallsScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/work/CompanyMailboxScreen.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/evals/[fixtureId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/evals/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/interfaces/page.tsx', 6],
  ['src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/layout.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/logs/AgentLogsResults.tsx', 4],
  ['src/app/(dashboard)/admin/agents/[id]/logs/[logId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/logs/page.tsx', 7],
  ['src/app/(dashboard)/admin/agents/[id]/memory/page.tsx', 8],
  ['src/app/(dashboard)/admin/agents/[id]/observability/[runId]/AgentJobDetailContent.tsx', 13],
  ['src/app/(dashboard)/admin/agents/[id]/observability/[runId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/observability/page.tsx', 13],
  ['src/app/(dashboard)/admin/agents/[id]/page.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/AgentRuleEditContent.tsx', 3],
  ['src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/rules/new/page.tsx', 3],
  ['src/app/(dashboard)/admin/agents/[id]/rules/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/runs/_components/EvalHealthPanel.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/runs/_components/FeedbackModal.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/runs/_components/RunDetailModal.tsx', 7],
  ['src/app/(dashboard)/admin/agents/[id]/runs/_components/RunsTable.tsx', 9],
  ['src/app/(dashboard)/admin/agents/[id]/runs/page.tsx', 7],
  ['src/app/(dashboard)/admin/agents/[id]/settings/page.tsx', 4],
  ['src/app/(dashboard)/admin/agents/[id]/skills/page.tsx', 6],
  ['src/app/(dashboard)/admin/agents/[id]/system-prompt/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/new/page.tsx', 2],
  ['src/app/(dashboard)/admin/agents/skills/SkillCatalogDialogs.tsx', 5],
  ['src/app/(dashboard)/admin/agents/skills/page.tsx', 5],
  ['src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav.tsx', 3],
  ['src/app/(dashboard)/admin/ai/models/catalogue/page.tsx', 4],
  ['src/app/(dashboard)/admin/ai/models/defaults/ModelDefaultsEveryJobDialog.tsx', 1],
  ['src/app/(dashboard)/admin/ai/models/defaults/page.tsx', 5],
  ['src/app/(dashboard)/admin/ai/models/providers/ModelProviderDisableDialog.tsx', 1],
  ['src/app/(dashboard)/admin/ai/models/providers/page.tsx', 2],
  ['src/app/(dashboard)/admin/ai/rules/new/page.tsx', 1],
  ['src/app/(dashboard)/admin/ai/tool-servers/ToolServerDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/ai/tool-servers/page.tsx', 4],
  ['src/app/(dashboard)/admin/ai/tools/[id]/EditToolContent.tsx', 3],
  ['src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/ai/tools/new/page.tsx', 2],
  ['src/app/(dashboard)/admin/ai/tools/page.tsx', 3],
  ['src/app/(dashboard)/admin/ai/voice/page.tsx', 4],
  ['src/app/(dashboard)/admin/audit-logs/[id]/AuditLogDetailContent.tsx', 1],
  ['src/app/(dashboard)/admin/companies/CompanyDialogs.tsx', 3],
  ['src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new/NewChatEvalContent.tsx', 6],
  ['src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new/ChatMemoryCandidateContent.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/diary/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/edit/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/knowledge/[documentId]/KnowledgeDocumentContent.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/ai/knowledge/[documentId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/models/page.tsx', 5],
  ['src/app/(dashboard)/admin/companies/[id]/ai/pages/[pageId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/pages/map/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/pages/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/prompt/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/rules/[ruleId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/rules/new/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/ai/rules/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/skills/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/ai/unanswered/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/usage/page.tsx', 3],
  ['src/app/(dashboard)/admin/companies/[id]/calls/[callId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/directory/invites/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx', 17],
  ['src/app/(dashboard)/admin/companies/[id]/features/CompanyFeaturesContent.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/features/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/mailbox/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/overview/CompanyOverviewContent.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/page.tsx', 3],
  ['src/app/(dashboard)/admin/connections/page.tsx', 2],
  ['src/app/(dashboard)/admin/directory/page.tsx', 5],
  ['src/app/(dashboard)/admin/governance/approvals/page.tsx', 2],
  ['src/app/(dashboard)/admin/governance/audit-trail/[id]/AuditEntryContent.tsx', 1],
  ['src/app/(dashboard)/admin/governance/audit-trail/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/governance/audit-trail/page.tsx', 4],
  ['src/app/(dashboard)/admin/governance/policies/page.tsx', 2],
  ['src/app/(dashboard)/admin/governance/register/page.tsx', 8],
  ['src/app/(dashboard)/admin/health/HealthResults.tsx', 2],
  ['src/app/(dashboard)/admin/health/page.tsx', 1],
  ['src/app/(dashboard)/admin/page.tsx', 3],
  ['src/app/(dashboard)/admin/settings/(system)/identity/page.tsx', 1],
  ['src/app/(dashboard)/admin/settings/(system)/options/DeveloperDiagnosticsContent.tsx', 1],
  ['src/app/(dashboard)/admin/settings/(system)/options/page.tsx', 1],
  ['src/app/(dashboard)/admin/settings/_components/IdentitySettingsSection.tsx', 1],
  ['src/app/(dashboard)/admin/settings/_components/PurgeHistorySection.tsx', 2],
  ['src/app/(dashboard)/admin/settings/_components/RetentionRuleDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/settings/_components/RetentionRulesSection.tsx', 6],
  ['src/app/(dashboard)/admin/settings/_components/SelfImprovementSection.tsx', 1],
  ['src/app/(dashboard)/admin/settings/analytics/page.tsx', 2],
  ['src/app/(dashboard)/admin/settings/api-keys/ApiKeyRevokeDialog.tsx', 1],
  ['src/app/(dashboard)/admin/settings/api-keys/page.tsx', 6],
  ['src/app/(dashboard)/admin/settings/plans/PlanDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/settings/plans/page.tsx', 3],
  ['src/app/(dashboard)/admin/super-admins/SuperAdminDialogs.tsx', 4],
  ['src/app/(dashboard)/admin/super-admins/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/super-admins/invite/page.tsx', 1],
  ['src/app/(dashboard)/admin/super-admins/page.tsx', 9],
  ['src/app/(dashboard)/admin/users/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/users/invite/page.tsx', 2],
  ['src/app/(dashboard)/admin/users/page.tsx', 1],
  ['src/app/(dashboard)/admin/workflows/WorkflowDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/workflows/[id]/page.tsx', 4],
  ['src/app/(dashboard)/admin/workflows/executions/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/workflows/executions/page.tsx', 1],
  ['src/app/(dashboard)/admin/workflows/schedules/[id]/page.tsx', 5],
  ['src/app/(dashboard)/admin/workflows/schedules/_components/ScheduleBuilder.tsx', 1],
  ['src/app/(dashboard)/admin/workflows/schedules/new/page.tsx', 5],
  ['src/app/(dashboard)/admin/workflows/schedules/page.tsx', 4],
  ['src/app/(dashboard)/app/[workspace]/customers/[account]/page.tsx', 2],
  ['src/app/(dashboard)/app/[workspace]/customers/page.tsx', 9],
  ['src/app/(dashboard)/app/[workspace]/import-data/page.tsx', 5],
  ['src/app/(dashboard)/app/[workspace]/opportunity-report/page.tsx', 11],
  ['src/app/(dashboard)/app/[workspace]/spreadsheet-import/page.tsx', 9],
  ['src/app/(dashboard)/app/agentic-testing/page.tsx', 8],
  ['src/app/(dashboard)/app/arcade/ronins-run/RoninCanvas.tsx', 1],
  ['src/app/(dashboard)/app/assistant/[threadId]/page.tsx', 5],
  ['src/app/(dashboard)/app/assistant/_components/AssistantComposer.tsx', 7],
  ['src/app/(dashboard)/app/assistant/_components/AssistantModals.tsx', 4],
  ['src/app/(dashboard)/app/assistant/_components/AssistantModelSelector.tsx', 1],
  ['src/app/(dashboard)/app/assistant/_components/AssistantThinkingSelector.tsx', 1],
  ['src/app/(dashboard)/app/assistant/page.tsx', 7],
  ['src/app/(dashboard)/app/calls/CallsContent.tsx', 1],
  ['src/app/(dashboard)/app/governance/policies/page.tsx', 2],
  ['src/app/(dashboard)/app/governance/register/page.tsx', 1],
  ['src/app/(dashboard)/app/page.tsx', 2],
  ['src/app/(dashboard)/app/profile/AssistantNoteTab.tsx', 1],
  ['src/app/(dashboard)/app/profile/page.tsx', 8],
  ['src/app/(dashboard)/app/properties/information/_components/PropertyInfoVisuals.tsx', 5],
  ['src/app/(dashboard)/app/properties/information/page.tsx', 2],
  ['src/app/(dashboard)/app/properties/logs/PropertiesRunRows.tsx', 2],
  ['src/app/(dashboard)/app/properties/logs/page.tsx', 4],
  ['src/app/(dashboard)/app/properties/scraped-data/ScrapedDataDeleteDialog.tsx', 4],
  ['src/app/(dashboard)/app/properties/scraped-data/[id]/PropertyDescription.tsx', 3],
  ['src/app/(dashboard)/app/properties/scraped-data/[id]/page.tsx', 8],
  ['src/app/(dashboard)/app/properties/scraped-data/page.tsx', 3],
  ['src/app/(dashboard)/app/properties/search/page.tsx', 1],
  ['src/app/(dashboard)/app/reports/information/_components/ReportInfoVisuals.tsx', 10],
  ['src/app/(dashboard)/app/reports/information/page.tsx', 1],
  ['src/app/(dashboard)/app/reports/page.tsx', 13],
  ['src/app/(dashboard)/app/settings/page.tsx', 11],
  ['src/app/(dashboard)/app/settings/team/TeamDialogs.tsx', 2],
  ['src/app/(dashboard)/app/settings/team/page.tsx', 9],
  ['src/ui/components/charts/ChartTooltip.tsx', 1],
  ['src/ui/components/chat/ChatHistoryList.tsx', 10],
  ['src/ui/components/chat/ChatInput.tsx', 16],
  ['src/ui/components/chat/ChatMessage.tsx', 3],
  ['src/ui/components/chat/MessageFeedbackControls.tsx', 6],
  ['src/ui/components/chat/PhotoActionChip.tsx', 1],
  ['src/ui/components/chat/RealtimeVoiceOverlay.tsx', 14],
  ['src/ui/components/chat/SwarmStatusCard.tsx', 2],
  ['src/ui/components/feedback/SonaeModal.tsx', 1],
  ['src/ui/components/governance/AuditLogsTable.tsx', 1],
  ['src/ui/components/governance/GovernanceActivity.tsx', 2],
  ['src/ui/components/governance/GovernanceDashboard.tsx', 1],
  ['src/ui/components/governance/PersonalDataPanel.tsx', 1],
  ['src/ui/components/layout/NotificationBell.tsx', 4],
  ['src/ui/components/layout/SidebarNavTrees.tsx', 3],
  ['src/ui/components/layout/SidebarNavigation.tsx', 1],
  ['src/ui/components/screens/AccessLevel.tsx', 1],
  ['src/ui/components/screens/Button.tsx', 3],
  ['src/ui/components/screens/CompactList.tsx', 2],
  ['src/ui/components/screens/DataTable.tsx', 2],
  ['src/ui/components/screens/DetailTabs.tsx', 5],
  ['src/ui/components/screens/Field.tsx', 2],
  ['src/ui/components/screens/ModalForm.tsx', 1],
  ['src/ui/components/screens/SettingsCard.tsx', 1],
  ['src/ui/components/screens/Table.tsx', 2],
  ['src/ui/components/screens/TableControls.tsx', 2],
  ['src/ui/components/workflows/AgentEditorModal.tsx', 3],
  ['src/ui/components/workflows/AgentNode.tsx', 2],
  ['src/ui/components/workflows/ConfigDrawerPanels.tsx', 7],
]);

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];

function looksLikeCopy(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 8 || !text.includes(' ')) return false;
  if (!/[a-z]{2}/.test(text)) return false;
  const letters = text.replace(/[^A-Za-z ]/g, '');
  return letters.length >= text.length * 0.6;
}

/**
 * Scanned over the whole file, not line by line.
 *
 * Line-by-line was the same as not scanning at all for most of this codebase:
 * Prettier puts a JSX sentence on its own line between the tags, so `>` and
 * `<` are never on one line together and the match never fired. Measured on
 * 2026-08-26, four fully-English pages scored zero, and a probe page written
 * entirely in hardcoded English passed — the docblock above promised the
 * opposite. Newlines inside the text are collapsed before the shape test so
 * a wrapped sentence reads as one.
 */
function countHardcodedCopy(contents: string): number {
  let hits = 0;

  for (const match of contents.matchAll(/>\s*([^<>{}]+?)\s*</g)) {
    if (looksLikeCopy(match[1].replace(/\s+/g, ' '))) hits += 1;
  }

  for (const match of contents.matchAll(COPY_ATTRS)) {
    if (looksLikeCopy(match[1].replace(/\s+/g, ' '))) hits += 1;
  }

  return hits;
}

describe('screen copy stays in the catalogue', () => {
  const measured = new Map<string, number>();
  for (const root of SCAN_ROOTS) {
    for (const file of walkFiles(path.join(repoRoot, root), new Set(['.tsx']))) {
      const relative = relativePath(file).replaceAll(path.sep, '/');
      if (relative.includes('/demos/') || relative.endsWith('.test.tsx')) continue;
      const hits = countHardcodedCopy(fs.readFileSync(file, 'utf8'));
      if (hits > 0) measured.set(relative, hits);
    }
  }

  test('no file grows hardcoded copy, and new files carry none', () => {
    const regressions = [...measured.entries()]
      .filter(([file, hits]) => hits > (FROZEN.get(file) ?? 0))
      .map(([file, hits]) => `${file}: ${hits} sentence(s), frozen at ${FROZEN.get(file) ?? 0}`);
    expect(
      regressions,
      `Hardcoded screen copy above the frozen count. Put the copy in messages/en.json and it.json and read it with useTranslations — the list may shrink, never grow:\n${regressions.join('\n')}`
    ).toEqual([]);
  });

  test('entries whose files are clean or gone leave the list', () => {
    const stale = [...FROZEN.keys()].filter((file) => !measured.has(file));
    expect(
      stale,
      `These files no longer carry hardcoded copy (or no longer exist) — remove their entries so the guard binds them at zero:\n${stale.join('\n')}`
    ).toEqual([]);
  });
});
