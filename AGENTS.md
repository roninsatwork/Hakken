# Sonae Agent Handoff

This is the repo-level handoff for future coding agents. Treat this file as the first local project guide to read after the user's latest instructions.

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
- The remote is expected to be `https://github.com/roninsatwork/Sonae.git`; do not switch it to SSH just to work around Codex auth unless the user asks.

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

Every push to `dev` runs lint, types and the whole test suite on GitHub. That
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
- The browser suite already runs only on pull requests into `main`. Leave it
  there.

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

Two different things run on GitHub, and it matters which one you are about to
trigger.

**Every push to `dev`, and every pull request** (`.github/workflows/ci.yml`):

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run coverage:check
```

This is the one that runs constantly and costs the Actions allowance. It does
not build the app and it does not audit dependencies, so a change that
type-checks and passes its tests can still fail on the way to production.

A pull request **into `main`** additionally runs the browser suite
(`npm run test:e2e`) in a second job.

**Only on a push to `main`** (`.github/workflows/deploy.yml`), before deploying:

```bash
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
npx convex deploy
```

`--omit=dev` is deliberate: only runtime dependencies block a release. The dev
toolchain currently pins an unpatchable transitive advisory, which
`.github/workflows/security-audit.yml` reports weekly without blocking.

If the local frontend is running on port 3000, stop it before `npm run build`, then restart both services afterwards:

```bash
npm run dev
npm run convex:dev
```

## Movement Demo Freeze

Do not refactor, redesign, or expand the movement demo unless the user explicitly asks or a quality gate is broken by it.

Frozen areas:

- `src/app/(dashboard)/demos/movements/**`
- `src/app/(dashboard)/demos/movement-capture/page.tsx`
- `convex/movements.ts`

The user considers this demo temporary and expects to delete it after the client has seen it. Focus maintainability work elsewhere.

If the user explicitly reopens avatar body motion, read `docs/developer/movement-demo-retargeting-approach.md` before changing `VrmAvatar` or lower-body tracking. The documented direction is source-skeleton proof, neutral calibration, vector retargeting, and foot locking; do not drive body animation primarily from labels such as `squat` or from canned poses.

### Mirror Methodology — Mandatory Contract

Before changing movement capture, display preparation, landmark ownership, scoring correspondence, retargeting, head/spine signs, hands, face, root motion, VRM bone application, or movement proof, read `docs/developer/movement-mirror-and-side-ownership-contract.md`.

The historical implementation record is `docs/plans/completed/movement-mirror-methodology-implementation-plan.md` (retired). Current work follows `docs/plans/active/movement-definitive-plan.md`; do not skip directly to bone tuning or selected-frame proof.

The non-negotiable mirror-game invariant is:

- recorded instructor motion preserves anatomical side: instructor right drives instructor-avatar right;
- the live player uses the opposite anatomical side to imitate the instructor: instructor right is matched by player left;
- the player avatar reverses the player's anatomy: player left drives player-avatar right;
- therefore, the instructor avatar and player avatar must visibly perform the same anatomical movement.

Keep preview mirroring, coordinate reflection, anatomical side ownership, and player-to-instructor scoring as separate named decisions. Do not use one generic `mirror` / `facing-player` flag to represent all four.

Mirror acceptance requires actual rendered VRM-bone proof. For shared avatar-behaviour changes, run the three-party instructor/player/player-avatar invariant through every rendered frame of the current schema-v3 acceptance recordings (see `docs/plans/active/movement-definitive-plan.md`) with zero silent skips; selected frames, solver labels, debug metadata, or a high score are not sufficient proof.

### Replay/Game Motion Vision

Replay Studio is the motion source of truth. If avatar motion is broken, fix the Replay/shared motion pipeline first, prove it with recorded data such as FULL MOTION EXERCISES, and then make Game Studio consume that same shared result. Do not patch Game Studio with separate bone rules, pose-specific tuning, or live-only presentation numbers that diverge from Replay. Any remaining Game Studio difference must be explicit input cleanup before the shared pipeline, or documented VRM application plumbing with parity proof.

All previous movement/replay plans were retired on 2026-07-20. The single source of truth is `docs/plans/active/movement-definitive-plan.md`: acceptance is the automated Replay/Game comparison passing on current schema-v3 recordings plus browser-visible confirmation. Retired plans (for example `docs/plans/completed/replay-studio-agent-repair-harness-plan.md` and `docs/plans/completed/replay-lab-visual-acceptance-tightening-plan.md`) remain useful background on the record-once repair loop and rendered-proof discipline, but they no longer gate work. Do not treat a UI verdict or solver label as sufficient rendered-avatar proof.

When debugging Game Studio movement, do not ask the user to repeat live motions until the matching recording has been run through the replay/game harness. Live testing is final confirmation, not the primary debugging loop.

## Project Guardrails

- Keep English and Italian locale dictionaries in parity: `messages/en.json` and `messages/it.json`.
- Do not use native browser dialogs (`alert`, `confirm`, `prompt`) in app UI. Use in-app feedback or the existing Sonae modal patterns.
- Administrative tables and feeds should use 15 rows per page unless a specific product requirement says otherwise.
- Preserve tenant isolation in Convex queries and mutations. Scope non-super-admin access by company.
- Mutations that manage users must prevent privilege escalation. Admins must not create, edit, or delete super-admin privileges.
- Resolve AI model choices from stored configuration instead of hardcoding model literals in runtime paths.
- Never hardcode colours in dashboard UI. No raw Tailwind palette classes
  (`text-red-500`, `bg-amber-500/10`, …) and no hex in class strings
  (`text-[#10b981]`) — use the theme tokens (`success`, `destructive`,
  `warning`, `info`, `brand`, `background`, `card`, `sidebar`, `foreground`,
  `secondary`, `muted`, `hover`, `border-dim`) and the `StatusPill` /
  `toneForStatus` atoms in `src/ui/atoms/` for status colouring. The ratchet
  test `src/theme-drift.test.ts` fails any change that raises the hardcoded
  count; when you remove hardcoded colours, lower its baseline in the same
  commit. Do not add a new local `getStatusColor`-style helper — extend
  `src/ui/atoms/statusTone.ts` instead. Sanctioned exceptions: the public
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
