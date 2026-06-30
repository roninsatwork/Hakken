# Route Protection And Authentication Developer Guide

Route protection and authentication in Sonae are implemented through Convex Auth providers, client-side layout guards, deterministic test-auth helpers, Next.js route aliases/security headers, and backend Convex authorization checks. There is currently no root `middleware.ts`; route access is enforced by app layouts and by every sensitive query, mutation, and action.

Read this before changing `next.config.ts`, `convex/auth.ts`, `convex/authUserProvisioning.ts`, `convex/authEvents.ts`, `convex/authz.ts`, `convex/actionAuth.ts`, `convex/localTestAuth.ts`, `src/app/login/page.tsx`, dashboard layouts, admin layouts, or E2E auth helpers. For support diagnostics events, see [Auth Diagnostics](./auth-diagnostics.md). For user and invite lifecycle rules, see [Company And User Management](./company-user-management.md).

## Authentication Providers

`convex/auth.ts` configures Convex Auth with:

- Google sign-in through `@auth/core/providers/google`
- Resend email magic links through `@auth/core/providers/resend`
- an optional local-test credentials provider when local test auth is explicitly enabled

The auth callback `createOrUpdateUser` is `createOrUpdateSonaeAuthUser` from `convex/authUserProvisioning.ts`. That callback is the invite-only provisioning gate for real auth providers.

`convex/auth.config.ts` exposes the Convex site provider configuration used by the frontend auth provider.

## Login Page

`src/app/login/page.tsx` is the public login screen. It supports:

- Google sign-in with `signIn("google", { redirectTo: "/app" })`
- email magic-link sign-in with `signIn("resend", { email, redirectTo: "/app" })`
- preflight auth diagnostics through `api.authEvents.recordMagicLinkRequestAttempt`

The email flow deliberately uses neutral success copy. It shows the same "check your inbox" state whether the backend accepts or rejects the email. This avoids user enumeration from the public login form.

If diagnostics logging fails, the login page catches that failure and still proceeds with the auth action. Auth diagnostics are useful evidence, not a dependency for sending the magic link.

## Invite-Only Provisioning

`createOrUpdateSonaeAuthUser` is the source of truth for user creation during auth callbacks.

It extracts email, name, and image from provider payloads, lowercases the email, and then:

- returns existing users and logs `USER_FOUND`
- logs `MAGIC_LINK_STARTED` for unverified email-provider starts
- accepts pending invites only after the provider reports a verified email
- creates the initial super admin when `INITIAL_SUPER_ADMIN_EMAIL` matches
- rejects new users without an invitation
- rejects expired pending invites after seven days
- rejects revoked invites
- creates invited users with the invite role and company
- recovers accepted invites whose user row is missing
- increments global inventory user totals for newly provisioned users

Invitation links currently send users to `/login`. They do not expose the stored invite token as a URL parameter. Access depends on the authenticated email matching an invite or an existing user.

Initial super-admin provisioning does not currently write an auth diagnostics event. Treat that as implemented behavior unless the auth event model is deliberately expanded.

## Auth Event Diagnostics

`convex/authEvents.ts` stores troubleshooting events in `authEvents`, separate from privileged-operation `auditLogs`.

Public magic-link attempts call `recordMagicLinkRequestAttempt`, which records:

- `MAGIC_LINK_REQUESTED`
- `USER_FOUND`
- `INVITE_MISSING`
- `INVITE_FOUND`
- `INVITE_REVOKED`
- `INVITE_EXPIRED`
- `INVITE_STALE_ACCEPTED_RECOVERED`

Provisioning callbacks record additional events such as `MAGIC_LINK_STARTED` and `MAGIC_LINK_VERIFIED`.

`getRecentAuthEvents` requires admin access. Super admins see recent platform events, while company admins see only events scoped to their active company. Unscoped events such as missing-invite attempts are intentionally hidden from company admins.

Keep event types synchronized across the schema union, `AuthEventType`, UI filter lists, and tests.

## Layout Guards

The root layout wraps the app with:

- `ConvexAuthNextjsServerProvider`
- `ConvexClientProvider`
- `SystemSettingsProvider`
- `NextIntlClientProvider`
- `UIProvider`
- `AnalyticsProvider`

`ConvexClientProvider` uses `ConvexAuthNextjsProvider` during normal runtime. When `NEXT_PUBLIC_E2E_AUTH_ENABLED=1`, it bypasses the real Convex client so the E2E mock can provide deterministic data.

`src/app/(dashboard)/layout.tsx` provides the authenticated dashboard shell and sidebar. It does not itself perform role checks.

`src/app/(dashboard)/admin/layout.tsx` is the main admin route guard. It reads `api.users.getMe`, redirects non-super-admin users to `/app`, and returns `null` while loading or redirecting to prevent admin UI flashing.

Several nested admin layouts and pages also read `api.users.getMe` or use backend super-admin queries. These are secondary UI protections. Backend Convex authorization remains mandatory.

The `/app` dashboard page redirects super admins to `/admin` once per session using `sessionStorage.admin_redirected`. This is a convenience redirect, not an authorization boundary.

## Backend Authorization

`convex/authz.ts` owns query/mutation role helpers:

- `getCurrentUser`
- `requireCurrentUser`
- `requireRole`
- `requireAdmin`
- `requireSuperAdmin`
- `getActiveCompanyId`
- `canAccessCompany`
- `assertAdminCanAccessCompany`

`getActiveCompanyId` prefers `impersonatingCompanyId` over `companyId`. This is intentional and affects scoped behavior while a super admin is impersonating a tenant.

`convex/actionAuth.ts` mirrors role checks for Convex actions, where actions must read the auth user id with `getAuthUserId` and load the user row through an internal query.

Do not authorize sensitive behavior with UI checks alone. Every privileged Convex function should enforce role and company access directly.

## Login Tracking And Logout

`src/ui/components/layout/Header.tsx` records best-effort login metadata after a user resolves:

1. It checks `sessionStorage.login_tracked`.
2. It calls `https://ipapi.co/json/`.
3. It records user agent, IP, and location through `api.users.recordLogin`.
4. If the IP lookup fails, it records concealed or unknown fallback values.

`recordLogin` throttles repeated identical device/IP rows for 60 minutes and writes `SYSTEM_AUTHENTICATION` audit logs for admin and super-admin users.

Logout calls `api.users.recordLogout`, then Convex Auth `signOut`, then hard-navigates to `/`. The hard navigation is intentional so logout still leaves deep admin pages even if auth loss triggers a client-side exception.

## Local Test Auth

Local test auth is intentionally gated. The credentials provider is added only when:

- `LOCAL_TEST_AUTH_ENABLED=1`
- `LOCAL_TEST_AUTH_ENVIRONMENT` is not `production`

`convex/localTestAuth.ts` requires `LOCAL_TEST_AUTH_SECRET` and supports deterministic roles:

- `super-admin`
- `company-admin`
- `user`

`api.localTestAuth.seed` creates or updates a deterministic `Local Test Company` and three deterministic users. `internal.localTestAuth.authorize` verifies the shared secret, checks that the requested user exists with the expected role, and ensures tenant users have a company.

This provider must never be enabled in production. Tests assert that it fails closed when disabled or marked production.

## E2E Mock Auth

Playwright E2E tests use a separate deterministic cookie helper:

- `e2e/auth.setup.ts` writes storage states with a `sonae_e2e_auth` cookie.
- `e2e/helpers/auth.ts` can set the same cookie in a test.
- `src/e2e/convexReactMock.tsx` reads the cookie and returns deterministic users from mocked `useQuery` calls.

This is not the same as Convex local test auth. E2E mock auth bypasses the Convex client through `NEXT_PUBLIC_E2E_AUTH_ENABLED=1` and should only be used for browser route smoke tests.

## Route Redirects And Aliases

Current implemented redirects include:

- `/app` redirects super admins to `/admin` once per session.
- `/admin` routes redirect non-super-admin users to `/app` through the admin layout.
- `/admin/companies/[id]/directory` redirects to `/admin/companies/[id]/directory/users`.
- `/admin/companies/[id]/ai` redirects to `/admin/companies/[id]/ai/knowledge`.

`next.config.ts` also keeps legacy company-admin URLs working with temporary redirects:

- `/admin/companies/:id/users` -> `/admin/companies/:id/directory/users`
- `/admin/companies/:id/invites` -> `/admin/companies/:id/directory/invites`
- `/admin/companies/:id/knowledge` -> `/admin/companies/:id/ai/knowledge`
- `/admin/companies/:id/prompt` -> `/admin/companies/:id/ai/prompt`
- `/admin/companies/:id/system-prompt` -> `/admin/companies/:id/ai/prompt`
- `/admin/companies/:id/rules/new` -> `/admin/companies/:id/ai/rules/new`
- `/admin/companies/:id/rules/:ruleId` -> `/admin/companies/:id/ai/rules/:ruleId`
- `/admin/companies/:id/rules` -> `/admin/companies/:id/ai/rules`
- `/admin/companies/:id/models` -> `/admin/companies/:id/ai/models`
- `/admin/companies/:id/chat-logs` -> `/admin/companies/:id/ai/chat-logs`

These redirects shape navigation. They do not replace backend authorization checks.

## Security Headers

`next.config.ts` applies `next-secure-headers` to `/`, `/login`, `/admin/:path*`, `/app/:path*`, `/sandbox/:path*`, `/w/:path*`, and `/embed.js`.

The default header set is report-only CSP with same-origin frame ancestors. It is used by the public landing/login, admin, app, and sandbox routes. The widget iframe route `/w/:path*` and the embed script `/embed.js` use an embed header set with frame guard disabled and `frameAncestors: ["*"]` so customer sites can host the widget. Treat this as intentional widget behavior, not a general relaxation for dashboard routes.

Both header sets currently allow self plus HTTPS scripts, inline/eval scripts, inline styles, data/blob/HTTPS images, HTTPS and websocket connections, and HTTPS frames. Because the CSP is report-only, do not describe it as an enforced runtime block until `reportOnly` is removed. If widget embedding, sandbox behavior, or dashboard CSP posture changes, update this guide, [Embedded Widgets](./embedded-widgets.md), and the customer handoff docs together.

## Access Boundary Rules

Preserve these boundaries:

- Public login must not reveal whether an email has a user or invite.
- New real-auth users require an invite unless they match `INITIAL_SUPER_ADMIN_EMAIL`.
- Admin UI routes are super-admin-only under `/admin`.
- Tenant admins work from `/app/settings` routes and backend-scoped mutations.
- Company admins must not see unscoped or cross-company auth events.
- Local test auth must fail closed when disabled or marked production.
- E2E mock auth must stay isolated to explicit E2E mode.
- Sensitive Convex actions must use `actionAuth` helpers rather than query/mutation helpers.

## Verification

Focused tests include:

- `src/app/login/page.test.tsx` for neutral magic-link copy, diagnostics preflight, and Google/email redirects.
- `convex/authUserProvisioning.test.ts` for invite-only provisioning, invite acceptance, stale accepted invite recovery, expiration, revoked invites, public diagnostics, and initial super-admin creation.
- `convex/authEvents.test.ts` for super-admin reads, company-admin scoping, and standard-user rejection.
- `convex/authz.test.ts` for active-company and tenant helper behavior.
- `convex/localTestAuth.test.ts` for deterministic seeding, secret validation, and fail-closed behavior.
- `e2e/auth-journey.spec.ts`, `e2e/auth.setup.ts`, and `e2e/helpers/auth.ts` for deterministic browser auth route journeys.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
