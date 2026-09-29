# Status labels: icon and words, no pills

**Started 2026-09-29. Status: all six steps built on dev 2026-09-29.** Change a decision here,
with a date, before building anything that disagrees with it.

## What was asked

Anthony, 2026-09-29, looking at "Checked once on Google" and "Commercial" on
a search's page in Sites: "I really don't like lozenges … it's a give away
it's AI designed", "We are going to replace them platform wide". Four
alternatives were drawn on the canvas "Replacing the pills" (coloured words;
dot and words; icon and words; small capitals), each with the same ten real
labels. He chose **C, icon and words**: "we need to replace these platform
wide to create a standard and document this for future agents and guards
against drift".

## The standard

A status is said with **a small line icon in the status's colour, then the
words in plain text**. No box, no fill, no border, no rounded ends.

| Tone (`StatusTone`) | Means | Icon (lucide) | Colour token | Examples today |
|---|---|---|---|---|
| `success` | Good | `Check` | `text-success` | Commercial, Tracked, Mentions ronins.co.uk, Done |
| `info` | Information, in motion | `Info` | `text-info` | Checked once on Google, Informational, Running |
| `warning` | Worth a look | `TriangleAlert` | `text-warning` | ronins.co.uk not mentioned, Recommends lightflows.co.uk, No, in neither answer |
| `danger` | Failed | `CircleX` | `text-destructive` | Failed, Refused |
| `neutral` | Nothing to say | `Minus` | `text-secondary` | Not judged yet, Off, Cancelled |

The five tones and the status-to-tone list (`toneForStatus`) already exist
in `src/ui/components/screens/statusTone.ts` and do not change; only what
is drawn for a tone does. The colours are the theme's own, so the
Aesthetics screen's status colours keep working.

Rules, each one there to stop a drift before it starts:

1. **The icon comes from the tone**, not from the screen. A screen that wants
   a different icon for a genuinely different meaning (a clock for
   "Waiting", say) adds it once to the kit's named list, with a line on why;
   it never passes an icon of its own at the call site.
2. **Only the icon is coloured.** The words stay the page's ordinary text
   colour, so a table of statuses reads as text, not as a rainbow.
3. **Colour is never the only signal.** The five icons differ in shape, so
   someone who cannot tell green from amber still can.
4. **The icon is decoration to a screen reader** (`aria-hidden`): the words
   carry the meaning, so the words must say it on their own.
5. **Two sizes:** 12px words and a 14px icon in tables and lists; 13px and
   15px in page headers and detail rows. Nothing else.
6. **One component:** `StatusLabel` in the screen kit
   (`src/ui/components/screens/`). Every status on every dashboard screen,
   the client's and admin's alike, is drawn by it or by a named part built
   on it (`IntentLabel`, `DecisionLabel`, …).

## What is there today (counted 2026-09-29)

- **`StatusPill`**, the kit's pill: **104 uses in 52 files**.
- **Parts built on it**, about nine: `IntentPill`, `PageTypePill`,
  `LinkStatusPill` (Sites), `DecisionPill` (a button that opens how sure
  the Decision was), `FeedbackPill`, `AssistantStagePill`,
  `DirectoryInviteRolePill`, `DirectoryUserRolePill`,
  `MemoryApplyModeBadge`, and `PhotoActionChip`.
- **Pills drawn by hand**, not using the kit: about **44 places in 35
  files** shaped as a rounded, tinted pill, and about **25 places in 16
  files** drawn as small tinted tags. Some of these are not statuses at all —
  avatars, dots, progress bars, filter buttons — and each is looked at before
  it is changed; those stay as they are.
- **The recipe itself**, `STATUS_TONE_CLASSES` in `statusTone.ts`
  (border, tinted background and text colour together), which is what makes
  a pill easy to draw by hand. Its text-only twin,
  `STATUS_TONE_TEXT_CLASSES`, is what `StatusLabel` colours its icon with.

## Order of work

1. **The component** (`StatusLabel`), its five tones and icons, its two
   sizes, and its tests. `StatusPill` then draws a `StatusLabel`, so all 104
   uses and every part built on it change in one step, with nothing else
   touched — the whole platform changes look at once.
2. **The parts built on it**, renamed from *Pill*/*Badge*/*Chip* to
   *Label* (`IntentPill` → `IntentLabel`, …), each checked on its screen.
   `DecisionPill` stays a button that opens its detail; only its look
   changes.
3. **The pills drawn by hand**, file by file: each one that is a status
   becomes a `StatusLabel`; each that is not is listed as such, with why.
4. **The old name goes**: every `StatusPill` renamed to `StatusLabel`, and
   `StatusPill` and `STATUS_TONE_CLASSES` removed, so there is nothing left
   to build a pill from.
5. **The guards** (below) switched on, with the list of exceptions frozen.
6. **The documentation**: a "Status labels" section in
   `docs/developer/screen-kit.md` (the table above, what to use, what never
   to draw, one example), a line in `AGENTS.md`'s Project Guardrails
   pointing to it, and the canvas drawing linked from both.

Each step is its own commit, checked with the full local check, and looked
at in the real app on the screens it touched before the next begins.

Progress is reported against these six steps: step 1 is the largest single
change on screen, steps 2 and 3 the most files.

## Where to look when checking by eye

Step 1 changes every screen at once, so it is checked on the screens with
the most statuses, client and admin: Sites → a search's page (answers and
"From the AI's answers"), Sites → Fan-out queries, Admin → Runs and cost,
Admin → Decisions, Admin → Manage Companies, Subscription Plans, and the
user directory. Each is looked at in the app's dark theme and light theme,
and at phone width, where a label must wrap under its row, not squeeze.

## The guards

In `scripts/check-screen-kit.mjs`, which already stops hand-written tables,
fields and buttons, run by `npm run check:guards` locally and on GitHub:

- **No pill recipe outside the kit.** A class string with rounded ends
  (`rounded-full`) and a tinted status background or border
  (`bg-success/…`, `border-warning/…` and the rest) fails, as does a small
  tinted tag (`bg-{tone}/…` with 10–11px text). Avatars, dots and the like
  that legitimately combine them are listed by file in
  `scripts/screen-kit-allowlist.json`, which may shrink, never grow — the
  same rule as the existing lists there.
- **No new pill part.** A component named `…Pill`, `…Badge` or `…Chip`
  fails unless it is on the frozen list; a new status part is named
  `…Label` and draws `StatusLabel`.
- **No icon of a screen's own.** Passing `icon` to `StatusLabel` from a
  screen fails; a new icon is added to the kit's named list instead.
- **`StatusPill` stays gone**: importing it fails once step 4 is done.

A guard's failure message says what to use instead, in one sentence, so the
next person — or agent — does not have to find this plan to fix it.

## Not in this plan

- **The public website** (`/`), which keeps its own look and palette, as the
  theme rules already allow. Its pills, if any, are Anthony's call
  separately.
- **The frozen movement demo** and the Arcade games, which the guards
  already leave alone.
- **Buttons and filter chips.** A button that looks like a pill is a
  button's question (the kit's `Button`), not a status's; they are listed in
  step 3 and left for their own look.
- **Changing what any status says.** Only how it is drawn changes.

## Tests

- `StatusLabel`: each tone draws its icon in its colour and its words
  plain; the icon is hidden from screen readers; the two sizes.
- Every part renamed in step 2 keeps its existing tests, with the look
  checked.
- The guards: a pill recipe, a new `…Pill` part and a screen's own icon
  each fail, and an allowlisted file passes (`check-screen-kit.test.mjs`).
- The theme ratchet (`src/theme-drift.test.ts`) and the screen-kit counts
  can only fall; each step lowers them where it removed hardcoded pieces.

## Change log

- **2026-09-29 — step 1 built.** `StatusLabel`
  (`src/ui/components/screens/StatusLabel.tsx`) draws the five tone icons and
  two sizes; `StatusPill` now draws exactly a `StatusLabel`, so its 104 uses
  changed look together. The named icons started with two, both already in
  use on screens: `working` (a turning circle, for work under way — Knowledge
  sources and the purge history) and `approval` (a person with a tick, for a
  job waiting on someone — an agent's jobs list). Four screens that restyled
  the pill (capitals, monospace, padding, their own icons) had those removed;
  the jobs list's fixed status column widened from 86px to 112px so "Handed
  over" fits beside its icon. Words are the page's text at 85%. Checked in the
  app on the Sites list, Fan-out queries, a search's page with its answers, an
  agent's jobs and Manage Companies; not yet in the light theme or at phone
  width. Full local check: 652 files, 5,637 tests passed.
- **2026-09-29 — steps 2 to 6 built.** Decided while building, each written
  into `docs/developer/screen-kit.md` ("Status Labels"):
  - **A kind is not a status.** `TagLabel` (plain words in the quiet colour,
    no icon) joined the kit for a category, a count, a model's or plan's name,
    "Wiki staff" — the pills that never said a state.
  - **Named icons grew to six**, each a meaning the tone does not carry:
    `working`, `approval`, `waiting` (an invitation not yet accepted),
    `admin` and `member` (a person's role), `pinned` (facts pinned to a wiki
    page). `StatusLabel` also takes `wrap`, for a sentence or a long
    identifier, and `FeedbackLabel` (after a save or send) is built on it.
  - **Renamed:** `IntentPill`, `PageTypePill`, `LinkStatusPill`,
    `DecisionPill`, `RunStatusPill`, `FeedbackPill` and
    `MemoryApplyModeBadge` became `…Label`; the four copies of the role pill
    (the directory, Team, a company's users, super admins) became one
    `DirectoryUserRoleLabel` and `DirectoryInviteRoleLabel`, with the role in
    words ("Administrator") rather than the stored `ADMIN`.
  - **Removed:** `StatusPill` and `STATUS_TONE_CLASSES`, so nothing is left
    to build a pill from; the theme ratchet's last colour-helper exception
    went with them.
  - **Hand-drawn pills:** about 90 in some 50 files became labels. What
    still matches the recipe and is not a label is frozen, 24 in 19 files:
    code and ID snippets, numbered step circles, removable phrase chips, the
    workflow canvas's field names, a schema builder's type select, and the
    side menu's amber count. `AssistantStagePill` and `PhotoActionChip` keep
    their names, being no pill.
  - **Guards:** two rules in `scripts/check-screen-kit.mjs` — a pill drawn in
    a class string, counted per file; a part named `…Pill`, `…Badge` or
    `…Chip` — with their tests. Hardcoded colours fell by 89 (772 → 683) and
    the ratchet was lowered to match.
  - **Red/green:** Anthony is red/green colour blind. The connections page
    and login lists had been blue/amber for that; they now use the tones'
    own icons, whose shapes and words carry the meaning.
  - **Outside this plan, noticed:** Super Admins' role column is headed
    "Joined date".

  Full local check: 652 files, 5,642 tests — one failure on a comment naming
  the owner's domain, fixed and its test re-run. Checked in the app on the
  agents list, an agent's jobs, Connections, Super Admins and Manage
  Companies; not yet in the light theme or at phone width.
