---
product: Hakken
documentation_type: user guide
feature_area: authentication and access
audience: users, company admins and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/login-access-and-authentication.md
last_reviewed: '2026-10-26T09:42:59+00:00'
reviewed_against: current implementation
status: Current
---
# Login, Access, And Authentication

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Authentication and access
> **Reviewed:** 26 October 2026, 09:42:59 GMT (Europe/London)
> **Source path:** `docs/end-user/login-access-and-authentication.md` · **Status:** Current

Hakken uses invite-based access. Users sign in from `/login` with Google, an email magic link, or a typed one-time code, and the platform checks whether the email belongs to an existing user or a valid invitation.

This guide is for support, customer-success, admins, and operators who need to explain how people get into Hakken and how to troubleshoot access issues.

## Sign-In Methods

The login page supports:

- Google sign-in
- email magic links
- typed one-time codes

Successful sign-in normally opens `/app`; a safe requested destination under `/app` or `/admin` can be preserved through login. Super admins may then be redirected to `/admin`. A requested destination never grants the permissions needed to open it.

When someone requests an email magic link or code, Hakken shows neutral success text even if the email is not currently allowed. This is intentional. It prevents the public login screen from revealing whether an email address belongs to a user or invite.

Magic links land on `/verify` before signing in. That page does not redeem the link on load; the user must press the sign-in button. This protects one-use links from company mail scanners that open links before the person does. Typed one-time codes are useful when a mail system is especially aggressive about opening links.

## Invite-Based Access

New users normally need an invitation. An invite records:

- invited email
- company workspace, when applicable
- role: `USER`, `ADMIN`, or `SUPER_ADMIN`
- status: pending, accepted, or revoked
- invite date

The invite email sends the person to `/login`. The link does not need to include a visible invite token. The important step is signing in with the invited email address.

Pending invites expire after seven days. If an invite is expired, revoked, missing, or attached to a different email, the user may still see neutral login copy, but they will not gain access.

## Roles

Hakken uses workspace, platform, and evidence-review roles:

- `USER`: normal workspace user.
- `ADMIN`: company admin who can manage tenant-scoped organization areas.
- `SUPER_ADMIN`: platform operator with global administration access.
- `READ_ONLY`: can enter platform Admin and read the surfaces their backend policies permit, with write controls removed. Some company-specific reads remain scoped to an attached company.
- `AUDITOR`: can enter `/admin/governance` for governance evidence; other Admin routes send them to Governance. This is narrower than read-only access.

Company admins work inside `/app/settings` and `/app/settings/team`. Super admins use `/admin` for global platform administration.

## Admin Access

Platform Admin admits super admins and read-only accounts, with auditors restricted to Governance. Company admins and ordinary users are sent back to `/app`. The app avoids showing admin content while role checks are pending. A visible page is not permission to change it; backend authorization still decides each read and write.

Super admins can impersonate a company workspace for setup and support. While impersonating, they are working in a tenant context and should confirm the current company before changing users, prompts, knowledge, widgets, or settings.

## Login Tracking

When a signed-in user opens the dashboard, Hakken records a best-effort login record with:

- browser/device information
- IP address when available
- approximate location when available
- timestamp

If the IP lookup fails, Hakken records a concealed or unknown fallback. Repeated records from the same device within an hour are collapsed even if the IP changes. This is best-effort telemetry rather than a complete record of every authentication exchange.

Recorded login sessions create audit evidence for all roles. Explicit logout audit events are recorded for admins and super admins.

## Auth Diagnostics

Admins and super admins can use Auth Diagnostics to troubleshoot sign-in and invite issues.

Auth Diagnostics can show whether:

- the user requested a magic link
- an existing user was found
- an invite was found
- an invite was missing, expired, revoked, or already accepted
- the provider verified a magic link, typed code, or Google OAuth sign-in
- the event was associated with a company, user, or invite

Company admins see only diagnostics scoped to their company. Super admins can see broader platform diagnostics.

## Common Support Checks

When a user cannot sign in:

1. Confirm they are using the exact invited email address.
2. Check whether the invite is still pending and less than seven days old.
3. Revoke and resend the invite if the email was wrong or stale.
4. Confirm the user has the intended role and company assignment.
5. Check Auth Diagnostics for missing, expired, revoked, or accepted invite events.
6. For email magic links, confirm the email provider is configured for the environment.
7. If link scanning spends links before users click them, ask the user to sign in with the typed one-time code instead.

When a user can sign in but cannot access admin:

1. Confirm whether they should be a company admin or a super admin.
2. Use `ADMIN` for tenant organization management.
3. Use `SUPER_ADMIN` only for trusted platform operators.
4. Use evidence-review roles only when the person should inspect governance or read-only evidence, not manage configuration.
5. Confirm the person is not expecting global admin access from a tenant-admin account.

When a super admin lands in the wrong context:

1. Check whether they are impersonating a company.
2. Exit impersonation from the sidebar if they need global platform access.
3. Re-enter the intended company workspace only after confirming the target tenant.

## Security Notes

Do not send screenshots of magic-link emails, one-time codes, session cookies, or login links into shared support channels. Do not use super-admin accounts for normal tenant work when a scoped admin workflow is enough.

The public login screen is intentionally vague. Use Auth Diagnostics and invitation records for support evidence rather than expecting the login screen to explain the exact reason access was denied.

## Choosing A Link Or A Code

Use Google when the invited address is the Google account you intend to use. Signing in with a personal Google address does not transfer an invitation sent to a work address. When several Google accounts are open, check which one the account chooser selected before reporting that an invitation is broken. Email matching trims surrounding whitespace and ignores letter case; it does not treat different addresses or aliases as interchangeable.

Use a magic link when you can open the message in the browser that requested it. The verification page keeps the credential behind a button rather than redeeming it as soon as the page loads. That reduces accidental consumption by mail scanners, but software that actually clicks the button can still consume the link. A missing or already spent link produces a recovery page asking for a new link or a typed code. Do not repeatedly forward a one-use message between people or devices.

Use a typed code when email opens on a different device or your mail gateway consumes links. Request it from the login screen, then type its six digits into that screen. The code provider is configured for ten minutes. Spaces and punctuation are stripped from entered codes. A failed verification shows a general incorrect-code message; it does not reliably distinguish a wrong, expired, or already used code. Ask for a fresh code when needed, and avoid repeated guesses. The existence of a sent-state screen is not proof that the mail provider accepted a message.

## Request Limits And Delivery Problems

Magic links and codes share an authoritative send allowance per normalized email address: five in a rolling fifteen minutes and thirty in an hour. A platform-wide backstop also limits reservations to sixty per minute. Early page checks can refuse requests before they reach that boundary. Changing between link and code does not create a second mail allowance. The public screen stays neutral when a request is refused or the address cannot sign in.

If nothing arrives, verify the invited address, check junk or corporate quarantine, and allow the rate-limit window to clear before requesting more. Administrators can inspect the invitation and scoped authentication events. A send reservation proves the application admitted a request, not provider delivery. An environment without the configured mail credential can simulate the send in backend code; a successful local screen therefore does not establish working production email. Support should check environment configuration through approved operator procedures rather than sharing keys or asking a user for their sign-in credential.

## Existing Accounts And Workspace Conflicts

An existing account signs in through its established identity. A pending invitation to a different workspace cannot silently move that account: provisioning reports a workspace conflict. Duplicate accounts or invitations using the same canonical address also require administrator repair. Do not create additional invitations as a workaround until the duplicate or conflicting record is understood. New provisioning allows recovery of an accepted invitation whose user row is missing, so accepted status alone is not sufficient evidence that a particular failed sign-in was impossible.

Invitations awaiting new-user provisioning expire after seven days. Existing accounts follow their existing identity path, and verified sign-in can accept a compatible pending invitation. Administrators should inspect the actual account and invitation together instead of inferring all behavior from the invitation's age. Account deletion and team-management behavior are covered separately in [Company Workspace Administration](./company-workspace-administration.md).

## Scope And Evidence

Impersonation changes the active company used by tenant workflows; it does not turn a company administrator into a platform operator. Confirm the company shown before acting. A read-only account can inspect some platform-wide surfaces but remains company-scoped on handlers that explicitly require an attached company. Auditors should use Governance rather than expect the full Admin navigation.

This guide was checked against the login and verification pages, `src/proxy.ts`, the Admin layout, `convex/auth.ts`, `authUserProvisioning.ts`, `authEvents.ts`, `oneTimeCodes.ts`, `authz.ts`, and login-recording code. Source review establishes implemented behavior only. No real login, mail send, session revocation, or live Google acceptance was tested during this documentation pass.
