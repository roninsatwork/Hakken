> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is Movement Definitive Plan (not included in this copy).

# Global AI Navigation Consolidation Plan

Created: 2026-07-02

This plan documents the proposed navigation change for the platform-level `Artificial Intelligence` area: collapse the sidebar submenu into one sidebar destination, then organize AI administration inside the page with tabs and focused subnavigation only where the section needs it.

This is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plans:

- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)
- [Company AI Overview UX Plan](./company-ai-overview-ux-plan.md)
- [Company Admin Laptop UX Upgrade Plan](./company-admin-laptop-ux-upgrade-plan.md)

Index keywords: global AI navigation, artificial intelligence sidebar, AI admin tabs, running costs, chat logs, AI governance, global knowledge, AI models, AI tools, widget admin.

## Goal

The left sidebar currently exposes too many platform-level AI pages as direct submenu items under `Artificial Intelligence`.

The goal is to make the sidebar calmer and easier to scan:

```text
Artificial Intelligence
```

The AI pages should remain available, but they should move into local navigation inside the global AI workspace.

This follows the same product principle as the company workspace AI consolidation:

- the global sidebar should show broad product areas,
- workspace-level navigation should handle the pages inside that product area,
- users should learn one pattern for "open the AI area, then choose the AI section."

## Current Sidebar Problem

The current sidebar expands `Artificial Intelligence` into a long list:

- `Running Costs`
- `Chat Logs`
- `Rules`
- `System Prompt`
- `Global Knowledge`
- `Widget`
- `Models`

`Connectors` also points to `/admin/ai/tools`, but it currently lives under the broader agents/app kits part of the sidebar.

The issue is not that these pages are wrong. The issue is that all of them compete at the left-sidebar level, which makes the sidebar feel like a filing cabinet instead of a product map.

## Product Decision

Use one sidebar item:

```text
Artificial Intelligence
```

Inside the global AI workspace, use top-level tabs for major work modes:

```text
Overview | Usage | Governance | Knowledge | Widget | Models | Tools
```

Use subnavigation only where the section actually has multiple pages:

```text
Usage
- Running Costs
- Chat Logs

Governance
- Rules
- System Prompt
```

Do not create a long second row of every AI page. Do not keep the existing long sidebar submenu.

## Proposed Information Architecture

Recommended global AI workspace structure:

| Workspace tab | Child pages | Purpose |
| --- | --- | --- |
| `Overview` | None initially | Triage view for global AI posture, cost pressure, recent activity, model health, and setup gaps. |
| `Usage` | `Running Costs`, `Chat Logs` | Monitor spend, volume, model usage, and conversations. |
| `Governance` | `Rules`, `System Prompt` | Manage global AI behavior, policy, and runtime instructions. |
| `Knowledge` | `Global Knowledge` | Manage platform-level source material that is not company-specific. |
| `Widget` | `Widget` | Manage or preview global/default widget behavior if this page remains globally meaningful. |
| `Models` | `Models` | Manage providers, model availability, default model choices, and model pricing. |
| `Tools` | `Tools`, `Connectors`, detail pages | Manage AI tools, connector installations, and MCP/custom actions. |

## Route Plan

Preferred new route shape:

```txt
/admin/ai
/admin/ai/usage/costs
/admin/ai/usage/chat-logs
/admin/ai/governance/rules
/admin/ai/governance/system-prompt
/admin/ai/knowledge
/admin/ai/widget
/admin/ai/models
/admin/ai/tools
```

Nested detail routes should stay near their owning section:

```txt
/admin/ai/governance/rules/new
/admin/ai/governance/rules/:ruleId
/admin/ai/models/:modelId
/admin/ai/tools/new
/admin/ai/tools/mcp/new
/admin/ai/tools/:toolId
/admin/ai/tools/connectors/:connectorId
```

The parent route should become the overview:

```txt
/admin/ai
```

If a full overview is not ready in the first implementation slice, `/admin/ai` may temporarily redirect to `/admin/ai/usage/costs`, but the target product direction is a real overview page.

## Current Route Mapping

There is no requirement to preserve old AI URLs for user bookmarks.

However, implementation must update internal app links and tests that currently point at the old paths.

| Current route | Proposed route |
| --- | --- |
| `/admin/ai/costs` | `/admin/ai/usage/costs` |
| `/admin/ai/chat-logs` | `/admin/ai/usage/chat-logs` |
| `/admin/ai/rules` | `/admin/ai/governance/rules` |
| `/admin/ai/rules/new` | `/admin/ai/governance/rules/new` |
| `/admin/ai/rules/:ruleId` | `/admin/ai/governance/rules/:ruleId` |
| `/admin/ai/system-prompt` | `/admin/ai/governance/system-prompt` |
| `/admin/ai/global-knowledge` | `/admin/ai/knowledge` |
| `/admin/ai/widget` | `/admin/ai/widget` |
| `/admin/ai/models` | `/admin/ai/models` |
| `/admin/ai/models/:modelId` | `/admin/ai/models/:modelId` |
| `/admin/ai/tools` | `/admin/ai/tools` |
| `/admin/ai/tools/new` | `/admin/ai/tools/new` |
| `/admin/ai/tools/mcp/new` | `/admin/ai/tools/mcp/new` |
| `/admin/ai/tools/:toolId` | `/admin/ai/tools/:toolId` |
| `/admin/ai/tools/connectors/:connectorId` | `/admin/ai/tools/connectors/:connectorId` |

Routes whose proposed path is unchanged still need to participate in the new local tab active state.

## Sidebar Behavior

The sidebar should show only one AI entry:

```text
Artificial Intelligence
```

Clicking it should navigate to:

```txt
/admin/ai
```

When any route under `/admin/ai` is active:

- the sidebar `Artificial Intelligence` item is active,
- the old AI submenu items are not rendered in the sidebar,
- `Connectors` should not be duplicated elsewhere if `Tools` becomes part of the global AI workspace.

If product wants to keep `Connectors` visible under the agent/app-kit area for launch workflow reasons, it should link to the same tools workspace without creating a second canonical home.

## Local Navigation Pattern

Use tabs for the main AI workspace sections:

```text
Overview | Usage | Governance | Knowledge | Widget | Models | Tools
```

Tab behavior:

- `Overview` links to `/admin/ai`.
- `Usage` links to `/admin/ai/usage/costs` by default.
- `Governance` links to `/admin/ai/governance/rules` by default.
- `Knowledge` links to `/admin/ai/knowledge`.
- `Widget` links to `/admin/ai/widget`.
- `Models` links to `/admin/ai/models`.
- `Tools` links to `/admin/ai/tools`.

Only `Usage` and `Governance` need child subnavigation in the first pass.

Recommended child navigation:

```text
Usage: Running Costs | Chat Logs
Governance: Rules | System Prompt
```

On laptop-sized screens, prefer compact horizontal tabs or a compact section switcher rather than a left rail that steals content width.

On mobile or narrow layouts, collapse the workspace tabs into a selector.

## Naming Rules

Use `Artificial Intelligence` in the sidebar because it names the broad product area.

Use shorter labels inside the workspace:

- `Overview`
- `Usage`
- `Governance`
- `Knowledge`
- `Widget`
- `Models`
- `Tools`

Use page-level labels:

- `Running Costs`
- `Chat Logs`
- `Rules`
- `System Prompt`
- `Global Knowledge`
- `Widget`
- `Models`
- `Tools`

Avoid renaming `Running Costs` to `Costs` in this slice unless the wider product language is updated at the same time.

## Widget Open Question

Confirm whether global `Widget` still belongs in the platform AI workspace.

The company workspace already has company-specific widget configuration. Global `Widget` should remain here only if it is one of these:

- a global/default widget preview,
- platform-wide widget policy,
- a demo or simulator for AI behavior,
- cross-company widget administration.

If it is actually company-specific configuration, route users toward the company workspace widget pages instead.

## Implementation Slices

### Slice 1: Navigation Shell

- Add a global AI workspace layout with local tabs.
- Collapse the sidebar to a single `Artificial Intelligence` item.
- Keep existing page content behavior unchanged.
- Update active states for all `/admin/ai` routes.

### Slice 2: Route Reorganization

- Move `Running Costs` and `Chat Logs` under `/admin/ai/usage`.
- Move `Rules` and `System Prompt` under `/admin/ai/governance`.
- Move `Global Knowledge` to `/admin/ai/knowledge`.
- Update internal links, router pushes, and tests.
- Decide whether to leave temporary redirects for old URLs during development.

### Slice 3: Overview Page

- Build a useful `/admin/ai` overview once the shell is stable.
- Summarize global AI status, cost trend, recent chat volume, model/provider health, and governance gaps.
- Link each summary card to the relevant tab or child page.

### Slice 4: Polish And Regression Coverage

- Add or update tests for sidebar active state, workspace tab active state, and child subnavigation.
- Verify internal links from settings, launch plans, app dashboard, and AI detail pages.
- Check responsive behavior on laptop and mobile widths.
- Confirm English and Italian locale dictionary parity if new labels are introduced.

## Non-Goals

Do not redesign the underlying AI pages in this navigation slice.

Do not change AI permissions, data loading, mutations, pagination, model behavior, prompt behavior, or connector behavior.

Do not touch the frozen movement demo.

## Verification Notes

Before merging or pushing an implementation of this plan, run the repo verification gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Add focused tests where practical for:

- sidebar no longer rendering AI submenu links,
- `Artificial Intelligence` staying active for all `/admin/ai` routes,
- local AI workspace tabs setting active state correctly,
- child subnavigation for `Usage` and `Governance`,
- updated internal links to the new route structure.

## Acceptance Criteria

- The left sidebar has one `Artificial Intelligence` destination instead of the current long AI submenu.
- Global AI pages are reachable through local workspace tabs.
- `Usage` contains `Running Costs` and `Chat Logs`.
- `Governance` contains `Rules` and `System Prompt`.
- `Knowledge`, `Widget`, `Models`, and `Tools` are direct workspace tabs.
- The app has no stale internal links to removed old routes.
- Route, sidebar, and local tab active states are consistent.
- The layout remains comfortable on a 13-inch MacBook Pro width.
