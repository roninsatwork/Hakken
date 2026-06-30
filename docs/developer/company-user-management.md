# Company And User Management Developer Guide

Company and user management covers tenant workspaces, managed users, invitations, role boundaries, super-admin company assignment, impersonation, login tracking, plan assignment, and destructive cleanup. It is implemented across global admin routes, tenant organization routes, and Convex authorization helpers.

Read this before changing `convex/companies.ts`, `convex/users.ts`, `convex/userManagementService.ts`, `convex/invites.ts`, `convex/authUserProvisioning.ts`, company/user admin pages, or tenant team settings. For the broader admin route map, see [Administration](./administration.md). For tenant-facing workspace pages, see [Organization And Company Workspaces](./organization-and-company-workspaces.md). For audit log details, see [Audit Log Service](./audit-log-service.md).

## Product Surface

Super-admin routes:

- `/admin/companies` lists and creates companies.
- `/admin/companies/[id]` redirects into the company detail surface from `src/app/(dashboard)/admin/companies/[id]/page.tsx`.
- `/admin/companies/[id]/overview` edits profile fields and plan assignment.
- `/admin/companies/[id]/users` manages users in one company through `src/app/(dashboard)/admin/companies/[id]/users/page.tsx`.
- `/admin/companies/[id]/invites` manages pending invites for one company through `src/app/(dashboard)/admin/companies/[id]/invites/page.tsx`.
- `/admin/companies/[id]/directory` is the company directory section, with `src/app/(dashboard)/admin/companies/[id]/directory/layout.tsx`, `src/app/(dashboard)/admin/companies/[id]/directory/page.tsx`, `src/app/(dashboard)/admin/companies/[id]/directory/users/page.tsx`, and `src/app/(dashboard)/admin/companies/[id]/directory/invites/page.tsx`.
- `/admin/users`, `/admin/users/invite`, and `/admin/users/[id]` manage global users.
- `/admin/super-admins`, `/admin/super-admins/invite`, and `/admin/super-admins/[id]` manage super-admin users through `src/app/(dashboard)/admin/super-admins/page.tsx`, `src/app/(dashboard)/admin/super-admins/invite/page.tsx`, and `src/app/(dashboard)/admin/super-admins/[id]/page.tsx`.

The company detail shell is implemented by `src/app/(dashboard)/admin/companies/[id]/layout.tsx`. Company-specific AI, models, rules, prompt, knowledge, chat logs, and widget routes live beside the user/directory routes and are documented in [AI Administration](./ai-administration.md) and [Embedded Widgets](./embedded-widgets.md).

Tenant routes:

- `/app/settings` shows the signed-in user's company dashboard.
- `/app/settings/team` manages tenant-scoped users and pending invites.
- `/app/profile` edits the signed-in user's profile and shows plan usage.

Keep these route groups distinct. `/admin` is super-admin-only at the layout level, while `/app/settings/team` uses the same backend user-management mutations under tenant-scoped authorization.

## Authorization Helpers

`convex/authz.ts` is the central role and tenant helper module.

- `getCurrentUser` resolves the Convex auth user id to the `users` table row.
- `requireCurrentUser` rejects unauthenticated callers.
- `requireAdmin` allows `ADMIN` and `SUPER_ADMIN`.
- `requireSuperAdmin` allows only `SUPER_ADMIN`.
- `getActiveCompanyId` returns `impersonatingCompanyId` first, then `companyId`.
- `canAccessCompany` allows super admins or active-company matches.
- `assertAdminCanAccessCompany` allows super admins and tenant admins scoped to a company.

Do not rely on route guards alone. Convex functions that read or mutate tenant data must enforce the same role and company boundary.

## Scoped User Management

`convex/users.ts` exposes user list, create, update, delete, profile, login, impersonation, and super-admin assignment functions.

The key privilege checks live in `convex/userManagementService.ts`:

- Unimpersonated super admins can create, update, and delete managed users globally.
- Tenant admins are scoped to their active company.
- Super admins who are impersonating a company are treated as scoped admins for managed-user writes.
- Scoped admins cannot create super admins.
- Scoped admins cannot update or delete super admins.
- Scoped admins cannot move users outside the active company.

This distinction prevents a super admin who is operating inside a tenant context from accidentally performing global privilege changes through tenant-team workflows.

`addUser` inserts a manual user row with a `manual|...` token identifier, increments global inventory user totals, and writes `CREATE_USER`.

`updateUser` patches allowed fields, role, and company assignment after policy checks, then writes `UPDATE_USER`.

`deleteUser` schedules `internal.users.purgeUserEntitiesInternal`, deletes the user row, decrements global inventory user totals, and writes `DELETE_USER`.

`updateMyProfile` is separate from managed-user editing. It only allows the signed-in user to update name, phone, and image. If a storage id is supplied, it validates the upload with the admin image policy before resolving the storage URL.

## User Queries

`getPaginatedUsers` is the main table query. It:

- requires a current user with a role
- scopes tenant admins and impersonating super admins to `getActiveCompanyId`
- returns global results for unimpersonated super admins
- supports email search through the `search_email` index
- enriches rows with company names

`getAllUsers` follows the same global-vs-scoped distinction and caps results at 1,000.

`getUsersByCompany` allows super admins or tenant admins whose active company matches the requested company.

`getSuperAdmins` is super-admin-only.

`getUserById` allows the target user, any super admin, or a user whose active company matches the target user's company.

Preserve the 15-row admin pagination convention in UI tables unless a product requirement explicitly changes it.

## Invitations

Invitations are implemented in `convex/invites.ts` and stored in `invitations`.

`getPendingInvites` requires an admin. Super admins see up to 50 pending invites globally. Tenant admins see up to 50 pending invites for their own company.

`getInvitesByCompany` requires an admin and then calls `canAccessCompany`.

`revokeInvite` requires an admin, deletes the invite, and writes `REVOKE_INVITE`. Non-super-admins can only revoke invites for their own company. Because it deletes the row, revoked invites are not retained as status rows.

Invite email templates are stored in `emailTemplates` with `templateType: "INVITE"`. `getActiveTemplate` returns `null` for unauthenticated users, returns the stored invite template when one exists, and otherwise returns the built-in default subject, headline, body, and CTA text. The invite pages under `/admin/users/invite`, `/admin/companies/[id]/invites`, and `/admin/super-admins/invite` all read this same active template, so saving it changes the global invite copy used by those screens. `saveTemplate` requires `requireSuperAdmin`, upserts the single active invite template, and writes `UPDATE_EMAIL_TEMPLATE`.

`dispatchInviteEmail` is an action because it sends email through Resend. It:

1. Requires an action-authenticated user.
2. Allows unimpersonated super admins globally.
3. Allows tenant admins only for their active company and only for `USER` or `ADMIN` roles.
4. Rejects tenant-admin attempts to invite super admins or invite users into another company.
5. Generates a random token.
6. Reads email branding from settings.
7. Sends an invite email when `RESEND_API_KEY` is available.
8. Simulates success and still creates the invite record when `RESEND_API_KEY` is missing.
9. Calls `internal.invites.createInviteRecord` after successful or simulated dispatch.

The invite link currently points to `/login`. It does not expose the stored token in the URL. Access depends on the invited email matching the authenticated account during provisioning.

`createInviteRecord` lowercases the email, overwrites an existing non-accepted invite for that email with a new token/status/date, leaves accepted invites alone, inserts new pending invites otherwise, and writes `CREATE_INVITE` when a caller id is supplied.

## Auth Provisioning

`convex/authUserProvisioning.ts` connects login to invitations.

`createOrUpdateSonaeAuthUser` extracts email, name, and image from the auth provider payload. It then:

- returns an existing user and logs auth events when one exists
- accepts pending invites on verified-email login
- allows `INITIAL_SUPER_ADMIN_EMAIL` to create the first super admin without an invite
- rejects new users with no invite on the invite-only platform
- rejects expired pending invites after seven days
- creates a new user from the invite role and company
- increments global inventory user totals
- logs invite and magic-link auth events

Accepted invites can be recovered if the invite was accepted but the user row is missing. That path logs `INVITE_STALE_ACCEPTED_RECOVERED`.

## Companies

`convex/companies.ts` is super-admin-only for company management.

Company list queries:

- `getCompanies` returns up to 10,000 companies with user counts.
- `getPaginatedCompanies` supports name search and paginated results.
- `getCompanyOptions` returns bounded company id/name options for pickers.
- `getCompanyById` requires a super admin.

Company mutations:

- `createCompany` inserts name and optional system prompt, increments global inventory company totals, and writes `CREATE_COMPANY`.
- `updateCompany` patches name and optional prompt, then writes `UPDATE_COMPANY`.
- `updateCompanyProfile` patches name, description, and overview, then writes `UPDATE_COMPANY_PROFILE`.
- `updateCompanyPrompt` patches the prompt and writes `UPDATE_COMPANY_PROMPT` with prompt length and safety-warning categories.
- `updateCompanyDescription` patches only description and currently does not write an audit log.
- `assignPlanToCompany` validates the target company and plan, patches `planId`, and adjusts global inventory plan totals.
- `deleteCompany` schedules company cleanup, deletes the company row, adjusts inventory totals, and writes `DELETE_COMPANY`.

Because company deletion deletes the company row before all scheduled cleanup necessarily finishes, present it as destructive asynchronous cleanup in UI and operator notes.

## Cleanup And Purge Behavior

`internal.companies.purgeCompanyEntitiesInternal` runs in batches:

- reads up to 100 users for the company
- schedules `internal.users.purgeUserEntitiesInternal` for each user
- deletes each user row
- decrements inventory user totals
- reads up to 100 invitations for the company/status index
- deletes those invitations
- reschedules itself when either batch reaches the batch limit

`internal.users.purgeUserEntitiesInternal` also runs in batches:

- deletes up to 100 login rows for the user
- deletes up to 100 AI rules created by the user
- reads up to 10 threads
- deletes up to 100 messages per thread
- deletes a thread only when its current message batch is below the limit
- reschedules itself when more rows may remain

Do not assume related data is gone immediately after deleting a user or company. If a new company-owned or user-owned table is introduced, add cleanup coverage or document why it is intentionally retained.

## Impersonation And Super-Admin Assignment

`impersonateCompany` requires a super admin, patches the caller's `impersonatingCompanyId`, writes `IMPERSONATE_COMPANY`, and returns `true`. Passing `undefined` clears impersonation.

Impersonation changes `getActiveCompanyId`, so tenant-scoped queries and mutations behave as if the super admin is inside that company for many workflows.

`getUnassignedSuperAdmins` returns super admins whose `companyId` is not the requested company.

`assignSuperAdminToCompany` requires a super admin, verifies the target is a super admin, patches `companyId`, and writes `ASSIGN_SUPER_ADMIN`.

`detachSuperAdminFromCompany` requires a super admin, verifies the target is a super admin, clears `companyId`, and writes `DETACH_SUPER_ADMIN`.

Company assignment for a super admin is not the same as impersonation. `companyId` is a durable association; `impersonatingCompanyId` is the active tenant context.

## Login Tracking

Login tracking is initiated from the dashboard header. It attempts to fetch IP/location data from `https://ipapi.co/json/`, then calls `api.users.recordLogin`. If lookup fails, the UI records a concealed or unknown fallback.

`recordLogin`:

- returns `null` for unauthenticated callers
- throttles repeated identical device/IP rows for 60 minutes
- inserts a `logins` row with device, IP, location, success status, and timestamp
- writes `SYSTEM_AUTHENTICATION` for admin and super-admin users

`recordLogout` writes `SYSTEM_DISCONNECTION` for admin and super-admin users.

`getUserLogins` allows the target user, super admins, or company admins whose active company matches the target user's company. `getLogins` and `getMyLoginsCount` currently expose only the current super admin's own login rows.

## Plans And Inventory

Companies can be assigned a plan through `assignPlanToCompany`. Plan status for users is resolved by `convex/planService.ts`:

- user plan overrides win when `user.planOverrideId` is set
- otherwise company plans drive the status when the user has a company
- otherwise the default status is `System Default` with unlimited messages

Company and user create/delete paths update global inventory totals. Company plan assignment adjusts plan inventory. If new user provisioning or company lifecycle paths are added, keep inventory rollup updates aligned.

## Audit Coverage

Current covered events include:

- `CREATE_COMPANY`
- `UPDATE_COMPANY`
- `UPDATE_COMPANY_PROFILE`
- `UPDATE_COMPANY_PROMPT`
- `DELETE_COMPANY`
- `CREATE_USER`
- `UPDATE_USER`
- `DELETE_USER`
- `CREATE_INVITE`
- `REVOKE_INVITE`
- `SYSTEM_AUTHENTICATION`
- `SYSTEM_DISCONNECTION`
- `IMPERSONATE_COMPANY`
- `ASSIGN_SUPER_ADMIN`
- `DETACH_SUPER_ADMIN`

`updateCompanyDescription` and `assignPlanToCompany` currently do not write direct audit logs. If those actions become sensitive enough for operator review, add audit coverage in implementation rather than documenting a nonexistent event.

## Verification

Focused tests include:

- `convex/userManagementService.test.ts` for scoped-admin and impersonating-super-admin privilege boundaries.
- `convex/users.test.ts` for user CRUD, role behavior, profile uploads, login tracking, impersonation, and super-admin assignment.
- `convex/users.internal.test.ts` for scheduled user cleanup.
- `convex/invites.test.ts` for invitation listing, revocation, dispatch authorization, simulated email behavior, and invite record replacement.
- `convex/authUserProvisioning.test.ts` for invite-only provisioning, initial super-admin creation, invite acceptance, expiration, and auth events.
- `convex/companies.test.ts` for company CRUD, access control, profile updates, prompts, plan assignment, and deletion.
- `convex/companies.internal.test.ts` and `convex/companyService.test.ts` for company cleanup batching.
- `convex/planService.test.ts` and `convex/plans.test.ts` for plan status and plan assignment constraints.
- UI tests under `src/app/(dashboard)/admin/users`, `src/app/(dashboard)/admin/companies`, and tenant settings pages for tables, forms, destructive confirmation, and pagination.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
