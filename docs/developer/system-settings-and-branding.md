---
product: Hakken
documentation_type: Developer guide
feature_area: System settings and branding
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/system-settings-and-branding.md
last_reviewed: '2026-10-26T14:33:53+00:00'
reviewed_against: current implementation
status: Current
---
# System Settings And Branding Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** System settings and branding
> **Reviewed:** 26 October 2026, 14:33:53 GMT (Europe/London)
> **Source path:** `docs/developer/system-settings-and-branding.md` · **Status:** Current

System settings are Hakken's global configuration surface for platform identity, logos, email sender defaults, theme tokens, diagnostic routing, audit/PII controls, and analytics tracking. The implementation is split across the `systemSettings` table for branding and visual/runtime options, and the `systemConfig` table for keyed operational values such as system prompt, analytics id, and PII redaction.

Read this before changing `convex/settings.ts`, `convex/settingsService.ts`, `convex/system.ts`, `convex/systemService.ts`, `src/context/SystemSettingsContext.tsx`, the settings screens under `src/app/(dashboard)/admin/settings/(system)/`, or the settings page components. For email sender resolution, see [Email Branding](./email-branding.md). For platform operations settings around API keys, webhooks, health, purges, diagnostics, and maintenance scripts, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

`/admin/settings` is a redirect entry, not the old single-page tab editor. `settingsTabs.ts` maps retained `?tab=` bookmarks to current routes. Identity is `/admin/settings/identity`; Global Aesthetics is `/admin/settings/identity/aesthetics`; security is `/admin/settings/security`; retention is `/admin/settings/security/retention`; options is `/admin/settings/options`. Audit history lives in Governance. Unknown legacy tabs return to identity rather than creating a missing settings section.

The route group `(system)` owns shared navigation. Main identity/theme writes are super-admin-only. Company-admin billing remains separately in `/app/settings/billing`; platform settings access is not granted by company billing authority. Dedicated API key, analytics, script, plan, billing, and option pages use their own reviewed backend contracts, linked from [Platform operations](./platform-operations-settings.md).

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

`settings.get` is intentionally public for login/branding, reads the first row, resolves storage logo IDs through `ctx.storage.getUrl`, and merges values with defaults before allowlist projection. It returns only `PUBLIC_SETTINGS_FIELDS`, including the default-backed projection when no row exists. The full row is separately available through super-admin `getForAdmin`.

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

Legacy typography fields remain readable for compatibility, but `fontFamily`, `fontSizeBase`, `subTextSizeGlobal`, and `borderRadius` were retired from the update API. Current heading/body choices use shared font resolution; do not document removed controls as writable. Because it mutates global CSS variables, changes can affect every tenant and every route using shared tokens.

`UserNavTree` in `src/ui/components/layout/SidebarNavTrees.tsx` reads `diagnosticRoutingEnabled` through `useSystemSettings`. When enabled, it shows diagnostic/temporary navigation such as the Arcade route. This is presentation behavior, not authorization. Do not rely on the setting as a security boundary.

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

`/admin/settings/analytics` reads `api.system.getAnalyticsId`, writes through `api.system.updateAnalyticsId`, and also renders analytics data-health status from `api.systemHealth.getAnalyticsDataHealthForAdmin`.

`getAnalyticsId` is public by design. The value should be treated as a browser tracking id, not a secret. Writes still require a super admin and are audited.

Do not confuse analytics tracking with analytics rollups. Tracking id configuration controls frontend analytics script mounting; usage/cost dashboards and health reports are covered by [Analytics Rollups](./analytics-rollups.md).

## Audit Behavior

System settings writes create audit evidence:

- `UPDATE_SYSTEM_PREFERENCES` for `systemSettings`
- `UPDATE_SYSTEM_PROMPT` for `SYSTEM_PROMPT`
- `UPDATE_ANALYTICS_ID` for `GOOGLE_ANALYTICS_ID`
- `UPDATE_PII_FIREWALL` for `PII_REDACTION_CONFIG`

Audit metadata should stay compact. Store field names, lengths, categories, or small configuration summaries. Do not add raw secrets, logo file contents, large JSON payloads, or unbounded values.

Retained audit-purge configuration is not proof of an active independent scheduler. Use the current unified retention routes and [Data retention](./data-retention-and-purges.md) for the verified deletion chain.

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

For documentation-only edits, run `git diff --check`. For implementation changes, use the current complete gates in [AGENTS.md](../../AGENTS.md).

## Public Projection, Theme Record, And Logo Lifecycle

Public settings deliberately exclude commercial pricing, sales contacts, and sender addresses. They include identity/theme fields needed before sign-in. A public color or platform name is not a secret; adding a new backend setting requires an explicit decision about whether it belongs in `PUBLIC_SETTINGS_FIELDS`, the privileged editor projection, or a separate keyed configuration reader. Neither projection should contain provider credential values.

`settings.update` preserves false/zero values through patch construction and applies privileged logo validation for storage-backed references. Upload reservations and metadata verification belong to the existing shared upload policy, not arbitrary client URL acceptance. `clearLogo` is a separate super-admin operation that clears the selected field and attempts deletion of a storage reference; replacement/removal must be assessed using the actual current mutation, not an assumption that editing a visible URL proves every old blob was removed. Settings changes audit modified field names.

`DEFAULT_SETTINGS` imports the repository's theme record, `hakken.theme.json`, while runtime saved settings override default-backed values. The context updates root CSS variables as the current light/dark mode changes. Brand RGB derivation accepts plain three- or six-digit hex; invalid values clear that derived override. `onBrandFor` selects dark foreground for a sufficiently pale brand using the implemented 3:1 white-contrast threshold. That helper is a narrow rendering rule, not a whole-site accessibility certification.

The stored look and the repository record have a controlled synchronization workflow described in [Drawing guide](./drawing-guide.md) and [Screen kit](./screen-kit.md). Documentation housekeeping did not run `theme:pull`, mutate theme configuration, or restyle screens. A color in an old diagram is not an alternative source of truth. Diagnostic navigation visibility likewise remains presentation behavior; route/backend authorization must stand independently.

Prompt, tracking ID, PII controls, self-improvement switches, approval expiry, and retention settings have separate keyed records/read policies. A tracking ID is intended for browser script mounting and is public by design; it is not a Google Analytics property-connection credential. Saving a PII policy affects the implemented message-write path going forward, not automatic retroactive redaction of every existing record, upload, or external log.

`settings.test.ts`, `settingsService.test.ts`, `system.test.ts`, context/theme tests, and current settings screen tests provide local evidence. This refresh inspected implementation without changing saved settings, uploading logos, running an app, or executing live integrations. The [deployment guide](./deployment.md) and PRODUCT.md cutover record remain separate from local configuration presence.
