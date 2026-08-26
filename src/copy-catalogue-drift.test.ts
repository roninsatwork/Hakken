import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { repoRoot, walkFiles, relativePath } from './test/driftUtils';

/**
 * Screen copy stays in the catalogue — including in pages that do not exist yet.
 *
 * The adoption floors in admin-i18n-adoption.test.ts count components that use
 * the catalogue, so they defend the migration but cannot see a brand-new page
 * written in hardcoded English: it never joins the count it would need to
 * lower. This guard closes that gap from the other side, the way the raw-button
 * rule does for hand-drawn buttons: every sentence-shaped literal in screen
 * source is counted per file, today's counts are frozen below, and counts may
 * FALL, NEVER RISE. A new file starts at zero, so its first hardcoded sentence
 * fails here — which is what binds pages written after the migration.
 *
 * The scan parses each file rather than matching text against it, so the
 * positions below are syntax, not guesswork, and code can never be mistaken for
 * a sentence sitting in one of them:
 *
 *   - JSX text, which includes SVG `<text>` labels;
 *   - a string rendered as a child, `{busy ? "Working…" : "Ready"}`;
 *   - a copy-bearing JSX attribute — `description="…"`, `emptyLabel="…"`;
 *   - a copy-bearing object property, which is how a module-level config array
 *     hides a paragraph that the component later renders as `{item.label}`,
 *     and how a chart carries its axis labels;
 *   - a bare string element of an array, the shape of a phase list;
 *   - a string assigned to a variable, or returned from a function;
 *   - a string drawn onto a canvas with `fillText`.
 *
 * A template literal counts by its literal parts alone: `Showing ${a} of ${b}
 * attempts` is a sentence, `${label} opacity` is one hardcoded word, and
 * `/admin/companies/${id}` is a path. Copy assembled across statements is
 * invisible to any of this — review still owns that.
 *
 * A name carries copy if it is on the list below or ends in one of the copy
 * words, so `emptySearchMessage` and `successLabel` are read without being
 * named. Everything else is left alone, which is what keeps a Tailwind class
 * list out of the count: `className` is not a copy name, and a bare string that
 * is mostly utility tokens is rejected wherever it appears.
 *
 * When you translate a file, its count falls; move the entry down or delete it
 * at zero — the check tells you which. Adding or raising an entry is never the
 * fix. The frozen movement demos are excluded (owner decision), as is the
 * public marketing site, which is deliberately single-language.
 */

/**
 * Names whose value is never something a person reads.
 *
 * This used to be the other way round: a list of names that sounded like copy
 * — `label`, `title`, `description` and about twenty more — and a property
 * counted only if its name was on it. That let an English sentence through
 * under any other name, which is not a hypothetical: `sub={"PROPRIETARY RAG
 * VECTORS"}` sat on the usage screen, and a probe on 2026-08-26 planted a
 * sentence under `note` and watched the guard pass it.
 *
 * So the test is inverted: a sentence-shaped value counts wherever it sits,
 * unless the name is one of these. That puts the burden on the structural
 * names, which are a closed and knowable set, rather than on the copy names,
 * which are not — anyone can invent a new prop tomorrow, and the old rule
 * failed open every time they did.
 *
 * Three groups: identifiers and wiring, presentational tokens, and CSS-in-JS
 * property names. The last group matters more than it looks — a
 * `backgroundImage` holding `repeating-linear-gradient(to top, transparent…)`
 * is long, spaced and mostly letters, so every other test here passes it.
 */
const NOT_COPY: ReadonlySet<string> = new Set([
  // Identifiers, wiring and form mechanics.
  'className', 'class', 'style', 'href', 'src', 'srcSet', 'id', 'key', 'htmlFor',
  'rel', 'target', 'type', 'role', 'pattern', 'accept', 'method', 'action',
  'encType', 'testId', 'name', 'value',
  // Presentational choices that name a token, not a sentence.
  'icon', 'variant', 'tone', 'color', 'fill', 'stroke', 'width', 'height',
  'viewBox', 'd', 'transform', 'points', 'fontFamily',
  // CSS-in-JS.
  'backgroundImage', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
  'boxShadow', 'transition', 'gridTemplateColumns', 'gridTemplateRows',
  'clipPath', 'maskImage', 'filter', 'backdropFilter', 'animation', 'willChange',
  'objectPosition', 'textShadow', 'flex', 'font', 'background', 'border',
  'margin', 'padding', 'inset', 'placeItems', 'fontWeight', 'letterSpacing',
  'lineHeight',
]);

/**
 * Event handlers and `data-` attributes are excluded by shape rather than by
 * name, since both are open sets.
 */
const carriesCopy = (name: string) =>
  !NOT_COPY.has(name) && !name.startsWith('data-') && !/^on[A-Z]/.test(name);

/**
 * 29 files, 112 sentences.
 *
 * The customer area under `app/` was translated on 2026-08-26 and is absent
 * from the list; what remains is the admin area, the chat and workflow kit, and
 * the sidebar. `GameEngine.ts` is gone from it for the same reason as the rest:
 * the arcade HUD now takes its four strings from the catalogue, passed in as
 * formatters so the canvas loop stays free of React.
 *
 * The list is measured, not chosen. It last read 68 files and 119 sentences
 * under a scan that matched `>text<` against the file as a string. That shape
 * could not see a sentence held in a config array, an SVG label in capitals, a
 * chart axis, a fallback arm or anything drawn on a canvas — and 66 of its 119
 * sentences sat in 51 files that carried no copy at all, being type parameters,
 * JSX comments and the code between two elements. Parsing the file drops those
 * and reads 189 across 33 files in the same tree; translating the customer area
 * took it to 23 files and 102.
 *
 * It rose to 29 and 112 on 2026-08-26 when the name test was inverted (see
 * `NOT_COPY`). Eighteen sentences surfaced that had been invisible under any
 * property name the old list did not know. Eight were real screen copy and were
 * translated the same day — a table heading, the usage screen's five panel
 * labels, and the two location fallbacks in the header.
 *
 * The other ten are English on purpose, and are the reason this list is not a
 * to-do list:
 *
 *   - `agents/[id]/layout.tsx` (1), `agents/[id]/memory/page.tsx` (2) and
 *     `runs/_components/RunsTable.tsx` (3) hold the *reason* written into an
 *     audit record when a person cancels or rejects something — "Cancelled
 *     from the agent header". It is written once, stored, and read back years
 *     later. Translating it would translate the record, not the screen, and
 *     the record would then depend on who was looking when it was made.
 *   - `ai/voice/page.tsx` (1) and `chat/RealtimeVoiceOverlay.tsx` (2) are
 *     instructions addressed to a model, not to a person — "Say so plainly."
 *     They are prompt text. Translating them changes what the model is told.
 *   - `audit-logs/[id]/AuditLogDetailContent.tsx` (4) is fabricated fallback
 *     data shown when the real audit query returns nothing. Those four should
 *     not be translated because they should not exist; flagged separately
 *     2026-08-26 as a governance screen inventing records.
 *
 * A future reader should shrink this list by fixing the last group and leaving
 * the first two alone.
 */
const FROZEN: ReadonlyMap<string, number> = new Map([
  ['src/app/(dashboard)/admin/_features/widget-config/widgetConfigUtils.ts', 2],
  ['src/app/(dashboard)/admin/agents/[id]/layout.tsx', 1],
  ['src/app/(dashboard)/admin/agents/[id]/memory/page.tsx', 2],
  ['src/app/(dashboard)/admin/agents/[id]/runs/_components/RunsTable.tsx', 3],
  ['src/app/(dashboard)/admin/agents/[id]/settings/page.tsx', 1],
  ['src/app/(dashboard)/admin/agents/new/page.tsx', 1],
  ['src/app/(dashboard)/admin/ai/costs/_components/AICostDistributionCharts.tsx', 1],
  ['src/app/(dashboard)/admin/ai/voice/page.tsx', 1],
  ['src/app/(dashboard)/admin/audit-logs/[id]/AuditLogDetailContent.tsx', 4],
  ['src/app/(dashboard)/admin/companies/CompanyDialogs.tsx', 1],
  ['src/app/(dashboard)/admin/companies/[id]/ai/usage/page.tsx', 2],
  ['src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx', 21],
  ['src/app/(dashboard)/admin/companies/[id]/features/CompanyFeaturesContent.tsx', 5],
  ['src/app/(dashboard)/admin/companies/[id]/features/page.tsx', 1],
  ['src/app/(dashboard)/admin/directory/page.tsx', 1],
  ['src/app/(dashboard)/admin/governance/audit-trail/page.tsx', 2],
  ['src/app/(dashboard)/admin/super-admins/[id]/page.tsx', 1],
  ['src/app/(dashboard)/admin/super-admins/page.tsx', 1],
  ['src/app/(dashboard)/admin/users/page.tsx', 1],
  ['src/ui/components/chat/ChatHistoryList.tsx', 7],
  ['src/ui/components/chat/ChatInput.tsx', 15],
  ['src/ui/components/chat/MessageFeedbackControls.tsx', 8],
  ['src/ui/components/chat/RealtimeVoiceOverlay.tsx', 2],
  ['src/ui/components/chat/SwarmStatusCard.tsx', 2],
  ['src/ui/components/layout/SidebarNavigation.tsx', 17],
  ['src/ui/components/workflows/AgentEditorModal.tsx', 1],
  ['src/ui/components/workflows/ConfigDrawer.tsx', 1],
  ['src/ui/components/workflows/ConfigDrawerDataPanels.tsx', 3],
  ['src/ui/components/workflows/ConfigDrawerHumanPanels.tsx', 4],
]);

const SCAN_ROOTS = ['src/app/(dashboard)', 'src/ui'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * A utility class list is not a sentence, however English its words look.
 *
 * `px-4 py-3 text-[13px] whitespace-nowrap text-secondary` passes every other
 * test here — long enough, spaced, mostly letters — so the shape of a Tailwind
 * token is what separates it from copy. One hyphenated word in a sentence is
 * ordinary ("auto-generate", "multi-agent"), so the rule only fires when more
 * than half the words are built that way.
 */
function looksLikeStyling(text: string): boolean {
  const tokens = text.split(' ').filter(Boolean);
  const styling = tokens.filter((token) => /^\/|\[|\]|^[a-z][a-z0-9]*(?:[:/-][a-z0-9./%[\]-]+)+$/.test(token));
  return styling.length * 2 > tokens.length;
}

function looksLikeCopy(raw: string): boolean {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length < 8 || !text.includes(' ')) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  // Punctuation that appears in code and effectively never in screen copy:
  // statements, arrows, comments, markup samples and JSON keys.
  if (/[;=]|\/\/|=>|<\/|\/>|":/.test(text)) return false;
  const letters = text.replace(/[^A-Za-z ]/g, '');
  if (letters.length < text.length * 0.6) return false;
  return !looksLikeStyling(text);
}

/** The literal chunks of a string or template, with interpolations dropped. */
function literalParts(node: ts.Node): string[] | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  }
  return null;
}

/**
 * The strings a value can turn out to be.
 *
 * A prop is often written as a choice rather than a string — `placeholder={busy
 * ? "Awaiting agent…" : "Dispatch a prompt…"}`, `alt={name || "Player avatar"}`
 * — and both arms are copy someone reads.
 */
function valueBranches(expression: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(expression)) return valueBranches(expression.expression);
  if (ts.isArrowFunction(expression) && !ts.isBlock(expression.body)) return valueBranches(expression.body);
  if (ts.isConditionalExpression(expression)) {
    return [...valueBranches(expression.whenTrue), ...valueBranches(expression.whenFalse)];
  }
  if (
    ts.isBinaryExpression(expression) &&
    (expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    return [...valueBranches(expression.left), ...valueBranches(expression.right)];
  }
  return [expression];
}

function countHardcodedCopy(contents: string, filePath: string): number {
  const source = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  let hits = 0;

  const count = (parts: string[] | null) => {
    if (parts && looksLikeCopy(parts.join(''))) hits += 1;
  };

  const countValue = (expression: ts.Expression | undefined) => {
    if (!expression) return;
    for (const branch of valueBranches(expression)) count(literalParts(branch));
  };

  const declaredName = (node: ts.JsxAttribute | ts.PropertyAssignment) =>
    ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(source);

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      count([node.text]);
    } else if (ts.isJsxAttribute(node)) {
      if (carriesCopy(declaredName(node)) && node.initializer) {
        const initializer = node.initializer;
        countValue(ts.isJsxExpression(initializer) ? initializer.expression : initializer);
      }
    } else if (ts.isPropertyAssignment(node)) {
      if (carriesCopy(declaredName(node))) countValue(node.initializer);
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) count([element.text]);
      }
    } else if (ts.isVariableDeclaration(node)) {
      if (node.initializer) count(literalParts(node.initializer));
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      countValue(node.expression);
    } else if (ts.isReturnStatement(node)) {
      if (node.expression) count(literalParts(node.expression));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'fillText' && node.arguments.length > 0) {
        count(literalParts(node.arguments[0]));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

describe('screen copy stays in the catalogue', () => {
  const measured = new Map<string, number>();
  for (const root of SCAN_ROOTS) {
    for (const file of walkFiles(path.join(repoRoot, root), SCAN_EXTENSIONS)) {
      const relative = relativePath(file).replaceAll(path.sep, '/');
      if (relative.includes('/demos/') || /\.test\.tsx?$/.test(relative) || relative.endsWith('.d.ts')) continue;
      const hits = countHardcodedCopy(fs.readFileSync(file, 'utf8'), file);
      if (hits > 0) measured.set(relative, hits);
    }
  }

  /**
   * Frozen at 23 files and 102 sentences. The list may shrink and never
   * grow — a sentence three lists in this repository printed without anything
   * checking it, so a new entry slipped in unremarked. A file's count may split
   * when the file splits, but the total may not rise.
   */
  const FROZEN_FILE_CEILING = 29;
  const FROZEN_SENTENCE_CEILING = 112;

  test('the frozen list only shrinks', () => {
    const sentences = [...FROZEN.values()].reduce((sum, count) => sum + count, 0);

    expect(FROZEN.size, 'The frozen copy list gained a file. Put the copy in the catalogue instead:').toBeLessThanOrEqual(FROZEN_FILE_CEILING);
    expect(sentences, 'The frozen copy total rose. A count may move between files when one splits; the total may not grow:').toBeLessThanOrEqual(FROZEN_SENTENCE_CEILING);
  });

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
