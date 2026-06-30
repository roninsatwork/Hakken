# Organization And Company Workspaces

Organization and company workspace screens let tenant admins monitor their own workspace, manage team members, review company-level AI usage, and adjust personal profile information. Super admins also have company detail and white-label settings screens for preparing customer workspaces and branded platform packages.

For task-level user, invite, directory, profile, and handoff workflows, see [Company Workspace Administration](./company-workspace-administration.md).

## Where To Find It

Tenant-facing routes:

- `/app/settings` opens the organization dashboard for the signed-in user's company.
- `/app/settings/team` manages users and pending invites for the user's company.
- `/app/settings/auth-diagnostics` opens company-scoped auth diagnostics.
- `/app/profile` lets a user update their own profile.

Super-admin company routes:

- `/admin/users` lists platform users and pending invites across the accessible scope.
- `/admin/users/invite` creates an invite outside a company detail page.
- `/admin/users/[id]` shows a user's activity and cost history.
- `/admin/companies` lists tenant companies.
- `/admin/companies/[id]` and `/admin/companies/[id]/overview` show company detail and overview.
- `/admin/companies/[id]/users` manages company users.
- `/admin/companies/[id]/invites` manages company invitations.
- `/admin/companies/[id]/directory` redirects to `/admin/companies/[id]/directory/users`.
- `/admin/companies/[id]/directory/users` reuses the company users page.
- `/admin/companies/[id]/directory/invites` reuses the company invites page.
- `/admin/settings` manages platform identity, appearance, security, audit, purge, option, and white-label readiness settings.

## Organization Dashboard

The organization dashboard shows company-level usage and cost metrics for the current user's company. It includes a timeframe selector with preset and custom ranges, metric cards for monthly recurring revenue, active context, AI cost, and message count, a usage timeline, provider usage, top users, and top agents.

If the signed-in user is not linked to a company, the page shows that no organization is linked. If the user is linked to a company, the analytics query is scoped to that company.

Use this dashboard to understand tenant activity, message consumption, provider mix, and cost movement. It is an operational view and should be paired with plan status and billing workflows before making commercial decisions.

## Team Management

The team page lets company admins search users and pending invites, invite a user, edit a user's name, email, role, image URL, and company assignment within the current company, revoke pending invites, and delete users. The supported tenant roles on the team form are `USER` and `ADMIN`.

Tenant-scoped admins cannot create, edit, or delete super-admin privileges. They operate inside their active company. Pending invite rows are shown with their invited email, role, invite date, and revoke action.

Use `USER` for normal workspace users and `ADMIN` only for people who should manage team and organization settings. Revoke stale invitations rather than leaving unused access pending.

## Personal Profile

The profile page lets signed-in users update their own name, phone number, and profile image. Email is displayed but fixed. Profile image uploads use the same admin image upload policy and storage flow as other safe image uploads.

The profile page also shows the user's company AI messaging pool, current plan name, monthly reset note, and usage progress when the plan has a finite message limit. If assistant chat reaches that limit, Sonae records the attempted message and returns a quota-block assistant reply until the next billing cycle or a plan change.

## Company Workspaces For Super Admins

Super admins use company detail routes to inspect and configure a tenant workspace. Company detail pages connect to users, invites, AI prompt, AI rules, knowledge, models, chat logs, and widgets. Directory routes are currently aliases: the directory index redirects to users, and directory user/invite pages re-export the company users and invites pages.

The company list lets super admins search companies, create a new company, edit its name, edit the company-level system prompt, assign or clear an active plan, and delete a company. Company creation, update, and deletion write audit history. Plan assignment updates the company plan and inventory rollups, but it does not currently write a direct audit event. Deleting a company is destructive: the company row is removed and related company entities are scheduled for purge.

The workspace shell includes an `Impersonate Workspace` action for super admins. It switches the super admin into the selected company context and redirects to the tenant app. Use impersonation for support and verification, then return to the normal super-admin context when the tenant-scoped task is complete.

The overview page edits the company name, tagline, detailed profile overview, and, for super admins, the subscription plan override. The same page displays current plan usage and available active tiers so operators can confirm the visible subscription state after changing the assignment.

Company workspaces are the main tenant boundary. Check the company name and route before editing users, invites, prompts, rules, knowledge, model defaults, or widgets.

## Platform Users Area

The global users area is separate from a single company workspace. Super admins can see platform-level users, choose company assignment when creating or editing users, invite users without first opening a company, and open a user detail page with that user's activity and cost history. Scoped admins and impersonating super admins see company-filtered users through the same backend rules.

Use the company workspace user pages when the task is about one customer. Use `/admin/users` when the task is platform-wide account review, unassigned user cleanup, or support investigation across companies.

## White-Label Settings

The platform settings page includes identity, appearance, security, audit, purge, and options tabs. It also loads white-label readiness, module presets, navigation profiles, custom domain checklist, handoff summary, and packaging checklist data.

White-label settings cover platform name, currency and pricing display values, light and dark logos, email sender name and address, brand color, fonts, base text sizes, border radius, light and dark theme colors, and diagnostic routing. Logo uploads are validated before storage-backed references are saved.

White-label readiness compares system settings and active widgets against packaging requirements. Use it when preparing a branded customer environment, custom domain handoff, or operator packaging checklist. The settings page is global platform configuration, so changes can affect every tenant.

## Practical Guidance

For tenant admin work, start in `/app/settings` and `/app/settings/team`. For platform setup or support, start from `/admin/companies/[id]` so the company context is explicit. For platform-wide user review, start from `/admin/users`. For branded deployments, use `/admin/settings` together with the white-label operator guides and widget configuration.

Before deleting a user, revoking an invite, impersonating a company, changing a company prompt, deleting a company, changing a plan assignment, or changing global white-label settings, confirm the active company and role context. These changes can affect access, AI behavior, billing limits, branding, retained data, and customer trust immediately.
