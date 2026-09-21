> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is Movement Definitive Plan (not included in this copy).

# Auth And Login Hardening Plan

This is the source-of-truth plan for strengthening Hakken's invite-only authentication flow. Future agents should follow this plan in order unless the user explicitly changes the scope. If a phase must change, update this document in the same change set and explain why.

## Non-Drift Rules

- Keep the platform invite-only.
- Do not weaken tenant isolation or role boundaries to improve login convenience.
- Do not expose whether an arbitrary public email is registered, invited, expired, revoked, or unknown.
- Do not mark an invite as accepted when a magic link is merely requested.
- Do not hardcode production-only URLs or auth model literals in runtime paths.
- Do not use native browser dialogs for auth feedback.
- Keep `messages/en.json` and `messages/it.json` in parity for any new user-facing auth copy.
- Keep new tests focused on auth, invites, callback URLs, deliverability diagnostics, and login UX. Do not expand the frozen movement demo.

## Current Baseline

Completed in the current auth hardening slice:

- Magic-link requests include `redirectTo: "/app"`.
- Login success copy uses plain interpolation instead of `t.rich` for `{email}`.
- Authenticated visits to `/` and `/login` redirect to `/app`.
- Invite/user provisioning logic is extracted into `convex/authUserProvisioning.ts`.
- Regression tests cover pending invites, verified acceptance, stale accepted invites without a user row, expired invites, revoked invites, initial super admin provisioning, and login request shape.
- Auth event logging is durable for public magic-link request diagnostics and verified provider callbacks.
- Auth diagnostics are surfaced through a shared screen:
  - Super admins: `/admin/auth-diagnostics`
  - Company admins: `/app/settings/auth-diagnostics`
- Public magic-link feedback is neutral and does not echo the submitted email address.

Required baseline gates before starting the next phase:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

## Phase 1: Auth Event Logging

Status: Completed.

Goal: make login and invite failures diagnosable without exposing private account state to public users.

Implement:

- Add a durable auth event logging helper, preferably Convex-side.
- Capture safe auth event types:
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
- Store at minimum:
  - normalized email
  - event type
  - timestamp
  - companyId when known
  - userId when known
  - inviteId when known
  - safe reason code
  - provider, currently `resend` or `google`
- Do not store magic-link codes, verification tokens, raw Resend API keys, or full request payloads.

Acceptance:

- Backend tests prove each invite outcome creates the expected auth event.
- Public login behavior remains neutral.
- Existing audit log behavior is not broken.
- `npm run check` passes.

## Phase 2: Admin Auth Diagnostics View

Status: Completed.

Goal: let admins answer "why did this user not receive a link?" without opening terminal logs.

Implementation note: the existing `/admin` layout is super-admin-only. To preserve that boundary, the diagnostics screen is implemented as a shared component with separate routes for super admins and company admins rather than broadening `/admin` access.

Implement:

- Add an admin-only diagnostics surface or extend an existing audit/admin area.
- Show auth events with filtering by email, company, event type, and time.
- Scope access:
  - Super admins can see all auth events.
  - Company admins can see only events scoped to their active company.
  - Standard users cannot see auth diagnostics.
- Include clear labels for safe reason codes, not raw stack traces.

Acceptance:

- Tests cover super-admin, admin, and standard-user access.
- Company admin tests prove cross-company auth events are hidden.
- Tables use 15 rows per page unless a specific product requirement changes it.
- Locale dictionaries stay in parity if copy is added.

## Phase 3: Safer Public Login Feedback

Status: Completed.

Goal: reduce confusion without creating user enumeration risk.

Implement:

- Replace certainty-based public copy with neutral copy:
  - Example: "If this email is invited, you will receive a sign-in link shortly."
- Keep the same copy for unknown, expired, revoked, and existing emails.
- Optionally add non-public admin diagnostics links or event IDs only for authenticated admins, never on the public login screen.
- Avoid native dialogs; use existing in-app feedback patterns.

Acceptance:

- Login page tests assert neutral copy.
- Tests assert rejected backend requests still show neutral public feedback.
- No public copy reveals invite/user status.

## Phase 4: Resend And Rate-Limit UX

Goal: make repeated magic-link attempts predictable for users and observable for admins.

Implement:

- Add a resend cooldown in the login UI.
- Disable repeat submits during cooldown.
- Show neutral cooldown copy, such as "You can request another link in X seconds."
- Align UI cooldown with backend rate-limit assumptions where possible.
- Log rate-limit or repeated-request events using the Phase 1 event helper.

Acceptance:

- UI tests cover cooldown start, disabled resend, and cooldown completion.
- Backend tests cover repeated requests if backend rate-limit logic is added or surfaced.
- Public messaging remains neutral.

## Phase 5: Invite State Repair Tooling

Goal: detect and repair impossible invite/user states deliberately.

Implement:

- Add an admin-only read/report function for inconsistent states:
  - accepted invite without user
  - user without expected invite where invite is required
  - duplicate invites for one email
  - expired pending invites
- Add a repair action or mutation only where repair is safe.
- Record repair actions in audit/auth events.
- Prefer dry-run/report mode before mutation mode.

Acceptance:

- Tests cover report output and allowed repairs.
- Tests prove standard users cannot inspect or repair auth state.
- Tests prove company admins cannot repair outside their company.

## Phase 6: Invite Acceptance Semantics

Goal: make accepted invites traceable to a real user and verified login.

Implement:

- Add or plan schema fields:
  - `acceptedByUserId`
  - keep `acceptedAt`
- Set acceptance only after provider verification has occurred.
- Ensure accepted invite semantics are consistent for Google and magic-link sign-in.
- Migrate existing accepted invites safely if needed.

Acceptance:

- Tests prove `acceptedByUserId` is set only after verified login.
- Tests cover both Google and Resend paths if both paths can be simulated locally.
- Migration or repair docs explain how existing accepted invites are handled.

## Phase 7: End-To-End Magic-Link Coverage

Goal: protect the real browser flow, not just unit-level policy.

Implement:

- Add an e2e scenario that:
  - creates or seeds an invited user
  - requests a magic link
  - captures or simulates the generated link
  - opens the link in the browser
  - asserts redirect to `/app`
  - asserts user/session state is valid
- Prefer deterministic local/dev test providers over live email delivery.
- Keep production Resend out of automated tests.

Acceptance:

- E2E test is reliable in CI or documented as a local-only smoke test if CI cannot support it yet.
- Test does not depend on a real inbox.
- Test fails if `redirectTo: "/app"` is removed.

## Phase 8: Callback URL And Environment Checks

Goal: catch bad dev/prod URL configuration before magic links are sent.

Implement:

- Add a script or test that validates:
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CONVEX_SITE_URL`
  - `CONVEX_SITE_URL`
  - optional `CUSTOM_AUTH_SITE_URL`
  - app base URL used for invites and magic links
- Verify magic-link destination stays on the configured app origin and expected path.
- Include clear failure output for mismatched origins.

Acceptance:

- Check is part of `npm run check` or a clearly named companion script.
- Failure messages include the environment variable names to fix.
- No secrets are printed.

## Phase 9: Deliverability Diagnostics

Goal: distinguish auth rejection from email provider failure.

Implement:

- Record Resend response IDs for successful sends.
- Record safe provider error summaries for failures.
- Distinguish missing API key/dev simulation from actual provider delivery.
- Optionally surface bounce/suppression status if Resend APIs support it cleanly.

Acceptance:

- Tests cover simulated send, successful send response parsing, and failed send response parsing.
- Admin diagnostics can distinguish "not eligible for link" from "eligible but provider failed."
- No API secrets or raw provider payloads are exposed.

## Required Verification Per Phase

Each phase must run at least:

```bash
npm run lint:all
npm run check
git diff --check
```

Run `npm run build` when a phase changes runtime code, routing, middleware, schema, or frontend surfaces.

If port 3000 is running before `npm run build`, stop it first, then restart:

```bash
npm run dev
npm run convex:dev
```

## Change Control

If future work needs to deviate from this plan:

1. Update this document first or in the same change set.
2. State which phase changed.
3. State why the deviation is necessary.
4. Preserve the non-drift rules unless the user explicitly overrides them.
5. Add or update tests for the new behavior.
