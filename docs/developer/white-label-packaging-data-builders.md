# White-Label Packaging Data Builders Developer Guide

White-label packaging data builders are the code-backed planning helpers behind the `System Settings -> System Options` panels. They turn current global settings, active widget evidence, email sender resolution, and static starter catalogs into readiness summaries and copy-ready handoff markdown for branded or vertical Sonae deployments.

Read this before changing `convex/settingsService.ts`, `convex/settings.ts`, `src/app/(dashboard)/admin/settings/page.tsx`, the white-label settings components, or the operator packaging guides. For the human runbook, see [White-Label Packaging Operator Guide](../operator/white-label-packaging-operator-guide.md). For broader platform settings context, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/page.tsx` renders the `options` tab and wires the white-label panels into the global settings page.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelReadinessSection.tsx` shows readiness score, evidence, links, commands, and a local fallback preview while Convex data is loading.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelHandoffSummarySection.tsx` shows the product, readiness, runtime sender, widget, diagnostic, production, and preset summary.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelModulePresetsSection.tsx` renders starter module presets.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelNavigationProfilesSection.tsx` renders route-group planning profiles.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelCustomDomainChecklistSection.tsx` renders domain, widget allowlist, sender-domain, DNS, redirect, and tenant-routing evidence.
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelPackagingChecklistSection.tsx` renders the generated checklist and copies its markdown through the clipboard API.

These panels are planning and handoff surfaces. They do not hide routes, modify authorization, configure DNS, verify TLS, validate production hosting, or make a packaged app live.

## Backend Entry Points

`convex/settings.ts` exposes all white-label builder outputs through super-admin-only queries:

- `getWhiteLabelReadiness`
- `getWhiteLabelModulePresets`
- `getWhiteLabelNavigationProfiles`
- `getWhiteLabelCustomDomainChecklist`
- `getWhiteLabelHandoffSummary`
- `getWhiteLabelPackagingChecklist`

Each query calls `requireSuperAdmin`. Tenant admins and normal users must not receive global branding posture, diagnostic routing posture, custom-domain evidence, or packaging handoff data.

The readiness, custom-domain, handoff, and checklist queries read one `systemSettings` row plus an active widget candidate. The active widget lookup prefers active global widgets from `by_global_created` and falls back to recent active company widgets from `by_company_created`. This is evidence for packaging readiness, not a tenant routing decision.

## Settings Helpers

`convex/settingsService.ts` owns the builder contracts.

`DEFAULT_SETTINGS` provides fallback platform identity, default brand color, optional theme/font/logo/email fields, and `diagnosticRoutingEnabled: false`.

`buildSettingsPatch` drops only `undefined` fields before writes. This preserves intentional falsy values such as `false`, `0`, or an empty string supplied by the UI. `buildSettingsInsertRecord` overlays the first write onto defaults. `mergeSettingsWithDefaults` returns defaults plus stored values and resolved logo URLs.

`isStorageLogoReference` treats non-HTTP logo values as Convex storage ids. `settings.get` resolves those ids with `ctx.storage.getUrl`, while `settings.update` validates storage-backed uploads with `validateStoredUpload` and `validateAdminImageMetadata` before saving. Keep this validation if logo storage behavior changes.

Every successful settings update writes `UPDATE_SYSTEM_PREFERENCES` to `auditLogs` with `buildSettingsAuditMetadata`, which records modified field names. Do not add raw image metadata, secrets, or large payloads to that audit metadata.

## Readiness Model

`buildWhiteLabelReadiness` returns a score, counts, individual items, and the first three next-action keys.

The current readiness items are:

- `identity`: ready when `platformName` is set and is not the default `Sonae` name.
- `logos`: ready when both light and dark logo values are present.
- `brandColor`: ready when `brandColorHex` is a six-digit HEX color.
- `diagnostics`: ready when diagnostic routing is disabled.
- `widget`: ready when an active widget has a valid primary color, greeting, logo, placeholder, and at least one restricted allowed domain that is not `*`.
- `email`: ready when `emailSenderAddress` looks like an email address; otherwise it is manual with `RESEND_FROM_EMAIL` as the command.
- `production`: always manual with `npm run setup:validate -- --profile=production` as the command.

Manual items are not the same as failed checks. They mean the app can only show the operator what to verify outside the data available to Convex.

## Module Presets

`getWhiteLabelModulePresets` returns static presets for starter shape planning:

- `knowledgeAssistant`
- `supportWidget`
- `operatorWorkspace`

Each preset has an `href`, a translated link label key, readiness dependencies, visible module keys, owner/operator surface keys, and handoff check keys. The settings UI translates these keys for display. The presets do not activate modules or hide routes.

`buildWhiteLabelHandoffSummary` recommends a preset only when every dependency except `production` is ready. Production remains manual, so a preset can be recommended while still requiring a production validation run before customer handoff.

## Navigation Profiles

`getWhiteLabelNavigationProfiles` returns static route planning profiles:

- `customerWorkspace`
- `supportWidget`
- `operatorConsole`

Profiles list visible route-group keys, owner-only route-group keys, hide candidates, and implementation notes. They are previews for product packaging decisions. Do not treat the hide list as access control. Server authorization, tenant isolation, and audit behavior remain the actual boundary.

If future work makes route visibility configurable, keep that configuration separate from the static profile suggestions and document the server-side authorization checks that still protect hidden routes.

## Custom Domain Checklist

`buildWhiteLabelCustomDomainChecklist` creates domain readiness evidence.

The current items are:

- `appHost`: manual, because primary production host confirmation is outside Convex.
- `widgetDomains`: ready when the active widget has at least one restricted domain allowlist entry that is not `*`.
- `emailDomain`: ready when a valid sender address yields a domain; otherwise manual with `RESEND_FROM_EMAIL`.
- `dnsTls`: manual, because DNS and TLS are hosting-provider checks.
- `redirects`: manual, because apex, www, and legacy-route redirect behavior is deployment-specific.
- `tenantIsolation`: manual, because domain-to-tenant routing must be reviewed with the runtime and hosting setup.

The helper filters blank widget domains and wildcard-only entries from evidence. Keep this behavior so the UI does not mark public wildcard widget exposure as production-ready.

## Handoff Summary

`buildWhiteLabelHandoffSummary` composes settings, readiness, module presets, active widget evidence, and a resolved email sender string.

The email sender is supplied by `buildEmailBranding` in `convex/emailBrandingService.ts`. Deployment-level `RESEND_FROM_EMAIL` can override stored sender settings, so the handoff summary should always be described as the runtime sender rather than merely the stored settings row.

The summary also reports:

- product name
- brand color
- readiness score
- logo mode: `light-and-dark`, `partial`, or `missing`
- widget posture and evidence
- diagnostic posture
- manual production status
- next action keys
- recommended preset keys

## Packaging Checklist Markdown

`buildWhiteLabelPackagingChecklist` converts the handoff summary, readiness items, module presets, navigation profiles, and optional custom-domain checklist into structured sections and a markdown string.

Current sections are:

- `brand`
- `readiness`
- `modules`
- `navigation`
- `domains` when a custom-domain checklist is supplied
- `developerFollowUp`

The generated markdown is intended for release notes, build plans, PR descriptions, or handoff pages. It is not stored automatically. The UI displays the markdown and provides a copy button.

The developer follow-up section intentionally reminds operators to run production setup validation, keep navigation hiding as presentation only, and confirm widget domains, runtime email sender, and customer-specific routes before handoff.

## Extension Rules

When adding a readiness item:

1. Add a typed key in `WhiteLabelReadinessItem`.
2. Update `buildWhiteLabelReadiness` counts and evidence.
3. Add translations for the UI status text.
4. Update module preset dependencies if the new item gates a preset.
5. Update `buildWhiteLabelPackagingChecklist` if the item needs special handoff wording.
6. Add unit tests in `convex/settingsService.test.ts` and access-control/query tests in `convex/settings.test.ts`.
7. Update the operator guide if the human workflow changes.

When adding a preset or navigation profile, keep keys stable, translate every display key, and make clear whether the item is evidence, presentation planning, or an actual runtime control.

When adding custom-domain evidence, distinguish facts the app can verify from manual deployment checks. DNS, TLS, redirects, and tenant-domain routing should stay manual unless there is a real implementation that validates them.

## Access Control And Tenant Boundaries

White-label builder queries are global super-admin surfaces. Do not expose them to tenant admins just because some evidence comes from widgets or email settings.

These builders may reference active company widgets as packaging evidence, but that evidence must not become a cross-tenant data leak. Keep returned widget evidence coarse, such as readiness posture and domain strings already used for packaging review. Do not add chat content, customer data, raw widget transcripts, or company-private records to the builder output.

Route hiding, module presets, and navigation profiles are planning data. If runtime route visibility is added later, preserve existing authorization checks and tenant-scoped Convex queries regardless of what the navigation layer displays.

## Verification

Focused tests include:

- `convex/settingsService.test.ts` for default merging, patch building, readiness, presets, navigation profiles, custom-domain checks, handoff summaries, and generated checklist markdown.
- `convex/settings.test.ts` for super-admin access control, settings writes, upload URL access, audit logging, and all white-label query contracts.
- `src/app/(dashboard)/admin/settings/page.test.tsx` for settings page query wiring and save behavior.
- `src/app/(dashboard)/admin/settings/_components/SettingsSections.test.tsx` for white-label component rendering and copy behavior.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
