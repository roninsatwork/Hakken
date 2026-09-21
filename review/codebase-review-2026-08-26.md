# Hakken Codebase Review — 2026-08-26

Scope: `src/` (215,686 lines), `convex/` (174,581 lines excluding `_generated`), `e2e/`, `scripts/`, CI. 1,676 TS/TSX source files, 632 test files. Measured directly against the repository rather than carried over from `codebase-review-2026-08-24.md`, since much of what that review flagged has since been fixed.

## Overall verdict: 8.5/10

Per-area scores:

| Area | Score |
|---|---|
| Frontend (src/app, src/ui, src/context, src/hooks) | 8.5/10 |
| Convex backend | 8.5/10 |
| Cross-cutting consistency & TypeScript discipline | 9/10 |
| Testing & tooling | 8.5/10 |

The defining property is that conventions are **mechanically enforced**, not documented and hoped for. 25 drift tests in `src/*.test.ts` plus 7 guard scripts freeze existing debt with dated, reasoned, shrink-only allowlists while failing the build on anything new. That is the correct architecture for a 390k-line codebase and it is executed unusually well.

---

## 1. Coding best practices — very strong

### Verified measurements

- **TypeScript**: exactly **1** real `: any` in 390k lines (`convex/wikiAsk.ts:46`), **0** real `as any` (all 7 grep hits are the word "any" inside prose comments), 2 `@ts-expect-error` for `pdf-extraction`'s broken declarations, 0 `@ts-ignore`. `strict: true`, and `no-explicit-any`/`ban-ts-comment` are ESLint **errors**.
- **Hygiene**: 0 `dangerouslySetInnerHTML`, 0 `onClick` on a `<div>`, 3 empty catch blocks, 23 `console.*` calls in non-test frontend source (down from 145+).
- **Error handling is now consistent on the backend**: **859** `appError()` call sites against **5** remaining plain `throw new Error(` in non-test convex code. The prior review's largest consistency gap (477 vs 354) is effectively closed.
- **`useAdminAction` adoption**: 103 components, up from 22. `src/hooks/useAdminAction.ts` is a genuinely good abstraction — it exists because 48 hand-rolled sites all made the same three mistakes (leaked Convex error envelopes, no `reportError`, `useState` busy-flag that doesn't stop double submits), and its doc comment says exactly that.
- **Comments explain "why", not "what"** — consistently, across both `src/` and `convex/`. This is rare and it is the main reason the codebase is navigable at this size.

### Issues

| Sev | Location | Issue |
|---|---|---|
| Med | `convex/schema.ts` (4,421 lines, 116 tables), `convex/agentSkills.ts` (2,458), `convex/agentEvalFixtures.ts` (2,000), optional module (not included in this copy) (1,991) | 81 non-test, non-demo files exceed 500 lines. The worst frontend god-components were fixed (KnowledgeManager 1,453 → 663 plus a split-out Sections file; agentRuntime 2,803 → 1,212), but the backend's largest modules were not. |
| Med | optional module (not included in this copy) (1,336), `app/[workspace]/customers/[account]/page.tsx` (911), `app/page.tsx` (708) | Page components carrying fetch, transform, chart and export logic inline. |
| Low | `tsconfig.json` | `strict` is on but `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not, and `target` is still `ES2017` on a Node >= 24 / modern-browser project. 144 non-null assertions in non-test source are largely a symptom of the first gap. |
| Low | No Prettier/formatter config | Formatting is convention only. It holds in practice (3,687 double-quoted imports vs 46 single in `src/`; 100% double in `convex/`), but nothing enforces it. |

---

## 2. Architectural best practices — the standout

**Structural multi-tenant authorization.** Every client-callable Convex function goes through a guarded builder in `convex/tenantFunctions.ts` — `tenantQuery/Mutation`, `adminQuery/Mutation`, `governanceQuery` (deliberately no mutation), `superAdmin*`, `module*`, and `public*` builders that **require a written `reason` string**. Confirmed **0** raw `query`/`mutation`/`action` exports remain across 920 declared functions; `convex/authzEnforcement.test.ts` fails the build on any. Authentication happens before the handler is entered, so anonymous access is impossible by construction rather than by discipline.

**Layering enforced by tooling, not prose.** `eslint.config.mjs` blocks browser imports of Convex function-defining modules via regex (types, `utils/`, `*Service` allowed), and separately blocks `/app` routes from reaching into `admin/` internals — in both the alias and relative spellings. The comment is honest that neither spelling was the one that actually broke (a dynamic `import()`, invisible to ESLint), and that `src/admin-boundary-drift.test.ts` walks the import graph to cover all three. That is the right layered defence.

**Service pattern** holds: 75 `*Service.ts` modules are pure and unit-testable; external I/O is confined to `*Actions.ts`. No `ctx.db` in action files.

### Issues

| Sev | Location | Issue |
|---|---|---|
| High | `next.config.ts:31-46`, `.github/workflows/ci.yml:164` | **The e2e suite runs against a mocked Convex client.** `convex/react` is aliased to `src/e2e/convexReactMock.tsx` (1,609 lines) whenever the e2e flag is on, so no CI job exercises real client-to-backend wiring. The `real-auth-smoke` job that would has been moved to `workflow_dispatch`-only as of 2026-08-26. The reasoning in the comment is sound (a dedicated paid deployment with a test-login door open is a real cost), and the job fails loudly rather than skipping when unconfigured — but the outcome is still that the biggest integration surface is verified by hand. |
| Med | 77 sites across `analytics.ts` (16), `companySkills.ts` (12), `systemHealth.ts` (7), `aiRules.ts` (7), and others | `.take(10000)` is bounded-in-name-only — at scale these silently truncate. Up from 51 at the last review. To the codebase's credit, `src/analytics-read-drift.test.ts` fences every one with a written reason, and several reasons were **corrected downward** on 2026-08-26 ("Recorded honestly … after the previous reason claimed the snapshot ceiling covered it, which was false in both halves"). The debt is understood; it is not yet paid. |
| Med | `convex/` | **85 `returns:` validators against 920 exported functions (~9%).** Public functions return unshaped documents, so any field added to a table later leaks to clients automatically. This is now the single largest backend correctness gap. |
| Med | `convex/` flat directory, ~500 files | Past the point of navigability. 40+ `agent*` files and 30+ `wiki*` files should be subdirectories. Mitigated only by very regular `foo.ts`/`fooService.ts`/`fooActions.ts` naming. |
| Low | 334 of 443 non-test TSX are `"use client"`; **0** `loading.tsx` files | Only 19 async server components. Loading is hand-rolled per page (consistently, at least). Partly structural given Convex's live-query model, but the App Router's streaming primitives are unused. |
| Low | 43 `public*` declarations | Reason strings are still copy-pasted across surfaces that are really "authenticated-or-null soft-fail" rather than deliberately public. A `softQuery` builder would restore the distinction. |

---

## 3. Consistency — much improved, now genuinely good

Several inconsistencies from the last review have been **closed and locked**, which is the part worth noting:

- **File naming**: was called a three-way split. Measured now, PascalCase leads **234 to 6** among component files; the remaining kebab-case names are all Next.js structural (`page`, `layout`, `error`, `global-error`). `src/file-naming-drift.test.ts` now enforces PascalCase with a frozen 7-file list, and its comment correctly calls out that the earlier 302-file figure counted a different population.
- **`src/ui/atoms/` vs `src/ui/components/screens/`**: the split is gone. All primitives (`Button`, `Checkbox`, `Field`, `Select`, `StatusPill`, `CursorPagination`) now live in one kit directory with their tests beside them.
- **`quality-drift.test.ts`** (1,462 lines mixing ~10 concerns) has been split into 25 focused drift tests, largest now 569 lines.
- **Pre-kit pages migrated**: optional module (not included in this copy) now uses `useTranslations`, the shared `chartPalette`, and `src/lib/currency` — the local `formatCurrency` and per-page hexes are gone. Zero local `formatDate`/`formatCurrency`/`formatNumber` duplicates remain outside the frozen demos, and `date-fns` has been removed from the tree entirely.
- **i18n adoption**: admin 158/241, app area 40/60 (was 27/53), `src/ui` 31/58. Parity between `en`/`it` is test-enforced across 4,703 keys, all resolving.

### Remaining genuine inconsistencies

| Sev | Issue | Evidence |
|---|---|---|
| Med | 295 raw `<button>` across 125 files, 44 hand-written headings across 41 files, 9 headerless tables | Reported verbatim by `check:screen-kit`. Frozen and shrink-only, but the kit is still bypassed in a quarter of the tree. |
| Med | 287 hardcoded hex colours in `src/app` + `src/ui` outside globals/demos | Ratcheted down from ~2,039, but each chart-bearing page still redeclares its own. Partly forced by the documented html2canvas/oklab export constraint. |
| Low | 67 non-route components use default export | While most of the tree uses named exports. No rule either way. |
| Low | `src/ui/components/` sub-grouping | `charts`, `chat`, `feedback`, `governance`, `layout`, `screens`, `settings`, `workflows` mixes generic kit with feature folders under one parent. |

---

## 4. Testing & tooling

**Strong:** 632 test files. 139 of 234 convex test files run the real Convex runtime via `convexTest` rather than mocking it. Coverage floor has been ratcheted 69 to 72 lines / 67 to 70 statements since the last review, with a documented one-way ratchet, a vacuous-pass guard, and the movement demo split out as reported-only so its higher coverage cannot mask a platform regression. Guards actually pass and print real counts (2,225 files encoding-checked, 299 convex modules pagination-checked). CI is cost-conscious and its comments explain every trade honestly, including the ones the team lost.

### Issues

| Sev | Issue |
|---|---|
| Med | **`npm run typecheck` is not hermetic.** `tsconfig.json` includes `.next/dev/types/**/*.ts`; a stale dev-server artifact makes it fail against routes that no longer exist. 9 such errors appear on an otherwise clean tree — all from `admin/companies/[id]/{chat-logs,invites,knowledge,models,rules,system-prompt,users}` folders that were reorganized away. Green in CI (fresh checkout), red locally, which trains people to ignore it. |
| Med | `knip.json` has `ignoreDependencies: [".*"]` — unused/undeclared dependency detection is fully off; only orphan files are checked. |
| Med | `scripts/movement-debug/` drives ~101 of ~160 npm scripts. `package.json` is unreadable for platform work; this belongs behind its own CLI or workspace package. |
| Low | Coverage ratchet-up is manual — `nextRatchet` values sit in `coverage-thresholds.json` with nothing automating the raise. |

---

## 5. Priorities, in order

Impact-weighted. The first three are the only items that change what can silently break; everything below them is hygiene and should not be scheduled ahead of them.

1. **Add `returns:` validators**, starting with the ~40 highest-traffic public queries. 9% coverage on 920 functions is the one gap that can leak data without anyone noticing.
2. **Close the e2e honesty gap** — either restore `real-auth-smoke` on PRs into `main`, or state in `docs/developer/deployment.md` that client-to-Convex wiring is a manual pre-ship check, so it is not rediscovered as a surprise. Even one spec on one route against dev moves this from zero to non-zero.
3. **Page the four un-protected `.take(10000)` reads** the drift test's own reasons already identify as unprotected (`getGlobalAICosts`, `getPlatformOverview`, and the 30-day monthly-active scan in `getGlobalAnalytics`).
4. **Fix the typecheck hermeticity** — drop `.next/dev/types` from `tsconfig.include`, or add a `rimraf .next/dev/types` to `pretypecheck`. One-line fix, removes a false red.
5. **Split `convex/schema.ts`** into per-domain table modules, and group `agent*`/`wiki*` into subdirectories.
6. Turn on `noUncheckedIndexedAccess`, raise `target` to ES2022, add Prettier.

---

## 6. Bottom line

This is a well-architected codebase whose distinguishing feature is that its quality is falsifiable — nearly every claim it makes about itself is backed by a test that fails when it stops being true. The four points docked are real (return validators, mocked e2e, backend file sizes, `.take(10000)` at scale), and every one of them is already named in the repo's own allowlists rather than hidden.
