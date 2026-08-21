# Closing the Loop — the Wiki Learns From What People Ask

Status: **Delivered 2026-08-17**, all four phases, plus Anthony's
mid-build ruling honoured: the loop runs at both levels where that is
honest — usage marks and the This Week strip serve the platform shelf
too — while the couldn't-answer list and the exam stay company-level,
because questions are company data (his wall) and the platform shelf
has no exam yet (the recorded bound). The Examiner joined the staff as
its eighth member, per the standing rule that an auto-running AI worker
is a real agent on the Agents screen.
Owner: Anthony

Anthony, after the one-brain fold: *"how can we make it stronger?"* The
brain is built; what's missing is the feedback loop that feeds it. The
wiki learns from what it's given — this plan makes it learn from what
people ASK: every unanswerable question becomes a to-do, every answer
marks the pages it stood on, the system reports its own week, and the
exam grows from real questions. Ask → answer → measure → feed →
re-examine, all visible.

## What is actually true today (verified 2026-08-17)

- Every typed answer already records the wiki pages it stood on
  (`buildCompanyRuntimeEvidence` with `wikiPageKeys`, `convex/ai.ts`) —
  recorded, never counted.
- The moment of "the wiki offered nothing" is already explicit in both
  paths: empty `pageKeys` from the chooser (typed), and the voice path's
  deliberate "nothing found is reported as nothing found" — detected,
  then thrown away.
- The Wiki screen already carries an open-questions panel (used by the
  Contradiction Finder, Freshness Checker, and chat corrections) and the
  notification machinery already rings bells (`notifyUserInternal`).
- Exam questions live as `companyEvalCases` with ACTIVE/ARCHIVED states
  and run as standing AI Checks; nothing proposes new ones. Anthony's
  corrections to the original twenty are still pending — that stands
  apart from this plan and ahead of it in value.
- `companyMemories` had a usage-counting precedent
  (`recordRuntimeUsageInternal`); the wiki has none.

## The phases

### Phase 1 — the "I couldn't answer that" list (≈1 day)

When a company-scoped question ends with the wiki contributing no pages
— typed, widget, or voice — the question is logged: normalised,
deduplicated, counted when it repeats, and shown in its own panel on
the Wiki screen, newest and most-asked first. Junk is kept out
mechanically (greetings, one-word messages, thread-scoped chats);
nothing is model-judged and nothing is spent. Each row offers the same
two exits a person already knows: import something that covers it, or
dismiss it as not worth covering. Rows auto-resolve when a later
identical question gets answered with pages — the gap closed, the row
closes itself.

Acceptance: an unanswerable question appears once with a count that
grows on repeats; a greeting never appears; importing a covering
document and re-asking closes the row; dismiss works and is audited.

### Phase 2 — usage marks on pages (≈0.5 day)

Every answer's `wikiPageKeys` increment a per-page tally — total uses
and last-used — denormalised onto the page the way receipts already
are, never a scan at read time. The pages list gains a Used column
(sortable), page detail shows "stood under N answers, last on D", and
the map can size... no — the map stays as it is; the list and detail
carry the numbers. Zero-use pages older than a month get a quiet badge
so the dead weight is visible without accusation.

Acceptance: asking a question that opens a page moves its tally and
date; the list sorts by use; a never-used old page shows its badge;
answering costs no extra reads.

### Phase 3 — the weekly brain report (≈1 day)

One plain-English digest per company per week, assembled mechanically
from what is already recorded — no model call: pages learned and
improved (audit trail), questions answered and unanswered (phases 1–2),
what the staff of seven did on their rounds (their run history), and
what waits on a human (reviews, open questions, exam drafts). Delivered
as a notification to company admins linking to a report section on the
Wiki screen showing the same numbers. A quiet week says so in one line;
an empty company sends nothing.

Acceptance: a seeded week of activity produces one digest whose every
number matches its source table; a company with nothing to say sends
nothing; the bell rings once, not per item.

### Phase 4 — the exam grows itself (≈1 day, after 1–3)

Monthly, per company: the most-asked real questions (phase 1's list and
the answered log) that no exam question covers become DRAFT exam cases
— written by the model, clearly marked, running nothing and gating
nothing until a person approves each on the Evals screen (a PROPOSED
state beside the existing ACTIVE/ARCHIVED, same review-first shape as
memory suggestions had). Approved drafts join the standing AI Checks;
rejected ones remember their fingerprint and are not re-proposed.

Acceptance: a month of real questions yields drafts a person can
approve or reject; an approved draft runs in the next AI Checks; a
rejected one never returns; the gate maths (blocker rule) is untouched.

## Honest bounds

- Phase 1's junk filter is mechanical and will occasionally log a
  malformed-but-real question or skip a terse one; the dismiss button
  and the repeat counter are the correctives, not a model judge.
- Usage tallies count answers, not answer QUALITY — a much-used page
  can still be wrong. Quality stays the exam's job.
- The weekly report is mechanical prose around real numbers; it will
  read plain rather than polished. That is a feature until it isn't.
- Phase 4 spends model money monthly and per company; bounded to a
  handful of drafts per run, and OFF for companies with no unanswered
  history.

## Order and size

1 and 2 share plumbing and land together; 3 reads what they record; 4
reads all three. **≈3.5 build-days.** Each phase lands separately,
each stoppable, nothing gated on Anthony except the standing item that
outranks all of this: his corrections to the original twenty exam
questions.
