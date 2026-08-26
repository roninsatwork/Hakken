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
 * Re-measured 2026-08-26: 80 files, 183 sentences.
 *
 * The previous list read 72 sentences across 35 files. Nothing was added in
 * between — the scanner below was fixed. It matched line by line, so a JSX
 * sentence on its own line between its tags, which is what Prettier produces
 * and therefore what almost every file here contains, was invisible. Four
 * fully-English pages scored zero under the old count, and a probe page
 * written entirely in hardcoded English passed the check that exists to stop
 * exactly that.
 *
 * So this is the first honest baseline, not a regression. Every entry is work;
 * the list may only fall.
 *
 * The first attempt at this baseline read 675 across 201 files, because
 * scanning whole files let a generic type parameter open a match that ran on
 * through the code beneath it. `looksLikeCopy` rejects code punctuation now.
 * 183 is the number that survives both corrections.
 */
const FROZEN: ReadonlyMap<string, number> = new Map([
  ['src/app/(dashboard)/_features/user-directory/UserDirectoryScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/evals/EvalDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/_features/evals/EvalsScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx', 1],
  ['src/app/(dashboard)/admin/_features/widget-config/WidgetConfigScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/widget-config/WidgetPreviewPanel.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/UnansweredScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/wiki/WikiPageDetailScreen.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/interfaces/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/layout.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/logs/AgentLogsResults.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/logs/[logId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/logs/page.tsx', 3],
  ['src/app/(dashboard)/admin/agents/[id]/memory/page.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/observability/[runId]/AgentJobDetailContent.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/observability/page.tsx', 3],
  ['src/app/(dashboard)/admin/agents/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/settings/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/new/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/skills/SkillCatalogDialogs.tsx', 3],
  ['src/app/(dashboard)/admin/ai/models/catalogue/page.tsx', 2],
  ['src/app/(dashboard)/admin/ai/models/defaults/page.tsx', 1],
  ['src/app/(dashboard)/admin/ai/tool-servers/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/CompanyDialogs.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/models/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/directory/invites/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx', 10],
  ['src/app/(dashboard)/admin/companies/[id]/features/CompanyFeaturesContent.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/features/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/governance/audit-trail/page.tsx', 3],
  ['src/app/(dashboard)/admin/governance/register/page.tsx', 2],
  ['src/app/(dashboard)/admin/settings/_components/RetentionRuleDialogs.tsx', 1],
  ['src/app/(dashboard)/admin/settings/analytics/page.tsx', 1],
  ['src/app/(dashboard)/admin/settings/api-keys/ApiKeyRevokeDialog.tsx', 1],
  ['src/app/(dashboard)/admin/settings/api-keys/page.tsx', 2],
  ['src/app/(dashboard)/admin/settings/plans/PlanDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/settings/plans/page.tsx', 1],
  ['src/app/(dashboard)/admin/super-admins/invite/page.tsx', 1],
  ['src/app/(dashboard)/admin/users/invite/page.tsx', 1],
  ['src/app/(dashboard)/admin/workflows/WorkflowDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/workflows/schedules/page.tsx', 1],
  ['src/app/(dashboard)/app/[workspace]/customers/[account]/page.tsx', 1],
  ['src/app/(dashboard)/app/[workspace]/customers/page.tsx', 1],
  ['src/app/(dashboard)/app/agentic-testing/page.tsx', 2],
  ['src/app/(dashboard)/app/assistant/_components/AssistantComposer.tsx', 1],
  ['src/app/(dashboard)/app/assistant/_components/AssistantModals.tsx', 4],
  ['src/app/(dashboard)/app/page.tsx', 2],
  ['src/app/(dashboard)/app/profile/page.tsx', 6],
  ['src/app/(dashboard)/app/properties/information/_components/PropertyInfoVisuals.tsx', 3],
  ['src/app/(dashboard)/app/properties/information/page.tsx', 1],
  ['src/app/(dashboard)/app/properties/logs/PropertiesRunRows.tsx', 2],
  ['src/app/(dashboard)/app/properties/logs/page.tsx', 3],
  ['src/app/(dashboard)/app/properties/scraped-data/ScrapedDataDeleteDialog.tsx', 4],
  ['src/app/(dashboard)/app/properties/scraped-data/[id]/PropertyDescription.tsx', 3],
  ['src/app/(dashboard)/app/properties/scraped-data/[id]/page.tsx', 8],
  ['src/app/(dashboard)/app/properties/scraped-data/page.tsx', 3],
  ['src/app/(dashboard)/app/properties/search/page.tsx', 1],
  ['src/app/(dashboard)/app/reports/information/_components/ReportInfoVisuals.tsx', 6],
  ['src/app/(dashboard)/app/reports/information/page.tsx', 1],
  ['src/app/(dashboard)/app/reports/page.tsx', 12],
  ['src/app/(dashboard)/app/settings/page.tsx', 6],
  ['src/app/(dashboard)/app/settings/team/page.tsx', 3],
  ['src/ui/components/chat/ChatHistoryList.tsx', 6],
  ['src/ui/components/chat/ChatInput.tsx', 8],
  ['src/ui/components/chat/ChatMessage.tsx', 1],
  ['src/ui/components/chat/MessageFeedbackControls.tsx', 4],
  ['src/ui/components/chat/PhotoActionChip.tsx', 1],
  ['src/ui/components/chat/SwarmStatusCard.tsx', 2],
  ['src/ui/components/governance/GovernanceDashboard.tsx', 1],
  ['src/ui/components/screens/AccessLevel.tsx', 1],
  ['src/ui/components/screens/CompactList.tsx', 2],
  ['src/ui/components/screens/DataTable.tsx', 1],
  ['src/ui/components/screens/Field.tsx', 2],
  ['src/ui/components/workflows/AgentNode.tsx', 1],
  ['src/ui/components/workflows/ConfigDrawerPanels.tsx', 7],
]);

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];

function looksLikeCopy(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 8 || !text.includes(' ')) return false;
  if (!/[a-z]{2}/.test(text)) return false;
  // Angle brackets are not only JSX. Scanning whole files rather than lines
  // means a generic type parameter — `useState<Id<"companies"> | null>(null)` —
  // opens a match that runs on through the code below it until the next `<`.
  // Punctuation that appears in code and effectively never in screen copy is
  // what tells the two apart.
  if (/[;=]|\/\/|=>/.test(text)) return false;
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
