---
product: Hakken
documentation_type: Developer guide
feature_area: Auth diagnostics
audience: developers and support operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/auth-diagnostics.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# Auth Diagnostics Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Auth diagnostics
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/auth-diagnostics.md` · **Status:** Current


Auth diagnostics are the support surface for login, magic-link, invite, and provisioning events. They use the `authEvents` table, not the regular `auditLogs` ledger, because these events are troubleshooting evidence for authentication flows rather than privileged admin mutations.

Read this before changing auth event logging, invite-only provisioning, magic-link diagnostics, or the shared Auth Diagnostics page. For route-level authentication and redirects, see [Route Protection And Authentication](./route-protection-and-authentication.md).

## Product Surface

- `src/app/(dashboard)/_features/auth-diagnostics/AuthDiagnosticsPage.tsx` is the shared diagnostics UI.
- `src/app/(dashboard)/admin/auth-diagnostics/page.tsx` re-exports the shared UI for the admin maintenance area.
- `src/app/(dashboard)/app/settings/auth-diagnostics/page.tsx` re-exports the same UI for company settings.
- `convex/authEvents.ts` owns auth event types, logging, diagnostics reads, and public magic-link request diagnostics.
- `convex/authUserProvisioning.ts` logs provisioning-time auth events while creating or finding users.
- `src/app/login/page.tsx` calls `api.authEvents.recordMagicLinkRequestAttempt` before the auth flow sends a magic link.

The page is available to admins and super admins. Standard users see a restricted state.

## Data Model

`authEvents` rows contain:

- normalized lowercase `email`
- `eventType`
- `timestamp`
- optional `companyId`
- optional `userId`
- optional `inviteId`
- optional `provider`
- optional `reasonCode`

Indexes are:

- `by_email`
- `by_company`
- `by_type`
- `by_timestamp`

The diagnostics UI currently reads recent events only; it does not paginate from Convex. It filters the returned sample client-side.

## Event Types

Current event types are:

- `MAGIC_LINK_REQUESTED`
- `MAGIC_LINK_STARTED`
- `INVITE_FOUND`
- `INVITE_MISSING`
- `INVITE_EXPIRED`
- `INVITE_REVOKED`
- `INVITE_STALE_ACCEPTED_RECOVERED`
- `USER_FOUND`
- `EMAIL_DISPATCH_SIMULATED`
- `EMAIL_DISPATCH_STARTED`
- `EMAIL_DISPATCH_FAILED`
- `MAGIC_LINK_VERIFIED`

Keep this list in sync between the schema, `AuthEventType`, and the UI filter list. Adding an event type without updating all three will either fail validation or hide the event from operators.

## Logging Sources

`logAuthEvent` normalizes the email and inserts the event with optional company, user, invite, provider, and reason code.

`recordMagicLinkRequestAttempt` records public login-attempt diagnostics. It logs:

- `MAGIC_LINK_REQUESTED` for any non-empty email
- `USER_FOUND` when an existing user matches
- `INVITE_MISSING` when no user or invite exists
- `INVITE_FOUND` when an invite exists
- `INVITE_REVOKED`, `INVITE_EXPIRED`, or `INVITE_STALE_ACCEPTED_RECOVERED` for invite status edge cases

`createOrUpdateHakkenAuthUser` logs provisioning events while handling auth-provider callbacks. It logs existing user discovery, verified magic-link completions, magic-link starts, invite discovery, stale accepted invite recovery, and provisioning of invited users.

Initial super-admin provisioning through `INITIAL_SUPER_ADMIN_EMAIL` creates the user directly and does not currently log an auth event. Treat that as current behavior, not a documented diagnostics event.

## Access Scope

`getRecentAuthEvents` requires admin access.

Super admins read the latest 500 auth events across the platform ordered by timestamp descending. Company admins read the latest 500 events scoped to their active company id. Company admins without an active company id receive an empty result. Standard users are rejected by the backend; the shared UI also avoids calling the query for non-admin users.

Each returned row is enriched with `companyName` when `companyId` is present.

Do not expose unscoped auth events to company admins. Unscoped events include missing-invite attempts and other platform-level login diagnostics that may reveal emails outside a tenant boundary.

## UI Behavior

The shared diagnostics page:

- reads `api.users.getMe` first
- skips the diagnostics query until the current user is known to be an admin or super admin
- shows a restricted state for standard users
- supports search across email, event type, reason code, provider, company name, user id, and invite id
- filters by event type
- filters by time window: 24 hours, 7 days, 30 days, or all returned events
- exposes a company filter only for super admins
- uses the shared 15-row admin pagination helper

The table shows event, email, company, reason, provider, and timestamp.

## Troubleshooting Semantics

Use these events to answer support questions such as:

- did the user request a magic link?
- did the system find an existing user?
- did the email match an invite?
- was the invite missing, expired, revoked, or already accepted?
- did the provider callback verify the magic link?
- did email dispatch start, fail, or run in simulated mode?
- which company or invite was associated with the attempt?

Auth diagnostics are not an authorization override. Operators should use the evidence to decide whether to resend an invite, fix a user/company assignment, revoke and recreate an invite, or inspect email delivery configuration.

## Adding Event Coverage

When adding an auth event:

1. Add the type to the schema union.
2. Add the type to `AuthEventType`.
3. Add the type to the UI filter list.
4. Log a stable `reasonCode`.
5. Include `companyId`, `userId`, or `inviteId` whenever safely known.
6. Add tests for super-admin visibility and company-admin scoping.
7. Update this guide and user-facing support docs if the troubleshooting flow changes.

Avoid storing raw tokens, magic-link URLs, session ids, IP addresses, or provider secrets in `authEvents`. Email and ids are enough for the current support workflow.

## Verification

Focused tests include:

- `convex/authEvents.test.ts` for super-admin platform reads, company-admin scoped reads, and standard-user rejection.
- `convex/authUserProvisioning.test.ts` for provisioning-time auth events and invite edge cases.
- `src/app/login/page.test.tsx` for login-page magic-link request instrumentation where present.
- UI tests for the shared diagnostics page if the filters, restricted state, or pagination behavior changes.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Bounded Event Evidence And Current Auth Flow

`authEvents.getRecentAuthEvents` is an admin query. SUPER_ADMIN reads the newest 500 platform events; other permitted callers read up to 500 for the active company or receive an empty list without one. UI search, event/time filters and pagination operate on that returned population. Choosing All means all returned events, not every historical authentication event. Missing an old event in this screen does not prove it was never recorded.

The ledger includes pre-session invite/email attempts that may not carry a company. Company admins do not receive all unscoped events merely because the attempted email resembles their domain. Role, provider, reason and invitation identifiers can be sensitive support evidence. Do not include tokens, raw cookies, auth codes or secret values when adding an event or copying diagnostics into a report.

`recordMagicLinkRequestAttempt` and reservation helpers have their own public-before-session contract and bounded rate checks. They are not a way to provision arbitrary users or bypass invite-only admission. Provider callback/provisioning source is in `authUserProvisioning.ts`, which checks canonical identity/email and records actual admission/refusal events. A started email event or an invite row is weaker than successful callback verification. Simulated dispatch remains explicitly different from a real accepted provider send.

The auth event keep rule is 180 days through the owning purge pipeline, not the 500-row screen limit. An event can exist outside the recent list, and retention cleanup is not proof of provider-side deletion. Local test-auth events have explicit environment guards; documentation review did not create a login, seed a fixture, reserve a send, or test an identity provider.

Read [Authentication](./route-protection-and-authentication.md) for sign-in/control flow and [Company user management](./company-user-management.md) for invitation repair consequences. Source tests cover selected admission and scope cases; they do not certify every production callback, external email delivery, or accepted rename cutover. Diagnostic investigation is observational; actually resending/revoking or changing a role requires the separate operation's authorization.

For support handoff, distinguish event visibility from the user's current session and actual mail delivery. An empty bounded feed cannot prove that an older or unscoped sign-in attempt never occurred.
