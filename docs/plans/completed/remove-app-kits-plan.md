# Remove App Kits

**Started and completed 2026-07-26.** Anthony's instruction: remove App Kits
from the code entirely so the demo work can start from a clean space.

This was a deletion, not a refactor. Nothing in the feature was preserved.

---

## What this delivered

Done. 14 files deleted, 37 edited, 2 renamed. Roughly 6,500 lines of feature
code and tests removed.

Verified after the change:

- `npx tsc --noEmit` clean
- Full suite green — 3,167 tests across 429 files
- `/admin/app-kits` and `/admin/launch` both return 404 in a running dev server
- Sidebar renders Dashboard, Companies, Artificial Intelligence, Agents,
  Settings, Maintenance, System Admins — no App Kits entry
- No browser console errors, no dev-server errors

Two decisions taken during the work that were not in the original checklist:

**The `linkLabelKey` union changed, not just its value.** The Settings
white-label preset type declared `"launch" | "widget" | "health"` in *two*
places — `convex/settingsService.ts` and a duplicated copy in
`WhiteLabelModulePresetsSection.tsx`. Both now read `"agents"`, and the
`knowledgeAssistant` preset points at `/admin/agents`.

**A navigation test was re-anchored rather than deleted.** The profiles suite
had a test proving that a nav item no profile classifies still renders —
deny-by-default would silently drop newly added menu items. It used
`/admin/app-kits` as its example, and that was the only *top-level link* the
`customerWorkspace` profile left unclassified. It now asserts on the Agents
section instead, which is equally unclassified, so the guarantee still holds.

Anthony's uncommitted work in progress was left untouched. Note that
`messages/en.json` and `messages/it.json` contain both his changes and this
removal's translation edits, so those two files cannot be committed
independently.

### Not done here

The two demo client workspaces that replace this feature. That work starts from
an empty space, deliberately.

---

## Why it goes

App Kits is a catalogue of twelve hardcoded "starter kits", a seven-step setup
wizard, a saved build plan, and a button that creates agents and workflows.

The catalogue reads well. Almost nothing behind it does what the screen claims.

**The kits are twelve names over five recipes.** `APP_TEMPLATES`
(`convex/appTemplates.ts:53-270`) declares twelve kits, but
`APP_TEMPLATE_AGENT_ARCHETYPE` (`:793`) maps them onto five agent archetypes,
and `materializeLaunchPlan` resolves one archetype per plan (`:1797`) and reuses
it for every agent in the loop (`:1811-1823`). Support Desk AI's three agents —
Triage, Reply Drafting, Escalation Classifier — are created with byte-identical
`systemPrompt`, `temperature`, `reasoningEffort` and settings, differing only in
`name`. This is true for all twelve kits.

**Workflows are empty shells.** `:1851-1862` inserts `nodes: "[]"`,
`edges: "[]"`. Named, described, not executable.

**The wizard configures nothing.** The final step calls only `createLaunchPlan`
(`AppKitsClient.tsx:1161`), which writes one row (`appTemplates.ts:2023`). All
fourteen `setupOverrides` fields — brand name, accent hex, first admin email,
invite policy, model defaults, target plan — are concatenated into display
strings in `createWorkspaceSetupPlan` (`:1290-1293`, `:1304-1306`,
`:1318-1320`). `createWorkspaceForLaunchPlan` (`:1892`) passes only `{name,
systemPrompt}` to `buildCompanyRecord` (`convex/companyService.ts:4-10`) and
drops the rest.

**The kits' own eval fixtures are never created.** Templates declare strings
like `"Refund promise blocked"` and `"Prompt injection in ticket body"`
(`:67`). Nothing reads them. `seedFixturesForTemplate` (`:1826`) seeds the
*archetype's* two generic fixtures and inserts a synthetic `agentRuns` row with
`status: "SUCCESS"` and `finalOutput: "Template starter eval fixtures seeded."`
(`convex/agentEvalFixtures.ts:847-858`) purely to satisfy the fixture's
`sourceRunId` foreign key. Fabricated data in a real table.

**Resources ignore the linked workspace.** `materializeLaunchPlan` never reads
`plan.targetCompanyId`. `buildGlobalAgentRecord` sets `isGlobal: true` with no
`companyId` (`convex/agentService.ts:32`) and the workflow insert omits
`companyId`. A plan bound to a tenant still produces platform-wide resources.

**Progress states cannot complete.** `WorkspaceSetupAction.status` (`:689`) is
typed `"BLOCKED" | "PENDING"` with no done member.
`SurfaceImplementationAction.status` (`:700`) is the literal `"PENDING"`,
hardcoded at `:1223` and `:1231`. `buildDeveloperTasks` (`:1049`) sets
`status: knowledgeScopes.length > 0 ? "PENDING" : "READY"` — since all twelve
templates declare knowledge scopes, that task is permanently pending regardless
of what is uploaded. The plan page shows checklists that can never go green.

**Archiving orphans what was built.** `archiveLaunchPlan` (`:1745`) patches
status only. Agents and workflows already created stay in the database,
unlinked and not deactivated.

**The registry tab is decorative.** `getAppTemplateGallery` (`:1442`) returns
the hardcoded array and never touches the database. Nothing reads
`lifecycleStatus` to gate anything — an `ARCHIVED` catalog item can still be
launched (`:2015`).

**It is barely wired in.** One sidebar entry, one Settings preset link, one
mention in the releases empty state. Nothing else in the product depends on it.

**No end-to-end coverage.** Nothing under `e2e/` references app-kits or launch.

### The decision behind the deletion

The original intent was sound: prospects do not understand that Hakken is a
framework, so a set of concrete use cases makes it tangible.

A menu of twelve options does not demonstrate a framework — it demonstrates a
product with twelve features. What demonstrates a framework is the same
machinery producing visibly different products. Twelve labels over five
identical recipes does the opposite: it hides the framework.

The replacement is two or three fully-built demo client workspaces, switched
between using the existing workspace impersonation, each with real agents and
real evals. That work is not in this plan. This plan clears the ground for it.

---

## What stays

`convex/agentTemplates.ts` **stays.** It is imported by `convex/agents.ts:21`
(`getAgentTemplateById`, `getAgentTemplates`), `convex/localDemoSeed.ts:6` and
`convex/agentEvalFixtures.ts:10`. The five agent archetypes belong to the agent
builder, not to App Kits.

Agents and workflows previously created by a materialized plan are real rows in
`agents` and `workflows`. They are not deleted by this plan — see the open
question below.

---

## Removal checklist

### Delete outright

- `convex/appTemplates.ts` (2,052 lines)
- `convex/appTemplates.test.ts` (520 lines)
- `src/app/(dashboard)/admin/app-kits/` — the whole directory:
  `AppKitsClient.tsx` (1,502 lines), `page.tsx`, `[templateId]/page.tsx`,
  `[templateId]/setup/page.tsx`, `plans/[id]/page.tsx`
- `src/app/(dashboard)/admin/launch/` — the whole directory: `page.tsx`
  (a 1-line alias), `page.test.tsx` (437 lines — note these are the tests for
  the *app-kits* catalog), `plans/[id]/page.tsx` (1,395 lines — the canonical
  plan-detail implementation), `plans/[id]/page.test.tsx` (560 lines)

### Schema and data

- `convex/schema.ts:446-463` — remove `appLaunchPlans`
- `convex/schema.ts:465-482` — remove `appTemplateCatalogItems`
- Convex rejects a schema that omits tables still holding documents. Clear both
  tables in each deployment before or alongside the schema change.

### Demo seed

- `convex/localDemoSeed.ts` — remove launch-plan seeding (`:522-560`,
  `insert("appLaunchPlans")` at `:552`) and `upsertAppTemplateCatalogRegistry`
  (`:562-600`), plus the `appTemplates` import at `:9` and call sites at `:398`
- `convex/localDemoSeed.test.ts:62, 89, 92, 124, 133` — remove the
  `launchPlans` / `catalogItems` assertions

### Navigation and chrome

- `src/ui/components/layout/SidebarNavigation.tsx:184` — remove the
  `/admin/app-kits` and `/admin/launch` page-title branch
- `src/ui/components/layout/SidebarNavigation.tsx:429-432` — remove the nav item
- `src/ui/components/layout/Header.tsx:56` — remove the breadcrumb branch
- `src/ui/components/layout/SidebarNavigation.test.tsx:153-164` — remove the
  App Kits ordering assertions
- `src/ui/components/layout/SidebarNavigation.profiles.test.tsx:147` — update
- `src/ui/components/layout/__snapshots__/SidebarNavigation.characterisation.test.tsx.snap`
  — regenerate

### Settings white-label presets

The `knowledgeAssistant` preset links to App Kits. Repoint it at the agent
builder (`/admin/agents`), which is where that journey now starts.

- `convex/settingsService.ts:251-252` — change `href` and `linkLabelKey`
- `src/app/(dashboard)/admin/settings/_components/WhiteLabelModulePresetsSection.tsx:28-29`
  — same change, duplicated client-side
- `convex/settingsService.test.ts` — update
- `src/app/(dashboard)/admin/settings/_components/SettingsSections.test.tsx:279`
  — update
- `src/app/(dashboard)/admin/settings/page.test.tsx` — update

### Copy and translations

- `src/app/(dashboard)/admin/releases/page.tsx:464` — reword the empty state;
  it currently reads "Create agents from App Kits or the agent builder…"
- `messages/en.json:332` (`"launch": "App Kits"`) and `:1703`
  (`"launch": "Open App Kits"`) — remove, or repoint if the Settings preset
  keeps a label
- `messages/it.json:332` (`"Kit App"`) and `:1703` (`"Apri Kit App"`) — same

### Documentation

Delete — these describe only App Kits:

- `docs/developer/app-kit-launch-plan-implementation.md`
- `docs/developer/app-kits-interface-simplification-plan.md`
- `docs/end-user/app-kit-launch-plans.md`

Edit — these point developers at App Kits as the extension route for packaging
a new vertical app. Left alone they become a dead trail.

- `docs/developer/new-agentic-app-setup-checklist.md:13, 58`
- `docs/developer/starter-app-template-checklist.md:9`
- `docs/developer/product-extension-guide.md:173`
- `docs/developer/agentic-starter-framework-overview.md:49`
- `docs/operator/vertical-app-packaging-checklist.md:44`
- `docs/developer/administration.md:11` — remove the four routes
- `docs/developer/launch-releases-and-observability.md` and
  `docs/end-user/launch-releases-and-observability.md` — remove the alias notes
- `docs/developer/index.md`, `docs/index.md` — remove links to deleted pages
- `docs/plans/active/platform-hardening-plan.md:1217` — the note about
  `appTemplates.ts` being oversized is resolved by deletion

Leave as historical record:

- `docs/plans/completed/starter-platform-expansion-plan.md` — the plan that
  built the feature. Do not rewrite history; this removal plan is the record of
  its reversal.

---

## Open question

**Live data.** Awaiting Anthony's answer on whether any build plans saved on the
running deployment are worth keeping. The code removal is safe either way and
can land first. If nothing of value exists, both tables can be cleared in the
same pass.

**Orphaned resources.** Any agents or workflows a materialized plan created are
still in `agents` and `workflows`, inactive. They are harmless but meaningless —
identical clones and empty graphs. Worth listing them before deciding whether to
delete. They are recognisable by a description ending in
`"draft resource."` or `"draft workflow. Review trigger, steps, and approvals
before activation."`

---

## Done when

- `grep -ri "app-kits\|appTemplates\|appLaunchPlans\|AppKit" --include='*.ts'
  --include='*.tsx' --include='*.json' src convex messages` returns nothing
- `/admin/app-kits` and `/admin/launch` 404
- Typecheck, lint and the full test suite pass
- The sidebar has no App Kits entry and no dead breadcrumb
- Settings white-label presets link somewhere real
- No documentation instructs a developer to add a kit

## Not in scope

Anthony's uncommitted work in progress — the changes to agents, company
readiness, AI models and the admin agents/companies screens — is untouched.
Only files listed above are modified or committed.
