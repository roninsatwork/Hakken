# Company and agent model defaults — bring both screens up to the platform one

**Started 2026-07-26.** The platform Model Defaults screen was rebuilt in
`24294e1c4`, `4d6add674` and `e73082015`: every job now carries a sentence
explaining it, the price of the chosen model sits next to the choice, the
badge that appeared on every row was deleted, and a default that can no longer
do its job is named rather than silently hidden.

Two screens make the same decision and got none of that work: the company
override screen and the agent engine settings. This is what is wrong with each,
what changes, and in what order.

Scope is those two screens. The third copy of the control, inside
`AgentEditorModal`, is deliberately out of scope for this plan.

---

## What is actually wrong

### The company screen silently loses overrides

`src/app/(dashboard)/admin/companies/[id]/models/page.tsx` (re-exported by
`.../ai/models/page.tsx`) filters each row's dropdown down to models whose
provider can serve that job — the same rule as the platform screen. It does not
handle what happens when the saved override falls outside that list, which is
what a disabled model or a newly restricted provider does to it.

The `<select>` value then matches no option, so the browser displays option
zero: **"Inherit platform default"**. Meanwhile the status column reads
**Override**, because the underlying row is still set. The screen contradicts
itself, and the first touch of that dropdown fires `clearCompanyModelDefault`
and destroys a setting the reader never saw.

The platform screen solved exactly this: it injects the stranded model as a
named option suffixed "cannot do this job", turns the border amber, and prints
a sentence underneath.

### The company screen speaks engineer

- Rows read `Chat`, `Router`, `Title`, `Transcription` with no explanation. The
  platform screen gives each a sentence via `describeModelUseCase`.
- The Platform Default column prints the raw provider key and model id under
  every row. That second line was deleted from the platform screen for being
  the internal key restated.
- Every row carries a `ShieldCheck` pill reading `Override` or `Inherited`.
  The dropdown directly to its left already says which it is. This is the
  `CONFIGURED` pill the platform redesign removed, in a new costume.
- No price anywhere, so the cost-versus-quality trade-off is made blind.
- The whole page blanks to a spinner until both queries land, rather than
  drawing the header and loading inside the table.
- Local copies of `formatUseCase`, `getModelLabel` and `supportsUseCase`
  duplicate `modelAdminUtils` helpers and drift from them.

### The agent screen converts inheriting agents into overriding ones

This is the serious one, and it is not cosmetic.

`convex/agents.ts:175` only applies an agent's own model when
`modelSelectionMode === "override"`. An agent whose mode is unset therefore
**inherits** at runtime. Agents created today are written with `"inherit"`
(`:793`, `:837`, `:1072`), so unset means an older agent.

The settings form hydrates that unset value as `"override"`
(`src/app/(dashboard)/admin/agents/[id]/settings/page.tsx:264`) and fills the
model box with `defaultModelId`. `handleSave` (`:284`) then posts
`modelSelectionMode` on **every** save, together with `modelId` whenever the
mode is `override`.

So: open an older agent, change nothing but its avatar or description, press
Save — and that agent is permanently pinned to whatever model happened to be
the platform default at the moment the form loaded. It stops following the
platform default from then on, and nothing on screen says so.

### The agent screen also hides the decision

- The mode dropdown says "Inherit platform default" without ever naming what
  that default currently is.
- The model dropdown is not disabled-with-explanation, it is just disabled, so
  a reader in inherit mode sees a greyed box with no idea what will run.
- No price, no job description, no readiness signal on the control itself
  (`getAgentReadiness` knows when an inherited default is missing; the settings
  screen does not surface it).
- Two dropdowns for one decision. Mode then model is a machine's decomposition,
  not a person's.

### Neither screen is tested

`convex/aiModels.test.ts:1185-1350` covers the company round trip, the
permission wall and the three refusal messages, and it passes. Above that line
there is nothing: no `page.test.tsx` for the company screen, and the agent
settings test stubs `getActiveModels` to `[]` so the engine control is never
rendered. The e2e check asserts the company page title is visible and stops.

No existing test would catch either bug above.

---

## Decisions taken

**The agent model choice stays inside Settings.** It belongs beside the rest of
the engine configuration. Promoting two fields to their own tab adds a
navigation step and separates the model from the reasoning and thinking
settings that qualify it.

**One dropdown, not two.** The agent's model control collapses to a single
select whose first option is "Follow the platform default", followed by the name
of whichever model that currently resolves to, and then the specific models.
Mode is derived from the choice rather than asked for separately.

**The unset-mode bug is fixed by reading, not writing.** An agent with no mode
hydrates as `inherit`, matching what the runtime already does. No migration and
no bulk write — the stored data is not wrong, only the form's reading of it.

**Status pills go from both screens.** The control states the answer.

**The company table becomes four columns:** Job, Platform default, This
company, Price. Status is dropped.

---

## Phases

### Phase 1 — Company screen rebuild

`src/app/(dashboard)/admin/companies/[id]/models/page.tsx`.

1. Adopt `AdminPageHeader` (with `divider`), `AdminTableShell`,
   `AdminTableLoadingRow`, `AdminTableEmptyRow`, `AdminSaveError`. Delete the
   full-page spinner and the `setTimeout` success banner.
2. Delete the local `formatUseCase` / `getModelLabel` / `supportsUseCase` in
   favour of `formatModelTag`, `formatModelDisplayName`,
   `modelSupportsUseCase`, `getProviderDisplayName` and `describeModelUseCase`.
3. Job column: friendly name, description sentence, and the provider-limit line
   only where `describeUseCaseProviderLimit` returns one.
4. Platform default column: friendly model name and provider display name. The
   raw model id line goes.
5. This company column: the existing select, plus the stranded-override
   handling ported from the platform screen — named option, amber border,
   explanatory sentence. The `RotateCcw` clear button goes; "Inherit platform
   default" is already the clear action and two controls for one job is the
   confusion being removed elsewhere.
6. Price column: `formatTokenCost` for the effective model — the company
   override where set, otherwise the platform default, so the number always
   reflects what this company will actually be billed. Amber "Not set" when
   neither exists.
7. Status column deleted.

Deliberately **not** ported: the "use one model for every job" bulk bar and its
confirm modal. It is a platform-wide tool; a company overriding all nine jobs
at once is not a real action.

### Phase 2 — Company screen tests

New `.../companies/[id]/models/page.test.tsx`, modelled on the platform
`defaults/page.test.tsx` fixture pattern:

- job descriptions render and the raw key does not
- selecting a model calls `setCompanyModelDefault` with company, use case, model
- selecting the first option calls `clearCompanyModelDefault`
- **a stranded override keeps its value, renders the "cannot do this job"
  option and the amber sentence** — the regression guard for the bug above
- price reflects the override where set and the platform default where not

Extend `src/e2e/convexReactMock.tsx` so at least one fixture row carries a
`companyDefault`; today every row returns `null`, so no e2e path reaches the
override state.

### Phase 3 — Agent engine control

`src/app/(dashboard)/admin/agents/[id]/settings/page.tsx`.

1. Hydrate an unset `modelSelectionMode` as `"inherit"` (`:264`). This alone
   stops the silent conversion.
2. Replace the two dropdowns with one select: first option "Follow the platform
   default — {name}", then the candidate models with provider and price. Choosing
   the first sets mode `inherit`; anything else sets `override` plus that model.
3. Keep sending mode on save, but only send `modelId` when the choice is an
   override — already the shape at `:290`, now driven by a single control.
4. Name the inherited model. The agent's use case is `workflow` for
   workflow-backed agents and `agent` otherwise (`convex/agents.ts:909`); read
   the platform default for that use case and show it inline.
5. Keep the legacy-model fallback option (`:541`) so an agent pinned to a
   retired model still displays it rather than appearing unset.
6. Surface the readiness warning `getAgentReadiness` already computes when an
   inherited default is missing.

New user-facing strings go through `messages/en.json` under
`admin.agents.details.settings.sections.engine.model`, matching the existing
i18n on this screen. The company screen stays hardcoded English, as the rest of
the company admin area is.

### Phase 4 — Agent tests

Extend `.../agents/[id]/settings/page.test.tsx`, which currently stubs
`getActiveModels` to `[]`:

- give it real models so the control renders
- **an agent with no stored mode shows "Follow the platform default", and saving
  an unrelated field does not send a `modelId`** — the regression guard for the
  conversion bug
- an agent with `override` shows its model selected
- choosing the inherit option saves mode `inherit` with no `modelId`
- choosing a model saves mode `override` with that id

---

## Risk

Fixing the stranded-override display will reveal companies currently pointing at
a model that cannot serve that job. Those rows start showing an amber warning
that was previously invisible. That is the fix working, not a new fault, but the
count should be checked against live data before the change ships so the volume
is known in advance rather than discovered.

The agent hydration fix changes what the form *shows* for older agents, from
"Override" to "Follow the platform default". It does not change what any agent
*does*, because the runtime already treats unset as inherit. Worth stating
plainly in the commit body, because the screen appearing to change an agent's
model is exactly the alarm this fix is meant to prevent.

---

## What was delivered

All four phases, plus two things the build turned up that the plan had not.

**The stranded fix had a hole.** The plan said to name the stranded model from
the model list. That list is `getActiveModels`, which excludes disabled
models — and switching a model off is the commonest way to strand a row, so the
fix as written would have covered only the rarer case of a narrowed provider.
The name now comes from the row's own `companyDefault.model` summary, which the
query hydrates regardless of `isEnabled`. The two causes are also told apart:
"is switched off" and "cannot do this job" are fixed on different screens.

**Readiness could not name the inherited model for an overriding agent.**
`resolveAgentModelReadiness` short-circuited on the override and never resolved
the default behind it, so the single dropdown could not label its own first
option. The inherited resolution is now its own function,
`resolveInheritedModelForUseCase`, called on both paths, and readiness carries
`inheritedModelId` either way. Additive — no existing field or status changed.

Both regression guards were checked by reverting the fix and confirming the test
failed, not by assuming.

**The agents list had the same fault, and was pulled in.** Its Model column
rendered `agent.modelId` alone, so every inheriting agent was listed against a
leftover value — on live data, the same retired model against all ten. The column
now resolves the platform default once per page via `getInheritedAgentModels`
(both jobs, because the search path of `getPaginatedAgents` does not filter
workflow-backed agents out) and shows an agent's own model only when it overrides.
That screen had no test file at all; it has one now.

## Verification

Per `AGENTS.md`: `npm run verify:env`, `npm run lint:all`, `npm run check`,
`npm run build`, `git diff --check`. Plus the two new test files and the
existing `convex/aiModels.test.ts` and `convex/agents.test.ts` suites green.

Both screens driven in the browser before hand-back: a company override set,
cleared, and left stranded; an older agent opened and saved without touching the
model.
