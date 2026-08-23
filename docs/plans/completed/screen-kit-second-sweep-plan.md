# Nothing The Kit Owns Is Drawn Twice

> **COMPLETE — 2026-08-23.** Every phase is closed. The copies are gone, the
> nine leaderboard rows are one shared part, three panel lists moved onto
> `CompactList`, and two new rules are live — `shadows` with an empty frozen list
> and `dividers` with six. Phase 4 was decided rather than built: Anthony looked
> at the tool shelf and kept it. Two things are recorded here and deliberately
> not done: the wiki's revision history, which is a stack of cards rather than a
> list, and the six frozen `dividers` entries, which shrink as anyone works in
> them.

**Agreed 2026-08-23.** The screen kit plan closed on 2026-08-18 having answered
one question: does a screen draw a part the kit already owns? Every rule in
`scripts/check-screen-kit.mjs` asks a version of that, and the answer across the
app is now almost always no.

This plan is about the question that was never asked: **does a screen draw a part
the kit does not own yet, that another screen has already drawn?** A copy between
two screens passes every existing rule, because neither screen copied the kit —
they copied each other.

It changes no screen's design and adds no product feature.

---

## Where this came from

On 2026-08-23 three system settings screens were moved onto the standard table
after Anthony opened them: *"there are new tables in the system settings that
look hand drawn and need to be standardised."* Fixing them added a `switches`
rule, and the obvious next question was his: *"do we have any other tables or
table-like data in the admin section that are not standardised into our
component set?"*

All 201 admin screens were read. Fifty use `DataTable`, one uses `CompactList`,
and eight draw a list of records themselves. What the reading found was not
mostly screens ignoring the kit — it was screens copying each other, and the
copies had already begun to disagree.

---

## What is actually wrong

### 1. The same leaderboard row, nine times

One row skeleton — a name and a sub-line on the left, figures on the right,
inside a `px-6 py-4` divided run — is written out nine times across three
screens:

| Screen | Copies |
|---|---|
| AI Running Costs (`admin/ai/costs`) | 3 — top companies, top people, top agents |
| A company's AI Usage (`admin/companies/[id]/ai/usage`) | 3 — providers, top people, top agents |
| The client Settings screen (`app/settings`) | 3 — providers, top people, top agents |

Seven of the nine are ranked leaderboards and carry a rank number and an avatar;
the two provider lists use the same row without them. That is one part with an
optional rank, not two parts.

They have already drifted, which is the argument for the whole plan:

- **The dividing line disagrees.** The AI Costs three draw it with a hard-coded
  `border-[#0000000d] dark:border-[#ffffff0d]`; the other six use
  `border-border-dim/50`. One set ignores the theme tokens entirely.
- **The empty state disagrees.** AI Costs has a `LeaderboardEmptyState`
  component; the other two screens each hand-write a different sentence.
- **The avatar disagrees.** AI Costs has a `LeaderboardAvatar`; the usage
  screens inline `next/image` with their own sizing.
- **Two of the nine have the class words in a different order**
  (`items-center justify-between` against `justify-between items-center`) — the
  two provider lists, on the two screens that have one. That is the fingerprint
  of a copy rather than a shared part: a shared part cannot disagree with itself
  about word order.
- **None of them has a count or a footer.** A leaderboard of six and a
  leaderboard of sixty read identically until you count the rows yourself.
- **The column names repeat on every row.** "MESSAGES" and "COST" are printed
  once per row instead of once at the top, because there is no header row to put
  them in.

The kit already has the right part for this. `CompactList`
(`src/ui/components/screens/CompactList.tsx`) exists for exactly this shape — a
run of rows inside a panel that has already introduced itself — and was written
on 2026-08-17 for four such places. It has three users.

### 2. Three screens define a component the kit already exports

| Name | Where | What it is |
|---|---|---|
| `SettingSwitch` | `admin/settings/api-keys/page.tsx` | A pasted copy of the kit's |
| `SettingSwitch` | `admin/ai/tools/connectors/[id]/page.tsx` | A pasted copy of the kit's |
| `StatusPill` | `admin/agents/[id]/observability/page.tsx` | A different component wearing the kit's name |

The two `SettingSwitch` copies are the kit's own
(`src/ui/components/screens/SettingsCard.tsx`) character for character, except
that one uses `py-3` where the kit and the other copy use `py-4`. Three
identical switches, already one row-height apart.

`StatusPill` is a different fault with the same cause. The kit's takes a `tone`;
the local one takes a run `status` and works the tone out. It is not a copy — but
anyone reading that file sees `StatusPill` and gets something other than the
`StatusPill` every other screen means.

### 3. Twelve files draw their own divided list

`last:border-0` or `last:border-b-0` on a mapped row is the signature of a list
drawn by hand: the kit's list parts own their own dividers, so a screen only
writes that when it is drawing the list itself. Twelve files carry it, eight of
them in admin. Four are plainly rows of records inside a panel:

| Screen | The list |
|---|---|
| A script's detail page | Recent runs — status, when, summary, who |
| An audit trail entry | What changed — field, before, after |
| A wiki page | Backlinks |
| A wiki page | Revision history |

Every one of them is `CompactList`'s job.

### 4. The tool shelf is a table wearing cards

On `admin/ai/tools`, each ability shows a name, a description, an effect level
and a required role, with actions on the right — four columns and a row of
buttons, drawn as a bordered card. It has its own search, its own loading state
and its own empty state, and no footer or count.

**This one is a decision, not a fault.** The shelf layout was Anthony's own
direction call on 2026-08-16, and the shelf itself is not in question. Only the
right-hand list is, and it stays as it is until he says otherwise. See the open
decision at the bottom.

### 5. The switches rule gives half the advice

The `switches` rule added on 2026-08-23 points a developer at `DataTable` with
`Checkbox` in the last column. That is right for a list of records and wrong for
a settings form, where the answer is the kit's `SettingSwitch`. The rule itself
does not misfire — `SettingSwitch` draws its own spans and trips nothing — but
its `fix` text names only one of the two correct answers.

---

## The work

### Phase 1 — Delete the copies, then stop the next one

**Done, 2026-08-23.** Half a day, as estimated. The `shadows` frozen list is empty,
so the next entry is a deliberate act. Both files that lost their last raw button
came off the buttons count in the same change (297 → 295 across 120 files).

1. `admin/settings/api-keys` and the connector detail screen drop their local
   `SettingSwitch` and import the kit's. The kit's accepts `children`, which
   neither copy does, so nothing is lost.
2. The observability screen's `StatusPill` either renames to say what it is
   (`RunStatusPill`) or is rebuilt as a thin wrapper that maps a run status to a
   tone and renders the kit's pill. Prefer the wrapper: the tone-per-status
   decision is real and worth keeping in one place.
3. **New rule — `shadows`.** A file under `src/app/(dashboard)` may not declare a
   component under a name `src/ui/components/screens/*` or `src/ui/atoms/*`
   already exports. Three offenders today, all three fixed by this phase, so the
   frozen list starts empty and any future entry is a deliberate act.

This phase is first because it is the cheapest, and because the rule it adds
closes the whole class rather than these three instances. A rule with an empty
frozen list is the strongest kind the repo has.

### Phase 2 — One leaderboard, not nine

**Done, 2026-08-23.** `Leaderboard` (src/ui/components/screens/Leaderboard.tsx)
with its own test. One correction to the plan as written: the name column's
heading cannot be the panel's title, which is what the first pass did — the
column then repeated the heading directly above it, the same fault this plan
records against the old developer options card. Each list names its own column
instead (Company, Person, Agent, Provider).

1. Build `Leaderboard` on top of `CompactList`, owning the name-and-sub-line and
   the trailing stat columns, with the rank number and avatar optional so the two
   provider lists use the same part rather than a second one. Column headings go
   at the top once, where `CompactList` already puts them, instead of on every
   row.
2. Move all nine to it. The theme-ignoring hard-coded divider goes with them.
3. One empty state, said once.
4. Give each list its row count, since `CompactList` reports one.

`LeaderboardAvatar`, `LeaderboardStats` and `LeaderboardEmptyState` fold into the
new part and stop being AI-Costs-only.

The client Settings screen (`app/settings`) is included even though it is outside
admin: it holds three of the nine, and leaving it out would mean the ninth copy
survives to be copied again. It cannot be checked by eye on a super-admin
account — the screen renders "no organization linked" — so it is verified by
test rather than by looking.

### Phase 3 — The panel lists move onto the compact list

**Done, 2026-08-23**, with one item deliberately left alone — see below.

Three of the four moved: a script's run history, an audit entry's changes, and a
wiki page's backlinks. Each is a `CompactList` with its columns named once at the
top. The count in this plan moved as the work went: twelve files carried the
hand-drawn divider when it was written, Phase 2 took three of them (the
leaderboards), Phase 3 took three more, and **six are frozen**.

**The wiki's revision history stays as it is.** Read closely, it is not a divided
list at all: it is a stack of bordered cards, each holding a multi-line body
rendered with `whitespace-pre-wrap`. It carries no `last:border-0`, so the new
rule does not flag it, and putting a log of pre-formatted text into a table would
be forcing it — the same mistake as the switch cards, in reverse. Flagged here
rather than quietly dropped: if Anthony wants it changed, it is a separate call.

1. The four lists in the table above move onto `CompactList`.
2. **New rule — `dividers`.** A mapped row that draws its own last-row divider is
   a list the kit should be owning. Twelve files today; the four this phase fixes
   come off the list, and the remaining eight freeze where they stand. As
   everywhere, the list may shrink and never grow.

Phase 2 must land before this rule, or the nine leaderboard rows fail it on the
day it is written.

### Phase 4 — The tool shelf

**Decided, not built — 2026-08-23.** Anthony looked at it and kept it: *"the tool
shelf is ok I think."* The abilities on the right stay as cards. No rule flags
them, and the shelf remains his 2026-08-16 direction call. If it is ever
revisited, the question is only about the right-hand list, never the shelf.

### Phase 5 — The paragraph

**Done, 2026-08-23.** Ten minutes. The `switches` rule's `fix` text gains a sentence naming
`SettingSwitch` as the answer for a settings form, and `DataTable` with
`Checkbox` as the answer for a list of records. The developer-facing
`docs/developer/screen-kit.md` gains the same distinction.

---

## What this plan does not do

- **It does not touch the frozen decisions.** Six admin tables sit inside a page
  whose heading lives on the parent (rules, an agent's page, agent runs, audit
  logs, purge history, retention rules). Those are recorded decisions with
  reasons written down. So are the retention pop-up's switch and the three
  schedule screens' switches.
- **It does not redesign anything.** Every screen here should look like a tidier
  version of itself, not a different screen.
- **It does not widen `CompactList`'s remit.** If a list needs something the part
  does not have, that is a conversation, not a prop added in passing.

---

## How it gets checked

Every phase ends with `npm run check` green: the seven guards, lint, types and
the full test suite. Phases 1 and 3 each add a rule, so each also adds probes to
`scripts/check-screen-kit.test.mjs` — one that catches the fault, one that leaves
the correct fix alone, and one that reports a stale freeze.

Phase 2 is the one that cannot be proved by a guard, because "these nine rows are
now one row" is not something a rule can see. It is proved by the screens being
opened in Anthony's own browser at 1280px and read side by side.

---

## Done alongside, but not part of this plan

**The provider breakdown counted only today.** Found on 2026-08-23 while checking
Phase 2's work: a company's AI Usage screen showed a full thirty-day timeline
above an empty Provider Usage panel, and Anthony read it as a fault in the panel
we had just rebuilt — *"I think we broke this, it's empty when there should be
data."* It was not the panel. Both analytics queries read today's messages live
and take every older day from `analyticsDailySnapshots`; that merge fed
`modelDistribution` and silently skipped `providerDistribution`, so the provider
breakdown had never covered anything but today.

Fixed by deriving the provider from the model rather than storing it beside them,
in one shared helper (`mergeSnapshotModelMetrics`, convex/analyticsService.ts)
that both queries now call — so the two cannot skip different things again, which
is the same lesson as the rest of this plan. **No schema change and no backfill:**
every snapshot already written gains its provider breakdown the moment it ships.
A model that has since left the catalogue falls to "unknown" rather than being
dropped, so a retired model reads as unattributed spend instead of quietly
understating the period.

Pushed to Convex dev on 2026-08-23 with Anthony's go-ahead. The panel now reads
Google Vertex AI 38 calls / $0.0775 and OpenAI 14 calls / $0.0528.

---

## Decisions made

**The tool shelf's right-hand list stays as cards** (Anthony, 2026-08-23). The
shelf on the left was never in question.

**The wiki's revision history stays as a stack of cards** — see Phase 3. It is
not a divided list and no rule flags it; putting a log of pre-formatted text into
a table would be forcing it. Reopen only if someone asks for it directly.
