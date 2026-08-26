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

const FROZEN: ReadonlyMap<string, number> = new Map([
  ['src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen.tsx', 1],
  ['src/app/(dashboard)/admin/_features/evals/EvalDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/logs/AgentLogsResults.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/logs/[logId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/memory/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/observability/[runId]/AgentJobDetailContent.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/observability/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/settings/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/new/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/skills/SkillCatalogDialogs.tsx', 3],
  ['src/app/(dashboard)/admin/companies/CompanyDialogs.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/evals/[evalCaseId]/edit/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/rules/[ruleId]/page.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx', 6],
  ['src/app/(dashboard)/admin/companies/[id]/features/CompanyFeaturesContent.tsx', 1],
  ['src/app/(dashboard)/admin/settings/api-keys/ApiKeyRevokeDialog.tsx', 1],
  ['src/app/(dashboard)/admin/settings/api-keys/page.tsx', 1],
  ['src/app/(dashboard)/admin/settings/plans/PlanDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/workflows/WorkflowDialogs.tsx', 2],
  ['src/app/(dashboard)/admin/workflows/schedules/page.tsx', 2],
  ['src/app/(dashboard)/app/assistant/_components/AssistantModals.tsx', 2],
  ['src/app/(dashboard)/app/profile/page.tsx', 4],
  ['src/app/(dashboard)/app/properties/logs/PropertiesRunRows.tsx', 1],
  ['src/app/(dashboard)/app/properties/scraped-data/ScrapedDataDeleteDialog.tsx', 2],
  ['src/app/(dashboard)/app/properties/scraped-data/[id]/PropertyDescription.tsx', 2],
  ['src/app/(dashboard)/app/properties/scraped-data/page.tsx', 1],
  ['src/app/(dashboard)/app/settings/page.tsx', 4],
  ['src/app/(dashboard)/app/settings/team/page.tsx', 2],
  ['src/ui/components/chat/ChatHistoryList.tsx', 4],
  ['src/ui/components/chat/ChatInput.tsx', 5],
  ['src/ui/components/chat/MessageFeedbackControls.tsx', 3],
  ['src/ui/components/chat/SwarmStatusCard.tsx', 2],
  ['src/ui/components/screens/DataTable.tsx', 1],
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

function countHardcodedCopy(contents: string): number {
  let hits = 0;
  for (const line of contents.split('\n')) {
    for (const match of line.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) {
      if (looksLikeCopy(match[1])) hits += 1;
    }
    for (const match of line.matchAll(COPY_ATTRS)) {
      if (looksLikeCopy(match[1])) hits += 1;
    }
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
