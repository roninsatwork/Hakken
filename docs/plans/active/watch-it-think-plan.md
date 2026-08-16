# Watch It Think — Receipts, the Ask Box, Clean Captures, the Diary

Status: **Planned 2026-08-17**, building immediately on Anthony's "make
a plan and build these, all of them". Scoped by a code check first
(his standing rule): two of the four finish machinery that already
half-exists; two are new.
Owner: Anthony

## What the code check found (verified 2026-08-17)

- An answer-evidence panel already exists ("show the workings",
  `AnswerEvidence.tsx` + `convex/messageEvidence.ts`) showing documents,
  skills and memories — but it never learned about the wiki: the pages
  an answer stood on are recorded on every message
  (`companyRuntimeEvidenceJson.wikiPageKeys`) and never shown. Since the
  wiki became the brain, the panel shows almost nothing.
- A re-scrape flow exists (`forceRefresh` on `queueWebsiteUrls`), but a
  refreshed document never reaches the wiki: the Distiller's read-once
  claim blocks it, so a messy capture stays messy for ever.
- Nothing lets a person ask the brain a question and see which pages
  the chooser picks; the old chunk retrieval test died with the fold.
- The audit screen is the raw platform ledger; there is no browsable
  per-company "what the brain learned" feed.

## The phases

### Phase 1 — the evidence panel learns the wiki (≈0.5 day)

`getForMessage` resolves `wikiPageKeys` to living page titles (company
and platform pages both, the platform's marked); the panel shows them
as a Wiki pages section — names, not links, because the asker's surface
has no wiki screens. A page deleted since the answer is skipped, as
documents already are.

Acceptance: an answer that stood on pages shows their names in its
workings; the empty panel returns only for answers that truly used
nothing.

### Phase 2 — refresh from source reaches the wiki (≈0.5 day)

A re-ingested document that the wiki has already read refreshes its
SOURCE page: new text filed as a revision through the existing
mechanical door (no model), links re-synced. And on every SOURCE page
with a web original, a Re-read the original button: re-scrapes that one
page through the existing refresh road, then the above lands the clean
text. Both heights, audited.

Acceptance: pressing the button on a messy capture yields a clean
source page with the old text in History; a refresh of an undistilled
document behaves exactly as today.

### Phase 3 — ask the brain, from inside the wiki (≈1 day)

An Ask box on the wiki's list screen at both heights: type a question,
get the real answer the brain would give, with the pages it stood on as
clickable chips. Runs the actual answering pipeline through an
eval-purpose thread (the same road the checks use), so what you see is
what a customer would get. User-initiated model spend, plainly labelled.

Acceptance: a question answered from pages shows the answer and its
chips; a question the brain cannot answer says so honestly; the ask
lands in the loop's bookkeeping like any answer.

### Phase 4 — the brain's diary (≈1 day)

A Diary screen at both heights: the brain's learning as a browsable
feed, newest first — page created, page improved, pin added, gap
closed, review decided — each entry in plain words with who or what
taught it, built purely from audit rows that already exist. Company
menu beside the Wiki; platform through the Instructions menu.

Acceptance: a day of activity reads as a sensible feed; every entry's
page or source opens; an empty day says so; no new writes anywhere.

## Order and size

1 and 2 first (they finish what exists), then 3, then 4. **≈3
build-days.** Each lands separately.
