---
product: Hakken
documentation_type: End-user guide
feature_area: Organization workspace profile and personal context
audience: end-user
source_repository: roninsatwork/Hakken
source_path: docs/end-user/organization-and-company-workspaces.md
last_reviewed: '2026-10-26T14:58:39+00:00'
reviewed_against: current implementation
status: Current
---
# Organization And Company Workspaces

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Organization workspace profile and personal context
> **Reviewed:** 26 October 2026, 14:58:39 GMT (Europe/London)
> **Source path:** `docs/end-user/organization-and-company-workspaces.md` · **Status:** Current

Organization and company workspace screens let tenant admins monitor their own workspace, manage team members, review company-level AI usage, and adjust personal profile information. Super admins also have company detail and white-label settings screens for preparing customer workspaces and branded platform packages.

For task-level user, invite, directory, profile, and handoff workflows, see [Company Workspace Administration](./company-workspace-administration.md).

## Where To Find It

Tenant-facing routes:

- `/app/settings` opens the organization dashboard for the signed-in user's company.
- `/app/settings/team` manages users and pending invites for the user's company.
- `/app/settings/auth-diagnostics` opens company-scoped auth diagnostics.
- `/app/profile` lets a user update their own profile, preferences, and Assistant Notes.

Super-admin company routes:

- `/admin/users` lists platform users and pending invites across the accessible scope.
- `/admin/users/invite` creates an invite outside a company detail page.
- `/admin/users/[id]` shows a user's activity and cost history.
- `/admin/companies` lists tenant companies.
- `/admin/companies/[id]` and `/admin/companies/[id]/overview` show company detail and overview.
- `/admin/companies/[id]/features` controls which feature sections the workspace can reach beyond its plan defaults.
- `/admin/companies/[id]/directory` redirects to `/admin/companies/[id]/directory/users`.
- `/admin/companies/[id]/directory/users` manages company users.
- `/admin/companies/[id]/directory/invites` manages company invitations.
- `/admin/companies/[id]/calls` reviews company calls.
- The former company Mailbox is retired; use the current communication guides.
- `/admin/settings` manages platform identity, appearance, security, audit, purge, option, and white-label readiness settings.

## Organization Dashboard

The organization dashboard shows company-level usage and cost metrics for the current user's company. It includes a timeframe selector with preset and custom ranges, metric cards for monthly recurring revenue, active context, AI cost, and message count, top-user and top-agent views, with current layout limits described below.

If the signed-in user is not linked to a company, the page shows that no organization is linked. If the user is linked to a company, the analytics query is scoped to that company.

Use this dashboard to understand tenant activity, message consumption, provider mix, and cost movement. It is an operational view and should be paired with plan status and billing workflows before making commercial decisions.

## Team Management

The team page lets company admins search users and pending invites, invite a user, edit a user's name, email, role, image URL, and company assignment within the current company, revoke pending invites, and delete users. The supported tenant roles on the team form are `USER` and `ADMIN`.

Tenant-scoped admins cannot create, edit, or delete super-admin privileges. They operate inside their active company. Pending invite rows are shown with their invited email, role, invite date, and revoke action.

Use `USER` for normal workspace users and `ADMIN` only for people who should manage team and organization settings. Revoke stale invitations rather than leaving unused access pending.

## Personal Profile

The profile page lets signed-in users update their own name, phone number, and profile image. Email is displayed but fixed. Profile image uploads use the same admin image upload policy and storage flow as other safe image uploads.

The profile page also has an Assistant Note tab. These notes are the user's own durable instructions or facts for the assistant. A user can add a note manually, see notes the assistant has learned about them, and delete notes. Admins do not have a separate screen for another person's Assistant Notes, so this tab is the visibility and control point for the subject of those notes.

The profile page also shows the user's company AI messaging pool, current plan name, monthly reset note, and usage progress when the plan has a finite message limit. If assistant chat reaches that limit, Hakken records the attempted message and returns a quota-block assistant reply until the next billing cycle or a plan change.

## Company Workspaces For Super Admins

Super admins use company detail routes to inspect and configure a tenant workspace. Company detail pages connect to overview, feature gates, directory users and invitations, company calls, company mailbox, AI prompt, AI rules, knowledge, Wiki, models, usage, chat logs, and widgets. Directory routes are now the current user/invitation management home inside a company record; older top-level company user and invite routes should be treated as historical references unless a file exists for them.

The company list lets super admins search companies, create a new company, edit its name, edit the company-level system prompt, assign or clear an active plan, and delete a company. Company creation, update, and deletion write audit history. Plan assignment updates the company plan and inventory rollups, but it does not currently write a direct audit event. Deleting a company is destructive: the company row is removed and related company entities are scheduled for purge.

The workspace shell includes an `Impersonate Workspace` action for super admins. It switches the super admin into the selected company context and redirects to the tenant app. Use impersonation for support and verification, then return to the normal super-admin context when the tenant-scoped task is complete.

The overview page edits the company name, tagline, detailed profile overview, and, for super admins, the subscription plan override. The same page displays current plan usage and available active tiers so operators can confirm the visible subscription state after changing the assignment. The separate Features screen edits `enabledModules`; plan-granted modules stay enabled even when a workspace-specific checkbox is off.

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

## Current Workspace Dashboard And Billing Distinctions

The organization dashboard is a company-scoped view, not platform administration. Its implementation has removed the old dedicated supplier-cost card and usage/provider chart from the main layout; Usage is a separate credits destination. Some leaderboard rows still display their recorded cost values. Read the actual screen and labels rather than assuming every cost field has moved or that every older dashboard description remains accurate.

A recurring value displayed from assigned plans is an estimate based on plan assignment, not verified Stripe collection. Paid company, covered users, available credit balance, model supplier spend and customer revenue answer different questions. Company-admin Billing is `/app/settings/billing`; global setup stays under platform Admin. Do not use an organization's dashboard as a financial acceptance record.

The team, invitation, role and company-deletion details are maintained in [Company workspace administration](./company-workspace-administration.md). In particular, user management and company management have different authority, and selecting a company does not permit editing super-admin privileges. Former company Mailbox routes are retired; the current email and Outbox paths are described separately.

## Personal Notes About You

Profile includes an Assistant Note tab, alongside preferences and other account tabs. These notes are about the signed-in person and how they prefer answers, not the company's shared facts. They travel with the user identity rather than being keyed to the currently selected company. Company knowledge belongs in its Wiki/knowledge workflow, so moving workspaces should not turn a personal preference into another company's business record.

You can list your own active notes, add one, or remove one. The current set is limited to twenty notes, with each saved note normalized and truncated to 300 characters. Duplicate normalized wording is ignored, but attempting to add while the set is already full is refused before that duplicate check. Remove an unwanted entry rather than repeatedly submitting the same note to a full list. Text rejected by the platform's safety patterns cannot be saved as written.

Deletion removes the current personal-note row rather than moving it to an admin-readable archive. The audit records that a note was added or deleted without recording its words. This is narrower than erasing every earlier conversation or provider prompt that may have included it. Historical messages and integrations have their own retention and personal-data workflows.

When platform Autonomous memory is enabled, a periodic process can infer a small number of notes from the user's own recent conversation text. It uses bounded history and a configured model, and successful learning can appear as AI-applied notes. There is no separate administrator queue exposing the content of everyone's personal notes. Company weekly reports can include a count learned without those words.

The prompt layer uses personal notes only for the signed-in asker's own eligible conversations, excluding widget visitor and EVAL-purpose threads at injection. The learning reader explicitly excludes widget threads but does not separately exclude every EVAL-purpose thread in the reviewed selection path. Evaluation ownership and memory-learning scope should therefore be reviewed before claiming all testing conversations are excluded from learning. This documentation records the implementation distinction without changing it.

## Preferences, Profile Identity, And Practical Review

The profile form edits your own name, phone and image; email is a displayed fixed identity field. It does not provide a way to change your platform role or company assignment. Image uploads use the owned upload reservation and two-MiB admin-image policy. A profile photo upload is different from sending a photo for an Assistant action or adding a document to company knowledge.

Theme and language preferences change your presentation, not the product's global stored brand or another user's access. Communication and integration tabs have their own delivery and account-linking contracts, including Telegram. Do not share a personal integration link or widget/session credential as a troubleshooting shortcut.

Use the appropriate layer when correcting behavior: personal preference in Assistant Note, shared company facts in Wiki, active company/agent behavior in its authorized configuration, and profile identity in the account form. This review read source and local test files without updating a profile, sweeping memories, generating a model answer, changing team access, or contacting a provider. Local configuration and a saved guide do not prove external cutover or production acceptance.
