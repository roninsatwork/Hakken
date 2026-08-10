# System Settings And Branding Developer Guide

System settings are Sonae's global configuration surface for platform identity, logos, email sender defaults, theme tokens, diagnostic routing, audit/PII controls, and analytics tracking. The implementation is split across the `systemSettings` table for branding and visual/runtime options, and the `systemConfig` table for keyed operational values such as system prompt, analytics id, and PII redaction.

Read this before changing `convex/settings.ts`, `convex/settingsService.ts`, `convex/system.ts`, `convex/systemService.ts`, `src/context/SystemSettingsContext.tsx`, the settings screens under `src/app/(dashboard)/admin/settings/(system)/`, or the settings page components. For email sender resolution, see [Email Branding](./email-branding.md). For platform operations settings around API keys, webhooks, health, purges, diagnostics, and maintenance scripts, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `/admin/settings` renders the main system settings page for identity, appearance, security, audit, purges, and options.
- `/admin/settings?tab=identity` manages platform name, light logo, dark logo, email sender name, and email sender address.
- `/admin/settings?tab=appearance` manages typography, brand color, and light/dark theme color tokens.
- `/admin/settings?tab=security` manages PII redaction settings and the older audit purge schedule controls.
- `/admin/settings?tab=audit` renders recent audit log rows.
- `/admin/settings?tab=purges` renders the unified purge engine controls.
- `/admin/settings?tab=options` manages diagnostic routing and renders white-label readiness, handoff, preset, navigation, custom-domain, and packaging panels.
- `/admin/settings/analytics` manages the Google Analytics or Google Tag Manager tracking id and analytics data-health reporting.

All writes from the main settings page are privileged. The settings page itself is an admin surface, but global settings mutation paths must remain super-admin-only unless a product requirement deliberately changes that boundary.

## Storage Model

`systemSettings` is a singleton-style table. The app reads the first row and falls back to `DEFAULT_SETTINGS` when no row exists.

Fields include:

- platform identity: `platformName`
- commercial display values: `currencySymbol`, `monthlyBasePrice`, `monthlySeatPrice`
- logos: `logoUrlLight`, `logoUrlDark`
- email sender defaults: `emailSenderName`, `emailSenderAddress`
- typography: legacy `fontFamily`, `headingFontFamily`, `bodyFontFamily`, `fontSizeBase`, `headingSizeGlobal`, `subTextSizeGlobal`, `borderRadius`
- theme tokens for light and dark surfaces
- `diagnosticRoutingEnabled`

`systemConfig` stores keyed operational values:

- `SYSTEM_PROMPT`
- `GOOGLE_ANALYTICS_ID`
- `PII_REDACTION_CONFIG`

Do not move keyed operational values into `systemSettings` without a migration plan. `systemConfig` rows carry `key`, `value`, `updatedAt`, and `updatedBy`, and several runtime paths already look them up by key.

## Settings Reads And Writes

`convex/settings.ts` owns `systemSettings` access.

`settings.get` reads the first settings row, resolves storage-backed logo ids through `ctx.storage.getUrl`, and merges stored values with defaults. If no row exists, it returns `DEFAULT_SETTINGS`.

`settings.update`:

1. Requires a super admin.
2. Builds a patch with `buildSettingsPatch`, preserving falsy values and removing only `undefined`.
3. Validates storage-backed logo references with `validateStoredUpload` and `validateAdminImageMetadata`.
4. Patches the existing row or inserts a default-backed row with `buildSettingsInsertRecord`.
5. Writes `UPDATE_SYSTEM_PREFERENCES` to `auditLogs` with the modified field names.

`settings.generateUploadUrl` also requires a super admin. The UI uploads logo files to Convex storage first, then immediately stores the returned storage id through `settings.update`.

## Runtime Consumption

`src/context/SystemSettingsContext.tsx` calls `api.settings.get` and blocks rendering until settings resolve. It then injects CSS variables into `document.documentElement` based on the current light/dark theme.

Global non-themed overrides include:

- `--color-brand`
- `--radius-lg`
- `--font-heading`
- `--font-sans`
- `--h1-size-override`
- `--subtitle-size-override`

Dark and light theme overrides include the main background, radial colors, text colors, card/sidebar colors, borders, hover background, muted text, success color, destructive color, and focus ring.

The provider also sets wrapper `fontFamily` and `fontSize` from settings values. Because it mutates global CSS variables, changes can affect every tenant and every route using shared tokens.

`SidebarNavigation` reads `diagnosticRoutingEnabled` through `useSystemSettings`. When enabled, it shows diagnostic/temporary navigation such as the Arcade route. This is presentation behavior, not authorization. Do not rely on the setting as a security boundary.

## Identity And Appearance UI

`src/app/(dashboard)/admin/settings/_components/IdentitySettingsSection.tsx` edits platform name, logos, and email sender fields. Logo upload controls accept light and dark variants and call the page-level upload handler.

`src/app/(dashboard)/admin/settings/_components/AppearanceSettingsSection.tsx` edits heading/body font selections, heading/subtext sizes, dark palette values, light palette values, and the global brand color.

Both sections share settings form types from `src/app/(dashboard)/admin/settings/_components/types.ts`.

The page hydrates form state from `settings.get` and fills several UI defaults that mirror existing global CSS. These UI defaults make controls usable even when optional settings fields are absent; they do not necessarily mean every optional token has been stored.

When adding a settings field, update:

- `convex/schema.ts`
- `DEFAULT_SETTINGS`
- `settings.update` args
- `SystemSettingsContext` type and CSS application if the field affects runtime styling
- `SystemSettingsFormData` only if the generated `Doc<"systemSettings">` type is not enough
- the appropriate settings component
- English and Italian locale messages
- settings tests

## System Config Values

`convex/system.ts` owns keyed `systemConfig` values.

`getSystemPrompt` returns the stored system prompt for authenticated users. `getInternalSystemPrompt` is an internal query for runtime model paths. `updateSystemPrompt` requires a super admin, writes or patches `SYSTEM_PROMPT`, and writes `UPDATE_SYSTEM_PROMPT` with prompt length and assistant safety warning categories.

`getAnalyticsId` is intentionally public because the frontend analytics provider needs it to mount tracking. `updateAnalyticsId` requires a super admin, trims the value, writes or patches `GOOGLE_ANALYTICS_ID`, and writes `UPDATE_ANALYTICS_ID`.

`getPiiConfig` requires an admin and returns `parseSystemPiiConfig`. `updatePiiConfig` requires a super admin, writes or patches `PII_REDACTION_CONFIG`, and writes `UPDATE_PII_FIREWALL`.

## PII Redaction

PII redaction settings are stored as JSON in `systemConfig` under `PII_REDACTION_CONFIG`.

`systemService.DEFAULT_SYSTEM_PII_CONFIG` defaults the admin-facing config to disabled, with email, credit card, and NINO/SSN masking enabled when the feature is turned on. `convex/utils/pii.ts` defines the runtime `redactPII` behavior and its own default config for lower-level callers.

`convex/chat.ts` loads the PII config before inserting a user message. It redacts synchronously before saving the message row, so stored chat content receives the masked value when redaction is enabled.

Current mask categories include:

- credit cards
- email addresses
- UK NINO and US SSN patterns
- phone numbers, disabled by default because the regex can produce false positives

Keep PII config writes super-admin-only. Admins can read current posture, but they cannot disable or loosen the global redaction firewall.

## Analytics Tracking Id

`/admin/settings/analytics` reads `api.system.getAnalyticsId`, writes through `api.system.updateAnalyticsId`, and also renders analytics data-health status from `api.analyticsCron.getAnalyticsDataHealthForAdmin`.

`getAnalyticsId` is public by design. The value should be treated as a browser tracking id, not a secret. Writes still require a super admin and are audited.

Do not confuse analytics tracking with analytics rollups. Tracking id configuration controls frontend analytics script mounting; usage/cost dashboards and health reports are covered by [Analytics Rollups](./analytics-rollups.md).

## Audit Behavior

System settings writes create audit evidence:

- `UPDATE_SYSTEM_PREFERENCES` for `systemSettings`
- `UPDATE_SYSTEM_PROMPT` for `SYSTEM_PROMPT`
- `UPDATE_ANALYTICS_ID` for `GOOGLE_ANALYTICS_ID`
- `UPDATE_PII_FIREWALL` for `PII_REDACTION_CONFIG`

Audit metadata should stay compact. Store field names, lengths, categories, or small configuration summaries. Do not add raw secrets, logo file contents, large JSON payloads, or unbounded values.

The security tab also includes older audit purge controls through `api.auditLogs.getConfig` and `api.auditLogs.updateConfig`. Unified purge pipelines are documented separately in [Data Retention And Purges](./data-retention-and-purges.md).

## Access Control Rules

Preserve these boundaries:

- Standard users cannot update global settings, generate logo upload URLs, update system prompt, update analytics id, or alter PII config.
- Admins can read PII config but cannot update it.
- Super admins can update global settings, logos, system prompt, analytics id, PII config, and white-label builder surfaces.
- `getAnalyticsId` is public for frontend mounting and should not return secrets.
- Diagnostic routing and navigation hiding are presentation controls, not security controls.

Settings that affect all tenants should not become company-admin writable without a separate tenant-scoping design.

## Verification

Focused tests include:

- `convex/settings.test.ts` for settings defaults, writes, audit rows, upload URL access, and white-label query access control.
- `convex/settingsService.test.ts` for patch construction, default merging, logo reference detection, and white-label helper contracts.
- `convex/system.test.ts` for system prompt, analytics id, PII config access control, writes, trimming, and audit rows.
- `src/app/(dashboard)/admin/settings/page.test.tsx` for settings query wiring, tab routing, saves, security toggles, and white-label data.
- `src/app/(dashboard)/admin/settings/_components/SettingsSections.test.tsx` for identity, appearance, and white-label component behavior.
- `src/context/SystemSettingsContext.tsx` consumers should be checked when adding CSS variables or theme-token behavior.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
