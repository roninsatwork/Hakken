---
product: Hakken
documentation_type: developer guide
feature_area: authentication and access
audience: developers and operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/route-protection-and-authentication.md
last_reviewed: '2026-10-26T09:42:59+00:00'
reviewed_against: current implementation
status: Current
---
# Route Protection And Authentication Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Authentication and access
> **Reviewed:** 26 October 2026, 09:42:59 GMT (Europe/London)
> **Source path:** `docs/developer/route-protection-and-authentication.md` · **Status:** Current

Route protection and authentication in Hakken are implemented through Convex Auth providers, client-side layout guards, deterministic test-auth helpers, Next.js route aliases/security headers, and backend Convex authorization checks. `src/proxy.ts` supplies the Next.js request boundary, app layouts apply role-aware navigation, and sensitive Convex handlers enforce backend authorization. The absence of a root `middleware.ts` does not mean request protection is absent.

Read this before changing `next.config.ts`, `convex/auth.ts`, `convex/authUserProvisioning.ts`, `convex/authEvents.ts`, `convex/authz.ts`, `convex/actionAuth.ts`, `convex/localTestAuth.ts`, `convex/oneTimeCodes.ts`, `convex/magicLinkUrlService.ts`, `src/app/login/page.tsx`, `src/app/verify/page.tsx`, dashboard layouts, admin layouts, or E2E auth helpers. For support diagnostics events, see [Auth Diagnostics](./auth-diagnostics.md). For user and invite lifecycle rules, see [Company And User Management](./company-user-management.md).

## Authentication Providers

`convex/auth.ts` configures Convex Auth with:

- Google sign-in through `@auth/core/providers/google`
- Resend email magic links through `@auth/core/providers/resend`
- typed codes through Convex Auth `Email`, with provider ID `one-time-code`
- an optional local-test credentials provider when local test auth is explicitly enabled

The auth callback `createOrUpdateUser` is `createOrUpdateHakkenAuthUser` from `convex/authUserProvisioning.ts`. That callback is the invite-only provisioning gate for real auth providers.

`convex/auth.config.ts` exposes the Convex site provider configuration used by the frontend auth provider.

## Login Page

`src/app/login/page.tsx` is the public login screen. It supports:

- Google sign-in with `signIn("google", { redirectTo })`
- email magic-link sign-in with `signIn("resend", { email, redirectTo })`
- typed one-time-code sign-in through public `oneTimeCodes` mutations
- preflight auth diagnostics through `api.authEvents.recordMagicLinkRequestAttempt`

The email flow deliberately uses neutral success copy. It shows the same "check your inbox" state whether the backend accepts or rejects the email. This avoids user enumeration from the public login form.

If diagnostics logging fails, the login page catches that failure and still proceeds with the auth action. Auth diagnostics are useful evidence, not a dependency for sending the magic link.

The actual send boundary is the exported `auth:signIn` action in
`convex/auth.ts`. Before either `resend` or `one-time-code` invokes its email
provider, it atomically calls `internal.authEvents.reserveAuthEmailSend`.
The reservation occurs before eligibility checks, so an admitted reservation is not proof of an actual mail send. `canStartEmailSignIn` returns a generic refusal for unknown, revoked, expired or ambiguous new identities before invoking the provider. Magic links and codes share a five-send rolling 15-minute limit and a 30-send
hourly limit per normalized address, plus a 60-send-per-minute platform
backstop. A refused call returns the same generic `started` shape and never
invokes the provider. The page-level checks remain useful early feedback and
diagnostics, but direct callers cannot bypass this authoritative gate.

## Verify Page And One-Time Codes

`src/app/verify/page.tsx` is the page a magic-link email lands on. It reads the
consent code parameter named by `CONSENT_CODE_PARAM` in
`convex/magicLinkUrlService.ts`, but it does not redeem the code during page
load. Redemption happens only inside the user's button click handler. This
protects one-use sign-in links from mail gateways that render links before the
user sees the message.

`convex/magicLinkUrlService.ts` builds the consent URL for `/verify`. Keep the
parameter name and route aligned with the email provider callback and the verify
page.

`convex/oneTimeCodes.ts` supports typed code sign-in with one public mutation for
request throttling. The rules live in `convex/oneTimeCodeService.ts`: six digits,
ten-minute configured provider expiry, a five-request rolling window per email, an
hourly per-email cap, and a 60-request-per-minute global backstop. Successful
verification is recorded only by the trusted Convex Auth callback in
`convex/authUserProvisioning.ts`; the browser cannot submit success or failure
telemetry for an arbitrary address. The emailed code contains no redemption link for scanners to follow. `checkCode` and `MAX_ATTEMPTS` describe a five-attempt helper rule, but the current login path submits directly to Convex Auth rather than calling that helper. Do not claim that helper alone proves the provider enforces five attempts. Provider-specific verification behavior needs separate runtime/library evidence. The UI normalizes input and reports a generic incorrect-code message on framework failure.

## Invite-Only Provisioning

`createOrUpdateHakkenAuthUser` is the source of truth for user creation during auth callbacks.

It extracts email, name, and image from provider payloads, lowercases the email, and then:

- returns existing users and logs `USER_FOUND`
- logs `MAGIC_LINK_STARTED` for unverified email-provider starts
- logs `ONE_TIME_CODE_VERIFIED` only after the one-time-code provider verifies the email
- accepts compatible pending invites after verified email or OAuth/OIDC authentication; OAuth is treated as verified because Google’s mapped profile omits the email verification flag
- rejects ambiguous canonical users or invitations, missing linked identities, linked-email mismatch and cross-workspace pending invitations
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

Provisioning callbacks record additional events such as `MAGIC_LINK_STARTED`, `MAGIC_LINK_VERIFIED`, `ONE_TIME_CODE_VERIFIED` and `OAUTH_VERIFIED`. OAuth acceptance must not be recorded as if a magic link was sent.
`AUTH_EMAIL_SEND_RESERVED` records an admitted provider send at the server
boundary; it deliberately covers both link and code providers.

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

`ConvexClientProvider` uses `ConvexAuthNextjsProvider` during normal runtime. Only when `NEXT_PUBLIC_E2E_AUTH_ENABLED=1`, `NEXT_PUBLIC_E2E_AUTH_ENVIRONMENT=local`, and the build is non-production does it bypass the real Convex client so the E2E mock can provide deterministic data.

`src/app/(dashboard)/layout.tsx` provides the authenticated dashboard shell and sidebar. It does not itself perform role checks.

`src/app/(dashboard)/admin/layout.tsx` is the main admin route guard. It reads `api.users.getMe`, admits `SUPER_ADMIN` and `READ_ONLY`, admits `AUDITOR` only under `/admin/governance`, and returns `null` while loading or redirecting to prevent admin UI flashing. Auditors elsewhere go to Governance; other rejected roles go to `/app`. `AccessLevelProvider` removes write controls from oversight roles; the backend independently rejects writes.

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

`recordLogin` collapses records from the same device within 60 minutes regardless of IP, updates `lastLoginAt` only on insert, and writes `SYSTEM_AUTHENTICATION` audit logs for every inserted user session. It also records the reader language. The IP lookup is aborted after 1.5 seconds and falls back to unknown values. This best-effort telemetry is not the authentication authority. Explicit logout audits remain restricted to admin and super-admin users.

Logout calls `api.users.recordLogout`, then Convex Auth `signOut`, then hard-navigates to `/`. The hard navigation is intentional so logout still leaves deep admin pages even if auth loss triggers a client-side exception.

## Local Test Auth

Local test auth is intentionally gated. The credentials provider is added only when:

- `LOCAL_TEST_AUTH_ENABLED=1`
- `LOCAL_TEST_AUTH_ENVIRONMENT=local`

`convex/localTestAuth.ts` requires `LOCAL_TEST_AUTH_SECRET` and supports deterministic roles:

- `super-admin`
- `company-admin`
- `user`

`api.localTestAuth.seed` creates or updates a deterministic `Local Test Company` and three deterministic users. `internal.localTestAuth.authorize` verifies the shared secret, checks that the requested user exists with the expected role, and ensures tenant users have a company.

This provider must never be enabled in production. The guard checks explicit local enablement, the local label and the configured shared secret. Unlike the E2E runtime helper, this guard does not separately inspect `NODE_ENV`; do not claim that a production runtime independently overrides mislabelled local settings. No seed or cleanup was invoked in this review.

## E2E Mock Auth

Playwright E2E tests use a separate deterministic cookie helper:

- `e2e/auth.setup.ts` writes storage states with a `hakken_e2e_auth` cookie.
- `e2e/helpers/auth.ts` can set the same cookie in a test.
- `src/e2e/convexReactMock.tsx` reads the cookie and returns deterministic users from mocked `useQuery` calls.

This is not the same as Convex local test auth. E2E mock auth requires both server and public enable flags, both explicit `local` environment labels, and a non-production runtime. It should only be used for browser route smoke tests.

## Route Redirects And Aliases

Current implemented redirects include:

- `/app` redirects super admins to `/admin` once per session.
- `/admin` admits platform operators and read-only accounts; auditors reach Governance, and other rejected roles return to `/app`.
- `/admin/agents/skills` redirects exactly to `/admin/ai/skills` through
  `src/lib/legacyAdminRedirect.ts`; nested paths under the old address are not
  redirected.
- `/admin/companies/[id]/directory` redirects to `/admin/companies/[id]/directory/users`.
- `/admin/companies/[id]/ai` opens the company AI readiness overview.
- `/verify` requires a user click before redeeming a magic-link consent code.

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

The default header set is an enforcing CSP with same-origin frame ancestors. It is used by the public landing/login, admin, app, and sandbox routes. Production removes `unsafe-eval`, limits scripts to Hakken and the configured Google analytics hosts, and limits browser requests to configured Convex origins plus the named analytics, monitoring, location, OpenAI, and secure voice-relay channels. The widget iframe route `/w/:path*` and the embed script `/embed.js` use an embed header set with `frameGuard: false` so customer sites can host the widget. Per-widget frame authorization is request-specific and belongs to `src/proxy.ts`, which applies an enforcing `frame-ancestors` policy from the widget's allowed domains. Treat this as intentional widget behavior, not a general relaxation for dashboard routes.

The widget header set remains report-only for its general resource policy because it runs on customer sites and has different integration requirements; its request-specific `frame-ancestors` header is enforcing. The main app policy keeps inline scripts and styles for the current Next.js bootstrap, secure WebSockets for the runtime-configured voice relay, and HTTPS images for customer-configured avatars. If widget embedding, sandbox behavior, or dashboard CSP posture changes, update this guide, [Embedded Widgets](./embedded-widgets.md), and the customer handoff docs together.

## Access Boundary Rules

Preserve these boundaries:

- Public login must not reveal whether an email has a user or invite.
- New real-auth users require an invite unless they match `INITIAL_SUPER_ADMIN_EMAIL`.
- Admin write access remains privileged; read-only accounts can inspect allowed Admin surfaces and auditors are restricted to Governance.
- `superAdminQuery` includes `READ_ONLY`, while `superAdminMutation` admits `SUPER_ADMIN` alone. Company-specific read handlers may impose further scoping.
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
- `convex/oneTimeCodes.test.ts` and `convex/oneTimeCodeService.test.ts` for typed-code request, expiry, attempt, and verification behavior.
- `convex/magicLinkUrlService.test.ts` for the `/verify` consent URL.
- `convex/localTestAuth.test.ts` for deterministic seeding, secret validation, and fail-closed behavior.
- `e2e/auth-journey.spec.ts`, `e2e/auth.setup.ts`, and `e2e/helpers/auth.ts` for deterministic browser auth route journeys.

The focused test sources were inspected, not executed. This documentation pass used Markdown checks and `git diff --check`; it did not run browser authentication, seed accounts, send mail, or inspect live sessions. Before implementation merges or pushes, use the current full gates in AGENTS.md rather than a shortened copied command list.

## Request Boundary And Identity Limits

`src/proxy.ts` checks authentication for `/app` and `/admin`, sends anonymous requests to `/login?redirectTo=…`, and sends signed-in requests away from `/` and `/login`. `sanitizeAuthRedirect` accepts only local `/app` or `/admin` paths, preserving safe query/hash values and falling back to `/app` for external or unrelated destinations. Request authentication does not determine the user's role; the layout and backend still do that. Widget frame policy runs before these branches and is covered separately in the widget guides.

`usersForCanonicalEmail` combines the exact email index with a bounded legacy search fallback, filters canonical matches, and detects ambiguous identities. It reads up to three exact rows and one hundred search candidates. Invitations use `by_email`; preflight and provisioning refuse multiple matches rather than selecting arbitrarily. Existing-user handling occurs before new-invite expiry checks. `acceptPendingInvite` checks workspace compatibility, whereas the seven-day pending expiry rule is applied to new-user provisioning. Preserve this distinction when changing support copy.

The auth tables and session lifecycle are managed by Convex Auth. This review does not establish a custom maximum session lifetime or a universal account-deletion retention guarantee. Read user lifecycle and identity-purge implementation before making either claim. Auth diagnostic events use `by_type`, `by_email_type_timestamp`, `by_timestamp`, and company-scoped indexes for bounded reads. A retained event is evidence of that stage, not proof that all subsequent provider and session operations succeeded.
