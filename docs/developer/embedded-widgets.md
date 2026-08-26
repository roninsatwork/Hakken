# Embedded Widgets

Embedded widgets are the public chat surface implemented by `public/embed.js`, `/w/[widgetId]`, `/sandbox/[widgetId]`, admin widget setup screens, `src/proxy.ts`, `convex/utils/widgetEmbedPass.ts`, `convex/utils/widgetOriginPolicy.ts`, and `convex/widgets.ts`. The implementation supports global widgets, company-scoped widgets, anonymous widget threads, server-minted embed passes, per-widget `frame-ancestors`, domain allowlists, public iframe configuration, widget photo upload validation, and photo-action confirmation through shared chat/task infrastructure.

## Route Map

- `src/app/(dashboard)/admin/ai/widget/page.tsx` manages the primary global widget. It is super-admin-only through the admin layout and calls `api.widgets.getPrimaryGlobalWidget` and `api.widgets.saveWidget`.
- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` manages the primary company widget for a company workspace.
- `src/app/(dashboard)/admin/_features/widget-config/*` contains the shared widget configuration sections, tab helpers, preview panel, empty state, embed snippet builder, and their tests. Both the global and the company widget route import from here; it is the only copy. A byte-for-byte duplicate of these components once sat under the company route at `_components/`, unimported and carrying the only tests, and was removed on 2026-08-17. Edit the shared files, and do not reintroduce a route-local copy.
- `src/app/w/[widgetId]/page.tsx` renders the public iframe chat experience server shell, reads the request referrer, and mints the signed widget embed pass passed into the client.
- `src/app/w/[widgetId]/WidgetIframeClient.tsx` owns the public chat client, including photo staging, upload, thumbnail display, visitor-facing photo-action confirmation, and `createWidgetThread` calls with the embed pass.
- `src/app/sandbox/[widgetId]/page.tsx` injects `public/embed.js` into a simulated page for manual verification.
- `public/embed.js` is the host-page script. It injects styles, creates the fixed-position widget container, opens the iframe, receives `SONAE_WIDGET_CONFIG`, and applies popup/color behavior.
- `src/proxy.ts` applies the per-widget enforcing `Content-Security-Policy: frame-ancestors ...` header for `/w/[widgetId]`.
- `src/app/kiosk/[widgetId]/page.tsx` is not the embedded iframe. It is the full-screen Receptionist screen that reuses widget identity and anonymous tokens; see [Receptionist Screen](./receptionist-screen.md).

## Convex API

`convex/widgets.ts` owns widget persistence and public thread creation:

- `getWidgetsByCompany` lists widgets for an admin-accessible company.
- `getPrimaryWidgetByCompany` returns the latest company widget by creation time.
- `getGlobalWidgets` and `getPrimaryGlobalWidget` are super-admin-only global widget queries.
- `getWidgetById` is public and returns only iframe-safe configuration for active widgets.
- `saveWidget` creates or updates widgets and writes `CREATE_WIDGET` or `UPDATE_WIDGET` audit logs.
- `deleteWidget` deletes widgets and writes `DELETE_WIDGET` audit logs.
- `createWidgetThread` creates anonymous or signed-in threads for active widgets after embed-pass verification, allowlist validation, and hourly thread minting checks, then returns either `{ threadId, accessToken }` or a refusal value for the iframe session.
- `generateWidgetUploadUrl` and `finalizeWidgetUpload` support widget attachment uploads after active-widget, thread-mapping, widget access token, quota, and upload-policy checks.

Global widget management is limited to super admins. Non-super-admin admins must supply a company id, cannot create global widgets, and must pass company access checks.

## Data Model

The `widgets` table in `convex/schema.ts` stores company/global scope, name, linked agent, domain allowlist, theme fields, visitor gates, conversation starters, active status, creator, and creation timestamp. Threads store optional `widgetId`, `widgetAccessTokenHash`, `companyId`, `agentId`, and `sourceUrl`, allowing chat logs and runtime checks to identify widget-originated conversations while requiring the browser-held widget session token for anonymous thread reads, sends, and uploads.

The public config query resolves system branding fallbacks from `systemSettings` when a widget does not specify color, logo, greeting, or placeholder values. Storage-backed logos are converted to URLs before being returned.

## Company Widget Editor

`src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` is a client route that edits the primary widget for the active company id. It loads `api.widgets.getPrimaryWidgetByCompany`, saves through `api.widgets.saveWidget`, uploads widget logos through `api.users.generateUploadUrl`, validates uploaded logos with `validateUploadFile(file, "adminImage")`, and keeps the local form state in sync with the loaded widget once the query resolves.

The editor initializes new company widgets with the current form defaults when no widget exists. Once a widget exists, the page exposes a sticky tab rail, section-specific forms, a publish button, and an appearance preview. The publish mutation always sends `isActive: true`, `isGlobal: false`, the route company id, parsed domain allowlist, theme settings, visitor gates, greeting state, sound/popup preferences, and conversation starters.

The shared widget configuration component map is:

- `src/app/(dashboard)/admin/_features/widget-config/WidgetConfigScreen.tsx` renders the sticky tab rail for `Appearance`, `Welcome Screen`, `Conversation Starters`, `Greeting`, and `Integration`.
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

The first browser-enforced boundary is `src/proxy.ts`, which queries public
widget config and emits an enforcing `frame-ancestors` directive for
`/w/[widgetId]`. Unknown widgets, inactive widgets, and disallowed referrers are
served with a refusal response instead of a permissive frame policy.

The backend session boundary is `createWidgetThread`:

- inactive or missing widgets are rejected
- `WIDGET_EMBED_SIGNING_SECRET` must be configured or sessions fail closed
- `/w/[widgetId]` must have minted a signed embed pass for the same widget
- malformed, expired, wrong-widget, or bad-signature passes are refused
- the pass carries the server-observed referrer host, or `null` for a direct open
- `*` allows all origins
- an empty allowlist does not authorize backend thread creation; configure `*` explicitly for broad testing or add concrete hostnames for production
- a direct open with no referrer is only allowed when the widget allows every domain
- exact hosts and subdomains of allowlisted hosts are accepted
- rejected attempts return `{ refused: "unauthorized" }` and write `BLOCKED_WIDGET_ACCESS` audit logs
- per-widget thread minting is capped at 120 threads per hour; excess attempts
  return `{ refused: "busy" }` and log `RATE_LIMITED_WIDGET_THREADS` once per
  window

Widget threads inherit the widget company id and linked agent id. The chat message send path receives `dynamicAgentId` from the iframe when the widget has an agent, but anonymous widget conversations cannot switch to a different agent after the thread is created. If the supplied dynamic agent would change the thread's agent id, `api.chat.sendMessage` rejects the request instead of patching the thread.

Company message allocation still applies to anonymous widget threads, but `quotaRefusalMessage` must not expose tenant billing state to a public visitor. It returns the generic temporary-unavailability copy for an anonymous widget and the explicit allocation/admin guidance only for signed-in app threads. PII redaction runs before the quota gate so even a refused user message is stored in masked form when the firewall is enabled.

Quota notices carry `systemKey: "quotaRefusal"`. `src/lib/widgetSystemMessages.ts` translates that platform-authored message from `navigator.language` because anonymous visitors do not have the app's locale cookie. Italian is implemented; unknown keys and languages fall back to stored English. Keep this dictionary limited to platform messages and never run model output through it.

`createWidgetThread` generates a high-entropy access token, stores only its SHA-256 hash on the thread, and returns the raw token to the iframe session. The iframe stores the thread id and raw token in widget-specific localStorage keys, `sonae_widget_{widgetId}_thread` and `sonae_widget_{widgetId}_token`. If only one value is present on load, the iframe clears the partial session and creates a fresh thread/token pair before sending messages.

Anonymous widget calls into chat access helpers must pass the raw token as `widgetAccessToken`; otherwise `canAccessThread` returns false and `assertCanAccessThread` throws `Unauthorized: Invalid widget session`. This prevents a visitor who learns a thread id from reading or writing that widget thread without the browser-held session credential.

The embed pass is not an unforgeable proof of browser origin. A caller can send
a forged `Referer` while fetching `/w/[widgetId]`. Its job is narrower: force
thread creation through the served page, bind the mutation to a signed
server-observed host, make direct mutation calls refusable, and leave audit
evidence. Keep that limitation explicit when changing this path.

## Receptionist Screen Opt-In

The widget Integration section also controls `kioskEnabled`. When enabled, the
same widget can be opened at `/kiosk/[widgetId]` as a full-screen spoken
Receptionist screen. That path reuses the widget company, agent, branding, and
anonymous token model, but it does not use the iframe route, embed script,
frame-ancestor policy, or embed pass because it is opened on Sonae's own
top-level origin. See [Receptionist Screen](./receptionist-screen.md) for the
kiosk-specific Convex functions, limits, relay behavior, and tests.

## Upload Policy

Widget uploads are deliberately narrower than normal authenticated uploads:

- the widget must exist and be active
- the target thread must belong to the widget
- the caller must present the matching widget access token for that thread
- a thread can have at most ten messages with attachments
- stored uploads are validated by `validateWidgetAttachmentMetadata`

Do not bypass these checks from the frontend. Anonymous visitors can reach this flow, so validation belongs in Convex.

The iframe calls `generateWidgetUploadUrl`, uploads the image file to Convex
storage, finalizes the upload, and then sends the message with the resulting
storage id. A photo-only message is valid. The widget route renders image
attachments from `api.chat.getMessages` and renders `PhotoActionChip` when an
assistant reply includes `messages.photoActionProposal`.

Photo-action confirmation calls `api.tasks.confirmPhotoAction` with the raw
widget access token. The task text is read from the stored proposal on the
assistant message, not from the browser. The anonymous task is assigned through
the same inbound handoff helper used by telephony. See
[Photo Actions](./photo-actions.md) before changing this path.

## Tests

Current coverage lives mainly in:

- `convex/widgets.test.ts` for widget auth, global/company scoping, public config, origin enforcement, upload quota, and upload finalization
- `src/lib/widgetEmbedPolicy.test.ts` and `convex/utils/widgetOriginPolicy.test.ts` for host parsing, frame-ancestor decisions, wildcard handling, direct-open behavior, and suffix-lookalike rejection
- `convex/agentRuntime.test.ts`, `convex/photoActionService.test.ts`, and task tests for image-bearing widget turns and photo-action confirmation
- `src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx` for company widget save and copy behavior
- `src/app/(dashboard)/admin/_features/widget-config/*.test.tsx` for section behavior and snippet building
- `convex/kiosk.test.ts` and widget Integration section tests for the Receptionist screen opt-in and full-screen kiosk behavior
- settings tests that treat widgets as white-label and domain-readiness evidence

When changing widget behavior, update both backend tests and route/component tests. Keep the movement demo freeze unrelated; widget work should not touch frozen movement files.

## Maintenance Notes

The embed script is plain browser JavaScript and runs on customer pages. Preserve host-page isolation: fixed container, iframe boundary, strict `postMessage` origin checks, and no dependency on the customer site's JavaScript framework.

If domain matching or embed-pass behavior changes, update `src/proxy.ts`,
`src/lib/widgetEmbedPolicy.ts`, `convex/utils/widgetOriginPolicy.ts`,
`convex/utils/widgetEmbedPass.ts`, `src/app/w/[widgetId]/page.tsx`,
`src/app/w/[widgetId]/WidgetIframeClient.tsx`, `convex/widgets.ts`, and tests
together. The browser-enforced frame policy, server-minted pass, and Convex
checks should stay conceptually aligned, while Convex remains the authoritative
session guard.
