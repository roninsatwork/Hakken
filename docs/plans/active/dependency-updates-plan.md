# Bringing every dependency up to date

Anthony, 2026-10-22, after the Node.js October security release: "can we check if anyting else needs to be updated
too", then "lets make a plan to do all of them". Nothing in this plan is built yet; each phase waits for his "go".

## Already done

- **Node 24.22.1** everywhere we set it (2026-10-21, `6f59ff6d`, pushed; GitHub's run passed). Convex runs our
  "use node" actions on its own Node — 24.21.0 on 22 October — which only Convex can update.

## How every phase is done

- **One phase at a time, one major version at a time.** Never two big upgrades in one commit, so a fault is traced to
  one package.
- **Each phase passes the whole gate before it is committed:** `npm ci`, `npm run check`, GitHub's own steps
  (`test:coverage`, `coverage:check`, `test:e2e:smoke`, in a copy so the app on :3000 keeps running) and `npm run build`.
- **Screens are looked at in Chrome** where a package draws them (icons, animation, charts, styles), against their
  approved looks.
- **Pushes are batched**: one push every two or three phases, each of which costs one GitHub run.
- **What a phase changes in how the app behaves is said before it is done**; a package that needs code changed beyond
  following its upgrade notes is raised with Anthony first.

## Phases

| # | Phase | What moves | What could break, and how it is checked | Days |
|---|---|---|---|---|
| 0 | **Security** | `vitest`, `@vitest/coverage-v8` and `@vitest/mocker` 4.1.11 → 4.1.12; `vite` past 8.1.5 and `smol-toml` past 1.8.0 (both inside other tools); `mammoth`'s own `argparse` moved to 2.x by an `overrides` entry, which drops `sprintf-js` | See "Phase 0, from the audit" below | ½ |
| 1 | **Framework, small steps** | Next.js 16.3.8 → 16.4.2 (with `eslint-config-next`, `@next/third-parties`); React 19.2.7 → 19.3.1 (with their types); Convex 1.40.0 → 1.47.0 (with `convex-helpers`, `@convex-dev/auth`, `@convex-dev/stripe`) | Next's own upgrade notes read first (AGENTS.md: this is not the Next.js the models know); Convex's generated code and sign-in checked; every screen's look test | 1 |
| 2 | **Smaller app and tool updates** | Tailwind 4.3.3, `tailwind-merge`, `next-intl`, `recharts` 3.10, `lucide-react` 1.61, `@xyflow/react`, `mammoth`, `axe-core`, `knip`, `@vitejs/plugin-react`, `@testing-library/react`, Playwright 1.64 (and its browsers) | Icons renamed in 44 releases of lucide; charts in the drawing kit and on screen; the screens' looks | 1 |
| 3 | **The test database** | `convex-test` 0.0.53 → 0.0.64 | Our change to it (`src/test/convexTestTables.ts`, AGENTS.md) moves with its code: every backend test fails at once if it no longer fits, and is fixed, never removed | ½ |
| 4 | **GitHub's own steps** | `actions/checkout` v4/v5 → v7, `actions/setup-node` v4/v5 → v7, `actions/cache` v4 → v6, `actions/upload-artifact` v4 → v7, Google Cloud's actions v2 → v3, `docker/setup-buildx-action` v3 → v4 | Proved by one GitHub run; the deploy steps run only on a push to `main` (no production yet), so they are proved at the first release | ½ |
| 5 | **Node's types match the Node we run** | `@types/node` 20 → 24 (not 26: the types follow Node 24) | New type errors where Node's own functions changed | ½ |
| 6 | **Test tools** | `@testing-library/jest-dom` 6 → 7, `jsdom` 27 → 30 | The screen tests and the drawing kit, which renders the parts in jsdom | 1 |
| 7 | **The test runner** | `vitest` and `@vitest/coverage-v8` 4 → 5 | AGENTS.md's test rules are written for Vitest 4 (fake timers, the one time limit, the speed check, the file cache): each re-proved and the rules updated | 1½–2 |
| 8 | **App libraries, one each** | `intl-messageformat` 11 → 12 (advice text); `framer-motion` 12 → 14 (31 screens); `@sentry/nextjs` 10 → 11 (error reporting); `@google/genai` 1 → 2 (the Google AI agents) | Each its own commit. The Google AI change is checked with a few real model calls on dev (a few pence) | 2–3 |
| 9 | **Billing** | `stripe` 22 → 23 | The billing rules hold: local checks are not live Stripe acceptance, which stays a separate step on Anthony's word | 1 |
| 10 | **Lint** | `eslint` 9 → 10 | The repo's lint rules and the guards built on them | ½–1 |
| 11 | **TypeScript 7** | `typescript` 6 → 7, the new compiler | Only once Next.js, Convex and the lint tools support it; if they don't yet, this phase waits and says so | 1–2 |
| 12 | **The arcade** | `three` 0.184 → 0.186 (and its types) | Ronins Run only; its own tests and a play-through | ½ |
| — | **Node 26** | Our Node 24 → 26 | Only once Convex offers Node 26 for its actions, so both sides stay on one version (Node 26 becomes the long-term one on 28 October) | 1 |

**About 11–14 working days in all**, about five pushes.

## Phase 0, from the audit (2026-10-22)

`npm audit` names 13 warnings, none critical:

- **In the app itself: 3 moderate, one cause.** `mammoth` (reading Word documents into Knowledge) depends on an old
  `argparse`, which depends on `sprintf-js`, which a crafted format string can slow to a stop. `mammoth` uses
  `argparse` only in its command-line tool, which Hakken never runs, so nothing a customer does reaches it. There is no
  fixed `sprintf-js`, and npm's own suggestion (going back to `mammoth` 0.3.29) is years old. The clean fix is an
  `overrides` entry giving `mammoth` `argparse` 2.x, which needs no `sprintf-js`; its command-line tool is the only part
  that could notice.
- **In the developer tools only: 10.** Vitest's mock server (code injection, moderate) and Vite's dev server (high:
  files outside the project served, and editor-opening flaws mostly on Windows) are fixed by small updates; so is
  `smol-toml` (moderate, a slow parse). The other five are one chain — `braces` through `micromatch`, `fast-glob` and
  Next's lint plugin (high: deeply nested patterns slow it to a stop). No fixed version exists, the patterns are our
  own lint settings, and AGENTS.md already notes it as reported weekly without blocking; it stays watched.

### Phase 0, as built (2026-10-22)

- `vitest`, `@vitest/coverage-v8` (and `@vitest/mocker`) 4.1.12; the `vite` override raised to `^8.1.6` (8.3.5
  installed) and `smol-toml` given one (`^1.8.1`, 1.9.1 installed); `mammoth` given `argparse` `^2.0.1`, so
  `sprintf-js` is gone. `npm audit`: 13 warnings to 5 — the `braces` lint chain, which has no fix — and none in the
  app itself.
- **Install scripts.** npm 11.19, which came with Node 24.22.1, runs a package's install script only once it is
  approved, and nine packages have one (`esbuild`, `@swc/core`, `@sentry/cli`, `unrs-resolver`, `fsevents`,
  `@parcel/watcher`, `protobufjs`, `@google/genai`): fetching or building a native file when the ready-made one is
  missing, or nothing at all. A fresh `npm ci` with all of them skipped passed the browser smoke tests and the build,
  as GitHub's run on the new Node had; they are recorded as not run (`allowScripts` in `package.json`), so a new one
  shows up for review.
- Four of `googleAnalyticsHistory.test.ts`'s tests sat at five seconds on a busy machine: they now mark the finished
  periods fetched already, as the file's tests read none of their lists, and take half the time.
- **Convex's Node.** Convex runs our "use node" actions on Node 24.21.0, before the Brotli fix. Of our four files
  that use Node's `fetch` there, only webhook delivery reads a reply from an address someone else sets; Hakken is not
  on the internet and no webhook is set. A change to make it refuse compressed replies until Convex updates is offered
  to Anthony, not built.

### Phase 1, as built (2026-10-22)

- Next.js 16.3.8 → 16.4.2 (with `eslint-config-next` and `@next/third-parties`), React 19.2.7 → 19.3.1 (with its
  types), Convex 1.40.0 → 1.47.0 (`convex-helpers` 0.1.129, `@convex-dev/auth` 0.0.96, `@convex-dev/stripe` 0.1.7).
- **A security fix too.** Next.js's 14 October update fixes two critical flaws and a high one (`use cache` returning
  typed arrays, SVGs through the image optimiser, Server Actions), from 16.4.1 only on the 16.x line; `npm audit` did
  not name them. Hakken uses none of those features, and `sharp` was already at the safe 0.35.5.
- Next.js 16.4's upgrade notes list no breaking change for an app not using Cache Components. Convex 1.47's generated
  `server` files gain its typed environment variables.
- **For the first release:** `npx convex deploy` now stops to ask before building an index on a large table, which a
  release from GitHub cannot answer. Nothing is large while there is no production; when there is, a release that adds
  an index needs `staged: true` on it or a decision on `--skip-large-indexes-check`.

### Phase 2, as built (2026-10-22)

- Tailwind and `@tailwindcss/postcss` 4.3.3, `tailwind-merge` 3.7.0, `next-intl` 4.14.9, `recharts` 3.10.1,
  `lucide-react` 1.61.0 (no icon Hakken uses was renamed or removed: the typecheck is clean), `@xyflow/react` 12.12.0,
  `mammoth` 1.13.0 (still given `argparse` 2), `axe-core` 4.14.0, `knip` 6.42.1, `@vitejs/plugin-react` 6.1.2,
  `@testing-library/react` 16.3.3, Playwright 1.64.1 with its Chromium.
- Gate, coverage, smoke tests and build passed. **Still to do:** a look at the screens in Anthony's Chrome, signed out
  of Hakken when phase 1 replaced the sign-in library under the running app.

## Limits, said plainly

- Convex's own Node is Convex's: this plan can't move it, only check it.
- The deploy workflow's new steps can only be proved by a push to `main`.
- A live Stripe payment is never part of these checks.
- Google AI calls in phase 8 cost a little; they are asked one by one, on dev.
