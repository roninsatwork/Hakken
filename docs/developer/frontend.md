# Frontend Development

Sonae's frontend is a Next.js App Router application with authenticated dashboard routes, super-admin routes, public widget routes, and a small number of support pages. This guide covers current layout, styling, component, and verification expectations.

Read this with [Shared Admin UI](./shared-admin-ui.md), [Architecture](./architecture.md), and the feature-specific guide before adding or changing UI.

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

`src/ui/components/layout/SidebarNavigation.tsx` maps route prefixes to active items and renders the app/admin navigation groups. It also handles impersonation exit, diagnostic routing visibility, arcade navigation, movement demo visibility, organization routes, and admin sections. When adding a durable route, update sidebar active-route logic and navigation copy in the same change.

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

## Shared Components

Prefer existing shared components before creating page-local variants:

- Feedback: `SonaeModal`, `SonaeEmptyState`, admin modal and confirmation wrappers.
- Admin tables and layouts: `src/app/(dashboard)/admin/_components/**`.
- Chat: `src/ui/components/chat/ChatInput.tsx`, `src/ui/components/chat/ChatMessage.tsx`, `src/ui/components/chat/ChatHistoryList.tsx`, `src/ui/components/chat/SonaeMarkdown.tsx`, and `src/ui/components/chat/SwarmStatusCard.tsx`.
- Charts: `src/ui/components/charts/ChartExportWrapper.tsx`.
- Workflows: `WorkflowSidebar`, `ConfigDrawer`, `AgentEditorModal`, node components, and workflow types.
- Settings: `JsonSchemaBuilder`, settings sections, white-label components.
- Navigation: `Header`, `SidebarNavigation`, `src/ui/components/layout/ThemeToggle.tsx`, and `src/ui/components/TimeframeDropdown.tsx`.

`src/ui/components/layout/AnalyticsProvider.tsx` is mounted by the root layout and selects Google Tag Manager for ids starting with `GTM-`, or Google Analytics for ids starting with `G-` or `AW-`. `src/ui/components/layout/FluidBackground.tsx` is used by the public landing and login routes for the animated background layer.

`src/app/(dashboard)/demos/movements/_components/Robot.tsx` is the generated `gltfjsx` component for the frozen movement demo; keep it inside that demo boundary. `src/ui/components/header.tsx` and `src/ui/components/footer.tsx` are legacy public-shell components and are not the authenticated dashboard header/footer. Prefer `src/ui/components/layout/Header.tsx` and the route-specific dashboard shell for active app work.

Use Lucide icons for recognizable commands and keep icon buttons labelled with `aria-label` or `title`. Avoid native `alert`, `confirm`, and `prompt`; use Sonae modal or inline feedback patterns.

## Data And State

Frontend data access uses `convex/react` hooks:

- `useQuery` for live reads.
- `usePaginatedQuery` for paginated feeds.
- `useMutation` for Convex writes.
- `useAction` for action calls such as provider-backed helpers.

Always treat `undefined` query results as loading. Do not interpret loading as an empty state. For tenant-scoped routes, let backend authorization own the real boundary and render user-friendly loading, empty, or error states without exposing cross-company details.

Uploads should use the central upload policies in `src/lib/constants/uploads.ts` and the relevant Convex upload URL mutation. Do not add direct browser-to-third-party upload paths for product data without a documented security decision.

Shared frontend helpers should stay boring and reusable. `src/hooks/useDebounce.ts` is the shared delayed-search hook used by admin search surfaces. `src/hooks/useProgressiveLoading.ts` is the localized staged-loading text helper used by assistant composer states. `src/lib/chatTelemetry.ts` contains display-only token and approximate GBP chat-cost helpers for chat-log screens; it uses simple model-name heuristics and fixed rates, so do not treat it as billing authority. `src/lib/convexHttpActionsUrl.ts` resolves the Convex HTTP Actions site origin for workflow webhook examples from `CONVEX_SITE_URL`, with the `.cloud` to `.site` fallback kept only for default Convex deployments.

## Localization

User-visible dashboard copy is localized through `next-intl` and dictionaries in `messages/en.json` and `messages/it.json`. `src/i18n/request.ts` reads the `locale` cookie, defaults to `en`, and imports the matching message dictionary for `NextIntlClientProvider` in `src/app/layout.tsx`. The profile preferences UI writes that cookie and reloads the page when the user switches between English and Italian.

When editing localized UI, keep English and Italian keys in parity. `src/i18n.test.ts` verifies the message key structures match exactly. Some older pages still contain inline strings; reduce drift when touching those pages instead of expanding hardcoded copy.

The current root layout still renders `<html lang="en">` even when `next-intl` resolves another locale. Treat that as accessibility/i18n implementation debt: do not document dynamic HTML language metadata as live until the layout binds the resolved locale to the `lang` attribute.

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
