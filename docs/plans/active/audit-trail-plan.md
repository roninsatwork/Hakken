# Audit Trail Plan

Written 2026-08-06, after Anthony looked at the finished audit trail screen and
found most of the rows saying nothing: *"we have a lot of blanks in the audit
trail report."*

## Status

All five phases delivered 2026-08-06, with one part of Phase 5 found to be
impossible in this database. That is written up under Phase 5 rather than
quietly dropped.

**Correction to Phase 3 as written.** The claim that the governance screens
record nothing was wrong. They are read-only views over data owned elsewhere:
the register edits agents, the policies screen sends people to AI instructions,
and approvals were already writing an entry per decision. All of that was
audited, with before-and-after values, before this plan existed. The real gap
in Phase 3 was agent activity alone, and that is what was built.

**Found while building Phase 3, fixed in Phase 4.** Agent changes carried no
workspace on the entry, so a workspace administrator reading the trail never
saw them — the scoping added when the trail was opened to oversight roles
filtered them out. Agent edits and risk changes now carry the workspace.

**Changed from the plan in Phase 4.** The plan called for one schema addition,
a field for where a request came from. It was not added. Only the sign-in paths
know the address a request came from, so the column would have been empty on
almost every row, and an empty column is worse than none — where it is known it
already reads inside the entry itself ("Signed in — IP address: …, Where from:
London"). The two columns that were added are the ones with something in them.

The estimates below are left exactly as written rather than corrected after the
fact — a plan whose figures are edited to match what happened teaches nobody
anything next time. Both delivered phases came in around their estimate.

Two things found while building that were not in the plan:

- **There are two purge systems, not one.** A monthly retention job in the audit
  trail's own settings, and a separate clear-out with pipelines, one of which
  also deletes audit records. Both were deleting silently; both now record it.
- **The audit-log clear-out had to change how it walks the table.** It repeatedly
  took the oldest rows, which works only while every row found is deletable. The
  moment some are exempt — which is the whole point of the summary record — the
  same exempt rows come back every batch and the run never ends.

## What this is

The plan to make the audit trail answer the question it exists to answer —
**what happened on this platform, who did it, and when** — rather than the
narrower question it currently answers, which is *what fields changed on a
record*.

The trail was rebuilt on 2026-08-06 as part of the governance work: real paging,
a detail screen, before-and-after values on agent changes. That work was right
and stays. This plan covers what it exposed.

Owns `convex/auditLogService.ts`, `convex/auditLogs.ts`, the audit trail list and
detail screens, and the rule every part of the platform follows when it writes
to the trail. Read it before adding an audit entry anywhere.

## The finding

There are 135 places in the platform that write to the trail, using 127
different action names. 131 of those 135 record something alongside the action.

The screen understands three shapes of record: a proper before-and-after, a risk
rating move, and the older "these fields were touched". Everything else — which
is most of it — falls through and is labelled **"Nothing recorded about what
changed."**

That sentence is untrue, and it is untrue on an audit surface, which is the
worst place for it. A sign-in entry holds the address and location it came from.
An evidence pack export holds the period and the counts. A maintenance run holds
which script, which run, and what it did. All of it is sitting in the record and
none of it reaches the reader, except folded away at the bottom of the detail
screen as raw text.

**So the blanks are a reading problem, not a recording problem.** With one
exception: settings saves record which settings were touched and never what they
were changed to. That one is a real gap in what is written.

## The rule

Agreed 2026-08-06. Everything in this plan follows from it.

**The trail records what happened. A change of values is one kind of happening,
not the definition of one.**

The column heading "What changed" is what caused the whole problem. It framed
every entry as a diff, so anything that was not a diff had nothing to say. A
sign-in is not a diff. An export is not a diff. A refused attempt is not a diff.
They are all things that happened, and they are the things an auditor asks about
first.

Two rules that follow:

- **Never claim nothing was recorded when something was.** If the entry holds
  anything at all, the screen shows it in words. "Nothing recorded" is reserved
  for entries that genuinely hold nothing, and after Phase 1 there should be
  almost none.
- **Describe from the record, not from a list of action names.** A lookup table
  of 127 action types goes stale the day someone adds the 128th. The describer
  reads whatever the entry holds and renders it; the phrase table is a polish
  layer on top for the twenty actions people actually read, not the mechanism.

## Decisions settled before starting

**Retention deletion gets its own record, and that record is exempt from
deletion.** The purge currently removes old entries and writes nothing to say so.
A trail that can be silently shortened, with no record of the shortening, fails a
review on its own. The purge writes a summary entry — how many, how old, under
which rule — and the purge skips its own summary entries when it runs.

**The application records only server-verified sign-in outcomes.** A browser
cannot prove that a code failed or succeeded, and accepting its email-address
claim created forgeable, unauthenticated audit rows. Convex Auth enforces its own
failed-attempt limit; successful one-time-code verification is recorded by the
server-side auth callback. Provider and platform logs remain the source for
failed-attempt investigation until there is a trusted server hook for it.

**Reads are recorded only where the read is the sensitive act.** Opening a
person's data, downloading a document, exporting the trail, producing an evidence
pack. Not every page view — that is a web log, not an audit trail, and mixing the
two makes both useless.

**No new table.** Everything here fits the existing `auditLogs` shape. The one
schema addition is an optional field for where a request came from.

## The work

| Phase | What it is | Days | State |
|---|---|---|---|
| 1 | Reading what is already recorded | 1–2 | Delivered |
| 2 | The two records that fail a review | 1–2 | Delivered |
| 3 | Governance and agent activity | 3–4 | Delivered |
| 4 | The screen an auditor can actually use | 2–3 | Delivered |
| 5 | Access, refusals, and the rest | 2–3 | Delivered, with one limit |

**The number that matters is 2 to 4 days.** That is Phases 1 and 2, and it is
the point at which the screen stops lying and the two findings that would come
out of a review are closed. Everything after that is widening the net.

Phase 1 is worth doing on its own even if nothing else follows, because it is a
day's work against a screen that currently misrepresents itself on most rows.

---

# Phases

## Phase 1 — Reading what is already recorded

*1–2 days.*

The column becomes **"What happened"**, and the describer gains a fallback: when
an entry is not a before-and-after, render whatever it does hold as a sentence.
Not raw JSON — words. "Signed in from London." "Evidence pack for 1–31 July: 12
systems, 340 runs." "Ran the orphaned-records script: 14 rows repaired."

The mechanism is generic on purpose, so an action nobody has written yet still
reads as something. On top of it sits a small phrase table for the twenty or so
actions that actually get read, turning `UPDATE_AGENT_RISK` into "Risk rating
changed" and so on. The action name stays visible as the machine-readable label;
the sentence is what the reader is given.

Settings saves start recording before-and-after values the way agent changes now
do. This is the only genuine recording gap in the current blanks.

**Done when.** No row on the first three pages of the trail says "Nothing
recorded about what changed" unless the underlying entry genuinely holds nothing.

## Phase 2 — The two records that fail a review

*1–2 days.*

**The purge records itself.** Every retention run writes an entry saying how many
records it removed, how old they were, and under which retention setting. The
purge skips its own summaries so the record of deletion cannot itself be deleted.

**Failed sign-in audit rows were removed.** The original implementation accepted
an arbitrary address from an unauthenticated browser, so the rows were evidence
of what a caller claimed rather than evidence of an authentication failure. The
auth provider still rate-limits wrong codes; only its trusted successful callback
writes `ONE_TIME_CODE_VERIFIED` to the auth trail.

Ending impersonation gets its own action name. Today stopping shows as
"IMPERSONATE_COMPANY — None (Reverted)", which reads as starting.

**Done when.** A retention run appears in the trail, running the purge twice does
not remove the record of the first run, and no browser can forge sign-in outcome
rows.

## Phase 3 — Governance and agent activity

*3–4 days.*

The newest and most compliance-facing screens are the ones with no history at
all. The AI register, approvals, and policies write nothing to the trail. That is
the gap most likely to be noticed by the exact buyer the governance section was
built for.

Register entries, approvals granted and refused, and policy changes all start
writing entries, with before-and-after on the fields that matter — risk rating,
accountable person, status.

Agent activity is the other half. A person changing an agent's purpose is
recorded; the agent then acting is not. Runs, tool calls that required approval,
and anything an agent changed on its own account start appearing. This needs a
judgement call on volume — a busy agent could write thousands of entries a day —
so it records decisions and changes, not every step. Step-level detail already
lives in the agent observability screens and belongs there.

**Done when.** Approving an agent action, changing a register entry, and an agent
changing something itself all leave a trail entry that names what happened.

**Where the volume line was drawn, in the end.** Reads are never recorded. An
agent answering a question by looking something up is the bulk of what agents
do, and a trail carrying all of it is a trail nobody can read. What reaches the
trail is what an agent changed, deleted or sent outside the platform, plus one
entry per run at the point it finishes. Step-level detail stays in the agent
observability screens, which is where it already lived and where it belongs.

Agent entries name no actor, deliberately. An agent is not a person, and putting
the name of whoever started the run against an action they did not take is the
precise thing an accountability record must not do. The run and the agent are
both on the entry, so the person who set it going is one hop away.

## Phase 4 — The screen an auditor can actually use

*2–3 days.*

Three columns are missing and each of them means opening rows one at a time:
**who it was done to**, **which workspace**, and **where from**. The workspace one
matters most — you currently cannot tell which client an action belonged to
without opening it.

The trail gets an export. It is the first thing anyone will ask for and there is
no way to produce one today.

Filtering widens to match: by person, by workspace, by action, over a date range,
and the action list stops being built from whatever happens to be loaded.

This is also where successful sign-ins for ordinary users get switched on, once
the filtering can cope with the volume.

**Done when.** A named person's activity across one workspace over one month can
be filtered to and exported without opening a single row.

## Phase 5 — Access, refusals, and the rest

*2–3 days.*

**Refused attempts.** Someone trying to do something they are not allowed to
leaves nothing behind today. Under GDPR and under any security review, the
attempt is the interesting part.

**Sensitive reads.** Opening a person's data, downloading a knowledge document,
reading the trail itself.

**API keys being used.** Created and revoked are recorded; used is not, which
means a leaked key is invisible until it changes something.

**Done when.** A refused action and a key-authenticated request both appear in
the trail.

## What Phase 5 could not do, and why

**A refused admin action cannot be recorded.** Not "was not" — cannot. Every
guarded mutation on this platform refuses by throwing, and a Convex mutation is
one transaction: anything written before the throw is rolled back with it. An
audit entry written on the way out of a refusal disappears along with the
refusal. This was verified rather than assumed — a write followed by a throw
leaves zero rows behind.

So refusals are recorded everywhere the platform refuses by *returning* a denial
rather than throwing, which is most of the places that matter: API requests,
blocked widget embeds, the assistant's own safety refusals, and
refused agent approvals. The one uncovered case is an ordinary admin mutation
called by somebody without the role for it.

Closing that would mean changing every guarded mutation to return a denial
instead of throwing — a rewrite of how authorisation works across the whole
platform, to catch a case that is already refused correctly and is visible in
the platform's own function logs. It is not worth that, and pretending otherwise
by writing an entry that silently vanishes would be worse than the gap.

**Downloading a document is not a thing here.** The plan listed it as a
sensitive read. Documents are ingested into knowledge and never handed back out
as files, so there is no download to record.

**Viewing the trail is not recorded, on purpose.** A query cannot write either,
but this one does not need to: the decision at the top of this plan is that page
views belong in a web log. Taking a *copy* is the sensitive act, and that is
recorded — which is why the export is a mutation rather than a query.

**Every accepted API call is not recorded, on purpose.** They already live in the
API's own request log, and mirroring routine traffic onto the trail would bury
everything else within a day. What reaches the trail is a key being refused, and
a key being used for the very first time — the moment something issued months
ago starts acting.

---

## What is deliberately not being built

- **Page-view logging.** Every screen someone opened is a web log. Putting it in
  the audit trail buries the entries that matter under the ones that do not.
- **Tamper-proofing — hash chains, signed entries, write-once storage.** Worth
  doing eventually and not now. It is meaningful only once the trail is complete
  enough to be worth protecting, and it is a much larger piece of work than
  anything above.
- **Alerting on provider failures.** Noticing repeated failed sign-ins and telling
  somebody is a monitoring product. It needs a trusted provider-side signal;
  browser-submitted telemetry is not evidence.
- **A second retention rule for security entries.** Keeping trusted provider
  failure signals longer than ordinary changes is a real requirement in some
  sectors, and it is configuration nobody has asked for yet.

## Decision update

- **2026-09-10 — remove client-reported sign-in outcomes.** The browser-facing
  `recordFailed` and `recordVerified` mutations could write arbitrary email
  addresses into security trails. Successful code use now comes from Convex
  Auth's verified callback; failed attempts remain provider-enforced and are not
  copied into the audit trail without a trusted server signal.

## Where the estimates are soft

- **Phase 3 is the one that will move.** Deciding what an agent should and should
  not record is a product judgement, not a build task, and it is the sort of
  thing that reads as one day and takes three. The volume question is genuine —
  get it wrong and the trail is unreadable within a week.
- **Phase 1's phrase table has no natural end.** Twenty actions read well after a
  day; the remaining hundred could absorb another day each if anyone let them.
  The generic fallback is what makes stopping safe — an action without a phrase
  still reads as a sentence, just a plainer one.
