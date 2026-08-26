# Manage Agents Secondary Tabs UX Plan

> **Superseded in part.** Interfaces is no longer a dropdown over Integrations and
> I/O Schemas. Those were two halves of one question and are now a single screen at
> `/admin/agents/:id/interfaces`. The rest of this plan still describes the tab row.

This plan documents the agreed UX direction for the agent detail secondary tab row on the Manage Agents screen. The goal is to align the agent detail navigation with the global AI tabbed menu and the company workspace tabbed menu without changing the underlying agent routes.

## Problem

The agent detail screen currently exposes every agent section as a top-level horizontal tab:

- Dashboard
- Runs
- Evals
- Settings
- Skills
- Knowledge
- Memory
- Prompt
- AI Rules
- Integrations
- I/O Schemas
- Logs

This makes the row feel wider and more brittle than the global AI and company workspace navigation patterns. It also gives all sections equal weight even though operators usually think in grouped workflows: activity, evaluation, context, governance, interfaces, configuration, and troubleshooting.

## UX Direction

Keep the same visual language as `AdminDetailTabs` and group dense secondary areas into dropdown tab families.

Proposed visible row:

- Dashboard
- Context
- Governance
- Interfaces
- Settings
- Logs

Dropdown contents:

- Context: Runs, Evals, Skills, Knowledge, Memory
- Governance: Prompt, AI Rules
- Interfaces: Integrations, I/O Schemas

Rationale:

- Dashboard stays top-level as the landing view for the agent.
- Context groups the operational and knowledge surfaces that explain what happened, how the agent is evaluated, and what it can know or do.
- Governance mirrors the global AI navigation pattern for prompt/rule controls.
- Interfaces groups external connections and input/output contracts.
- Settings stays top-level because it is a broad configuration destination.
- Logs stays top-level because it is a frequent troubleshooting path.

## Implementation Scope

Primary files:

- `src/app/(dashboard)/admin/agents/[id]/layout.tsx`
- `src/ui/components/screens/DetailTabs.tsx`
- `src/app/(dashboard)/admin/agents/[id]/layout.test.tsx`
- `messages/en.json`
- `messages/it.json`

Expected code change:

- Restructure the `tabs` array in the agent detail layout.
- Use existing `dropdownItems` support from `AdminDetailTabs`; do not add a new navigation component.
- Add localized labels for `context`, `governance`, and `interfaces`.
- Preserve existing hrefs so bookmarks and direct links continue to work.
- Preserve existing active-route behavior by relying on each dropdown child href.

Potential component refinement:

- If the agent row still overflows at common desktop widths, consider allowing `AdminDetailTabs` to keep horizontal scrolling even when dropdown tabs are present.
- Keep the dropdown trigger and menu styling consistent with company detail tabs and global AI navigation.

## Acceptance Criteria

- The agent detail tab row renders the agreed visible groups.
- Runs, Evals, Skills, Knowledge, and Memory appear only inside Context.
- Prompt and AI Rules appear only inside Governance.
- Integrations and I/O Schemas appear only inside Interfaces.
- Direct routes such as `/admin/agents/:id/runs`, `/admin/agents/:id/evals`, and `/admin/agents/:id/knowledge` mark the Context trigger active.
- Direct routes such as `/admin/agents/:id/rules` mark the Governance trigger active.
- Direct routes such as `/admin/agents/:id/schemas` mark the Interfaces trigger active.
- Existing agent detail pages remain reachable at the same URLs.
- English and Italian locale dictionaries remain in parity.

## Test Plan

Add or update a focused agent layout navigation test that verifies:

- The visible row exposes direct links for Dashboard, Settings, and Logs.
- Context, Governance, and Interfaces render as closed dropdown buttons.
- Opening Context shows Runs, Evals, Skills, Knowledge, and Memory with the expected hrefs.
- Opening Governance shows Prompt and AI Rules with the expected hrefs.
- Opening Interfaces shows Integrations and I/O Schemas with the expected hrefs.
- Active child routes mark the correct dropdown trigger and menu item active.

Run focused checks after implementation:

```bash
npm run verify:env
npm run check
npm run lint:all
```

Before merge or push, run the full local gate from `AGENTS.md`.

## Out Of Scope

- Do not redesign agent detail page content.
- Do not change agent route paths.
- Do not change global AI or company workspace navigation unless a shared component bug is discovered.
- Do not refactor unrelated admin tables or side navigation.
- Do not touch the frozen movement demo.

## Open Follow-Up

After the grouped tabs ship, review the Manage Agents screen at common desktop widths and laptop widths. If the row still feels cramped, the next improvement should be a responsive overflow behavior in `AdminDetailTabs`, not another page-specific navigation variant.
