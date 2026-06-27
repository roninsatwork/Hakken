# Embedded Widgets

Embedded widgets are the public chat surface implemented by `public/embed.js`, `/w/[widgetId]`, `/sandbox/[widgetId]`, admin widget setup screens, and `convex/widgets.ts`. The implementation supports global widgets, company-scoped widgets, anonymous widget threads, domain allowlists, public iframe configuration, and widget upload validation.

## Route Map

- `src/app/(dashboard)/admin/ai/widget/page.tsx` manages the primary global widget. It is super-admin-only through the admin layout and calls `api.widgets.getPrimaryGlobalWidget` and `api.widgets.saveWidget`.
- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` manages the primary company widget for a company workspace.
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/*` contains the company widget configuration sections and embed snippet builder.
- `src/app/w/[widgetId]/page.tsx` renders the public iframe chat experience.
- `src/app/sandbox/[widgetId]/page.tsx` injects `public/embed.js` into a simulated page for manual verification.
- `public/embed.js` is the host-page script. It injects styles, creates the fixed-position widget container, opens the iframe, receives `SONAE_WIDGET_CONFIG`, and applies popup/color behavior.

## Convex API

`convex/widgets.ts` owns widget persistence and public thread creation:

- `getWidgetsByCompany` lists widgets for an admin-accessible company.
- `getPrimaryWidgetByCompany` returns the latest company widget by creation time.
- `getGlobalWidgets` and `getPrimaryGlobalWidget` are super-admin-only global widget queries.
- `getWidgetById` is public and returns only iframe-safe configuration for active widgets.
- `saveWidget` creates or updates widgets and writes `CREATE_WIDGET` or `UPDATE_WIDGET` audit logs.
- `deleteWidget` deletes widgets and writes `DELETE_WIDGET` audit logs.
- `createWidgetThread` creates anonymous or signed-in threads for active widgets after source-origin validation.
- `generateWidgetUploadUrl` and `finalizeWidgetUpload` support widget attachment uploads after active-widget, thread-mapping, quota, and upload-policy checks.

Global widget management is limited to super admins. Non-super-admin admins must supply a company id, cannot create global widgets, and must pass company access checks.

## Data Model

The `widgets` table in `convex/schema.ts` stores company/global scope, name, linked agent, domain allowlist, theme fields, visitor gates, conversation starters, active status, creator, and creation timestamp. Threads store optional `widgetId`, `companyId`, `agentId`, and `sourceUrl`, allowing chat logs and runtime checks to identify widget-originated conversations.

The public config query resolves system branding fallbacks from `systemSettings` when a widget does not specify color, logo, greeting, or placeholder values. Storage-backed logos are converted to URLs before being returned.

## Origin And Tenant Controls

The public iframe performs a browser-side referrer check before posting popup configuration to the parent page. This improves host-page behavior but is not the security boundary.

The security boundary is `createWidgetThread`:

- inactive or missing widgets are rejected
- `*` allows all origins
- non-empty allowlists require an absolute `http://` or `https://` source URL
- URLs with credentials or invalid syntax are rejected
- exact hosts and subdomains of allowlisted hosts are accepted
- rejected attempts write `BLOCKED_WIDGET_ACCESS` audit logs

Widget threads inherit the widget company id and linked agent id. The chat message send path receives `dynamicAgentId` from the iframe when the widget has an agent.

## Upload Policy

Widget uploads are deliberately narrower than normal authenticated uploads:

- the widget must exist and be active
- the target thread must belong to the widget
- a thread can have at most ten messages with attachments
- stored uploads are validated by `validateWidgetAttachmentMetadata`

Do not bypass these checks from the frontend. Anonymous visitors can reach this flow, so validation belongs in Convex.

## Tests

Current coverage lives mainly in:

- `convex/widgets.test.ts` for widget auth, global/company scoping, public config, origin enforcement, upload quota, and upload finalization
- `src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx` for company widget save and copy behavior
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/*.test.tsx` for section behavior and snippet building
- settings tests that treat widgets as white-label and domain-readiness evidence

When changing widget behavior, update both backend tests and route/component tests. Keep the movement demo freeze unrelated; widget work should not touch frozen movement files.

## Maintenance Notes

The embed script is plain browser JavaScript and runs on customer pages. Preserve host-page isolation: fixed container, iframe boundary, strict `postMessage` origin checks, and no dependency on the customer site's JavaScript framework.

If domain matching changes, update `public/embed.js`, `src/app/w/[widgetId]/page.tsx`, `convex/widgets.ts`, and tests together. The browser checks and backend checks should stay conceptually aligned, while Convex remains the authoritative guard.
