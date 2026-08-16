# The Seven Gaps — the Product Around the AI

Status: **Planned 2026-08-16**, from Anthony's "make a plan for them all".
Every gap below was verified against the code first (his standing rule):
three earlier ideas were dropped because they already exist (one-time-code
sign-in, the company audit view, plans with prices and enforced limits).
Owner: Anthony

## What the code check found (verified 2026-08-16)

- Phone calls are stored (`phoneCalls`) and listed only through tenant
  doors (`telephony.listCalls`) on `/app/calls`; an admin looking at a
  company cannot see its calls at all.
- Emails the AI saw and answered are stored (`mailboxMessages`, written
  by the Gmail watcher) and have **no screen anywhere** in the product.
- The kiosk works and is capped, but keeps no visit record beyond a
  lifetime counter on the widget row; kiosk threads are written with
  `sourceUrl: "kiosk"` which no screen ever reads; nothing notifies a
  person when a visitor arrives, though `notifications.notifyUserInternal`
  exists and is used by three other subsystems.
- The Health screen reads only internal tables. The connector "Does it
  work" button deliberately contacts nothing. Gmail polling failures go
  to `console.error` only. The hourly OAuth refresh writes
  `authConnectionStatus: "ERROR"` that only one drill-down page shows.
  24 cron jobs have no run ledger and no screen.
- The dashboards (platform + company) count signed-in staff only; calls,
  widget, kiosk, email and tasks are structurally invisible to them.
- The wiki's Cmd-K switcher is the only global-shortcut search; the
  header has no search box; conversation content, calls and emails have
  no search index at all.
- Widgets carry per-company colour/logo/greeting but every screen that
  edits them is super-admin-only; company-scoped emails (even invites)
  render only the platform name; the kiosk fetches `themeLogoUrl` and
  never renders it (flagged as a side fix).
- Plans/limits/cycle-reset exist and are enforced; a company cannot see
  its own plan or usage anywhere; there is no payment machinery at all.

## The phases

### Phase 1 — seeing the work: calls and emails (≈1.5 days)

Admin-height doors for a company's calls (same shape as the tenant
list, walled by `assertAdminCanAccessCompany`) and a Calls screen on
the company menu; a Mailbox screen over `mailboxMessages` at the same
height — what came in, what the AI decided, what it replied, when.
House table anatomy, en/it. No new writes: both tables already exist.

Acceptance: an admin opens a company and reads its calls and its
handled email; a company with neither shows honest empty states;
tenant walls hold (proven in tests).

### Phase 2 — connections that are really checked (≈2 days)

A Connections screen (Maintenance): one row per dependency — Gmail
inbox, phone line, each model provider, the widget — each with a real
"checked at", "last worked" and a plain word: working / needs
attention. Behind it: an hourly probe cron that actually contacts
Gmail (token + mailbox touch) and the phone provider (account fetch),
reusing the provider test that already exists for models; the Gmail
watcher writes lastPolledAt/lastError to the connector row instead of
console.error; `authConnectionStatus: "ERROR"` becomes a Health
bucket. A small run ledger for crons (job name, last ran, last
succeeded, last error) with a screen section, so a dead sweep is
visible the day it dies. Wording never colour-only (Anthony is
red/green colour-blind: blue/yellow accents + words).

Acceptance: pulling the Gmail token makes the row say "needs
attention" within the hour with a plain reason; every cron shows a
last-ran time; the Health page counts broken connections.

### Phase 3 — the visitor book (≈1.5 days)

A `kioskVisits` row per kiosk session (started, ended, thread link,
and the visitor's name/who-they-came-for when the conversation
surfaced them — extracted by the existing answer pipeline, never
required). A Reception book screen for the workspace ("who came in
today", newest first, opens the conversation) and the same at admin
height. Arrival notification: when a kiosk session starts, notify the
workspace's reception users through the existing notification road.
Expected visitors: a simple today-list a staff member types into, so
the book can say "expected · arrived".

Acceptance: a kiosk session appears in the book as it starts; the
named staff get the arrival note; an expected visitor who arrives is
matched by name; empty days say so.

### Phase 4 — the day view (≈1 day)

One screen per company: what happened, day by day — questions
answered, calls taken, emails handled, widget conversations, kiosk
visits, tasks moved — each number opening the screen it came from
(phase 1's screens included). Platform height: the same shape summed
across companies. Built on the tables the surveys located; a new
per-day rollup only if live counting proves too slow at either height.

Acceptance: yesterday reads as one honest row of numbers; each number
opens its detail; a quiet day is a row of zeros, not a blank.

### Phase 5 — search everywhere (≈1.5 days)

The wiki's Cmd-K grows into the product's: from any admin screen, one
box finds companies, people, wiki pages, conversations (title), calls
(caller number/name) — grouped by kind, walled by exactly the asker's
rights at each height. Missing search indexes added where cheap
(calls); conversation *content* search stays out (its own project,
recorded here honestly).

Acceptance: three keys from anywhere find a person, a company, a call
or a page; a company admin's results never cross the wall; the wiki
switcher remains unchanged inside the wiki.

### Phase 6 — their own look (≈1.5 days)

A Look screen for company admins (under /app settings): their widget's
colour, logo, greeting, placeholder — the fields that already exist,
editable at last by the people they belong to (the backend mutation
already admits ADMINs; only the route was missing). Company-scoped
emails (invites first) carry the company's name alongside the
platform's. The widget/kiosk "Powered by" line becomes a platform
setting. No email white-labelling beyond naming: sender domains stay
the platform's (deliverability).

Acceptance: a company admin restyles their widget without Anthony; an
invite email names the inviting company; walls hold in tests.

### Phase 7 — their own bill (≈1 day, plus a decision)

A Plan page for company admins: plan name, price, allowance used
("800 of 1,000 questions this month"), days until the counter resets,
and a plain note when they're near the edge — read from the plan
machinery that already enforces all of this silently. A gentle
in-product warning at 90% instead of today's hard cliff.
**Decision recorded, not built:** actually taking payment (Stripe or
similar) needs a payment account and pricing choices that are
Anthony's; parked until he rules.

Acceptance: a company admin sees plan, usage and reset date; the 90%
note fires before the refusal ever does; no payment code ships.

## Order and size

1 → 2 → 3 → 4 (each feeds the next: the day view links to phase 1's
screens and phase 3's book), then 5, 6, 7 in any order. **≈10
build-days.** Each phase lands separately, each stoppable.
