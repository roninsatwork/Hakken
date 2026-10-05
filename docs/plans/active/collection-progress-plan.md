# Collection progress — planned 2026-10-05

A collection sends itself to the end, and the Collection pipeline screen says
what it is doing while it does. No collection waits for a person to press a
button, and a person is only asked to act when only a person can fix it.

**Status: planned, drawn and approved 2026-10-05; all four steps built the
same day, local on dev, and on the dev deployment (the Collector set to $3 a
website and $100 a day there). Not on production: set the same two limits on
the Collector's Settings there when it is deployed — until then its old $15 is
read as a limit per website.** Change a decision here, with a date, before
building anything that disagrees with it.

## What was asked

Anthony, 2026-10-05, after Collect now on two new companies (Conterra Ops and
Period House Group) left one of them half-sent until the next night's run:

- "i think we may need a better UX for here as i dont see what its workign on
  just waitng … pershaps a progress bar would be good or anythign that just
  waiting"
- "we can['t] have it fail like this, thsi is not a SAAS is we have to baby sit
  this each time"
- On restarting a stalled send: "a retry [is] a shit ux"
- On the spend limit: "i want to keep the value small"; "a limit per website is
  good"

## Why it stalled

One Collector run took the whole queue — every company's requests, a hundred
of a kind at a time — and stopped at whichever came first: an empty queue,
**7 minutes** (`SEO_COLLECTOR_RUN_MS`, under a job's 10-minute ceiling), or
**$15 spent by that run** (the Collector agent's `maxCostUsd`, read per run).
Whatever was left waited for the next scheduled run, at 03:00.

On 2026-10-05 the one run sent all of Conterra Ops ($13.00) and the first 48 of
Period House Group ($2.68), reached $15.67, and stopped: "the rest waits for
the next run". A full collection costs $13–18 — site crawls are $1.50 each and
most of it; a website costs about $2 — so any two companies at once passed the
limit. The time limit ends the same way on a bigger queue.

## Decisions

1. **One continuous send** (Anthony, 2026-10-05, option A). The Collector
   works in short steps — a batch at a time, a few minutes a step — and each
   step starts the next the moment it ends, until the queue is empty. One
   Collector run lasts as long as the queue; there are no 7-minute runs, no
   hand-offs and no restarts on screen. Each step also books a check a few
   minutes ahead: if a step is lost (a deploy), the check carries on from where
   it was, silently. The hourly sweep is the last net: requests due 15 minutes
   with no Collector going start one.
2. **AI questions five at a time** (option B). A live endpoint takes one task
   per request; five requests go at once rather than one after another (40
   questions: about a minute rather than four).
3. **A spend limit per website, $3** (Anthony, 2026-10-05: "a limit per
   website is good"). The Collector's limit stops meaning "per run" — a run now
   lasts as long as the queue — and means: what one website's requests in one
   collection may cost. Today a website costs $1.73–$2.14. Before a request is
   sent, what its website has cost in this collection plus this request's price
   must stay within the limit; one that would not is not bought, says why on
   its row, and the rest of the collection carries on. It is set where the $15
   is today — the Collector's own settings, the box relabelled for it. A
   request outside a collection (a fan-out query, a one-off pull) has no
   collection to count against and is not held by it.
4. **It stops only for what a person must fix**, and says what to do: a
   website at its limit, the DataForSEO login refused, or the account out of
   funds. Nothing else waits on anyone.
5. **A daily ceiling for all collecting, $100** (Anthony, 2026-10-05: "yes"),
   the backstop for too many websites at once. Everything the Collector sends in
   a UK day counts; once it is reached nothing more is sent that day, the screen
   says so, and sending carries on by itself after midnight — or at once when
   the ceiling is raised. Set on the Collector's settings beside the limit per
   website. Today's two full collections came to $30.51.

## The screen — approved 2026-10-05

Admin → Websites → Collection pipeline, drawn on the canvas
<https://claude.ai/artifact/JSXWejSsJF4nLAyXM9836U> and saved as
[`assets/collection-progress/Main.dc.html`](../assets/collection-progress/Main.dc.html).
Anthony: "the UI is good through for the screen"; the words were brought into
line with decision 1 the same day (no runs, no hand-offs, "Needs you" only for a
person's fix).

- **Collecting now**, above the existing list: a line saying what is happening
  ("Sending on its own …", or "Needs you: …" with what to do), then one row per
  collection or Search Console download going, with a **Show** filter (In
  progress, Finished today, Everything):
  - **Collection** — the company, how it started, when and by whom;
  - **Progress** — the kit's `Meter`, extended with a lighter second band for
    requests sent and waiting for an answer, and the counts beneath ("77 of 136
    back · 2 out · 57 to send"; weeks for Search Console);
  - **Doing now** — a `StatusLabel` and what it is on ("Sending · corston.com —
    who links to it"; "Waiting for 3 site crawls, out 16 min: …");
  - **Time left** — to send, then the slowest answers still out, and when one
    is given up;
  - **Cost so far** (real cost) and **Credits** (counted at the end).
  - A row opens to its steps, with times: work list written, sending, answers,
    closes (credits counted on Usage, Discovery's figures built), and a link to
    the collection line by line.
- **Every pull** stays below, with plainer state words: Waiting to send,
  Sending, Out — waiting for the answer (and for how long), Back, Failed.

New to the screen kit: the second band on `Meter`.

## Steps and days

| Step | What | Days |
|---|---|---|
| 1 | Continuous sender: steps that start the next, the check a few minutes ahead, the hourly net; "going" judged by the run's last step, not its start | 1 |
| 2 | AI questions five at a time | 0.5 |
| 3 | $3 per website per collection, replacing the per-run limit; $100 a day for all of it; the Collector's boxes | 1 |
| 4 | The screen: the read behind Collecting now, the section, the state words, its look test | 1.5 |
| | **Total** | **4** |

Found while planning (2026-10-05): the hourly check closed any role's run
"running" 20 minutes after it **started**, so Search Console's first 90 days for
a big website (about 40 minutes) could be closed as died while still working.
Step 1 judges every role's run by its last activity instead — each step it
records counts — so a long run that is still moving is never closed.

A rule goes into AGENTS.md with step 1: no queue waits on a person to press a
button; work that stops at a time limit hands itself on, and only a person's
fix stops it.

## Built — 2026-10-05

- **The continuous send** (`convex/seoCollectorRun.ts`): a run's first step
  runs inside its start; each step sends for five minutes, sleeps through gaps
  of 30 seconds at most, and books the next step — at once, or when the next
  request comes due within ten minutes — with a watch ten and a half minutes on
  that carries on a step the platform stopped (and leaves be a run that moved
  in the last three minutes, so a step started late is never doubled). A run
  ends saying why: the queue empty, today's ceiling, the account refused, or
  DataForSEO saying "not now" five steps in a row.
- **Nothing queued waits for a run**: a next page of a list
  (`sitePagedLists.ts`) and a one-off request (`seoTools.requestSeoPull`)
  start the Collector when none is going (`seoAgentRuns.sendIfWaiting`), as
  saving the Collector's limits does; the hourly check starts it for requests
  due a quarter of an hour (`sendWaiting` duty). Found on the screen itself:
  two next pages queued after Period House Group's send had ended waited 48
  minutes until this went in.
- **Every role's run judged by its last step** (`roleRuns.ts`,
  `agentRunStepWriter.ts`): each step it records moves its `updatedAt`, and the
  hourly check closes only a run silent twenty minutes.
- **Live requests five at once** (`seoCollectionActions.ts`, each its own
  request), **$3 a website in a collection** and **$100 a UK day**
  (`seoCollectionLimits.ts`, the `seoCycleSpend` totals and the agent's
  `maxDailyCostUsd`), on the Collector's Settings: "Spend per website ($)" in
  Limits, "Spend a day ($)" under its role; a figure over a box's most says so
  in the app's words.
- **Collecting now** on Admin → Websites → Collection pipeline
  (`convex/seoCollectionProgress.ts`, `collection/_components/CollectingNow.tsx`),
  the request list's plainer states, `Meter`'s second band, and the look test
  (`collectionPipelineLook.test.tsx`, outline in
  `assets/collection-progress/look/Main.txt`). A Search Console run records the
  days it fetches on its connection (`collecting`) for its progress; a run from
  before says only its rows.

Found and handed on, not part of this plan: Search Console's add-up failed for
morehandles.co.uk's 2.88 million rows ("Too many bytes read",
`searchConsoleRollups.ts`), so its totals may be incomplete until it works in
pages.
