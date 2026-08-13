# What Sonae Learns, Keeps, Shows And Watches

Status: Delivered 2026-08-13. All four phases shipped; Phase 2 shipped with
auto-approval rather than a review queue, at Anthony's direction.
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## The decision

Four features, chosen together because each one turns something the platform
already records into something a person gets to use.

1. **Corrections.** A thumbs-down says an answer was wrong and never says what
   right would have been.
2. **Saved answers.** A good answer cannot be kept, so the same question gets
   asked again next month.
3. **Why it said that.** Which documents, memories and skills reached the
   model is recorded on every reply and shown nowhere.
4. **Scheduled questions.** The scheduler can run an agent but cannot ask a
   question every Monday and say whether the answer moved.

Anthony's call, 2026-08-12, in preference to payments and connectors.

## What is actually true today (verified 2026-08-12)

**Feedback collects a verdict and a shrug.** `messageFeedback`
(`convex/schema.ts`) holds `rating`, `labels` from a fixed four
(`GREAT_ANSWER`, `INCORRECT`, `MISSED_CONTEXT`, `UNHELPFUL`), and — already —
an optional `comment`. The column exists. Nothing writes it: the UI
(`MessageFeedbackControls.tsx`) offers the three negative labels and no way to
type. There is also a per-writer daily cap that flips a row out of the
learning signal without punishing the person, and any new path must respect it.

**The memory candidate queue is built and has a front door.**
`companyMemoryCandidates` carries `sourceType` including `CHAT`,
`sourceIdsJson`, `confidence`, `status`, and a `rejectedFingerprint` so a
rejected idea cannot be re-proposed forever. `companyMemories.createCandidate`
(`convex/companyMemories.ts:700`) is that door — but it is an `adminMutation`,
so an ordinary person correcting an answer cannot reach it. That is the gap,
not the queue.

**A reply already records its own evidence.** `messages` carries
`companyMemoryEvidenceJson` (`convex/schema.ts:1902`) and
`companyRuntimeEvidenceJson` (`:1907`, `{version, skillIds, sourceIds}`),
written by `generateSonaeResponse` from what retrieval actually admitted
rather than what was merely available. No screen reads either.

**Knowledge can already take a document from a conversation.**
`knowledge.saveChatDocument` (`convex/knowledge.ts:905`) exists for uploads
into a thread. Saving an *answer* is the same shape with a different source,
and the company scope is the one that makes it findable by the team.

**The scheduler runs things, and only things.** `schedules`
(`convex/schema.ts:2294`) points at a `workflowId` or an `agentId` with
`intervalStr`, `nextRunAt` and `lastRunTs`. There is no notion of a question,
an expected answer, or a comparison between runs.

### Confirmed absent (searched, zero matches)

- No UI anywhere writes `messageFeedback.comment`.
- No screen reads either evidence field.
- No "save this answer" on any surface.
- No stored question, answer history, or change detection.

## Design commitments (binding on every phase)

1. **A correction is a suggestion, not an edit.** It never rewrites the reply
   that was given and never becomes a memory on its own. It joins the
   existing candidate queue and waits for a person — unless autonomous memory
   is on, which is the existing switch's business, not this plan's.
2. **The daily feedback cap still applies.** A correction is feedback; a
   person who trips the cap still gets their row, and the learning consumers
   still skip it.
3. **Nothing here invents evidence.** The "why" panel shows what the reply
   recorded. Where a reply has no evidence — an older message, or an answer
   with no retrieval — it says so plainly rather than showing an empty frame
   that implies nothing was used.
4. **A saved answer is knowledge, with its origin attached.** It goes through
   the existing knowledge path so retrieval picks it up for free, and it
   records the conversation it came from, because an answer with no
   provenance is a rumour.
5. **A scheduled question costs money every time it runs.** It is off by
   default, its interval is explicit, and it never fans out.
6. **A changed answer is reported, not judged.** The platform says the answer
   moved and shows both; it does not decide whether the change is good.

## Phase 1 — Corrections

**Goal:** thumbs-down can carry what the right answer was, and that lands in
the queue somebody already reviews.

- `MessageFeedbackControls.tsx`: after a negative rating, an optional "what
  should it have said?" field. Skipping it leaves today's behaviour exactly.
- `messageFeedback.upsertForMessage` accepts and stores the `comment` the
  column already has.
- A correction with text raises a `companyMemoryCandidates` row,
  `sourceType: "CHAT"`, `sourceIdsJson` naming the message and thread,
  `confidence` low because one person's opinion is a lead not a fact.
- The admin-only door stays admin-only; corrections come through a new
  internal path so an ordinary user never gains write access to memory.

**Tests (write first):** a correction stores its text; it creates exactly one
candidate; a correction from a capped writer is stored but creates none; a
rejected-fingerprint match does not reappear; an empty correction changes
nothing.

## Phase 2 — Saved answers

**Goal:** a good answer can be kept where the team will find it.

- "Save this" on a finished assistant reply, next to the rating.
- Creates a company-scoped knowledge document titled by the question,
  containing the answer, recording the thread and message it came from.
- Appears in the workspace's knowledge list, and is picked up by retrieval
  with no extra work because it is an ordinary document.
- Saving twice is a no-op rather than two copies.

**Tests (write first):** saving creates one company-scoped document; it
records its origin; saving the same reply twice does not duplicate; a saved
answer is retrievable in that company and invisible to another.

## Phase 3 — Why it said that

**Goal:** the evidence a reply already carries becomes visible.

- A quiet control on an assistant reply opening a panel listing the documents
  retrieval admitted, the memories applied, and the skills in force.
- Reads `companyRuntimeEvidenceJson` and `companyMemoryEvidenceJson`; resolves
  ids to names through existing queries.
- A reply with no evidence says "nothing was retrieved for this answer",
  which is a true and useful thing to know.
- Not a modal: `SonaeModal` is now accessible, but this is reference material
  beside an answer, not a decision to make.

**Tests (write first):** a reply with evidence lists it; a reply with none
says so; ids that no longer resolve are skipped rather than rendered blank;
another tenant's document never appears.

## Phase 4 — Scheduled questions

**Goal:** Sonae can watch something and tell you when it changes.

- A new `scheduledQuestions` table: the question, the model, the interval, the
  last answer, the last run, whether it is active, and who owns it.
- Runs through the existing assistant path on the existing scheduler.
- Compares the new answer with the last one. On a material change, raises a
  **notification** and — where the owner wants it — a **task**, both of which
  now exist.
- A screen listing each question, its latest answer, and when it last moved.

**Tests (write first):** a question stores its answer on first run; an
unchanged answer notifies nobody; a changed answer notifies once and records
both; an inactive question never runs; a question belongs to its tenant.

## What this plan deliberately does not do

- **No editing of a reply.** A correction proposes; it never rewrites history.
- **No automatic memory writing.** That switch exists and is not touched here.
- **No diffing prose word by word.** Phase 4 reports that the answer changed
  and shows both; a semantic diff is a separate problem.
- **No scheduled questions for widgets or anonymous visitors.**
- **No new evidence capture.** Phase 3 shows what is already recorded; if
  something is missing from the record, that is a runtime change and belongs
  elsewhere.

## Sequencing and dependencies

```
Phase 1 (corrections) ─┐
Phase 2 (saved answers)─┼─ independent, any order
Phase 3 (why panel)   ─┘
Phase 4 (scheduled questions) ── wants tasks + notifications, which now exist
```

## Work queue

- [x] **1** Correction field, stored comment, candidate creation, five tests
- [x] **2** Save this answer, company knowledge document, four tests — shipped
      auto-approving, with super-admin removal, instead of a review queue
- [x] **3** Evidence panel over recorded evidence, four tests
- [x] **4** `scheduledQuestions`, runner, change detection, screen, five tests

Delivered in `604ed6be7` (1–3) and `07279e645` (2's auto-approve flip, and 4).
Phase 4 was watched end to end against the running app: switched on, picked up
by the minute cron, answered, recorded silently as the baseline, then a changed
answer raised exactly one notification.

## Reading list before touching this area

- `docs/plans/active/self-improvement-plan.md` — owns the learning loops and
  the autonomous-memory decision; Phase 1 feeds its queue and changes none of
  its rules.
- `docs/plans/active/tasks-and-notifications-plan.md` — what Phase 4 raises.
- `convex/companyMemories.ts:700` — the existing candidate door.
- `convex/knowledge.ts:905` — how a document enters from a conversation.
