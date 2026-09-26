# Hakken Agent Handoff

This is the repo-level handoff for future coding agents. Treat this file as the first local project guide to read after the user's latest instructions.

## Which repository is this?

**This is Hakken. All work happens here.**

Hakken was **cloned** from Sonae on 2026-09-21. This was not a rename — both
repositories exist and both are kept:

| | Local path | GitHub | Status |
|---|---|---|---|
| **Hakken** | `~/Projects/Hakken` | `roninsatwork/Hakken` | **Active. Do all work here.** |
| **Sonae** | `~/Projects/Sonae` | `roninsatwork/Sonae` | Upstream framework. Leave alone. |

Sonae is the reusable framework and continues in its own right, maintained
separately. Hakken is the first product built on top of it. Never edit, commit
to, or push to the Sonae folder or repo unless the user explicitly asks.

**On the git remotes here:** `origin` is `roninsatwork/Hakken` — push product
work there. `upstream` is `roninsatwork/Sonae`, kept only for pulling framework
updates; never push to it. The remotes were swapped on 2026-09-21, because
tools that name a project from `origin` (including the Claude desktop sidebar)
were displaying this repository as "Sonae".

## Product Context — read this before you build anything

**Hakken** (発見, discovery) works out which of a business's digital assets make
money and why the rest don't, fixes the broken stage, and proves the result in
leads and sales. Read [PRODUCT.md](PRODUCT.md) before any product work; the
research behind it is in [docs/product/](docs/product/index.md).

Three things to hold onto:

- **The product is not built.** This repository is the agentic framework it will
  be built on — a clone of the **Sonae** framework taken on 2026-09-21, with
  Sonae itself still live upstream. PRODUCT.md Part
  Two is what the code does today; Part Three §31 is the Hakken product surface,
  all of it unbuilt. Never describe a Part Three item as though it exists.
- **The product is Hakken. Nothing here is called Sonae.** Everything was
  renamed on 2026-09-21 — components, Convex functions and tables, config
  files, webhook headers, Stripe metadata keys, the widget surface,
  deployment names, test fixtures, CSS classes and every user-facing string.
  The only `Sonae` left is the URL of the upstream repository this was cloned
  from, and the prose above explaining that relationship. If you find any
  other `sonae`, it is a miss — rename it.
- **The rename knowingly broke external integrations.** Webhook receivers,
  Stripe metadata on live subscriptions, embedded widget snippets, DNS and
  Cloud Run resources still expect the old names. This was accepted
  deliberately; they are being fixed over time. The cutover checklist —
  what broke, and what to reconfigure — is PRODUCT.md §33. Do not "fix" a
  failure by renaming something back to `sonae`.
- **Everything in `docs/product/` is a dated record.** Do not edit those files
  to match later decisions. Supersede them with a new dated document, or record
  the change in PRODUCT.md's change log.

## Billing Framework Handoff

Before changing billing, read the [approved billing experience and handoff](docs/plans/active/optional-billing-starter-proposal.md#approved-billing-experience--2026-09-14) and [Stripe operator guide](docs/operator/stripe-billing.md). Company admins use **Billing in the user frontend** (`/app/settings/billing`) and have **zero access to platform Admin**. Super-admin setup and oversight live at `/admin/settings/billing`; Stripe owns hosted payments, invoices and customer financial management. Each clone uses one operator-owned Stripe account. Saved backend settings override the JSON clone defaults; credentials stay in the backend environment. Keep paid-company and covered-user counts distinct from revenue or per-seat billing. The [dated verification record](docs/plans/active/product-building-foundations-plan.md#billing-experience-verification--2026-09-14) separates local implementation from live Stripe acceptance and deployment; never treat one as proof of the other.

## Current Branch Rules

- Daily development happens on `dev`.
- `main` is production. A push to `main` triggers `.github/workflows/deploy.yml`.
- Before editing, run `git branch --show-current`. If it is `main`, switch to `dev` before making changes.
- Do not push after every small task. Batch related fixes, verify them, then push only when the user asks. Every push to `dev` runs the full check on GitHub, which is metered — see **What a push costs** below.
- After merging or pushing to `main`, switch back to `dev` before continuing feature or cleanup work.

## Git in Codex Desktop

- In Codex Desktop, prefer Apple system Git for network operations: `/usr/bin/git pull`, `/usr/bin/git fetch`, and `/usr/bin/git push`.
- The bundled Codex Git can fail against the HTTPS GitHub remote with `could not read Username for 'https://github.com': Device not configured`, even when the user's normal machine credentials work.
- If a normal `git pull` or `git fetch` fails with that credential error, retry the same operation with `/usr/bin/git` before asking the user to fix GitHub auth.
- The remote is expected to be `https://github.com/roninsatwork/Hakken.git`; do not change its transport without the owner's instruction.

## Progress Reporting

- For roadmap, plan, or multi-step product builds, include a percentage-complete estimate in user updates and final summaries.
- Report both the overall roadmap progress and the current slice/phase progress when they differ.
- Update the estimate when scope changes, after meaningful implementation milestones, and before pausing, committing, or handing work back.
- Use plain estimates such as "Overall: 10%. Current slice: 40%." Do not wait for the user to ask for percentages.

## Clear Communication

- Use simple, direct language. If the user says they do not understand, stop and restate the point in plainer words before continuing.
- When asking for approval, say exactly whether the user needs to do anything. Use wording such as "You do not need to record, test, or click anything. I am only asking for approval to proceed."
- When the user asks "what's next", answer with the next concrete action first. Do not lead with internal proof terminology, long roadmap summaries, or multiple abstract options.
- Translate technical terms into product meaning. For example, explain "schema-v3 packet is missing" as "we do not have a current saved recording with the new evidence format."
- Keep progress updates short and practical: what was checked, what was found, what will happen next, and whether the user needs to act.
- Do not hide blockers behind jargon. State the blocker plainly, the evidence for it, and the next useful action.

## User Alignment And Approval

- Default to questions before action. Keep asking short clarifying questions until the user explicitly says "go", "go for it", "approved", or an equally clear instruction for the specific next action.
- Approval for one action does not approve extra actions. Do not expand a "go" for investigation into repeated runs, saves, browser tests, proof gates, product changes, commits, pushes, or roadmap edits unless those exact actions were named and approved.
- When proposing work, ask one clear question and wait. Phrase it plainly, for example: "Do you want me to run one automated capture/save test now?" or "Do you want me to create the three real recordings now?"
- Before changing product behaviour, user-facing UX, roadmap scope, acceptance criteria, proof contracts, data schemas, capture/scoring semantics, or implementation direction, discuss the intended change with the user first.
- Present the proposed outcome, affected surfaces, important states, risks/tradeoffs, and verification plan, then obtain explicit approval before writing product or contract-changing code.
- This approval rule is not limited to visible UX. Treat movement capture, Replay/Game runtime behaviour, proof gates, saved-recording requirements, scoring correspondence, and roadmap status changes as user-alignment surfaces.
- Feedback, criticism, and brainstorming do not authorize implementation.
- If feedback materially changes an already approved direction, pause and agree the revised direction before continuing implementation.
- Read-only investigation, repo-state checks, local evidence gathering, and non-mutating diagnostics may proceed without waiting, but agents must report what they are checking and ask before acting on any material change discovered.

## What A Push Costs

Every push to `dev` runs the source guards, lint, types, the whole test suite
and a small browser smoke subset on GitHub. That
is real money on a metered allowance, and in July 2026 the account reached 90%
of its 3,000 monthly minutes with three days to go — 221 pushes to `dev`, most
of them one-per-step rather than one-per-finished-piece.

- A check takes about five to six minutes. It was nine and a half until the
  installed packages were cached between runs; the tree is 1.1GB and was
  refetched every time.
- Superseded checks are cancelled, so a burst of pushes costs one check rather
  than one each. `main` is exempt — those gate a deploy and each must stand on
  its own.
- Documentation-only pushes skip the suite. Pull requests never skip it.
- A four-spec browser smoke subset runs on every push and PR; the full browser
  suite runs only on pull requests into `main`. Leave that split alone.

**The failure mode to know about.** The cached dependency tree is keyed on the
lockfile, and this project carries a workaround for an npm bug that installs
the wrong rollup binary on Linux. If a check ever fails on something unrelated
to the change, suspect a stale cache first: bump the suffix in the cache key in
`.github/workflows/ci.yml`.

## Verification Gates

Use Node `24.18.0` (`.nvmrc` / `.node-version`) and run `npm ci` before trusting local verification. The local gate starts with `npm run verify:env`, which checks Node and installed direct dependency versions against `package-lock.json` so stale `node_modules` cannot produce misleading green tests.

Run these before asking the user to merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

**Two tests run only here, never on GitHub** (Anthony, 2026-09-25): the Sites
speed test (`convex/sitesLoad.test.ts`) and the whole-company planning test in
`convex/seoCollection.test.ts`. Both failed pushes on timing alone — GitHub's
runner is small, busy and slowed by coverage — so they skip when
`GITHUB_ACTIONS` is set. The local `npm run check` above is therefore the only
place they run: never push without it. Every other test still runs on GitHub.

Two different things run on GitHub, and it matters which one you are about to
trigger.

**Every push to `dev`, and every pull request** (`.github/workflows/ci.yml`):

```bash
npm run check:guards
npm run lint
npm run typecheck
npm run test:coverage
npm run coverage:check
npm run test:e2e:smoke
```

This is the one that runs constantly and costs the Actions allowance. It does
not build the app and it does not audit dependencies, so a change that
type-checks and passes its tests can still fail on the way to production.

A pull request **into `main`** additionally runs the full browser suite
(`npm run test:e2e`) plus coverage in a second job, the full gate.

**Only on a push to `main`** (`.github/workflows/deploy.yml`), before deploying:

```bash
npm audit --omit=dev --audit-level=high
npm run check:guards      # skipped when a passing CI run
npm run lint              # already covers this exact code
npm run typecheck         # (documentation-only releases,
npm run test:coverage     # or the same SHA passed CI)
npm run coverage:check
npx convex deploy
```

There is no `npm run build` in the deploy any more — deliberate, not an
omission. The Docker image builds the app itself in its builder stage, so a
separate build produced output nothing read; `deploy.yml` explains it inline.

`--omit=dev` is deliberate: only runtime dependencies block a release. The dev
toolchain currently pins an unpatchable transitive advisory, which
`.github/workflows/security-audit.yml` reports weekly without blocking.

If the local frontend is running on port 3000, stop it before `npm run build`, then restart both services afterwards:

```bash
npm run dev
npm run convex:dev
```


## Project Guardrails

- **Reuse before you build. Look first, every time.** Before writing a
  component, a hook, a helper or a Convex service, find out whether one already
  exists and use it. This is the rule most easily broken by accident, because a
  fresh file always compiles and a duplicate never announces itself — it just
  drifts from the original a token at a time until the two behave differently
  and nobody knows which is right.

  Where to look, in this order:
  - **Screens and UI**: `src/ui/components/screens/` is the kit — table, modal,
    headers, fields, pills, save controls, pagination. `docs/developer/screen-kit.md`
    lists every part. Genuinely admin-only pieces live in
    `src/app/(dashboard)/admin/_components/`.
  - **Hooks**: `src/hooks/` — `useServerPagedTable` for a paged list,
    `useAdminAction` for any admin write, `useDebounce` for a search box.
  - **Shared logic**: `src/lib/` for dates, formatting and the rest;
    `convex/adminQueryService.ts` for search, slicing and pagination on the
    backend; `convex/utils/` for validators and row shapes.

  If the existing part nearly fits, extend it rather than forking it, and say in
  a comment what the extension is for. If it genuinely does not fit, give the new
  thing a name that says what it adds — `RunStatusPill`, not a second
  `StatusPill` — and render the shared part inside it. `npm run check:screen-kit`
  already fails a component declared under a name the kit exports, which is the
  machine-checkable corner of this rule; the rest is on whoever is writing.

  Three copies of a thing is the signal to stop and share it. When you do, move
  the shared version to the narrowest folder both callers can reach — not
  automatically into the kit, which is for parts every screen may want.

- **Layouts are fluid. Do not put a fixed width on a layout.** The dashboard
  shell (`FluidWorkspace`) owns the scrollable column and its padding, and
  everything inside fills it. A `max-w-*` on a card, a section or a page wrapper
  leaves half a wide screen empty and is the most common way a new screen stops
  matching the ones beside it.

  The two sanctioned uses of `max-w-*` are both about the *content*, never the
  container: on a paragraph, where a long line is genuinely harder to read
  (`max-w-2xl` on prose), and on a single control that would look broken
  stretched across a monitor — a date picker, a short select. Put two such
  controls side by side in a responsive grid rather than stacking them down a
  narrow column. `ApprovalExpirySection` is the screen to copy.

- Keep English and Italian locale dictionaries in parity: `messages/en.json` and `messages/it.json`.
- Do not use native browser dialogs (`alert`, `confirm`, `prompt`) in app UI. Use in-app feedback or the existing `HakkenModal` patterns.
- Administrative tables and feeds should use 15 rows per page unless a specific product requirement says otherwise.
  The client's Sites tables (`/app/sites`) are that requirement (Anthony,
  2026-09-25): numbered pages like Ahrefs', a choice of 25, 50, 75 or 100 rows
  opening at 25 and remembered per page, and an exact total on every table.
  Build a Sites table on `useSitePager` (a list sent whole) or the Sites
  server pager, never on `TABLE_PAGE_SIZE`. See
  `docs/plans/active/sites-table-pages-plan.md`; `src/pagination-drift.test.ts`
  holds both rules.
- Every Sites table sorts by its headings, the same way (Anthony,
  2026-09-26): the best first, again for the other way, over the whole list,
  blanks last. Never a sort dropdown, never only the rows on screen. Server
  lists take `sort` and `direction` (`listOrder`), screens use `useSiteSort` or
  `useSiteSortedList`, and the one rule is `convex/utils/sortOrder.ts`. See
  `docs/plans/active/sites-table-sorting-plan.md`;
  `src/pagination-drift.test.ts` fails a table that drifts.
- Read `docs/developer/screen-kit.md` before building or restyling any screen,
  and copy an existing screen that already does it — Subscription Plans and
  Manage Companies are the reference list screens. Do not infer a layout from
  the screen in front of you: a list screen is assembled in one order — title
  and description, an explanation box if needed, the search box, the table, its
  footer, then save controls — and the title goes above the search box, never
  inside the table via `cardHeader`. Take the parts whole: `DataTable` for a
  list, `PageHeader` / `DetailHeader` / `DetailLayout` for the title,
  `Checkbox` for a tick box, `Field` for a text field, `Button` for a button,
  `SaveAction` / `SaveError` for saving. `npm run check:guards` fails on eight
  kinds of drift here, including a table with no header above it, and the
  allowlist in `scripts/screen-kit-allowlist.json` may shrink, never grow —
  adding an entry is not the fix. If the standard genuinely does not cover the
  case, add the rule and write it down rather than deciding by eye; that gap is
  what produced the 2026-08-22 Features rebuild.
- Every screen wears a header, and which one is decided by what the page is, not
  by how it looks:
  - **A top-level page** (opens from the sidebar): `PageHeader` with `divider`.
  - **A tabbed section** (companies, agents, System Settings): `DetailLayout`,
    which draws title, rule and tab strip itself — never draw that rule
    separately.
  - **A page inside such a section** (a tab's own content): its own `PageHeader`
    with **no** `divider` — the section's `DetailLayout` already drew the rule,
    and a second one reads as two headers. Company Dashboard, Calls and Features
    are the examples to copy.
  - **A record-level page** (a rule editor, a script, a schedule, a document):
    `DetailHeader`, which puts a quiet back row on its own line above the title
    block, with status pills under the description via `pills`, never woven into
    the title row.

  At most one brand-orange action per page: orange means "this page's action" and
  nothing else, so filters, pickers and secondary buttons stay quiet grey, and a
  page with two orange buttons has no primary action. `PagePrimaryAction` is the
  shared one and removes itself for a read-only viewer rather than greying out;
  most screens still use `WriteButton` with their own classes, so match the
  screen you are working in rather than converting it in passing. Never
  hand-write an `<h1>` in a screen and never hand-write
  `border-b border-border-dim pb-6` — the header components own the title recipe
  and that line, and the build refuses both. Full detail in
  `docs/developer/screen-kit.md` under "Headers".
- Preserve tenant isolation in Convex queries and mutations. Scope non-super-admin access by company.
- A company's tracked Google searches and AI questions are its own
  (Anthony, 2026-09-25; `docs/plans/active/private-tracking-lists-plan.md`).
  Read them only through `convex/holdLists.ts`, by the company's hold, never
  by website, search or question; buying stays shared.
  `convex/websiteTenancyGuard.test.ts` fails a read that goes round it.
- Mutations that manage users must prevent privilege escalation. Admins must not create, edit, or delete super-admin privileges.
- Resolve AI model choices from stored configuration instead of hardcoding model literals in runtime paths.
- Never hardcode colours in dashboard UI. No raw Tailwind palette classes
  (`text-red-500`, `bg-amber-500/10`, …) and no hex in class strings
  (`text-[#10b981]`) — use the theme tokens (`success`, `destructive`,
  `warning`, `info`, `brand`, `background`, `card`, `sidebar`, `foreground`,
  `secondary`, `muted`, `hover`, `border-dim`) and the `StatusPill` /
  `toneForStatus` atoms in `src/ui/components/screens/` for status colouring. The ratchet
  test `src/theme-drift.test.ts` fails any change that raises the hardcoded
  count; when you remove hardcoded colours, lower its baseline in the same
  commit. Do not add a new local `getStatusColor`-style helper — extend
  `src/ui/components/screens/statusTone.ts` instead. Sanctioned exceptions: the public
  site's own palette, `movementPalette.ts`, `chartPalette.ts`. See
  `docs/plans/active/theme-compliance-plan.md`.
- Avoid committing generated reports, build output, local caches, or scratch artifacts.

## Code Quality Priorities

1. Turn drift checks into automated tests or scripts so future regressions are caught before review.
2. Promote cleaned lint categories back to hard errors now that `npm run lint:all` is clean.
3. Extract repeated admin table/search/pagination structure outside the frozen movement demo.
4. Consolidate app feedback banners, confirmation flows, and empty/error states into shared UI primitives.
5. Add Convex auth helper functions for common `requireUser`, `requireAdmin`, and `requireSuperAdmin` patterns.
6. Normalize Convex error handling and typed row contracts in admin and AI surfaces.
7. Continue splitting workflow editor/runtime types and helpers, but leave movement demo code alone.
8. Add regression tests for auth redirects, locale parity, no-native-dialog drift, and 15-row admin pagination.

See `docs/developer/future-agent-maintenance-plan.md` for the fuller plan.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
