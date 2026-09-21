# Admin Clone-Readiness Plan

Last reviewed: 2026-08-21
Status: COMPLETE — all four phases plus the invite unification executed 2026-08-21; committed and pushed to `dev` (21a0e7b2 and neighbours), then an independent completeness audit's sixteen findings were closed the same day (record below; fix round committed separately).
Approved by Anthony on 2026-08-21, scoped in conversation the same day.
Owner: Anthony

## Why

Hakken's admin section is the part every cloned product keeps. The 2026-08-21
pre-clone review found its structure healthy — a real screen kit with
shrink-only guards, ~1% duplication, thin pages over shared `_features`
components — but three known debts remain hand-drawn, and each one is
multiplied by every clone: raw buttons (restyling means touching ~150 files),
mirrored screens (edits made twice or missed once), and the hardcoded product
name (rebranding means editing components). This plan pays those three down
for the admin section only.

## Scope And Rules

**In scope:** `src/app/(dashboard)/admin/**`, the shared components under
`src/ui/**` that admin screens use, and the guards that defend them.

**Out of scope (owner decision, 2026-08-21):**

- **The public marketing site** (`src/app/(public)`) — rewritten per product;
  not worth polishing in the base.
- **The user-facing front end** (`src/app/(dashboard)/app/**`) — a separate
  pass if ever needed; some shared `src/ui` components serve both sides and
  improve incidentally, which is fine, but no user-page-only work.

(Full translation coverage for admin copy was initially deferred here;
Anthony pulled it back into scope on 2026-08-21 — it is Phase 4.)

**Standing rules:** no convex deploy/codegen/dev and no git push without
Anthony's explicit permission (subagents told the same). Message/label text
is preserved exactly unless a task says otherwise. Every phase ends with
`npm run check` green, and screen changes are verified visually in the
browser (e2e-auth fixture mode) — never claimed without looking.

---

## Phase 1 — Migrate the raw buttons (~1.5–2 days)

The screen kit's button variants exist and are proven (the first ten screens
migrated under the maintenance plan, 2026-08-19). What remains is the frozen
census in `scripts/screen-kit-allowlist.json`: **408 raw `<button>` elements
across 149 files**, the bulk in admin screens and the shared `src/ui`
components admin uses. `scripts/check-screen-kit.mjs` enforces the ceiling
per file and demands entries be deleted as files reach zero.

### Tasks

1.1 Read the migrated examples first (the ten screens done 2026-08-19 — find
them via the shrunken entries in the allowlist's git history) and the button
variants in the screen kit, so every swap follows the established mapping.

1.2 Migrate in batches by directory: `src/ui/components/**` first (shared —
every admin screen inherits the fix), then `admin/_features/**`, then the
admin pages, worst offenders first (`admin/_features/knowledge/
KnowledgeManager.tsx`, `ui/components/chat/ChatInput.tsx`,
`ui/components/workflows/AgentEditorModal.tsx` — 11 raw buttons each).
Each batch: swap, delete the files' allowlist entries, run the affected
tests and `check:screen-kit`, and eyeball one changed screen per batch in
fixture mode.

1.3 Buttons that genuinely cannot use a variant (if any exist) get a
comment at the site saying why, and stay in the allowlist — the ledger's
remaining entries must all be deliberate, not backlog.

1.4 Done means: the `buttons` map in the allowlist holds only commented,
deliberate exceptions (target: near zero), and restyling a clone's admin is
an edit to the shared variants.

**Out-of-scope buttons** (user-front-end-only files in the census) keep
their entries untouched; note the count left behind in the phase record.

## Phase 2 — Finish collapsing the mirrored screens (~1–1.5 days)

The `admin/_features/` extraction layer (31 files) already collapsed about
half the platform-vs-per-company screen pairs into shared components with
thin page wrappers. The remaining near-copies, from the 2026-08-21
duplication scan:

| Pair | Duplicated lines |
| --- | ---: |
| `admin/companies/[id]/directory/invites` ↔ `admin/super-admins/invite` | 106 |
| `admin/ai/widget/page.tsx` ↔ `admin/companies/[id]/widget/page.tsx` | 186 |
| `admin/ai/rules/[id]` ↔ `admin/companies/[id]/ai/rules/[ruleId]` | 77 |
| `admin/_features/evals/EditEvalScreen` ↔ `NewEvalScreen` | 69 |
| `admin/users/page.tsx` ↔ `app/settings/team/page.tsx` | 51 |

### Tasks

2.1 For each pair: extract the shared body into `admin/_features/<area>/`
following the existing pattern (scope-specific bits — company id, back
links, permissions — passed as props), reduce both pages to wrappers,
keep both routes' tests green.

2.2 The `admin/users` ↔ `app/settings/team` pair crosses into the user
front end; extract the shared component but change only the admin page's
wrapper — leave the app-side page importing it untouched unless the import
is a pure swap.

2.3 The `admin/governance` ↔ `app/governance` pair stays as-is: its
duplication carries a written justification (different audiences) — a
recorded decision, not backlog.

2.4 Done means: no admin screen pair differs only by scope; jscpd (40-line
threshold) over `src/app/(dashboard)/admin` reports no cross-scope clones.

## Phase 3 — De-brand the admin screens (~0.5–1 day)

This executes the "follow-up phase" the 2026-08-19 branding guard
(`src/no-client-specific-fallbacks.test.ts`) named for itself, scoped to
admin. ~200 hardcoded "Hakken" strings sit in admin screens and the shared
components they use; the settings field `platformName` (via
`useSystemSettings`) is the single source the backend already resolves.

### Tasks

3.1 Route every user-visible "Hakken" literal in `admin/**` and the
admin-serving `src/ui/**` components through `platformName`. Code comments
and internal component names (`SonaeModal` etc.) are not user-visible and
stay — renaming components is cosmetic churn, explicitly out of scope.

3.2 Extend the guard: widen `no-client-specific-fallbacks.test.ts`'s
builder-string scan to cover `src/app/(dashboard)/admin` and `src/ui`, with
a shrink-only allowance for the deliberate survivors (the same reviewed
pattern the convex/ scan uses). The public site and user front end stay out
of its scope for now.

3.3 Done means: a clone renames itself by setting `platformName` in admin
settings — no admin-screen edits — and the guard fails any new literal.

## Phase 4 — Full translation coverage for admin copy (~2–3 days)

In scope by owner decision (2026-08-21). Today only ~36% of admin screens
use `useTranslations`; the other ~60% of admin wording is typed into
components, so rebranding wording or adding a language means editing code.
The infrastructure is ready and healthy: `next-intl`, `messages/en.json`
and `messages/it.json` in exact key parity, and `scripts/check-messages.mjs`
failing the build on any key a screen uses that the catalogue lacks.

### Tasks

4.1 Externalise the copy screen by screen: every user-visible string in
`admin/**` and the admin-serving `src/ui/**` components moves to
`messages/en.json` under the file's existing key convention (read three
already-translated admin screens first and follow their namespace pattern
exactly). English text is moved verbatim — this phase changes where words
live, never what they say.

4.2 Keep `it.json` in exact key parity as keys land: add the Italian
translation for each new key in the same change (translate faithfully;
where a term is product-specific, keep the English term rather than
guessing). Parity is asserted by existing tests — a missing key fails.

4.3 Phase 3's `platformName` work composes with this: strings containing
the product name become keys with a `{platformName}` parameter, not
hardcoded interpolations — one mechanism for both jobs, which is why
Phase 3 runs first.

4.4 Ratchet, house pattern: extend the messages guard (or a sibling check)
with a shrink-only list of admin files not yet externalised, so coverage
can only grow — the same inverse design as the appError guard, for the
same reason.

4.5 Done means: every admin screen resolves its wording through the
catalogue, `check:messages` green, parity tests green, and a spot-check of
5-6 screens in fixture mode confirms nothing reads differently.

---

## Order and estimate

1 → 2 → 3 → 4: buttons before screen-collapsing avoids re-touching pages,
and de-branding before i18n means name-bearing strings are externalised
once with the `{platformName}` parameter already in place. **Total:
roughly 5–7 working days.** Phases are independent enough to pause
between.

## Verification

Each phase: `npm run check` green (includes `check:screen-kit`,
`check:messages`, lint, typecheck, full tests), plus visual checks of
changed screens in e2e-auth fixture mode. Phase records appended to this
plan as phases land, same convention as the foundation-quality plan.

## Phase 1 record (2026-08-21)

Executed in three parallel batches plus a follow-up pass; full gate green
(5,655 tests, all guards). The census told a more honest story than the
plan's framing: many counted `<button>` elements are not buttons in the
kit's sense.

- **Migrated onto the kit: ~100 sites.** 68 in the first pass, then 32 more
  after freezing two new variants the migration itself surfaced — `brand`
  (the solid brand-filled CTA, ~16 hand-drawn copies) and `outline` (the
  bordered no-fill chip, ~10 copies), both frozen pixel-for-pixel from the
  most-repeated recipes per the primitive's own method. Six "drifted ghost"
  cancels converted with their one drift token merged explicitly.
- **Ledger: 408 → 305 raw buttons; 23 files deleted from it entirely** (the audit round corrected an earlier "307/22" here, removed a phantom count from a comment the checker's regex matched, and restored one quietly-raised ceiling).
  Counts regenerated with the checker's own regex; `check:screen-kit` green.
- **The remainder is annotated, not backlog.** Every in-scope raw button now
  carries a one-line comment naming its family: segmented filters/tabs
  (~24), toggle glyphs and switches, selected-state option cards, bare text
  links, menu/listbox rows, preview mocks, and a handful of one-off recipes.
  These are interaction patterns the button kit deliberately does not
  cover — a future Segmented/Tabs primitive is the natural next extraction,
  out of this plan's scope.
- ~104 of the 305 remaining sit in out-of-scope files (user front end,
  demos) and were not touched.
- Visual verification: initially pending on the dev server; the
  fixture-mode pass then ran (see the completion note) — dashboard,
  invites, workflows, agents, health and analytics screens all render on
  the kit with no drift visible.

## Phase 2 record (2026-08-21)

All five pairs collapsed; the nine pair files went 2,625 → 963 lines with
1,077 lines of shared screens extracted — net −585 (the audit round
corrected an earlier "2,631 → 965 / −655" here). Every page is a thin
wrapper — the admin users page joined them in the audit round (441 → 157
over the new `UserDirectoryScreen`; 0 clones at the plan's threshold),
closing the one pair the first pass had only half-collapsed (its cells had
moved, its body had not). New shared screens: `_features/invites/InviteDispatchScreen`
(role/preview differences as slots, so page-owned raw buttons stay within
the shrink-only ledger), `_features/widget-config/WidgetConfigScreen`,
`_features/rules/EditRuleScreen`, one `EvalCaseFormScreen` handling create
and edit, and cross-scope `(dashboard)/_features/user-directory/
DirectoryTableCells` (admin page migrated; the app-side page untouched per
task 2.2 — its adoption is a one-move follow-up). Duplication over admin
after the phase: 0.42%, none of it the five pairs; the two residues (a
third modernised invite screen; the rules/new pair that differs by
deliberate styling) are recorded with reasons. Layering allowlist shrank by
three entries in passing. 2,212 dashboard tests and all guards green.

## Phase 3 record (2026-08-21)

Every user-visible "Hakken" in `admin/**` and `src/ui/**` now resolves
through `useSystemSettings().platformName` (~20 component literals routed;
21 catalogue keys parameterised as `{platformName}` in exact en/it parity;
the two literals inside Phase 2's freshly collapsed screens caught in the
mop-up). Task 3.2 delivered the guard the strong way round: a third scan in
`no-client-specific-fallbacks.test.ts` covering the admin roots with an
**empty** shrink-only allowance map — zero surviving builder-name strings,
so any new one fails the build. Module-path literals (the `SonaeModal`
import specifiers) are excluded as not user-visible; the component renames
stay out of scope as agreed. Fourteen test files pin the behaviour by
rendering under a mock platform name ("Acme Copilot"). A clone now renames
its entire admin section by setting `platformName` once.

## Phase 4 record (2026-08-21)

Executed in three sequential batches (the two catalogues are shared state),
plus the invite unification between batches 1 and 2. Final gate: 5,660
tests across 617 files, all guards, lint and typecheck green.

- **2,143 new catalogue keys per language** (batch 1: 912 — features and
  agent screens; batch 2: 1,000 — remaining admin pages; batch 3: 231 —
  shared ui components), English moved verbatim, Italian added in the same
  edits, exact parity held throughout (`src/i18n.test.ts`).
- The three `agents/_lib` helper files now return stable message keys
  (`LabelRef` pattern, namespace `admin.agents.labels`) instead of English;
  their unit tests assert key mappings. Displayed and stored strings no
  longer share functions.
- `{platformName}` is a message parameter wherever the name appears;
  hardcoded display locales became `useLocale()`.
- Test infrastructure: `src/test/renderWithProviders.tsx` wraps renders in
  the real intl provider with `messages/en.json`, so English assertions
  still assert real English; ~30 test files migrated onto it (including
  two frozen-demo test harnesses whose shared Table/modal now resolve
  catalogue keys — harness-only changes, demo code untouched).
- 4.4 ratchet: `src/admin-i18n-adoption.test.ts` — adoption floors (139
  admin components, 22 ui components on `useTranslations`, rise-only), with
  its honest limit stated in the file: it defends the migration, review
  defends new screens.
- Deliberate exemptions recorded by the batches: DB-seeded defaults, audit
  strings written to storage, model prompts, code-syntax examples, lone
  glyphs, and user-front-end-only chat components (out of scope).

## Plan completion note

All four phases plus the invite unification landed on 2026-08-21. Visual
verification: admin dashboard, unified invite screen, workflows list,
agents list, health and analytics screens checked in e2e-auth fixture mode
— kit buttons, catalogue copy and settings-driven naming all render; no raw
keys, no layout breakage. Everything uncommitted on `dev` alongside the
foundation-quality work; both were committed and pushed to `dev` on
2026-08-21 (cd71774d, 3ab65ff9, 21a0e7b2).

## Audit round record (2026-08-21)

An independent completeness audit against this plan found sixteen items —
none breaking, all closed the same day:

- The shrink-only button ledger had been raised by one to accommodate a
  why-comment containing the checker's own match string; the comment was
  reworded and the ceiling restored (true count: 408 → 305, 23 files off
  the ledger — the record's earlier 307/22 was wrong and is corrected
  above, as are the Phase 2 line counts, now −585).
- Nine raw buttons in three run-screen components lacked why-comments; all
  annotated.
- Three "Hakken" values had escaped into the message catalogues (which the
  code-only guard could not see) plus two Italian-only slips; all
  parameterised or aligned, and the branding guard now scans both
  catalogues against a shrink-only list of the seven reviewed public-site
  keys.
- ~30 English strings survived in already-translated screens; externalised
  (27 new keys per language, two keys reused).
- The admin users page became a true thin wrapper (441 → 157 over the new
  `UserDirectoryScreen`), closing pair 5 properly.
- Record and docstring corrections throughout: Button's variant count,
  the checker's guidance now naming `brand`/`outline`, provenance aligned,
  and these records reconciled with what actually happened.
