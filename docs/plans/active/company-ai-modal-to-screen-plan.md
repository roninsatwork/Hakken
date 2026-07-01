# Company AI Modal To Screen Plan

Created: 2026-07-01

This plan documents how to replace large Company AI modal workflows with full screens that include a clear back action. It is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plans:

- [Company AI Upgrade Plan](./company-ai-upgrade-plan.md)
- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)

Index keywords: company AI, modals, full-screen forms, back button, memory editor, skill editor, eval editor, chat evidence, knowledge upload.

## Product Rule

Large input belongs on a page, not in a modal.

Modals in the Company AI workspace should be reserved for:

- yes/no confirmations,
- destructive confirmations with a short explanation,
- genuinely small inputs where the user can finish without scrolling or composing long text.

Do not use modals for:

- long textareas,
- JSON authoring,
- multi-section forms,
- evidence review plus editing,
- workflows where the user may need to read surrounding context,
- any form where accidental close would feel expensive.

## Goal

Move the large Company AI authoring and evidence workflows onto routes under:

```text
/admin/companies/[id]/ai/**
```

Each replacement screen should:

- have a visible back button in the header,
- return to the previous screen after save or cancel,
- preserve the Company AI submenu context,
- use the same backend mutations as the existing modal flow,
- make room for long text, JSON, previews, validation, and evidence without cramped modal scrolling,
- leave tiny confirmation modals alone unless the implementation naturally replaces them.

## Back Button Standard

Use one shared back behavior for all new screens.

Recommended pattern:

1. List/detail pages link to form pages with a `returnTo` query param set to the current route when useful.
2. The form page renders a back button labelled `Back`.
3. On click, prefer the safe `returnTo` value if it is an internal admin company route.
4. If `returnTo` is absent or invalid, fall back to the parent section route.
5. After a successful save, navigate to the same safe destination.

Example:

```text
/admin/companies/[id]/ai/evals/new?returnTo=/admin/companies/[id]/ai/evals
```

Do not rely only on `window.history.back()` because deep links and reloads must still have a predictable destination.

## Current Modal Inventory

### Knowledge

Source:

- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`
- Company AI route: `src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx`

Current modals:

- `Upload Knowledge Document`: file, title, text, and metadata authoring.
- `Inspect Knowledge Document`: large read-only chunk/evidence inspection.
- `Delete Document`: small destructive confirmation.
- `Delete Website Data`: small destructive confirmation.

Plan:

- Replace upload modal with `/admin/companies/[id]/ai/knowledge/upload`.
- Replace inspect modal usage in Company AI with existing routed document screen `/admin/companies/[id]/ai/knowledge/[documentId]`.
- Keep `Delete Document` and `Delete Website Data` as confirmation modals unless the delete flow grows beyond confirmation.

### Memory

Source:

- `src/app/(dashboard)/admin/companies/[id]/ai/memory/page.tsx`

Current modals:

- `Add Memory`: title, category, content, confidence.
- `Edit Memory`: title, category, content, confidence.
- `Add Candidate`: title, category, content, confidence, reason.
- `Reject Candidate`: optional short reason.
- `Archive Memory`: yes/no destructive confirmation.

Plan:

- Replace `Add Memory` with `/admin/companies/[id]/ai/memory/new`.
- Replace `Edit Memory` with `/admin/companies/[id]/ai/memory/[memoryId]/edit`.
- Replace `Add Candidate` with `/admin/companies/[id]/ai/memory/candidates/new`.
- Keep `Reject Candidate` as a small-input modal for now because it is a short review note, not a large authoring flow.
- Keep `Archive Memory` as a yes/no confirmation modal.

### Skills

Source:

- `src/app/(dashboard)/admin/companies/[id]/ai/skills/page.tsx`

Current modals:

- `New Company Skill`: name, description, category, status, risk, version, instruction, required tools JSON, approval policy JSON, input contract JSON, output contract JSON, recommended knowledge JSON.
- `Bind Skill`: surface and optional surface id.
- `Archive Skill`: yes/no destructive confirmation.

Plan:

- Replace `New Company Skill` with `/admin/companies/[id]/ai/skills/new`.
- Add a future edit route at `/admin/companies/[id]/ai/skills/[skillId]/edit` before expanding skill editing.
- Keep `Bind Skill` as a small-input modal initially. Revisit if bindings gain policies, tests, or multiple surfaces.
- Keep `Archive Skill` as a yes/no confirmation modal.

### Evals

Source:

- `src/app/(dashboard)/admin/companies/[id]/ai/evals/page.tsx`

Current modals:

- `New Eval`: name, category, severity, target surface, prompt, expected behavior, forbidden claims JSON, expected model use case, required sources JSON, required memories JSON, judge rubric.
- `Run Eval`: answer, evidence JSON, model id, use case, judge notes.
- `Archive Eval`: yes/no destructive confirmation.

Plan:

- Replace `New Eval` with `/admin/companies/[id]/ai/evals/new`.
- Replace `Run Eval` with `/admin/companies/[id]/ai/evals/[evalCaseId]/run`.
- Add a future case detail/edit route at `/admin/companies/[id]/ai/evals/[evalCaseId]` if eval cases need richer maintenance.
- Keep `Archive Eval` as a yes/no confirmation modal.

### Chat Evidence And Learning Loop

Source:

- `src/app/(dashboard)/admin/companies/[id]/chat-logs/page.tsx`
- `src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/page.tsx`

Current modals:

- `Create Memory Candidate`: title, category, confidence, content, reason from selected chat evidence.
- `Create Eval From Chat`: name, category, severity, target surface, prompt, expected behavior, forbidden claims JSON.

Plan:

- Replace `Create Memory Candidate` with a routed evidence screen.
- Replace `Create Eval From Chat` with a routed evidence screen.

Recommended route shape:

```text
/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new?messageId=[messageId]&returnTo=...
/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new?messageId=[messageId]&returnTo=...
```

The page should show the selected thread/message evidence beside or above the form, so the admin can compose without losing context.

## Route Map

| Existing Modal | Replacement Route | Back Fallback |
| --- | --- | --- |
| Upload Knowledge Document | `/admin/companies/[id]/ai/knowledge/upload` | `/admin/companies/[id]/ai/knowledge` |
| Inspect Knowledge Document | `/admin/companies/[id]/ai/knowledge/[documentId]` | `/admin/companies/[id]/ai/knowledge` |
| Add Memory | `/admin/companies/[id]/ai/memory/new` | `/admin/companies/[id]/ai/memory` |
| Edit Memory | `/admin/companies/[id]/ai/memory/[memoryId]/edit` | `/admin/companies/[id]/ai/memory` |
| Add Candidate | `/admin/companies/[id]/ai/memory/candidates/new` | `/admin/companies/[id]/ai/memory` |
| New Company Skill | `/admin/companies/[id]/ai/skills/new` | `/admin/companies/[id]/ai/skills` |
| New Eval | `/admin/companies/[id]/ai/evals/new` | `/admin/companies/[id]/ai/evals` |
| Run Eval | `/admin/companies/[id]/ai/evals/[evalCaseId]/run` | `/admin/companies/[id]/ai/evals` |
| Chat to Memory Candidate | `/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new` | `/admin/companies/[id]/ai/chat-logs` |
| Chat to Eval | `/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new` | `/admin/companies/[id]/ai/chat-logs` |

## Implementation Order

### Phase 1: Shared Screen Pattern

- Add a lightweight `AdminFormPageHeader` or Company AI-specific form header with:
  - back link,
  - title,
  - optional subtitle,
  - optional right-side status/action slot.
- Add helper logic for safe internal `returnTo` handling.
- Add tests for safe fallback behavior.

### Phase 2: Highest Pain, Highest Value

- Move `New Company Skill` to `/ai/skills/new`.
- Move `New Eval` to `/ai/evals/new`.
- Move `Run Eval` to `/ai/evals/[evalCaseId]/run`.

These are the most modal-hostile flows because they include multiple long textareas and JSON fields.

### Phase 3: Memory Authoring

- Move `Add Memory`, `Edit Memory`, and `Add Candidate` to routed screens.
- Keep candidate approval inline and keep rejection as a short review modal.
- Update Learning Suggestions links so memory suggestions land on the most useful new screen where possible.

### Phase 4: Chat Evidence

- Move chat-derived memory/eval creation onto evidence pages.
- Show selected message/thread context persistently on the screen.
- Make the AI Overview Learning Suggestions route to these screens when the suggestion is evidence-driven.

### Phase 5: Knowledge Upload And Inspect

- Move knowledge upload to a page.
- Ensure Company AI inspect actions always use `/ai/knowledge/[documentId]` instead of the shared modal path.
- Leave delete confirmations as modals.

## Design Requirements

- Use normal page layouts, not floating card-on-card modal replacements.
- Keep the Company AI submenu visible where the existing layout already provides it.
- Use compact section headers and dense controls; these are admin work surfaces, not landing pages.
- Long textareas should have comfortable vertical space and not be trapped in modal scroll.
- JSON fields should have room for validation hints and error states.
- Evidence-driven pages should show source evidence in a stable side panel or top evidence block.
- The primary submit button should be fixed only if the page becomes long enough that losing the action is annoying; otherwise keep actions at the bottom of the form.

## Backend Requirements

- Reuse existing mutations first.
- Do not add duplicate mutations just because the UI moves from modal to page.
- Preserve tenant isolation and existing admin access checks.
- Keep audit logs and drift event creation unchanged.
- Add new queries only when the page needs route-loaded records, for example fetching one eval case by id for `/run`.

## Test Plan

Each migrated flow should include:

- route-level rendering test where practical,
- mutation success test if not already covered,
- validation/error state test for JSON-heavy forms,
- back-link fallback test,
- navigation test that save returns to `returnTo` or the section fallback,
- regression test that the old modal open state is removed or no longer reachable from the list page.

Manual/browser verification should cover:

- deep-linking directly to each new form route,
- saving from each route,
- cancel/back behavior from each route,
- refreshing a form page,
- mobile-width layout for long fields,
- no Overview submenu highlight when a nested form route is active unless the route belongs to Overview.

## Definition Of Done

This work is complete when:

- no large Company AI authoring or evidence-review workflow opens in a modal,
- all large workflows are addressable by URL,
- every new workflow screen has a working back button,
- existing small confirmation modals remain small and intentional,
- all updated flows pass `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check`,
- browser verification confirms the new routed screens are usable from the Company AI submenu.

