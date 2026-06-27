# Organization And Company Workspaces Developer Guide

Organization and company workspace implementation spans tenant-facing settings under `/app`, super-admin company detail routes under `/admin/companies`, profile management, scoped user management, and white-label system settings. This guide covers the implementation that exists now and should be reviewed before changing tenant admin workflows, company directory aliases, profile uploads, plan usage displays, or white-label packaging readiness.

## Product Surface

Tenant-facing routes:

- `src/app/(dashboard)/app/settings/page.tsx` renders the organization dashboard for the signed-in user's company.
- `src/app/(dashboard)/app/settings/team/page.tsx` renders company team management.
- `src/app/(dashboard)/app/settings/auth-diagnostics/page.tsx` renders shared auth diagnostics from the app settings area.
- `src/app/(dashboard)/app/profile/page.tsx` renders personal profile editing and company plan usage.

Super-admin company routes:

- `src/app/(dashboard)/admin/companies/page.tsx` lists companies.
- `src/app/(dashboard)/admin/companies/[id]/**` contains company overview, users, invites, AI, knowledge, models, prompt, rules, chat logs, widget, and directory routes.
- `src/app/(dashboard)/admin/companies/[id]/directory/page.tsx` redirects to `directory/users`.
- `src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx` re-exports `../../users/page`.
- `src/app/(dashboard)/admin/companies/[id]/directory/invites/page.tsx` re-exports `../../invites/page`.
- `src/app/(dashboard)/admin/settings/page.tsx` manages global identity, appearance, security, audit, purge, options, and white-label readiness sections.

## Tenant Organization Dashboard

The organization dashboard gets the current user through `api.users.getMe`, reads `user.companyId`, and calls `api.analytics.getCompanyMetrics` only when a company id exists. It renders tenant metrics, timeline charts, provider distribution, top users, and top agents for the selected timeframe.

Keep this route company-scoped. Do not let a user-provided company id override the signed-in user's company context in the tenant app settings route.

## Team Management

`app/settings/team/page.tsx` uses `api.users.getPaginatedUsers`, `api.invites.getPendingInvites`, `api.users.addUser`, `api.users.updateUser`, `api.users.deleteUser`, and `api.invites.revokeInvite`. The UI filters pending invites to the current user's company and uses paginated user results with an initial page size of 15.

Backend privilege enforcement lives in `convex/users.ts`, `convex/userManagementService.ts`, and `convex/invites.ts`. Scoped admins and impersonating super admins must operate inside the active company and cannot manage super-admin privileges. Preserve those checks when changing the form or route structure.

The team page currently contains some inline English and Italian fallback text. If editing user-visible strings, keep `messages/en.json` and `messages/it.json` in parity and reduce hardcoded copy where practical.

## Profile And Plan Usage

`app/profile/page.tsx` reads the signed-in user, updates personal profile fields through `api.users.updateMyProfile`, generates upload URLs through `api.users.generateUploadUrl`, and validates profile images with the `adminImage` upload policy before uploading.

The profile page also reads `api.plans.getMyCompanyPlanStatus` and displays the company AI messaging pool, plan name, monthly reset note, and usage progress. If message usage reaches a finite limit, the UI warns that non-critical AI interactions are paused until the next billing cycle.

Email is displayed as a fixed field and should not become editable through this profile form unless auth identity update flows are also implemented.

## Company Detail And Directory Aliases

Super-admin company pages use company id route params and backend company access checks. The directory routes are currently organizational aliases rather than separate implementations: the directory index redirects to users, and the directory users/invites pages re-export the existing company users and invites pages.

If directory behavior becomes a real product surface later, replace the aliases with dedicated pages and update this guide plus the indexes. Until then, documentation should describe them as aliases, not as separate directory features.

## White-Label Settings

`admin/settings/page.tsx` reads and writes system settings through `convex/settings.ts`, PII config through `convex/system.ts`, audit config/logs through `convex/auditLogs.ts`, and white-label readiness data through settings queries.

`convex/settings.ts` exposes:

- `get` for merged system settings with storage-backed logo URLs resolved.
- `update` for super-admin updates to platform name, pricing display values, logos, email sender fields, brand color, fonts, light and dark theme colors, border radius, and diagnostic routing.
- `getWhiteLabelReadiness`, `getWhiteLabelModulePresets`, `getWhiteLabelNavigationProfiles`, `getWhiteLabelCustomDomainChecklist`, `getWhiteLabelHandoffSummary`, and `getWhiteLabelPackagingChecklist`.
- `generateUploadUrl` for super-admin logo uploads.

Logo updates validate stored uploads with `validateAdminImageMetadata`. Settings updates write `UPDATE_SYSTEM_PREFERENCES` audit logs with compact settings metadata. White-label helper logic lives in `convex/settingsService.ts`, and email sender defaults are assembled through `convex/emailBrandingService.ts`.

## Authorization And Tenancy

Tenant organization routes should derive company scope from the current user. Super-admin company routes can use route params but must still rely on backend checks. User management must preserve the privilege boundary that scoped admins cannot create, edit, or delete super admins.

Global system settings and white-label readiness are super-admin-only. Do not expose global branding, PII, audit purge, or diagnostic routing writes to company admins without a separate product decision.

## Verification

Focused tests include `src/app/(dashboard)/app/settings/page.test.tsx`, `src/app/(dashboard)/app/settings/team/page.tsx` coverage where present, `src/app/(dashboard)/app/profile` coverage where present, `src/app/(dashboard)/admin/settings/page.test.tsx`, `src/app/(dashboard)/admin/settings/_components/SettingsSections.test.tsx`, `convex/users.test.ts`, `convex/userManagementService.test.ts`, `convex/invites.test.ts`, `convex/settings.test.ts`, `convex/settingsService.test.ts`, `convex/plans.test.ts`, and `convex/planService.test.ts`.

For documentation-only edits, run `git diff --check`. Before merging code changes in this area, run the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
