# Theme compliance — make the Global Aesthetics screen tell the truth

**Started 2026-08-10. Status: Phases 0–3 built and green same day; Phase 4
built except the ongoing 4.4 sweep.** Ratchet baseline recorded at **1,231**
(from ~2,039). As built, deviations from spec worth knowing:

- Migrated screens kept their local badge geometry where StatusPill's
  rounded-full recipe would have changed layout — those sites use
  `STATUS_TONE_CLASSES` directly, or StatusPill with overriding className.
- The runs screen keeps a local tone-mapper (CANCELLED→warning there, by
  design) — tone maps may differ per screen; the *classes* never do.
- Rule-priority colours kept their families via a small `PRIORITY_TONES` map
  (HIGH→warning, CRITICAL→danger) rather than collapsing both into danger.
- Movements palette needs its Tailwind safelist comment maintained — v4 only
  compiles literal class text; see `movementPalette.ts`'s header.
- `resolveFontFamily` maps legacy Playfair/Outfit literals to the app
  default (they were never loaded; the browser was already falling back).
- Reset on the Aesthetics screen restores the shipped default value rather
  than unsetting the row — `buildSettingsPatch` drops undefined, so a true
  unset would need a mutation change nothing yet justifies.

**Original estimate: 8 working days across five phases** (per-phase estimates
below; Phase 4's sweep can trail in the background after its first day).

This document is written to be implemented by someone — or some model — with
no other context. Every claim carries the file and line it rests on; verify
anchors before editing, because line numbers drift. Follow the repo's working
rules in `AGENTS.md`. Tests run with vitest (`vitest.config.ts`); typecheck
with `npx tsc --noEmit`; after Convex changes run `npx convex dev --once`.
Phases must land in order — later phases assume earlier fixes — but each
phase is independently shippable and the app must be green (tests, tsc,
eslint) at every phase boundary.

**Scope decision (owner, 2026-08-10): the dashboard app only.** The public
marketing site and `/login` keep their own deliberate cream palette
(`src/app/(public)/public.css`, applied via the `.public-site` class —
`src/app/(public)/layout.tsx:26`, `src/app/login/page.tsx:118`), and emails
keep their hardcoded palette table in `convex/emailLayoutService.ts:106-132`.
Neither is drift; both are out of scope. The Aesthetics screen's copy must
stop claiming "the entire platform".

## Background: how theming works today

One pipeline, no alternatives:

1. `convex/settings.ts:18` — `get`, a `publicQuery`, merges the
   `systemSettings` row with `DEFAULT_SETTINGS`
   (`convex/settingsService.ts:4`).
2. `src/context/SystemSettingsContext.tsx:48` reads it; a single `useEffect`
   (`:52-120`) writes inline CSS custom properties onto
   `document.documentElement` (e.g. `darkBg` → `--bg-main`). It is mounted
   once in `src/app/layout.tsx:54`, wrapping everything.
3. `src/app/globals.css` maps those to Tailwind v4 `@theme` tokens
   (`--color-background`, `--color-card`, `--color-sidebar`,
   `--color-border-dim`, `--color-secondary`, `--color-muted`,
   `--color-hover`, `--color-brand`, `--color-success`,
   `--color-destructive`, `--color-ring`, `--radius-*`, `--font-sans`,
   `--font-mono`) which generate the utilities the app uses
   (`bg-card`, `text-muted`, `border-border-dim`, …).

Nothing is written server-side; first paint uses the `globals.css` defaults,
and the provider returns `null` until the query resolves
(`SystemSettingsContext.tsx:122-124`).

The screen: `/admin/settings/identity/aesthetics` →
`src/app/(dashboard)/admin/settings/_components/AppearanceSettingsSection.tsx`
(4 selects + 19 colour swatches, rendered through `SettingBlock.tsx:29-53`),
with form state and save in
`src/app/(dashboard)/admin/settings/_components/useSystemSettingsForm.ts`.

## Audit verdict per control (2026-08-10)

| Control (screen label) | Field(s) | Verdict | Evidence |
|---|---|---|---|
| Main Background | `darkBg`/`lightBg` | wired | `--bg-main` + radial gradient, 300+ `bg-background` |
| Card Backgrounds | `*CardBg` | wired, but also silently repaints the sidebar and gradient centre | `SystemSettingsContext.tsx:86-90, 105-109` |
| Primary Text | `*Fg` | wired | `text-foreground` et al. |
| Secondary Text | `*CardFg` | wired | ~1,350 `text-secondary` |
| Borders & Dividers | `*Border` | wired | ~1,330 `border-border-dim` |
| Hover States | `*Muted` | partial — 16 usages total | `hover:bg-hover*` only in `SidebarNavigation.tsx`, `MessageFeedbackControls.tsx` |
| Success | `*Success` | **DEAD** — zero `*-success` utilities in `src/` | drift renders `emerald-*`/`#10b981` (~262 sites) |
| Error / Delete | `*Destructive` | partial — 14 usages vs ~557 hardcoded danger sites | `red-*`/`rose-*` split arbitrarily |
| Focus Outline | `*Ring` | **DEAD** — `--color-ring` has no consumer; all rings are `focus:ring-brand` or width-only | compiled CSS confirms no `var(--color-ring)` |
| Brand Accent | `brandColorHex` | wired and healthy — ~1,226 `-brand` usages, 1 leak | leak: `demos/movements/information/_components/MovementInfoVisuals.tsx` |
| Heading Font | `headingFontFamily` | partial — 2 of 4 options are fonts the app never loads | `next/font` loads only Inter + JetBrains Mono (`src/app/layout.tsx:18-26`) |
| Body Font | `bodyFontFamily` | wired **but self-breaking** (Phase 0.1) | |
| Heading Base Size | `headingSizeGlobal` | wired to `h1` only, with `!important` | `globals.css:71-73` |
| Small Text Size | `subTextSizeGlobal` | **DEAD** — targets `p.header-subtitle`, a class used nowhere | `globals.css:75-77` |
| *(no row)* | `*MutedFg` → `--text-muted` | consumed ~1,030 times, **cannot be set from the screen** | seeded blindly on save (`useSystemSettingsForm.ts:42,54`) |
| *(no row)* | `fontSizeBase`, `borderRadius`, deprecated `fontFamily` | saved fields, no control, (near) no effect | `SystemSettingsContext.tsx:131-132`, 36 `rounded-lg` vs 1,325 `rounded-[Npx]` |

Drift totals (grep-rough, excluding tests, `(public)`, e2e): **~2,039 sites**
— ~796 hardcoded hex + ~1,243 raw palette classes. Semantic tones: danger
~557, warning ~334, success ~262, info ~219. Eighteen `getStatusColor`-style
helpers across 15 files re-derive the same mapping; `src/ui/atoms/` has no
badge/pill atom. The `demos/movements` pose palette (`#f6ccbe`/`#a8d5ba`,
251 occurrences, ~12 files) is domain visualization, not theme drift.

---

## Phase 0 — fix what is actively broken (1 day)

Nothing new lands until the existing pipeline is honest. Each item is a bug a
user can hit today.

- [ ] **0.1 The Inter self-cycle.** The Body Font "Inter" option submits the
  literal string `var(--font-sans)` (`AppearanceSettingsSection.tsx:37-44`),
  and the injector executes
  `root.style.setProperty('--font-sans', 'var(--font-sans)')`
  (`SystemSettingsContext.tsx:68`) — a custom-property cycle, computed
  invalid, and the app falls to the browser serif. `useSystemSettingsForm.ts:33-34`
  seeds that value into every save. **Fix:** the dropdowns submit named keys
  (`"default" | "mono" | …`); the injector maps keys to concrete stacks and
  writes nothing for `"default"`. Migration: treat stored `var(--font-sans)`
  as `"default"` when reading (`mergeSettingsWithDefaults`,
  `convex/settingsService.ts:64`). **Test:** injector unit test asserting no
  written value ever contains its own variable name; a jsdom test that
  selecting Inter leaves `--font-sans` unset.
- [ ] **0.2 The whole-form save corrupts logo references.**
  `useSystemSettingsForm.ts:65-69` posts the entire merged form; logo fields
  arrived from `settings.get` already resolved from storage IDs to URLs
  (`convex/settings.ts:28-35`), so saving Aesthetics rewrites stored IDs as
  expiring URLs, and writes seeded colour defaults the admin never touched.
  **Fix:** the hook takes a field allowlist per screen
  (`useSystemSettingsForm(fields: (keyof SystemSettingsFormData)[])`) and
  `save` posts `pick(formData, fields)`. Core Identity owns
  name/pricing/email/logo fields; Aesthetics owns fonts/sizes/colours;
  Developer Diagnostics owns `diagnosticRoutingEnabled`. **Test:** regression
  test asserting the Aesthetics save payload contains no `logoUrl*` and no
  fields outside its allowlist.
- [ ] **0.3 Self-referential `@theme` fallbacks.**
  `--color-brand: var(--color-brand, #FF5A1F)` and the success/destructive
  siblings (`globals.css:18-20`) are cycles — the hex fallback can never
  fire, so brand colour exists only after JS hydration. **Fix:** the injector
  writes source variables with distinct names (`--brand`, `--success-src`,
  `--destructive-src` — follow the existing `--ring` pattern,
  `globals.css:21`), and `@theme` maps
  `--color-brand: var(--brand, #FF5A1F)`. **Test:** load the app with the
  Convex query unresolved (provider returning defaults) and assert computed
  `background-color` of a `bg-brand` probe equals the fallback, not
  transparent.
- [ ] **0.4 Define `--brand-rgb`.** Referenced by glow shadows in 8 places
  (`app/reports/page.tsx:189,193,392,411`, `admin/ai/widget/page.tsx:225`,
  `admin/companies/[id]/layout.tsx:253`,
  `admin/companies/[id]/widget/page.tsx:228`,
  `admin/companies/[id]/overview/page.tsx:158`) and defined nowhere. **Fix:**
  derive `"R, G, B"` from `brandColorHex` in the injector next to
  `--color-brand`.
- [ ] **0.5 The injector never clears.** Every write is guarded
  `if (settings.x)` (`SystemSettingsContext.tsx:58-118`), so a field cleared
  in the DB keeps its stale inline value until reload. **Fix:**
  `removeProperty` on the else branch of each pair.

**Phase acceptance:** picking "Inter" renders Inter; an Aesthetics save
changes no logo row (test proves the payload); brand renders from the CSS
fallback before hydration; all existing suites green.

## Phase 1 — the token set the app actually needs (1.5 days)

Backend + CSS only; the screen catches up in Phase 3.

- [ ] **1.1 Add `warning` and `info` end to end.** Schema fields
  `darkWarning/lightWarning/darkInfo/lightInfo` (`convex/schema.ts`,
  systemSettings table), update args (`convex/settings.ts:47-86`), injector
  pairs (pattern of `:96-97, 115-116`), `@theme` entries
  `--color-warning: var(--warning-src, #F59E0B)` and
  `--color-info: var(--info-src, #38BDF8)` (defaults = what the app already
  renders by hand). Also add both to `DEFAULT_SETTINGS`
  (`convex/settingsService.ts:4`) and `SystemSettingsContext` type.
- [ ] **1.2 Sidebar gets its own fields** (`darkSidebarBg/lightSidebarBg`).
  Today Card Backgrounds silently repaints the sidebar and the gradient's
  inner stop (`SystemSettingsContext.tsx:86-90`), destroying the deliberate
  two-tone dark default (`globals.css:44` sidebar `#18181A` vs card
  `#2C2C2E`). Absent → sidebar falls back to card, so existing deployments
  keep their look. **Test:** setting card leaves `--bg-sidebar` alone when a
  sidebar value exists.
- [ ] **1.3 Decide the three dead rows** (do not leave anything decorative):
  - Focus Outline: **keep and wire.** Keep `--ring`; Phases 2/4 standardise
    focus styles onto `focus-visible:ring-ring` as files are touched. Until
    adoption, the row's description says "adopted gradually".
  - Small Text Size: **delete** the row, the field's injector write
    (`SystemSettingsContext.tsx:74`), and the `header-subtitle` rule
    (`globals.css:75-77`). Keep the schema field (harmless) but drop it from
    update args.
  - Heading Base Size: **keep, relabel** "H1 size" — it styles `h1` only.
- [ ] **1.4 Muted Text becomes a row-backed token pair** (field exists;
  `--text-muted` has ~1,030 consumers). Rename the "Hover States"
  description to say it colours hover *backgrounds* (its schema name
  `*Muted` is a historical accident — note this in a code comment).
- [ ] **1.5 Fonts: offer only what loads.** Either drop Playfair
  Display/Outfit from the dropdowns, or load them via `next/font` in
  `src/app/layout.tsx` with `display: "swap"`. Decide by intent: if nobody
  chose them yet (check the dev/prod `systemSettings` row), drop them.
  Dropdown values become the named keys from 0.1.
- [ ] **1.6 Retire the dead schema fields.** Remove the injector reads of
  deprecated `fontFamily` and `fontSizeBase`
  (`SystemSettingsContext.tsx:131-132`) and drop both from update args.
  `borderRadius`: retire it the same way — 36 `rounded-lg` against 1,325
  literal radii means a control would be a lie; a radius overhaul is its own
  future plan. Keep schema fields as tombstones with a comment (Convex
  requires no migration for unread optional fields).

**Phase acceptance:** `text-warning`/`bg-info` etc. compile and render;
sidebar independently themable; tsc/eslint/tests green; `npx convex dev
--once` clean.

## Phase 2 — one StatusPill, four tones (2 days)

- [ ] **2.1 Build `src/ui/atoms/StatusPill.tsx`**:
  `tone: "success" | "warning" | "danger" | "info" | "neutral"`, optional
  icon slot, sizes `sm | md`. Renders the established recipe
  (`border-{tone}/20 bg-{tone}/10 text-{tone}`) from the tokens (success,
  warning, destructive, info, muted). ~400 of the drift sites are exactly
  this pattern (`bg-*-500/10` ×249, `border-*-500/20` ×161). Unit-test the
  tone → class mapping.
- [ ] **2.2 One shared tone map** (`src/ui/atoms/statusTone.ts`):
  `toneForStatus(status: string): Tone` covering the union of the 18
  `getStatusColor`/`getRiskColor`/`getOutcomeColor` helpers (15 files — find
  them with `grep -rn "getStatusColor\|getRiskColor\|getOutcomeColor" src`).
  Migrate all 18 to it. This kills the red-vs-rose split for FAILED
  (`admin/agents/[id]/runs/page.tsx:1060` renders both today).
- [ ] **2.3 Migrate the top offenders** to the pill + tokens, in this order
  (site counts from the audit): `admin/agents/[id]/runs/page.tsx` (109),
  `admin/_features/knowledge/KnowledgeManager.tsx` (86), the six
  copy-paste AI-rules editors (`admin/ai/rules/{new,[id]}`,
  `admin/agents/[id]/rules/{new,[ruleId]}`,
  `admin/companies/[id]/rules/{new,[ruleId]}` — 29 each, near-identical),
  `admin/agents/[id]/memory/page.tsx` (54), `admin/ai/tools/[id]/page.tsx`
  (36), `admin/settings/_components/PurgesSettingsSection.tsx` (28),
  `admin/agents/[id]/observability/page.tsx` (27). Behavioural tests for
  these screens already exist — they must stay green; snapshot-style
  class-name assertions may need updating, which is expected and fine.

**Phase acceptance:** changing Success/Warning/Danger/Info in the DB
recolours status pills on the migrated screens; zero `getStatusColor`-style
local helpers remain; suites green.

## Phase 3 — the screen tells you where each row is used (1.5 days)

- [ ] **3.1 Usage descriptions under every heading and row** (the owner's
  explicit ask). One plain-English sentence each, derived from this audit,
  e.g. — Success: "Status pills and confirmations: passed checks, healthy
  agents, saved states." · Muted Text: "The faintest text — hints,
  timestamps, empty states. Used on nearly every screen." · Card
  Backgrounds: "Panels, tables, and modals." · Sidebar: "The left
  navigation rail." · Brand Accent: "Buttons, links, focus, and the widget's
  default accent colour." Add to `messages/en.json` **and** `messages/it.json`
  (i18n parity test enforces both — `src/i18n.test.ts`).
- [ ] **3.2 Honest scope copy:** "Applies to the dashboard app. The public
  website, sign-in screen, and emails have their own fixed designs."
  Replaces `appearance.typographySub` / `appearance.brandOriginSub` claims of
  "the entire platform/system".
- [ ] **3.3 New rows land:** Warning, Info, Muted Text, Sidebar Background;
  Small Text Size removed; relabels from 1.3/1.4. Keep the existing
  `SettingBlock` swatch UI.
- [ ] **3.4 Alpha-aware Borders/Hover.** The CSS defaults are translucent
  (`globals.css:46,50`) but `<input type="color">` writes opaque hex, so
  touching either row flattens the look permanently. Add an opacity slider
  beside those two swatches; store as 8-digit hex; injector passes it
  through.
- [ ] **3.5 Reset-to-default per row** — clears the override (pairs with
  0.5), showing the `globals.css` default it will fall back to.
- [ ] **3.6 Update the screen's component test**
  (`SettingsSections.test.tsx`) for new rows, removed row, and the
  allowlisted save from 0.2.

**Phase acceptance:** every visible row changes the app or does not exist;
every row/heading carries a usage sentence in both locales; i18n parity green.

## Phase 4 — the long tail, and a ratchet so it never regrows (2 days, then background)

- [ ] **4.1 Movements pose palette module**
  (`demos/movements/_lib/movementPalette.ts`): `#f6ccbe` (152), `#a8d5ba`
  (99) and friends, typed once, imported by the ~12 movement files. Domain
  colours, deliberately not tokens.
- [ ] **4.2 Chart palette module** for
  `admin/ai/costs/_components/AICostDistributionCharts.tsx` (15 inline hex)
  and any future chart.
- [ ] **4.3 The ratchet test** (`src/theme-drift.test.ts`): count
  `#hex-in-className` + raw palette classes (`red|rose|amber|yellow|emerald|
  green|sky|blue|indigo|orange|purple|cyan|violet|slate|zinc|gray|fuchsia`)
  under `src/`, excluding tests, `(public)`, and the two palette modules.
  Record the baseline in the test file. Fail if the count **rises**; whoever
  lowers it updates the baseline downward in the same commit. Model it on the
  existing repo-scan tests (e.g. `src/no-client-specific-fallbacks.test.ts`).
  **Write the ratchet first on day one of this phase**, then sweep.
- [ ] **4.4 File-by-file sweep** of remaining app-side drift, working down
  the offender list from the audit. Mechanical; batch as capacity allows;
  each batch lowers the ratchet baseline.

**Phase acceptance:** ratchet in CI with a recorded baseline; movements and
charts palettes centralised; baseline strictly lower than at phase start.

---

## Estimate summary

| Phase | Content | Days |
|---|---|---|
| 0 | Live bugs: font cycle, save corruption, CSS fallbacks, brand-rgb, clears | 1 |
| 1 | Warning/info/sidebar/muted tokens; dead rows decided; fonts honest | 1.5 |
| 2 | StatusPill + tone map; 18 helpers and top offenders migrated | 2 |
| 3 | Screen upgrade: new rows, usage descriptions (en+it), alpha, reset | 1.5 |
| 4 | Palette modules, ratchet test, first sweep batch | 2 |
| **Total** | | **8** |

## What this plan deliberately does not do

- No theming of the public site, login, or emails (owner scope decision,
  2026-08-10).
- No dark/light mode mechanics changes — only making existing tokens
  truthful.
- No visual redesign: every default matches what renders today. Compliance
  means the controls do what their labels say.
- No radius overhaul (`borderRadius` retires; 1,325 literal radii are a
  separate future plan if ever wanted).

## Acceptance for the whole plan

1. Every row on the Aesthetics screen visibly changes the app, or does not
   exist.
2. Every row and heading carries a usage description naming where it
   applies, in English and Italian.
3. Changing Success/Warning/Danger/Info recolours status surfaces across
   admin and workspace screens.
4. The ratchet test pins the drift count and only ever goes down.
5. Saving the Aesthetics screen writes only aesthetics fields — proven by a
   regression test.
