# Embedded Widgets

Embedded widgets are the public chat surface implemented by `public/embed.js`, `/w/[widgetId]`, `/sandbox/[widgetId]`, admin widget setup screens, and `convex/widgets.ts`. The implementation supports global widgets, company-scoped widgets, anonymous widget threads, domain allowlists, public iframe configuration, and widget upload validation.

## Route Map

- `src/app/(dashboard)/admin/ai/widget/page.tsx` manages the primary global widget. It is super-admin-only through the admin layout and calls `api.widgets.getPrimaryGlobalWidget` and `api.widgets.saveWidget`.
- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` manages the primary company widget for a company workspace.
- `src/app/(dashboard)/admin/_features/widget-config/*` contains the shared widget configuration sections, tab helpers, preview panel, empty state, and embed snippet builder used by the company widget route.
- `src/app/(dashboard)/admin/companies/[id]/widget/_components/*` mirrors the widget section components and local tests for the company route; prefer the shared feature directory for active editor changes unless the route-local file is explicitly under test.
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
- `createWidgetThread` creates anonymous or signed-in threads for active widgets after source-origin validation and returns `{ threadId, accessToken }` for the iframe session.
- `generateWidgetUploadUrl` and `finalizeWidgetUpload` support widget attachment uploads after active-widget, thread-mapping, widget access token, quota, and upload-policy checks.

Global widget management is limited to super admins. Non-super-admin admins must supply a company id, cannot create global widgets, and must pass company access checks.

## Data Model

The `widgets` table in `convex/schema.ts` stores company/global scope, name, linked agent, domain allowlist, theme fields, visitor gates, conversation starters, active status, creator, and creation timestamp. Threads store optional `widgetId`, `widgetAccessTokenHash`, `companyId`, `agentId`, and `sourceUrl`, allowing chat logs and runtime checks to identify widget-originated conversations while requiring the browser-held widget session token for anonymous thread reads, sends, and uploads.

The public config query resolves system branding fallbacks from `systemSettings` when a widget does not specify color, logo, greeting, or placeholder values. Storage-backed logos are converted to URLs before being returned.

## Company Widget Editor

`src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` is a client route that edits the primary widget for the active company id. It loads `api.widgets.getPrimaryWidgetByCompany`, saves through `api.widgets.saveWidget`, uploads widget logos through `api.users.generateUploadUrl`, validates uploaded logos with `validateUploadFile(file, "adminImage")`, and keeps the local form state in sync with the loaded widget once the query resolves.

The editor initializes new company widgets with the current form defaults when no widget exists. Once a widget exists, the page exposes a sticky tab rail, section-specific forms, a publish button, and an appearance preview. The publish mutation always sends `isActive: true`, `isGlobal: false`, the route company id, parsed domain allowlist, theme settings, visitor gates, greeting state, sound/popup preferences, and conversation starters.

The shared widget configuration component map is:

- `src/app/(dashboard)/admin/_features/widget-config/WidgetConfigTabs.tsx` renders the sticky tab rail for `Appearance`, `Welcome Screen`, `Conversation Starters`, `Greeting`, and `Integration`.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetPanel.tsx` is the common section frame used by the company widget editor panels.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetEmptyState.tsx` shows the unconfigured-widget state and calls the same create/update handler used by publishing.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetAppearanceSection.tsx` edits the public widget name, primary color text/color inputs, logo upload/removal, input placeholder, sound notifications, and popup preview toggle.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetWelcomeSection.tsx` controls the optional first-screen name and email fields.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetConversationStartersSection.tsx` manages up to four quick-start prompts and disables adding empty entries or entries beyond the limit.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetGreetingSection.tsx` toggles the default greeting and edits its copy while disabled greetings keep the textarea inactive.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetIntegrationSection.tsx` edits authorized domains, displays the generated `<script>` snippet, handles clipboard copy feedback, and links to `/sandbox/[widgetId]` for manual testing.
- `src/app/(dashboard)/admin/_features/widget-config/WidgetPreviewPanel.tsx` renders the sticky appearance preview, including the collapsed launcher, popup greeting, visitor gate fields, greeting message, starter prompts when greetings are off, logo preview, and placeholder text.
- `src/app/(dashboard)/admin/_features/widget-config/types.ts` defines the shared tab union and logo upload handler type.
- `src/app/(dashboard)/admin/_features/widget-config/widgetConfigUtils.ts` owns the tab list, comma-separated domain parsing, embed snippet generation, local logo preview URL handling, and conversation starter add guard.

The company editor intentionally separates browser-only editing state from Convex validation. Frontend parsing and disabled controls improve the admin experience, but Convex remains responsible for tenant checks, global-widget restrictions, origin enforcement, audit logs, and widget-thread credentials.

## Origin And Tenant Controls

The public iframe performs a browser-side referrer check before posting popup configuration to the parent page. This improves host-page behavior but is not the security boundary.

The security boundary is `createWidgetThread`:

- inactive or missing widgets are rejected
- `*` allows all origins
- an empty allowlist does not authorize backend thread creation; configure `*` explicitly for broad testing or add concrete hostnames for production
- non-empty allowlists require an absolute `http://` or `https://` source URL
- URLs with credentials or invalid syntax are rejected
- exact hosts and subdomains of allowlisted hosts are accepted
- rejected attempts write `BLOCKED_WIDGET_ACCESS` audit logs

Widget threads inherit the widget company id and linked agent id. The chat message send path receives `dynamicAgentId` from the iframe when the widget has an agent, but anonymous widget conversations cannot switch to a different agent after the thread is created. If the supplied dynamic agent would change the thread's agent id, `api.chat.sendMessage` rejects the request instead of patching the thread.

`createWidgetThread` generates a high-entropy access token, stores only its SHA-256 hash on the thread, and returns the raw token to the iframe session. The iframe stores the thread id and raw token in widget-specific localStorage keys, `sonae_widget_{widgetId}_thread` and `sonae_widget_{widgetId}_token`. If only one value is present on load, the iframe clears the partial session and creates a fresh thread/token pair before sending messages.

Anonymous widget calls into chat access helpers must pass the raw token as `widgetAccessToken`; otherwise `canAccessThread` returns false and `assertCanAccessThread` throws `Unauthorized: Invalid widget session`. This prevents a visitor who learns a thread id from reading or writing that widget thread without the browser-held session credential.

## Upload Policy

Widget uploads are deliberately narrower than normal authenticated uploads:

- the widget must exist and be active
- the target thread must belong to the widget
- the caller must present the matching widget access token for that thread
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
