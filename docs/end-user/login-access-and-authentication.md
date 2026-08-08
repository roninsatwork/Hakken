# Login, Access, And Authentication

Sonae uses invite-based access. Users sign in from `/login` with Google, an email magic link, or a typed one-time code, and the platform checks whether the email belongs to an existing user or a valid invitation.

This guide is for support, customer-success, admins, and operators who need to explain how people get into Sonae and how to troubleshoot access issues.

## Sign-In Methods

The login page supports:

- Google sign-in
- email magic links
- typed one-time codes

Successful sign-in sends users into the main app at `/app`. Super admins may then be redirected to `/admin`.

When someone requests an email magic link or code, Sonae shows neutral success text even if the email is not currently allowed. This is intentional. It prevents the public login screen from revealing whether an email address belongs to a user or invite.

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

Sonae uses three roles:

- `USER`: normal workspace user.
- `ADMIN`: company admin who can manage tenant-scoped organization areas.
- `SUPER_ADMIN`: platform operator with global administration access.

Company admins work inside `/app/settings` and `/app/settings/team`. Super admins use `/admin` for global platform administration.

## Admin Access

The `/admin` area is for super admins. If a non-super-admin reaches an admin route, the app sends them back to `/app` and avoids showing admin content while access is being checked.

Super admins can impersonate a company workspace for setup and support. While impersonating, they are working in a tenant context and should confirm the current company before changing users, prompts, knowledge, widgets, or settings.

## Login Tracking

When a signed-in user opens the dashboard, Sonae records a best-effort login record with:

- browser/device information
- IP address when available
- approximate location when available
- timestamp

If the IP lookup fails, Sonae records a concealed or unknown fallback. Repeated identical login records are throttled to reduce noise.

Admin and super-admin login and logout actions also create audit evidence.

## Auth Diagnostics

Admins and super admins can use Auth Diagnostics to troubleshoot sign-in and invite issues.

Auth Diagnostics can show whether:

- the user requested a magic link
- an existing user was found
- an invite was found
- an invite was missing, expired, revoked, or already accepted
- the provider verified the magic link
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
4. Confirm the person is not expecting global admin access from a tenant-admin account.

When a super admin lands in the wrong context:

1. Check whether they are impersonating a company.
2. Exit impersonation from the sidebar if they need global platform access.
3. Re-enter the intended company workspace only after confirming the target tenant.

## Security Notes

Do not send screenshots of magic-link emails, one-time codes, session cookies, or login links into shared support channels. Do not use super-admin accounts for normal tenant work when a scoped admin workflow is enough.

The public login screen is intentionally vague. Use Auth Diagnostics and invitation records for support evidence rather than expecting the login screen to explain the exact reason access was denied.
