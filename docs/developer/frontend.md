# Frontend Development

Sonae's frontend is a Next.js App Router application with authenticated dashboard routes, super-admin routes, public widget routes, and a small number of support pages. This guide covers current layout, styling, component, and verification expectations.

Read this with [Screen Kit](./screen-kit.md), [Architecture](./architecture.md), and the feature-specific guide before adding or changing UI.

## Route Structure

Primary UI lives under `src/app/`:

- `src/app/(public)/page.tsx`: public landing page with marketing copy, public product sections, and `/login` entry links.
- `src/app/(dashboard)/app/**`: authenticated customer workspace routes.
- `src/app/(dashboard)/admin/**`: super-admin platform routes.
- `src/app/(dashboard)/demos/**`: frozen temporary movement demo routes.
- `src/app/login/page.tsx`: public sign-in.
- `src/app/w/[widgetId]/page.tsx`: public widget iframe.
- `src/app/sandbox/[widgetId]/page.tsx`: widget sandbox host page.
- `src/app/local-test-auth/page.tsx`: local E2E support route.

Dashboard routes share layout context, sidebar state, system settings, theme, and Convex auth state. Do not create a parallel app shell for normal feature pages unless the feature has a documented reason, such as the temporary movement demo's immersive presentation routes.

## Shell And Navigation

The root application layout in `src/app/layout.tsx` wraps the app in `ThemeProvider`, `ConvexClientProvider`, `SystemSettingsProvider`, and `UIProvider`.

`src/ui/providers/ThemeProvider.tsx` is a thin `next-themes` wrapper using the `class` attribute, system default theme, and system theme support. Use it as the top-level theme provider rather than mounting another `next-themes` provider inside feature routes.

`src/context/ConvexClientProvider.tsx` owns the browser Convex client wrapper. Normal runtime uses Convex Auth's Next.js provider, while the local E2E path can bypass the real client when `NEXT_PUBLIC_E2E_AUTH_ENABLED=1` so deterministic mocks can provide app data.

`src/context/UIContext.tsx` stores global shell UI state, currently `isLoading` and `isSidebarOpen`. `Header`, `SidebarNavigation`, and `FluidWorkspace` consume `useUI` for sidebar open/close behavior. Keep this context small and shell-oriented; feature-specific loading, form, modal, and table state should stay local to the feature surface.

`src/ui/components/layout/FluidWorkspace.tsx` is the root dashboard content shell. It animates left padding based on sidebar state, owns the scrollable viewport, and provides the default `p-8` content padding.

`src/ui/components/layout/Header.tsx` is the sticky top bar used by app and admin pages. It records best-effort login metadata once per browser session, exposes profile/admin/dashboard/logout actions, and uses hard navigation on logout to avoid stale deep-route auth state.

`src/ui/components/layout/SidebarNavigation.tsx` is the sidebar shell. It maps route prefixes to active items, holds the open/closed state of each section, handles impersonation exit and the workspace switcher, and chooses which of the two navigation trees to render. It also defines the shared `NavItem` and `SubNavItem` parts the trees are built from.

The trees themselves are `AdminNavTree` and `UserNavTree` in `src/ui/components/layout/SidebarNavTrees.tsx`. That is where the links live, and with them diagnostic routing visibility, arcade navigation, movement demo visibility, organization routes, and admin sections. When adding a durable route, add the link to the right tree and the active-route mapping in the shell, with navigation copy, in the same change.

`src/app/(dashboard)/app/page.tsx` is the authenticated app dashboard. It is a localized product-overview route with assistant, platform-depth, hosting-positioning, assurance, governance, benefit, and use-case sections. Its primary action routes to `/app/assistant`; the benefits action routes super admins to `/admin/ai/costs` and other users to `/app/reports`. The page redirects super admins to `/admin` once per browser session through `sessionStorage.admin_redirected`; treat that as a convenience redirect only, not an authorization boundary. If dashboard copy changes, keep the `dashboard` namespace in `messages/en.json` and `messages/it.json` in parity.

## Theme And Styling

Global styling lives in `src/app/globals.css`. Tailwind CSS v4 uses CSS theme variables backed by runtime CSS variables such as:

- `--bg-main`, `--bg-sidebar`, `--bg-card`, and `--bg-hover`
- `--text-primary`, `--text-secondary`, and `--text-muted`
- `--border-subtle`
- `--color-brand`, `--color-success`, `--color-destructive`, and `--color-ring`

`postcss.config.mjs` wires Tailwind through `@tailwindcss/postcss`. Keep PostCSS config minimal unless a new build-time CSS transform is intentionally introduced and documented.

System settings can override branding, fonts, colors, and text sizing in supported surfaces. Keep new UI on these tokens instead of hardcoding a separate palette.

Use dense, scannable layouts for operational screens. Admin and SaaS surfaces should prioritize tables, tabs, forms, filters, and compact evidence over decorative hero sections. Cards should represent repeated items or framed tools, not every page section.

## File Naming

Component files are **PascalCase**, matching the component they export:
`Button.tsx`, `KnowledgeManager.tsx`, `SidebarNavTrees.tsx`. Hooks keep their
own convention (`useAdminAction.ts` — the `use` prefix is the rule), and Next's
structural names (`page.tsx`, `layout.tsx`, kebab-case route segments) are the
framework's, not ours.

Measured on 2026-08-26, of the component files the rule governs — non-test
`.tsx` under `src/` — 230 were PascalCase against 7 stragglers, alongside 202
structural names. So the rule writes down what had already won rather than
imposing something new. (An earlier figure of 302 counted test files, which the
guard excludes; it described a different population from the one being ruled
on.)

`src/file-naming-drift.test.ts` enforces it: the seven pre-rule files are
frozen on a shrink-only list, and any new non-conforming file fails the build.
The structural exemption applies inside `src/app/` only — outside the router
tree, `error.tsx` or `template.tsx` is an ordinary component with an ordinary
name, and is held to the rule like any other.

## Shared Components

Prefer existing shared components before creating page-local variants:

- Feedback: `SonaeModal`, `SonaeEmptyState`, admin modal and confirmation wrappers.
- Admin tables and layouts: `src/app/(dashboard)/admin/_components/**` — genuinely
  admin-only parts. A `/app` route must not import from here, and ESLint now
  refuses it: a customer-facing page reaching into an admin folder is the
  boundary this guide always described and nothing enforced. If a part turns out
  to serve both halves, promote it rather than importing across.
- Governance, shared by both halves: `src/ui/components/governance/**`
  (`GovernanceDashboard`, `EvidencePackPanel`, `PersonalDataPanel`,
  `AuditLogsTable` and the activity chart parts). These moved out of
  `admin/_components` on 2026-08-25 because the `/app` governance pages had been
  reaching in for them.
- Chat: `src/ui/components/chat/ChatInput.tsx`, `src/ui/components/chat/ChatMessage.tsx`, `src/ui/components/chat/ChatHistoryList.tsx`, `src/ui/components/chat/SonaeMarkdown.tsx`, and `src/ui/components/chat/SwarmStatusCard.tsx`.
- Charts: `src/ui/components/charts/ChartExportWrapper.tsx` and
  `src/ui/components/charts/ChartTooltip.tsx`.
- Workflows: `WorkflowSidebar`, `ConfigDrawer` and the three files holding its node-type field sets (`ConfigDrawerEntryPanels`, `ConfigDrawerDataPanels`, `ConfigDrawerHumanPanels`), `AgentEditorModal`, node components, and workflow types.
- Settings: `JsonSchemaBuilder`, settings sections, white-label components.
- Navigation: `Header`, `SidebarNavigation` with the `SidebarNavTrees` it renders, and the workspace switcher in the sidebar. Theme selection lives in the profile's preferences, not a standalone toggle.

`src/ui/components/layout/AnalyticsProvider.tsx` is mounted by the root layout and selects Google Tag Manager for ids starting with `GTM-`, or Google Analytics for ids starting with `G-` or `AW-`. 

The movement demo's generated `gltfjsx` avatar components live inside the demo boundary; keep them there. The authenticated dashboard header is `src/ui/components/layout/Header.tsx`; the old public-shell `header.tsx`/`footer.tsx` pair no longer exists.

Use Lucide icons for recognizable commands and keep icon buttons labelled with `aria-label` or `title`. Avoid native `alert`, `confirm`, and `prompt`; use Sonae modal or inline feedback patterns.

## Chart Exporting And The Tailwind v4 Oklab Constraint

`ChartExportWrapper` (`src/ui/components/charts/ChartExportWrapper.tsx`) exports charts by rasterizing the DOM node to a PNG with `html2canvas`. That library parses computed CSS itself, and it cannot parse `color-mix(in oklab, ...)` values. Tailwind v4 compiles opacity shorthands on custom-variable colors — `bg-card/20`, `text-primary/50`, and similar — into exactly those `color-mix(in oklab, ...)` expressions, so a single such class inside an exported node crashes the export.

The rule: anything rendered inside an exported boundary must avoid custom-variable opacity shorthands. Use a standard opacity utility (`opacity-60`) or an explicit hex-with-alpha color instead. Grep for `ChartExportWrapper` usages before restyling chart panels to know whether a component sits inside an export boundary.

## Chart Tooltips

Use `ChartTooltip` for Recharts hover readouts unless a chart needs a custom row
layout. It leads with the formatted number, follows with a human series label,
can hide empty stacked rows, and avoids leaking raw data keys such as
`companies : 6` into the UI. Use `ChartTooltipSurface` when the row layout is
custom but the panel surface should stay consistent.

Use the exported cursor constants instead of page-local hover styling:

- `CHART_CURSOR` for bar cursor bands.
- `CHART_CROSSHAIR` for line and area chart crosshairs.
- `CHART_ACTIVE_BAR` for the active bar outline.

These constants use theme variables, so they remain legible in both light and
dark modes.

## Data And State

Frontend data access uses `convex/react` hooks:

- `useQuery` for live reads.
- `usePaginatedQuery` for paginated feeds.
- `useMutation` for Convex writes.
- `useAction` for action calls such as provider-backed helpers.

Always treat `undefined` query results as loading. Do not interpret loading as an empty state. For tenant-scoped routes, let backend authorization own the real boundary and render user-friendly loading, empty, or error states without exposing cross-company details.

Uploads should use the central upload policies in `src/lib/constants/uploads.ts` and the relevant Convex upload URL mutation. Do not add direct browser-to-third-party upload paths for product data without a documented security decision.

Shared frontend helpers should stay boring and reusable. `src/hooks/useDebounce.ts` is the shared delayed-search hook used by admin search surfaces. `src/hooks/useSmoothStreamText.ts` owns the display-only progressive reveal used by dashboard and embedded-widget assistant replies; its pure pacing rules live in `src/lib/streamReveal.ts`, while completed history renders immediately. `src/lib/chatTelemetry.ts` contains display-only token and approximate GBP chat-cost helpers for chat-log screens; it uses simple model-name heuristics and fixed rates, so do not treat it as billing authority. `src/lib/convexHttpActionsUrl.ts` resolves the Convex HTTP Actions site origin for workflow webhook examples from `CONVEX_SITE_URL`, with the `.cloud` to `.site` fallback kept only for default Convex deployments.

### The React Compiler Bails Out Of A Component With try/catch/finally

A `try/catch` or `try/finally` anywhere in a component makes
`eslint-plugin-react-hooks` stop analysing that component, which silences
`react-hooks/purity` and `react-hooks/set-state-in-effect` for the whole file.
Take the block away — migrating a hand-rolled error path onto `useAdminAction`,
for instance — and every violation it was masking lights up at once. Nine files
hit this on 2026-08-26.

They are pre-existing bugs, not new ones, and both rules are `error` here with
no suppression comment anywhere in `src/`. The three fixes that already have
precedent in this codebase:

- Seeding state from a prop or query in an effect → derive the value instead,
  or adopt it during render behind a sentinel (`useSystemSettingsForm.ts`).
- `useState(0)` plus a `value || Date.now()` fallback → `useState(() => Date.now())`.
- A helper used by an effect but declared below it → hoist it to module level.

**A render-time sentinel must be a stable value, not the object.** Keying on the
document itself re-seeds the form on every server change, overwriting whatever
the person is typing — and against any caller that returns a fresh object per
read it never settles at all, which rendered the model pricing screen until
React gave up. Key on the record's id.

## Localization

User-visible dashboard copy is localized through `next-intl` and dictionaries in `messages/en.json` and `messages/it.json`. `src/i18n/request.ts` reads the `locale` cookie, defaults to `en`, and imports the matching message dictionary for `NextIntlClientProvider` in `src/app/layout.tsx`. The profile preferences UI writes that cookie and reloads the page when the user switches between English and Italian.

When editing localized UI, keep English and Italian keys in parity. `src/i18n.test.ts` verifies the message key structures match exactly. Some older pages still contain inline strings; reduce drift when touching those pages instead of expanding hardcoded copy.

`src/app/layout.tsx` binds the resolved locale to `<html lang>` — the same value it hands `NextIntlClientProvider`, so the two cannot disagree. It rendered a hardcoded `"en"` until 2026-08-26.

## Responsive And Accessibility Rules

Keep tables horizontally scrollable when dense data cannot fit. Use stable dimensions for toolbars, icon buttons, board/grid cells, and repeated cards so hover states and dynamic labels do not shift layout.

Buttons, links, and row actions should be keyboard-reachable and labelled. Destructive actions should use confirmation modals. Text inside buttons and compact cards should fit at mobile and desktop widths without overlap.

## Testing And Verification

Frontend tests use Vitest, Testing Library, and jsdom. E2E tests use Playwright.

Focused areas include:

- shell and theme tests under `src/ui/components/layout/`
- admin table/modal/detail tests under `src/app/(dashboard)/admin/_components/`
- chat component and assistant page tests
- workflow component and schedule builder tests
- settings and white-label component tests
- feature page tests beside their routes
- Playwright specs under `e2e/`

Before merging UI implementation changes, run the local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For documentation-only changes, this automation runs Markdown link validation and `git diff --check`.
