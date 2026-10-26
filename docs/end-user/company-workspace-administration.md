---
product: Hakken
documentation_type: user guide
feature_area: company and user administration
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/company-workspace-administration.md
last_reviewed: '2026-10-26T09:45:20+00:00'
reviewed_against: current implementation
status: Current
---
# Company Workspace Administration

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Company and user administration
> **Reviewed:** 26 October 2026, 09:45:20 GMT (Europe/London)
> **Source path:** `docs/end-user/company-workspace-administration.md` · **Status:** Current

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
- `/admin/companies/new`: dedicated Add company page, saving the company name and website together.
- `/admin/companies/[id]`: company detail.
- `/admin/companies/[id]/overview`: company overview.
- `/admin/companies/[id]/features`: workspace feature gates beyond plan defaults.
- `/admin/companies/[id]/directory/users`: company users.
- `/admin/companies/[id]/directory/invites`: company invitations.
- `/admin/companies/[id]/calls`: company call review.
- Gmail mailbox review is retired; see [Gmail Mailbox](./gmail-mailbox.md) for the removal record.

Company pages are tenant-boundary surfaces. Always confirm the company id and company name before editing users, invites, prompts, rules, models, knowledge, widgets, or chat logs.

## Organization Dashboard

The organization dashboard reads the signed-in user's company and a selected calendar period. It shows activity and message figures and can show an incomplete-figures notice. Usage charts and provider distribution have moved out of this screen; the company's Usage surface reports credits. Do not interpret an organisation card as a reconciled Stripe revenue statement or provider invoice. For plan, credits and billing distinctions, use [Platform Plans And Quotas](./platform-plans-and-quotas.md).

If the signed-in user is not linked to a company, the page reports that no organization is linked. Fix the user-company assignment before interpreting missing analytics as low usage.

## Team Management

Company admins use `/app/settings/team` to manage tenant users and review pending invitations. The current Add action directly creates a user record through `addUser`; despite invite-style wording in the editor, it does not itself dispatch an invitation email. Dedicated invitation pages use the email-dispatch workflow. The supported tenant roles are `USER` and `ADMIN`.

Use `USER` for normal workspace users. Use `ADMIN` for people who manage team membership, organization settings, and company-scoped operational surfaces.

Tenant admins cannot grant or manage platform roles: `SUPER_ADMIN`, `READ_ONLY`, and `AUDITOR`. They also cannot edit or remove existing platform-role accounts. Those roles belong to platform administration, even when the account is attached to a company.

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

The directory routes under `/admin/companies/[id]/directory` are the current
company user/invite management home:

- `directory/users` manages company users
- `directory/invites` manages company invitations
- the directory index redirects to users

Do not describe removed direct `/admin/companies/[id]/users` or
`/admin/companies/[id]/invites` routes as current unless their files are
reintroduced.

## Personal Profile

Users can edit their own profile at `/app/profile`. The profile page supports name, phone number, and profile image updates. Email is displayed but fixed.

The Assistant Note tab lets a user see and manage the durable notes the
assistant keeps about them. They can add a note manually and delete manual or
learned notes. This is the user's own visibility and control point; it is not a
company-admin editing surface for someone else's memory.

The profile page also shows company plan and AI message usage when a finite plan applies. If assistant chat reaches the plan limit, Hakken records the attempted message and returns a quota-block assistant reply until the reset cycle or a plan change.

Profile image uploads use the platform upload policy. Do not ask users to paste arbitrary image links when the upload flow is available.

## Super-Admin Company Work

Super admins use company detail pages to prepare or support a tenant. Company detail routes connect to feature gates, directory users and invitations, calls, mailbox, AI prompt, AI rules, knowledge, Wiki pages, model defaults, usage, chat logs, and widget configuration.

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

## Creating And Configuring A Company

Open Add company from Manage Companies. The form asks for a name and website, then saves into the new company's detail area. The backend creates the company and, when a website is supplied, establishes its own-website holding in the same mutation. A rejected website address rolls back that mutation rather than deliberately leaving a half-created company. The website is a shared identity with a company-specific holding; adding it is not a promise that Google connections, paid collection, or product research have already completed.

Configure the plan, feature access, assistant instructions and directory in their own sections after creation. Saving one section does not save another tab's draft. Changes to profile descriptions clear the AI-authorship note for the changed field because a person now owns that wording. Feature switches change which optional sections the workspace can use. They do not stand in for a paid subscription or for a connected external account.

For a Stripe-managed company, manual plan assignment is refused. Company billing belongs in the frontend Billing page; platform setup is a separate operator responsibility. Likewise, the backend blocks company deletion when Stripe billing history exists and tells the operator to reconcile and archive billing first. Do not try to bypass that protection by deleting directory users or changing plan fields separately.

## Invitation Outcomes And Re-Adding People

Invitation dispatch can report that it created a new pending invitation, reissued an existing invitation, or found an already active account. An accepted invitation with a current account is not made pending again: that person should sign in. An accepted invitation whose account is missing can be reissued with fresh workspace, role, token and date. The new invitation uses `/login`; access follows the authenticated email rather than a visible token in the link.

A successful dispatch result may be simulated when the environment has no configured mail credential. It establishes a record outcome, not delivery to a real inbox. Even with a provider credential, email sending and the subsequent record mutation are separate operations. Check both the reported outcome and the pending directory entry when investigating a handoff. Repeating a send blindly can produce another message without solving an identity conflict. Never share sign-in codes or raw invitation records containing credentials in support notes.

## Deletion And Cleanup Boundaries

Deleting an individual user runs a dedicated identity cleanup before deleting the user row. It removes sessions, refresh tokens, linked provider accounts, unredeemed verification codes and matching canonical-email invitations. Content cleanup is separately scheduled for logins, rules, personal assistant notes and chat threads. Re-adding someone should begin with a fresh account or invitation, rather than relying on an old accepted record. Historic audit evidence and unrelated operational records are not covered by a promise of universal erasure.

Company deletion schedules batches for its users, invitations and website holdings, removes the company record, and retains shared website identities. The company batch directly deletes user rows; it does not call the same inline identity-purge helper as individual deletion. That implementation difference needs application follow-up before promising identical authentication cleanup or retention outcomes. A missing company row is not proof that all scheduled batches succeeded or that every related integration record has disappeared.

These procedures were reviewed from source only. No account was created, invitation sent, role changed, company deleted, or cleanup job invoked. Current implementation still uses a field editor dialog in the tenant team screen; it does not yet follow the repository's page-editor convention. This guide describes that behavior without changing the interface.
