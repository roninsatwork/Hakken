> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is Movement Definitive Plan (not included in this copy).

# Company Admin Laptop UX Upgrade Plan

Created: 2026-07-02

This plan documents how to upgrade the company admin area so it works comfortably on a 13-inch MacBook Pro, especially inside the company `AI` section. It is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plans:

- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)
- [Company AI Overview UX Plan](./company-ai-overview-ux-plan.md)
- [Company AI Batch Eval Runs Plan](./company-ai-batch-eval-runs-plan.md)

Index keywords: company admin laptop UX, 13-inch MacBook, company AI navigation, compact section switcher, responsive admin layout, client-friendly AI workspace.

## Product Decision

The company admin area should be designed laptop-first.

The target screen is a 13-inch MacBook Pro admin user, not only a wide desktop monitor. On this size, the UI must avoid stacking too many navigation systems side by side.

Do not solve the AI navigation problem with a long horizontal tab row. That pattern already failed because the row can run off screen and makes the workspace feel awkward.

Do not keep the AI submenu as a left rail on laptop-sized screens. It steals too much width from the working page.

Use a compact AI section switcher on laptop-sized screens:

```text
AI section: Memory v
```

Opening the switcher shows the available AI sections in a menu.

Wide desktop screens may still use a left submenu if it genuinely improves scanning and there is enough space. Laptop screens should prioritize full-width content.

## Current Problem

The company admin area can show too many navigation layers at once:

```text
Main admin sidebar | Company workspace | AI submenu | Actual page content
```

On a 13-inch MacBook Pro, this leaves the real working area too narrow. The result is that pages feel dense, tables and cards are squeezed, and two-column layouts become harder to read.

The earlier horizontal-tab alternative also has a problem:

```text
Overview | Knowledge | Memory | Skills | Prompt | AI Rules | AI Models | Evals | Chat Logs
```

That row contains too many items. It can overflow, wrap, or force smaller hit targets.

The UX issue is not only responsive CSS. It is information architecture. The interface exposes too many internal AI objects as always-visible navigation.

## Target Layout

### Current Cramped Layout

```text
+------------------+----------------------------------------------------------+
|                  | Company: Ronins Website                                  |
| Main Admin Menu  | Dashboard | Overview | Directory | AI | Widget           |
|                  |                                                          |
|                  | +--------------+-----------------------------------------+ |
|                  | | AI Menu      | Actual page content                    | |
|                  | |              |                                         | |
|                  | | Overview     | Company Memory                         | |
|                  | | Knowledge    | [Approved Memory] [Review Queue]       | |
|                  | | Memory       |                                         | |
|                  | | Skills       | This content area is too narrow        | |
|                  | | Prompt       | on a 13-inch MacBook.                  | |
|                  | | AI Rules     |                                         | |
|                  | | AI Models    |                                         | |
|                  | | Evals        |                                         | |
|                  | | Chat Logs    |                                         | |
|                  | +--------------+-----------------------------------------+ |
+------------------+----------------------------------------------------------+
```

### Rejected Horizontal Layout

```text
+------------------+----------------------------------------------------------+
|                  | Company: Ronins Website                                  |
| Main Admin Menu  | Dashboard | Overview | Directory | AI | Widget           |
|                  |                                                          |
|                  | Overview | Knowledge | Memory | Skills | Prompt | Rules...|
|                  |                                                          |
|                  | The AI row can run off screen or become hard to scan.     |
+------------------+----------------------------------------------------------+
```

### Target Laptop Layout

```text
+------------------+----------------------------------------------------------+
|                  | Company: Ronins Website                                  |
| Main Admin Menu  | Dashboard | Overview | Directory | AI | Widget           |
|                  |                                                          |
|                  | Company Memory                                           |
|                  | Trusted company facts and preferences.                   |
|                  |                                                          |
|                  | AI section: Memory v                                     |
|                  |                                                          |
|                  | +------------------------------------------------------+ |
|                  | | [Suggested memories - full width]                    | |
|                  | |                                                      | |
|                  | | [Approved memory - full width]                       | |
|                  | |                                                      | |
|                  | | Page content gets the full available company width.   | |
|                  | +------------------------------------------------------+ |
+------------------+----------------------------------------------------------+
```

When the user opens the switcher:

```text
+----------------------+
| Overview             |
| Knowledge            |
| Memory               |
| Skills               |
| Prompt               |
| AI Rules             |
| AI Models            |
| Evals                |
| Chat Logs            |
+----------------------+
```

## Navigation Rules

- Keep the global admin sidebar.
- Keep the company-level top tabs.
- Do not show a laptop-width AI left submenu.
- Do not show a long horizontal AI tab row.
- Show the current AI section as a compact selector below the page title and description.
- Keep the actual page content full width inside the company content area.
- Use plain client-facing labels wherever possible.
- Avoid exposing internal system objects as equal-weight navigation when a task grouping would be clearer.

## Admin Section Selector Placement Rule

Apply this rule anywhere a company admin area has subsections, such as `AI`, `Widget`, `Directory`, future setup areas, or other nested workspaces.

The page title and page description must come first. The section selector comes next. The working content comes after that.

Correct order:

```text
Page title
Short page description

Section selector: Current section v

Page content
```

Do not place a compact section selector above the title. A selector above the title makes the page feel like navigation is more important than the task, and it creates inconsistency with the Widget layout.

Do not use a long horizontal subsection tab row when the section has many items. Use the compact selector on laptop-sized screens and reserve vertical rails for genuinely wide desktop layouts.

On wide desktop, an optional left rail may appear beside the content, but the laptop/default experience should still be title first, selector second, content third.

## Action Placement Rule

Actions should sit beside the thing they act on.

The page header should identify the page and explain its purpose. It should not become a collection of unrelated controls.

Correct pattern:

```text
Page title
Short page description

Section selector: Current section v

Active Eval Cases                         [Run failed/not run] [Run all] [New eval]
Table or list content
```

Avoid putting table or list actions in the page header unless the whole page has one obvious primary action. For example, eval batch controls belong with `Active Eval Cases` because they run the cases in that collection. Memory review actions belong with the memory review queue. Table export, import, filter, bulk-run, and add-new controls should generally live in the relevant table/list header.

This keeps the title area calm and makes the action answer an obvious question: "what will this button affect?"

## Client-Friendly IA Direction

The current AI section names are accurate, but some are technical. Over time, move the visible IA toward client tasks.

Possible grouped model:

```text
Status
Setup
Memory
Testing
Logs
```

Suggested mapping:

| Client area | Includes |
| --- | --- |
| `Status` | Overview, readiness, next action |
| `Setup` | Knowledge, prompt, AI rules, AI models, skills |
| `Memory` | Suggested memories, approved memory, archive/reject history |
| `Testing` | Evals, run history, pass/fail evidence |
| `Logs` | Chat logs, activity, drift signals |

This grouping should be treated as a product decision, not just a layout change. The first implementation can keep existing section labels in the switcher, but the long-term UX should reduce the number of always-visible choices.

## Page Layout Rules

Company AI pages should treat laptop width as the normal admin experience.

Rules:

- Primary work areas should be full width on laptop.
- Avoid two-column primary workflows below wide desktop widths.
- Use two columns only for small secondary panels or genuinely related comparisons.
- Tables, review queues, memory lists, eval cases, and prompt editors should receive the widest practical content area.
- Use progressive disclosure for evidence, history, advanced settings, and diagnostics.
- Empty states should explain what the section is for and what the next action does.
- Button labels should make the action obvious without needing outside explanation.

Examples:

- `Suggested memories` and `Approved memory` should stack full width.
- Eval cases should support `Run all`, `Run failed/not run`, and batch result review.
- Overview should answer readiness, reasons, and next action before detailed evidence.
- Prompt/rules/model pages should avoid putting the main editor beside large secondary panels on laptop.

## Responsive Breakpoint Guidance

The breakpoint should be based on usable content width, not only viewport width.

The company area already has a global admin sidebar, so a nominal desktop viewport can still have a narrow content canvas.

Recommended behavior:

| Screen / usable width | AI navigation behavior |
| --- | --- |
| Small and tablet | Compact AI section switcher |
| 13-inch laptop | Compact AI section switcher |
| Standard laptop | Compact AI section switcher unless content remains comfortable |
| Wide desktop | Optional left submenu |

The left AI submenu should only appear when the page has enough room for both the submenu and a comfortable content column.

## Implementation Phases

### Phase 1: Audit Company Admin Width Pressure

Tasks:

- Review the company workspace shell, top tabs, AI layout, and admin sidebar widths.
- Identify pages with fixed grids, two-column panels, or min-width content that can overflow.
- Check AI pages at 13-inch laptop dimensions.
- Check whether any page relies on the AI submenu being permanently visible.

Acceptance:

- The implementation owner knows which shared layout components and which AI pages need changes.
- The plan has a concrete list of affected files before code changes begin.

### Phase 2: Add Compact AI Section Switcher

Tasks:

- Add a reusable company subsection switcher component.
- Use it in the company AI layout on laptop-sized screens.
- Show the current section label and open a menu of available AI sections.
- Preserve active state and routing.
- Ensure keyboard navigation, focus states, and click-outside behavior are accessible.

Acceptance:

- Users can switch AI sections without a left submenu or horizontal tab overflow.
- The current AI section is always visible.
- Navigation remains understandable on a 13-inch MacBook Pro.

### Phase 3: Make The AI Left Submenu Wide-Desktop Only

Tasks:

- Hide the AI left submenu below the agreed wide breakpoint.
- Keep the left submenu only where it improves scanning without squeezing content.
- Avoid duplicate navigation noise when the switcher and left submenu are both visible.

Acceptance:

- Laptop screens use the compact switcher.
- Wide desktop screens may use the left submenu.
- There is no state mismatch between switcher and submenu.

### Phase 4: Reflow Primary AI Pages

Tasks:

- Audit Overview, Knowledge, Memory, Skills, Prompt, AI Rules, AI Models, Evals, and Chat Logs.
- Stack primary work areas full width on laptop.
- Reserve side-by-side layouts for wide desktop or non-primary supporting panels.
- Keep memory review and approved memory areas full width.
- Make eval batch-run actions visible without making the page dense.

Acceptance:

- No AI page requires horizontal scrolling on a 13-inch MacBook Pro.
- Primary workflows are readable without shrinking the browser.
- Important actions remain visible and obvious.

### Phase 5: Simplify Labels And Empty States

Tasks:

- Replace technical labels where a client-facing label is clearer.
- Add small helper copy where users must understand approval, readiness, memory, evals, or runtime behavior.
- Make button labels describe the outcome.
- Keep explanations close to the interaction they clarify.

Acceptance:

- A client admin can understand the difference between approved content and suggested/review content.
- The user does not need a separate explanation to know what a primary action does.
- Empty states teach the purpose of the page without becoming marketing copy.

### Phase 6: Verify Laptop UX

Tasks:

- Test the company AI section at laptop dimensions.
- Check all AI child routes.
- Check long company names, long section labels, empty states, populated states, and table/list states.
- Check keyboard navigation for the section switcher.
- Check that the main content area remains usable with the global admin sidebar visible.

Acceptance:

- The company AI area is comfortable on a 13-inch MacBook Pro.
- Navigation does not overflow, wrap awkwardly, or steal the page's working width.
- Primary content is full width on laptop.
- Wide desktop remains efficient for admins with larger screens.

## Suggested Verification

Before asking to merge or push the implementation, run the project gates from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Manual verification should include:

- AI Overview on laptop width.
- AI Memory on laptop width with both suggested and approved records.
- AI Evals on laptop width with batch run controls.
- Prompt and Rules pages on laptop width.
- Old and new AI routes, if redirects are touched.
- Wide desktop behavior to confirm the experience has not become worse for large screens.

## Out Of Scope

Do not include these unless separately requested:

- Removing the global admin sidebar.
- Rebuilding company permissions.
- Changing tenant isolation behavior.
- Changing AI runtime logic.
- Renaming every AI concept at once.
- Refactoring the frozen movement demo areas.
- Replacing the whole admin design system.

## Open Product Decisions

1. Should the first implementation keep the existing AI section labels, or move immediately to grouped labels such as `Status`, `Setup`, `Memory`, `Testing`, and `Logs`?
2. Should the wide desktop left submenu remain, or should the compact switcher become the only AI navigation pattern everywhere?
3. Which breakpoint should reveal the wide desktop submenu?
4. Should `Widget` remain a separate company top tab, or eventually sit inside the AI/client-facing setup flow?

## Acceptance Criteria

This upgrade is complete when:

- The company AI section does not use a left submenu on 13-inch laptop screens.
- The company AI section does not use a long horizontal AI tab row.
- A compact AI section switcher lets users move between AI pages.
- Primary AI page content gets the full available company content width on laptop.
- Memory review and approved memory stack full width.
- Eval controls support batch-oriented workflows without crowding the page.
- Client-facing labels and empty states reduce the need for external explanation.
- The experience is verified at 13-inch MacBook Pro dimensions.
