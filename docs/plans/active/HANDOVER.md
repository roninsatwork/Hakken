# Handover — Sonae platform hardening

**State: green.** 3,072 tests passing (425 files), typecheck silent, lint 0 errors
/ 103 warnings, `npm audit --omit=dev` 0 vulnerabilities, build compiles.
Working tree is dirty with all the plan work. **Nothing has been committed or
pushed** — Anthony has not asked for it.

**Every item in the plan is complete: 49 of 49 days.**

---

## Read first

`docs/plans/active/platform-hardening-plan.md` — every item carries a write-up of
what was built, why each design choice, and what was deliberately **not** done.
All of Phases 0–4 are complete.

---

## How to work (standing instructions from Anthony, who is not technical)

- **Open every update with, unprompted, every time:**
  ```
  **Done:** …
  **Progress:** Phase N: X% (a of b days) · Overall: Y% (c of d days)
  **Next:** …
  ```
- **Never present technical choices.** Decide, then explain in plain language.
  He has told me off for this.
- **Keep updates short.** He has told me off for this too ("FFS"). Lead with the
  result; explain the *why* in one or two plain sentences; skip the detail.
- **Always take the best-practice option.** If the proper fix is blocked by
  missing verification, fix the verification gap first rather than take a
  shortcut.
- **Talk while working.** Don't go silent for long stretches.
- **The Posture Studio movement demo STAYS.** Fence it, don't delete it.
- **No client-specific hardcoded fallbacks** anywhere except `convex/seedUsers.ts`.
- **Do not commit or push without being asked.** A dirty tree means unfinished
  on purpose.

---

## Verification gate — run all of this before claiming anything is done

**Use Node 22, not the system Node.** The repo's `verify:env` check refuses to
run the suite otherwise, and the system default here is 23.10:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

Then:

```bash
npm audit --omit=dev   # expect 0 vulnerabilities
npm run typecheck      # expect silence
npm run lint           # expect 0 errors, 103 warnings
npm run test:run       # expect 3072 passing
npm run build          # expect "Compiled successfully"
```

Then re-verify the seven security fixes are still in place:

1. `frame-ancestors` in `convex/utils/widgetOriginPolicy.ts`,
   `src/lib/widgetEmbedPolicy.ts`, `src/proxy.ts`
2. `getSwarmLogs` gated by `canAccessThread` in `convex/swarmRuntime.ts`
3. `convex/authz-migration-allowlist.json` — `maxEntries` 0, `pending` empty
4. `"unconfigured.invalid"` in `convex/emailBrandingService.ts`
5. `validateConnectorConfiguration` in `convex/aiTools.ts`
6. `buildToolInteractionTurns` in `convex/agentRuntime.ts`
7. `src/no-client-specific-fallbacks.test.ts` exists

**Testing standard used throughout:** after writing a test, temporarily break the
code it covers and confirm the test fails. Roughly 50 of these have been done so
far, labelled A–BJ in the transcript. Don't skip it — it has caught several tests
that passed for the wrong reason.

---

## Known traps

- `convex/authz.ts` must import `getAuthUserId` from `@convex-dev/auth/server`,
  **not** the local `./auth`. The local import creates a module cycle and breaks
  116 tests.
- Test fixtures must not contain real model ID literals — the quality-drift guard
  in `src/quality-drift.test.ts` forbids them. Use `"test-provider-model"`.
- Only 2 of 7 enabled AI models have pricing set, so `resolveAgentObjectiveLimits`
  holds unpriced models to tighter budgets. Tests that assume otherwise will fail.
- UI tests must render through `src/test/renderWithProviders.tsx`, not
  `@testing-library/react` directly — pages now use `useToast`, which throws
  outside its provider.
- The React compiler's `set-state-in-effect` rule reports **more** as a
  component's hook shape changes. Changing a page can surface a pre-existing
  effect that was previously below its analysis threshold. Fix it (move the
  hydration to a render-time adjustment) rather than suppress it — see the three
  company-AI form pages for the pattern.

---

## Next: nothing in the plan. Ask Anthony.

The plan is finished. The obvious candidates are the open tasks below — the Node
24 upgrade (#5) is the one he asked for explicitly. Nothing has been committed;
that decision is his.

---

## P4.3 is done — what a later reader needs

`npm run template:build -- --out <dir>` writes the platform template. It reads
`template.manifest.json`; `src/template-boundary.test.ts` keeps that manifest
honest and runs in the normal suite.

- **Adding a product vertical means adding it to the manifest in the same
  commit.** The boundary test fails otherwise.
- **A platform file that needs a vertical** must either move into the vertical or
  be wrapped in `template:remove:start <vertical>` … `template:remove:end`. The
  test names the file when this is missed.
- **The generated template was run through its own full gate** when this landed —
  typecheck, 1,223 tests, lint, build. Repeat that after any manifest change; a
  unit test cannot stand in for it.
- The build never touches git. It prints the `git init`/`tag` commands and stops.

---

## P4.2 is done — what a later reader needs

All 49 admin write sites now run through `src/hooks/useAdminAction.ts`. The
write-up in the plan explains why. Three things worth keeping in mind when
touching an admin page:

- **A page needs a second runner when it shows failures inline in two places at
  once** (a permanent banner plus a modal). Otherwise one surface prints the
  other's error. Three pages do this; the rest share one runner.
- **Client-side validation stays out of the runner** — it is not a server failure
  and should not reach error tracking. Those pages render
  `validationError || action.error`.
- **A page test that renders a migrated page must use `renderWithProviders`**, or
  it fails with "useToast must be used within a ToastProvider".

**Careful (learned the hard way):** a scripted rename of `isSubmitting` →
`action.isBusy()` also rewrites JSX **prop names** (`isSubmitting={…}` becomes
`action.isBusy()={…}`), and a capitalised setter (`setSubmitError`) does not
imply a capitalised state name (`submitError`). Also check what a removed banner
was carrying — one held an "Open clone" link that a toast cannot replace.

**Left for a later tranche:** the original P4.2 idea of collapsing the 1,400-line
admin pages into data-driven list/detail/form components. The defect they shared
is fixed; their size is not.

## Open tasks, not part of the plan

- **#5** Upgrade Node 22.13 → current LTS. Anthony asked for this explicitly
  ("can we not upgrade to latest version of node rather than go backwards").
  Node 23 is an EOL odd release; the real target is Node 24 LTS. Touches
  `.nvmrc`, `Dockerfile`, and three workflows.
- **#12** `workflow.task.create` connector — needs a task data model and an admin
  surface first.
- **#14** Real connector OAuth — blocked on a token-storage decision and on
  Anthony registering apps with each provider.
- Adopt `eslint-plugin-react-hooks` 7.1 and fix the 58 violations behind the 103
  warnings.
- Wire error tracking to Sentry — blocked on Anthony creating an account.
  `src/lib/reportError.ts` already has the seam (`setErrorReporter`), and as of
  P4.2 admin action failures actually reach it.

## P3.7 leftovers

- No live Anthropic call has been made yet — the adapter is tested only against
  mocks.
- RAG embedding, `runTriggeredAgentObjective` and `executeAgentNode` still call
  Vertex directly rather than going through the provider registry.
- A provider failure *before* run creation leaves no FAILED run record.

## Spawned task chip

- Restore the missing Italian Properties page title (`messages/it.json` had a
  duplicate `properties` key; the parser already used the last one, so collapsing
  it was behaviour-neutral, but one title went missing in the process).
