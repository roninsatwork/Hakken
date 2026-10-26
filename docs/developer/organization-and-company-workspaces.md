---
product: Hakken
documentation_type: Developer guide
feature_area: Organization workspace profile and personal context
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/organization-and-company-workspaces.md
last_reviewed: '2026-10-26T14:58:39+00:00'
reviewed_against: current implementation
status: Current
---
# Organization And Company Workspaces Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Organization workspace profile and personal context
> **Reviewed:** 26 October 2026, 14:58:39 GMT (Europe/London)
> **Source path:** `docs/developer/organization-and-company-workspaces.md` · **Status:** Current

Organization and company workspace implementation spans tenant-facing settings under `/app`, super-admin company detail routes under `/admin/companies`, profile management, personal assistant notes, scoped user management, workspace feature gates, and white-label system settings. This guide covers the implementation that exists now and should be reviewed before changing tenant admin workflows, company directory aliases, profile uploads, plan usage displays, module gating, or white-label packaging readiness.

## Product Surface

Tenant-facing routes:

- `src/app/(dashboard)/app/settings/page.tsx` renders the organization dashboard for the signed-in user's company.
- `src/app/(dashboard)/app/settings/team/page.tsx` renders company team management.
- `src/app/(dashboard)/app/settings/auth-diagnostics/page.tsx` renders shared auth diagnostics from the app settings area.
- `src/app/(dashboard)/app/profile/page.tsx` renders personal profile editing, preferences, Assistant Notes, login history for super admins, and company plan usage.

Super-admin account and company routes:

- `src/app/(dashboard)/admin/users/page.tsx` lists platform users and pending invites, with scope filtered by the backend for non-global contexts.
- `src/app/(dashboard)/admin/users/invite/page.tsx` creates invites outside a company detail page.
- `src/app/(dashboard)/admin/users/[id]/page.tsx` shows one user's profile, activity, thread, and cost context.
- `src/app/(dashboard)/admin/companies/page.tsx` lists companies.
- `src/app/(dashboard)/admin/companies/[id]/**` contains company overview, feature gates, directory users/invites, AI, calls, mailbox, widget, and directory routes.
- `src/app/(dashboard)/admin/companies/[id]/directory/page.tsx` redirects to `directory/users`.
- `src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx` re-exports `../../users/page`.
- `src/app/(dashboard)/admin/companies/[id]/directory/invites/page.tsx` re-exports `../../invites/page`.
- `src/app/(dashboard)/admin/settings/page.tsx` manages global identity, appearance, security, audit, purge, options, and white-label readiness sections.

## Tenant Organization Dashboard

The organization dashboard gets the current user through `api.users.getMe`, reads `user.companyId`, and calls `api.analytics.getCompanyMetrics` only when a company id exists. It renders tenant metrics, timeline charts, provider distribution, top users, and top agents for the selected timeframe. The provider distribution comes from the live raw-data overlay; historical `analyticsDailySnapshots` currently store model metrics but not provider totals.

Keep this route company-scoped. Do not let a user-provided company id override the signed-in user's company context in the tenant app settings route.

## Team Management

`app/settings/team/page.tsx` uses `api.users.getPaginatedUsers`, `api.invites.getPendingInvites`, `api.users.addUser`, `api.users.updateUser`, `api.users.deleteUser`, and `api.invites.revokeInvite`. The UI filters pending invites to the current user's company and uses paginated user results with an initial page size of 15.

Backend privilege enforcement lives in `convex/users.ts`, `convex/userManagementService.ts`, and `convex/invites.ts`. Scoped admins and impersonating super admins must operate inside the active company and cannot manage super-admin privileges. Preserve those checks when changing the form or route structure.

The team page currently contains some inline English and Italian fallback text. If editing user-visible strings, keep `messages/en.json` and `messages/it.json` in parity and reduce hardcoded copy where practical.

## Profile, Assistant Notes, And Plan Usage

`app/profile/page.tsx` reads the signed-in user, updates personal profile fields through `api.users.updateMyProfile`, generates upload URLs through `api.users.generateUploadUrl`, and validates profile images with the `adminImage` upload policy before uploading. `src/app/(dashboard)/app/profile/ProfileTabs.tsx` renders preferences, Assistant Notes, and login-history tabs. Preferences can change theme through `next-themes` and write the `locale` cookie before reloading; the login-history tab is only shown to super admins, reads `api.users.getLogins` and `api.users.getMyLoginsCount`, searches device metadata, and paginates locally at 15 rows while loading more Convex results as needed.

`src/app/(dashboard)/app/profile/AssistantNoteTab.tsx` is the user-facing control plane for `convex/userMemories.ts`. It reads `api.userMemories.listMine`, adds notes with `api.userMemories.addMine`, and deletes notes with `api.userMemories.deleteMine`. Notes can be manual or learned, but the subject can see and remove both. Keep this route user-owned; do not add an admin screen for editing another person's assistant notes without a privacy and governance decision.

The profile page also reads `api.plans.getMyCompanyPlanStatus` and displays the company AI messaging pool, plan name, monthly reset note, and usage progress. If assistant chat usage reaches a finite limit, the backend records the attempted message and returns a quota-block assistant reply; the profile UI should describe that as assistant-chat quota behavior rather than a global AI feature gate.

Email is displayed as a fixed field and should not become editable through this profile form unless auth identity update flows are also implemented.

## Company Detail And Directory Aliases

Super-admin company pages use company id route params and backend company access checks. The directory routes are currently organizational aliases rather than separate implementations: the directory index redirects to users, and the directory users/invites pages re-export the existing company users and invites pages.

`admin/companies/page.tsx` creates and edits company rows through `api.companies.createCompany` and `api.companies.updateCompany`, assigns active plans through `api.companies.assignPlanToCompany`, and deletes companies through `api.companies.deleteCompany`. The delete mutation removes the company row, adjusts global inventory totals, writes a `DELETE_COMPANY` audit log, and schedules `internal.companies.purgeCompanyEntitiesInternal` to purge related company entities. Treat this as destructive cleanup, not as a reversible archive flow.

`admin/companies/[id]/layout.tsx` exposes the super-admin `Impersonate Workspace` action. It calls `api.users.impersonateCompany`, stores `impersonatingCompanyId` on the current super admin, writes an `IMPERSONATE_COMPANY` audit log, and redirects to `/app`. Because `getActiveCompanyId` prefers `impersonatingCompanyId`, tenant-scoped admin routes should continue to use the active company helper rather than the user's base `companyId` directly.

`admin/companies/[id]/overview/page.tsx` updates name, description, and overview through `api.companies.updateCompanyProfile`. Super admins can also assign or clear a plan from that page. Keep the plan control super-admin-only unless the product explicitly adds tenant self-service billing.

`admin/companies/[id]/features/page.tsx` edits workspace-specific `enabledModules` through `api.companies.setCompanyModules`. It displays plan-granted modules separately because the plan still wins; a checkbox can add access beyond the plan but cannot switch off a module granted by the assigned plan. The implementation uses `COMPANY_MODULES` from `convex/utils/companyModules.ts`, shares copy with provisioning and plan screens, and is super-admin-only.

If directory behavior becomes a real product surface later, replace the aliases with dedicated pages and update this guide plus the indexes. Until then, documentation should describe them as aliases, not as separate directory features.

## Global Users Area

The global users area uses the same user mutations as company-scoped team management, but the surface allows super admins to choose company assignment and manage platform-wide users. Backend enforcement in `convex/users.ts` and `convex/userManagementService.ts` remains authoritative:

- global super admins can list and manage users across companies
- tenant admins and impersonating super admins are filtered to the active company
- scoped admins cannot create, edit, or delete super-admin privileges
- super-admin company assignment helpers are separate mutations: `assignSuperAdminToCompany` and `detachSuperAdminFromCompany`

When changing `/admin/users` or company user pages, keep `ADMIN_PAGE_SIZE` pagination at 15 rows unless a specific product requirement changes it.

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

Impersonation changes the active company for a super admin. Any code that is meant to behave like tenant-scoped admin work should use `getActiveCompanyId`; any code that is truly global should require an unambiguous super-admin check and avoid accidentally narrowing to the impersonated company.

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

## Reviewed Personal Layer And Current Routes

`app/profile/page.tsx` calls `users.getMe`, `updateMyProfile` and the controlled image upload mutation. `updateMyProfile` allows only name, phone, image/reference fields, verifies owned uploaded images with the admin image policy, and does not accept role/email/company fields. Profile preferences and tabs are shared components; Assistant Note is an in-page tab, not an invented `/about-me` route. The Telegram integration has its own nested route and proof/session contract.

`userMemories.ts` stores the personal layer by userId alone. Tenant list/add/delete mutations always use `ctx.userId`; the module intentionally exposes no admin-content reader. `listMine` returns at most twenty active notes. `addMine` collapses whitespace, truncates at 300 characters, applies safety warning rejection, checks the full-set limit, then normalized duplicate detection. `deleteMine` verifies owner and deletes the row immediately. Audit metadata omits content; this does not establish erasure of prior prompt/log copies elsewhere.

`getActiveForUserInternal` supplies note content and IDs for eligible answer assembly. `aiPromptAssembly.shouldInjectPersonalNote` excludes widget and EVAL threads, and callers must preserve the actual asker's ownership. `markUsedInternal` updates bounded usage stamps asynchronously. The company weekly learned count reads up to 200 company members and each person's bounded approved notes, returning counts rather than content. This is not permission for an admin to inspect personal note text.

## Automatic Personal Learning And Selection Bounds

`userMemorySuggestionActions.sweepDispatcher` schedules per-user work from the roster query. `listUsersToSweepInternal` stops when autonomous memory is off, reads at most 500 users and picks 25 by least-recent run evidence. The user input query skips a full twenty-note set, reads ten recent threads and at most twenty messages per thread, and retains up to forty new user messages after the saved marker. Widget threads are explicitly skipped. EVAL-purpose threads are not independently filtered in that learning reader, even though personal-note injection excludes them. Keep that distinction visible in future test/privacy changes.

The transcript is bounded to 12,000 characters and parsing returns at most three notes per sweep. A fast-chat model produces suggestions with common spend attribution. The landing mutation rechecks autonomousMemory so disabling it during work can prevent application. On provider failure, the marker remains at its previous time; successful reads advance to their newest selected message. Bounded history and marker advancement do not guarantee lossless reading of every older conversation under heavy activity.

Learned notes are still subject to safety, normalization, duplicate and capacity checks. A deleted manual row does not create a permanent semantic rejection fingerprint for every possible relearning. Personal content must not be copied to company Wiki or public widgets by an extension merely because it is in a prompt. The existing tests provide local examples; this review did not execute a sweep or inspect any real person's notes.

## Workspace Metrics And Existing Management Coverage

`app/settings/page.tsx` queries company metrics for `user.companyId`. It has removed the main supplier-cost card and usage/provider chart while retaining some cost-valued leaderboard cells. Do not derive final visibility claims from comments alone or describe the removed chart as still present. Company usage/credits and company-admin frontend billing have separate routes. Assigned-plan mrr remains a formula rather than Stripe collected revenue.

Current team/user/invitation and company purge/impersonation contracts are maintained in [Company user management](./company-user-management.md), [billing](./platform-plans-and-quotas.md), and [tenancy](./tenancy-enforcement.md). This broad guide does not override their bounded cleanup and permission findings. Gmail mailbox controls are retired. No company/profile mutation, invitation, payment, memory sweep, provider call, or live acceptance test was performed for documentation maintenance.
