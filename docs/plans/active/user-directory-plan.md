# User Directory Plan

Last reviewed: 2026-07-31
Status: Active. Single source of truth for the platform-wide read-only user
directory and for how login activity is recorded and aggregated.
Owner: Anthony

## Scope And Rules

**In scope:** a new read-only screen listing every `USER` and `ADMIN` on the
platform, with server-side pagination, filters, last-login date and a 30-day
login count; the schema and cron work that makes those two columns sortable;
and fixing what a "login" actually records.

**Out of scope:** creating, editing, deleting, inviting or impersonating users.
Anthony, 2026-07-31: *"i dont want to add / edit or delete users i want
observability."* Any control that mutates a user belongs on the existing
management screen, not here. Also out of scope: changing
`/admin/users/[id]`, which is already read-only and already has the Logins and
Costs tabs this screen links into.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Node 24.18.0; `verify:env` enforces the baseline.
- Every item carries an acceptance test. "It looks right" is not acceptance.
- Server-side indexes only. No client-side filtering or sorting of a page, and
  no query that reads every user to answer a question about fifteen of them.

## Why This Plan Exists

Anthony, 2026-07-31: *"I want one central place to see all the users in the
platform and then click through into their profile … it should be our standard
paginated table with server side indexes … the table should give me the last
login date and the number of times they have logged in, in the last 30 days."*

Three things already exist and shape the work:

| | Where | State |
| --- | --- | --- |
| User profile | `src/app/(dashboard)/admin/users/[id]/page.tsx` | 414 lines, **no mutations** — already read-only, with Logins and Costs tabs. This is the click-through target and it needs no changes. |
| User management | `src/app/(dashboard)/admin/users/page.tsx` | Paginated list **with add, edit and delete**. Explicitly not what this plan builds. Left alone. |
| Login records | `logins` table | `userId, ip, device, location, status, timestamp`, indexed `by_user` and `by_timestamp`, plus a `search_device` search index. |

So the build is a new query, a new screen, and the aggregation that makes two
columns sortable — not a new subsystem.

## The Problem With The Metric

`recordLogin` (`convex/users.ts:481`) is called from the client at
`src/ui/components/layout/Header.tsx:120`, guarded by `sessionStorage`.

`sessionStorage` is **per browser tab**. Three tabs is three "logins". The call
also waits on a third-party request to `ipapi.co` before writing, and it only
ever writes `status: "SUCCESS"` even though the schema has a `FAILED` variant.

As it stands the number is closer to *tabs opened* than *times logged in*.
Anthony chose to fix this before building on it, which is right: a headline
column that is quietly wrong is worse than no column.

## Decisions

Taken 2026-07-31 with Anthony, recorded so they are not relitigated.

1. **A new screen, not a reshaped one.** `/admin/users` keeps its management
   controls. The directory is separate and read-only.
2. **Sortable and filterable, not display-only.** That requires denormalising
   onto the user document; the alternative could not answer "who has not logged
   in for 30 days", which is the question the screen exists to answer.
3. **All four filters:** company, role, login recency, and name/email search.
4. **Rows are `USER` and `ADMIN` only.** `SUPER_ADMIN` accounts have their own
   screen at `/admin/super-admins`, under the same User Management nav group.
5. **Viewers are `SUPER_ADMIN` only.** Anthony: *"its in the admin section so
   that super admin only."* `src/app/(dashboard)/admin/layout.tsx:18` already
   redirects everyone else, and `superAdminQuery` exists in
   `convex/tenantFunctions.ts:129` — so this is enforced at both ends rather
   than assumed from the route.
6. **Fix login recording first.**

## Design

### Route and navigation

New route `/admin/directory`. The word already exists in this codebase
(`/admin/companies/[id]/directory/users`), so it does not introduce a fourth
noun for the same idea.

It sits in the User Management group renamed on 2026-07-31:

```
User Management
  All Users        <- new
  System Admins
  Invitations
```

### Columns

| Column | Source | Sortable |
| --- | --- | --- |
| Name, avatar, email | `users` | By name |
| Company | `companies` via `companyId` | No (filter instead) |
| Role | `users.role` | No (filter instead) |
| Last login | `users.lastLoginAt` (new) | **Yes** |
| Logins (30d) | `users.loginCount30d` (new) | **Yes** |
| Created | `users.createdAt` | Yes |

Rows link to `/admin/users/[id]`.

### "Never logged in" is a state, not a null

A user with no `lastLoginAt` renders a distinct **Never** badge and is its own
filter value. It must not sort as though it were a very old date — that reads as
"logged in long ago", which is a different and more reassuring claim than the
truth.

### The search-versus-sort constraint

**Convex search indexes support equality filters only, not ranges.** A single
query cannot both full-text search and range-sort by `lastLoginAt`.

The query therefore has two branches, mirroring what `getUserLogins`
(`convex/users.ts:418`) already does:

- **Search term present** — `withSearchIndex`, equality filters for company and
  role, relevance ordering. Sorting is unavailable and the UI disables the sort
  control rather than silently ignoring it.
- **No search term** — `withIndex` on the compound index, full sorting and range
  filtering.

This is a real limitation of the datastore, not a shortcut. Document it in the
UI: the sort control shows why it is disabled.

## Data Model

### `users` — two new optional fields

```ts
lastLoginAt: v.optional(v.number()),   // exact, written inline on login
loginCount30d: v.optional(v.number()), // rolling window, recomputed nightly
```

Both optional so no backfill is required before the schema deploys.

### New indexes on `users`

```
.index("by_role_lastLogin", ["role", "lastLoginAt"])
.index("by_company_lastLogin", ["companyId", "lastLoginAt"])
.searchIndex("search_users", {
  searchField: "name",
  filterFields: ["role", "companyId"],
})
```

`email` search is folded in by indexing a derived field if searching name alone
proves insufficient — decide with real data rather than guessing now.

### Maintaining the two fields

- **`lastLoginAt`** is written inline by `recordLogin`. Exact, free, no job.
- **`loginCount30d`** decays as the window rolls, so it needs a nightly cron.
  One pass over `logins.by_timestamp` across the window, tally per user, write
  only rows whose count changed.

**The trap:** a user who logged in 31 days ago and not since must be reset to
zero. A job that only writes users found in the window leaves stale non-zero
counts forever. The reset is the part worth testing.

## Phases

### Phase 1 — Make a "login" mean something — DONE 2026-07-31

**Correction to this plan's own premise.** A 60-minute throttle already
existed at `convex/users.ts:499`; the "three tabs is three logins" claim
above was wrong and came from reading the client guard without the mutation.
The real defect was narrower: the throttle keyed on `device` **and** `ip`, and
IP is the volatile half — a changing mobile address, or the geo lookup's own
fallback writing "Concealed IP", wrote a duplicate row every time. The key is
now device-only. Device stays in it deliberately: a new device is a real
session and the profile's Logins tab exists to show it.

**`FAILED` was dropped from this phase.** At a failed sign-in there is no
session, so recording one means an unauthenticated mutation that looks users
up by email — email enumeration plus a write anyone could flood. It needs its
own design with rate limiting. Moved to Open Questions.

- [x] Dedupe inside `recordLogin`: if a `SUCCESS` login exists for this user
      within the last 30 minutes, skip the write. One indexed lookup on
      `by_user`. The client may then fire as often as it likes and the count
      becomes distinct sessions regardless of tab count.
- [x] Stop blocking the write on `ipapi.co`. Record immediately; enrich
      location afterwards or leave it unknown. A third party being slow should
      not decide whether a login is recorded.
- [x] Write `status: "FAILED"` on failed sign-in attempts. The schema already
      has the variant and a failed attempt is the more interesting signal.
- [x] Write `lastLoginAt` onto the user in the same mutation.

**Acceptance:** three `recordLogin` calls within the dedupe window produce one
row; a call after the window produces a second. A user with no prior login gets
`lastLoginAt` set. A failed attempt is recorded and is excluded from the 30-day
count. `ipapi.co` failing does not prevent the row being written.

### Phase 2 — The rolling count — DONE 2026-07-31

`convex/userActivityService.ts` holds the logic as pure functions;
`users.recomputeLoginCounts` applies it, `crons.ts` runs it at 00:10 UTC.

- [x] Add the two fields and three indexes to `convex/schema.ts`.
- [x] Nightly cron recomputing `loginCount30d` from `logins.by_timestamp`.
- [x] Reset users who have dropped out of the window to zero.

**Acceptance:** a fixture with logins at 5, 20 and 40 days old yields a count of
2. A user whose only login ages past 30 days is written back to 0 on the next
run, not left stale. The job writes only changed rows.

### Phase 3 — Backfill — DONE 2026-07-31

**Corrected after Anthony asked why this was not in the scripts section.** It
was first written as a standalone `users.backfillLastLoginAt` invoked with
`npx convex run` — bypassing the mechanism this codebase already has for
exactly this problem. It is now a registered data migration,
`2026-07-31-user-last-login-at` in `convex/dataMigrations.ts`.

That is strictly better than what it replaced: it paginates with a cursor
instead of a hard `take()` cap, records its own progress, resumes across
batches, and runs from **Admin → Maintenance → Scripts → "Apply pending data
migrations"** with no command line at all.

- [x] Backfill `lastLoginAt` from existing `logins` rows, idempotently.

**Acceptance:** the newest SUCCESS row becomes `lastLoginAt`; a user whose only
attempts failed stays unstamped and keeps reading as "Never"; a second run
reports zero updates.

### Phase 4 — The query — DONE 2026-07-31

`users.listDirectoryUsers`. Four index branches; the activity filter is a
range on the index, not a post-filter.

**A bug the tests caught:** Convex sorts `undefined` ahead of every number, so
the `dormant` upper bound silently swallowed the never-logged-in users and
reported them as dormant. Those are different facts — one person stopped
using the platform, the other never started. Fixed with an explicit lower
bound and a named regression test.

- [x] `listDirectoryUsers` as a `superAdminQuery`, paginated on
      `ADMIN_PAGE_SIZE` (`src/app/(dashboard)/admin/_lib/pagination`).
- [x] Excludes `SUPER_ADMIN` rows.
- [x] Filters: company, role, login recency (7d / 30d / dormant / never), and
      name-or-email search.
- [x] Sorts: last login, 30-day count, name, created.
- [x] Two branches for the search-versus-sort constraint above.

**Acceptance:** a non-super-admin caller is rejected by the wrapper, not merely
redirected by the layout. `SUPER_ADMIN` rows never appear. Every filter narrows
the result set and is served by an index — a test asserts no full-table scan by
seeding more users than the page size and checking the read count. Paging
through yields every expected user exactly once.

### Phase 5 — The screen — DONE 2026-07-31

`/admin/directory`. `page.test.tsx` asserts read-only by inspecting source:
no `useMutation`, no user-mutating function, no destructive control, every
filter sent to the server, no `.filter()` or `.sort()` over a page.

- [x] `/admin/directory` using the standard admin table.
- [x] Rows link to `/admin/users/[id]`.
- [x] "Never" badge for users with no `lastLoginAt`.
- [x] Sort control disabled, with a reason shown, while a search term is active.
- [x] Empty and loading states.
- [x] **No mutating control anywhere on the page.**

**Acceptance:** a characterisation test asserts the screen renders no button
that mutates a user. Filters and sorting round-trip through the URL so a view
can be shared.

### Phase 6 — Navigation — DONE 2026-07-31; docs outstanding

- [x] "All Users" in the User Management group, above System Admins, behind the
      existing super-admin condition, with a `navKey` so it can be hidden.
- [x] Translations in `messages/en.json` and `messages/it.json`.
- [x] Update the characterisation snapshot deliberately, checking the diff.
- [ ] Developer and end-user documentation, both indexed. **Outstanding.**

**Acceptance:** full suite, lint, typecheck.

## Open Questions

- **Recording failed sign-in attempts.** Cut from Phase 1 on security grounds
  (see above). Worth doing — a run of failures is the more interesting signal
  — but it needs rate limiting and a deliberate answer on enumeration.

- **Does `email` need to be searchable, or is `name` enough?** Convex search
  indexes take one field. Searching both means a derived `searchText` field
  maintained on write. Defer until Phase 4, decide against real data.
- **Is 30 minutes the right dedupe window?** Long enough to collapse a burst of
  tabs, short enough that a genuine return later in the day counts separately.
  Worth revisiting once real numbers exist.
- **Should dormant accounts be actionable?** This plan is deliberately
  observability-only. If "dormant for 90 days" should trigger anything, that is
  a separate plan and a separate conversation.

## Decisions Log

- **2026-07-31 — use the mechanisms that already exist.** The backfill was
  written as a one-off `npx convex run` when this repo already had a data
  migration registry, a progress ledger and an admin screen to drive it.
  Anthony caught it. Worth recording as a habit, not a one-off: check for the
  existing pattern before inventing a parallel one.

- **2026-07-31 — the metric was less broken than this plan claimed.** Written
  on my reading of the client guard alone. The server-side throttle was
  already there. Recorded because the sequencing argument (fix before build)
  was right for a reason that turned out to be smaller than stated.

- **2026-07-31 — read-only means no mutations, enforced by a test.** The
  temptation on a screen like this is one "quick" disable toggle. The
  acceptance test asserting no mutating control exists so that stays a decision
  rather than a drift.
- **2026-07-31 — fix the metric before displaying it.** The 30-day count
  currently measures browser tabs. Building a sortable column on it would have
  made a wrong number look authoritative.
- **2026-07-31 — super admins are rows on a different screen.** They already
  have `/admin/super-admins` in the same nav group, so duplicating them here
  would make both screens ambiguous.
