# Company Workspace Administration

Company workspace administration covers tenant setup, directory users, invitations, organization settings, personal profiles, and safe handoff between super admins and company admins. Use this guide when supporting a tenant workspace or preparing a customer handoff.

For the broader workspace overview, see [Organization And Company Workspaces](./organization-and-company-workspaces.md). For authentication troubleshooting, see [Operational Diagnostics And Retention](./operational-diagnostics-and-retention.md).

## Where To Find It

Tenant-facing routes:

- `/app/settings`: organization dashboard for the signed-in user's company.
- `/app/settings/team`: tenant team management.
- `/app/settings/auth-diagnostics`: company-scoped auth diagnostics.
- `/app/profile`: personal profile and plan usage.

Super-admin company routes:

- `/admin/companies`: company list.
- `/admin/companies/[id]`: company detail.
- `/admin/companies/[id]/overview`: company overview.
- `/admin/companies/[id]/users`: company users.
- `/admin/companies/[id]/invites`: company invitations.
- `/admin/companies/[id]/directory/users`: alias for company users.
- `/admin/companies/[id]/directory/invites`: alias for company invites.

Company pages are tenant-boundary surfaces. Always confirm the company id and company name before editing users, invites, prompts, rules, models, knowledge, widgets, or chat logs.

## Organization Dashboard

The organization dashboard shows company-scoped usage and cost signals for the signed-in user's company. It includes a timeframe selector, metric cards, usage timeline, provider distribution, top users, and top agents. For longer historical windows, treat provider distribution as partial because stored daily snapshots currently carry model metrics rather than provider totals.

Use it to answer:

- is the tenant actively using the platform?
- which users or agents are driving usage?
- which providers are being used?
- is cost moving unexpectedly?
- does message volume match the customer story?

If the signed-in user is not linked to a company, the page reports that no organization is linked. Fix the user-company assignment before interpreting missing analytics as low usage.

## Team Management

Company admins use `/app/settings/team` to manage tenant users and pending invitations. The supported tenant roles are `USER` and `ADMIN`.

Use `USER` for normal workspace users. Use `ADMIN` for people who manage team membership, organization settings, and company-scoped operational surfaces.

Tenant admins cannot grant or manage super-admin privileges. Super-admin assignment is a platform operation, not a company team task.

## Invite Users

Before inviting a user:

1. Confirm the target company.
2. Confirm the user's email spelling.
3. Choose the least privileged role.
4. Check whether an invite already exists.
5. Check whether the user already exists in another company.

Pending invites show email, role, invite date, and revoke action. Revoke stale or mistaken invitations rather than leaving unused access pending.

If a user reports sign-in trouble after an invite, use auth diagnostics to check whether the invite was found, expired, revoked, missing, or already accepted.

## Edit Or Remove Users

When editing a user, confirm:

- the user belongs to the intended company
- the role change is justified
- the email and display name are correct
- the profile image URL is appropriate
- the change will not strand a customer without an admin

Deleting a user removes their access path but does not automatically erase all historic operational evidence, chat logs, audit rows, or run records. Treat deletion as an access action, not a complete data-retention workflow.

## Directory Routes

The directory routes under `/admin/companies/[id]/directory` are currently aliases:

- `directory/users` reuses the company users page
- `directory/invites` reuses the company invites page
- the directory index redirects to users

Do not describe the directory as a separate implemented product module. It is a navigation grouping over the existing users and invites screens.

## Personal Profile

Users can edit their own profile at `/app/profile`. The profile page supports name, phone number, and profile image updates. Email is displayed but fixed.

The profile page also shows company plan and AI message usage when a finite plan applies. If assistant chat reaches the plan limit, Sonae records the attempted message and returns a quota-block assistant reply until the reset cycle or a plan change.

Profile image uploads use the platform upload policy. Do not ask users to paste arbitrary image links when the upload flow is available.

## Super-Admin Company Work

Super admins use company detail pages to prepare or support a tenant. Company detail routes connect to users, invites, AI prompt, AI rules, knowledge, model defaults, chat logs, and widget configuration.

Before changing company configuration:

1. Confirm the company route and name.
2. Check whether a super admin is impersonating or working globally.
3. Review existing users and admins.
4. Confirm the requested change affects only the intended tenant.
5. Use company-scoped pages instead of global AI settings when the request is tenant-specific.

Company prompts, rules, knowledge, models, widgets, and users can all affect tenant behavior immediately.

## Impersonation Awareness

When a super admin is impersonating or acting in a tenant scope, treat user and team management like company-admin work. Do not use impersonation to bypass least-privilege checks or create super-admin privileges from tenant flows.

If a support action depends on impersonation, record the reason in the appropriate support or operational notes and confirm that audit evidence exists where the feature records it.

## Handoff Checklist

Before handing a workspace to a customer admin:

- the company name and profile are correct
- at least one accountable company admin exists
- stale or mistaken invites are revoked
- role assignments follow least privilege
- model defaults and AI settings are reviewed
- company knowledge, rules, and prompts are current
- widget configuration and allowed domains are reviewed if a widget is used
- auth diagnostics are clean for first admin access
- plan usage expectations are explained

Workspace administration is primarily about safe scope. Most mistakes in this area come from editing the wrong company, over-granting roles, or treating a global setting as tenant-specific.
