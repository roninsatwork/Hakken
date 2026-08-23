# Knowing When It Breaks

**Decided 2026-08-23.** Sonae will use **Better Stack** to find out when things
go wrong, across the whole product. Once that is in, Sonae gains the ability to
connect to a service's own tool server, and Better Stack is the first thing it
connects to — so an admin can ask *"did anything break today?"* in plain English
instead of learning a dashboard.

Serves the vision in [PRODUCT.md](../../PRODUCT.md).

---

## The problem

**When something in Sonae breaks, nobody finds out.** You hear it from a client,
or you never hear it at all.

Error monitoring is installed and wired into the code, but it has no account
behind it, so it does nothing. Uptime is not watched. Agent failures are recorded
but only visible to someone who goes looking.

That is survivable for an internal tool. It is not for something sold, and for a
client-owned product "we will know before you do" is part of what is being paid
for. Today that would be an untrue claim.

---

## Two setups, not four

Sonae is two pieces that break separately.

**One — everything people click on.** The public site, the user app, the admin
screens and the embedded widget are all a single application. Setting up
monitoring once covers all of them. Errors already carry a label saying which
part they came from, so an admin screen failing looks different from a customer's
chat failing.

**Two — the engine.** Agent runs, the tools they call, workflows, and scheduled
jobs. These are the failures that matter most: an agent can fail every run for
three days and the first anyone knows is a client asking why they have had no
answers.

The engine already records its failures thoroughly — every run writes down its
steps, its tool calls, its cost, and how it ended. **The gap is not the
recording; it is that nothing tells anyone.** The work is to push what is already
written down out to Better Stack.

---

## What exists today

The codebase was built expecting this.

- **`src/lib/reportError.ts`** is a vendor-neutral funnel. Its own note says
  adding a vendor should be "one edit here instead of a sweep across the
  codebase", and `setErrorReporter` is the seam a vendor plugs into.
- **`src/lib/errorMonitoring.ts`** holds the decision — on or off, which
  environment, personal data deliberately excluded — apart from any vendor, and
  is unit tested.
- **Three entry points already agree**: `src/instrumentation.ts` (server and
  edge) and `src/instrumentation-client.ts` (browser), both through
  `initErrorMonitoring.ts`.
- **Off by default**, correctly: with nothing configured, nothing initialises and
  no network call happens. That is the right state for local work and a fresh
  clone, and it must survive.

Vendor-specific today, and therefore changing: the SDK package, the setting names
in `.env.example`, the allowed-domain list in `src/lib/securityHeaders.ts`, and
the build step in `next.config.ts`.

**Nothing in `convex/` reports errors anywhere.** That is the engine half, and it
is built from scratch in Phase 2.

---

## The risk, stated plainly

**Better Stack and the tool currently wired in are not the same shape.** The
current one catches unhandled errors automatically and turns unreadable
production code back into real file names. Better Stack's documented path for
this kind of application is more hands-on, and its handling of readable file
names is not clearly documented.

Two consequences: more may need wiring by hand than a vendor swap implies, and a
stack trace may point at gibberish rather than a real file — which would make
reports far less useful.

**The mitigating fact** is that this codebase already funnels errors through
`reportError`, so the hands-on path is mostly built.

**Phase 0 is therefore a proof, and it can stop the plan.** Working wiring is not
removed on the strength of a pricing page.

---

## Built to be swapped

Different client products will want different monitoring: one already pays for
something else, another insists nothing leaves their own servers, a third wants
none at all. Choosing a vendor must be a setting in a cloned product, not a code
change.

Normally this abstraction would be premature — building it before a second
implementation exists is how codebases collect layers nobody needs. It is
justified here because the business model guarantees the second case.

**So: build the seam properly, implement one vendor.** A second adapter is
written when a client actually asks, not speculatively.

### Copy the pattern already in the codebase

Sonae solved this once, for AI providers. Monitoring should look the same rather
than invent a second way:

- **A narrow interface** — start up, report a failure, nothing else. Everything
  vendor-shaped lives behind it. `convex/agentProviderTypes.ts` shows how narrow.
- **A registry that picks one by key**, as `convex/aiProviderRegistry.ts` does.
  An unknown key fails immediately with a message naming it.
- **The same seam serves both halves**, so the engine and the clickable app are
  never configured against different vendors.

### What has to change

1. **Generic setting names.** A cloned product using another vendor should not be
   filling in a box named after a competitor.
2. **Each adapter declares its own allowed domain.** The browser blocks sending
   data to servers it has not been told about, and that list currently names one
   vendor directly. Miss this and a switched clone silently sends nothing — a
   failure that looks like "monitoring just doesn't work" and is miserable to
   diagnose.
3. **"None" stays first-class.** Nothing configured means nothing initialises.
4. **Unused adapters must not ship.** Otherwise every clone carries every
   vendor's toolkit — the same bloat as stocking connectors nobody uses. Adapters
   are removable by [the clean cut](./client-product-cut-plan.md).

### The one piece that stays vendor-shaped

Turning unreadable production code back into real file names happens at **build
time**, and every vendor does it differently. It cannot hide behind the seam. Make
it conditional on the configured provider, and accept that a future swap still
touches it.

---

## Where it is switched on and off

**Monitoring is not a database setting, and cannot be.** It starts at process boot
and before the browser page hydrates — earlier than any database read — and the
browser half is fixed when the application is built. A toggle in a settings screen
physically could not control whether it initialises.

So it is configured **per deployment, in that deployment's environment**. **No new
settings screen, and no Convex variables.**

**What a screen should do instead is report status.** "Is monitoring actually on
here, and is it working?" has no answer today. The platform already has the right
home — the **Connections** screen, one row per thing the platform depends on, in
words rather than colour, with when it was last genuinely contacted. Error
monitoring and each uptime check become rows there, through
`convex/connectionProbes.ts`. No new screen is invented.

**Tool servers are the opposite case** and do need a screen — connected at
runtime, per company, stored in the database. See Phase 4. Each connected server
also appears as a Connections row.

---

## Phases

### Phase 0 — Prove it, before removing anything

Free Better Stack account. Send it a real error from a deployed environment, from
the browser and from the server. Break something on purpose and confirm it
arrives.

Answer three questions in writing:

1. Does an unhandled error arrive without hand-wiring every call site?
2. Does the stack trace name real files, or bundled output? If bundled, what is
   the route to readable ones?
3. Does the free allowance hold for one real deployment?

**Decision gate.** Good answers, continue. If stack traces cannot be made
readable, stop — a report nobody can act on is not worth switching for, and the
choice reopens with the alternatives in the background section below. Record the
answer either way so it is not re-argued from memory in three months.

### Phase 1 — Build the seam, put one vendor behind it

Not a vendor swap, a vendor *layer*, with Better Stack as its first occupant.

Write the interface and registry. Move the existing code behind an adapter, write
the Better Stack adapter beside it, select between them by configuration. Rename
settings to generic names. The active adapter supplies its own allowed domain.

`reportError` and `errorMonitoring` keep their shape and their tests.

Ends when: a deployed environment reports a deliberately triggered error; changing
one configuration value switches vendor with no code edit; a local run with
nothing configured still initialises nothing.

### Phase 2 — Cover the engine

The half that does not exist yet. Give the backend a twin of the same seam, and
send it the failures already being recorded: failed agent runs, failed workflow
steps, failed tool calls, scheduled jobs that did not run.

Written in our own code deliberately — see the background section for why the
built-in shortcut was rejected.

Ends when a deliberately failed agent run appears in Better Stack, with enough
detail to act on, and nothing sensitive in it.

### Phase 3 — Watch whether it is up

Uptime checks against the deployed application and its health surface, alerting
somewhere Anthony will actually see. Ten checks are free.

Ends when stopping the deployed service produces an alert.

### Phase 4 — Sonae speaks the standard tool plug

The general capability, not a Better Stack special case. Five parts:

1. **A screen to connect one.** An admin pastes an address, names it, supplies
   whatever login it needs. Stored per company.
2. **Ask what it can do.** Fetch and read the server's tool list.
3. **Write it into the tools Sonae already has**, so agent binding, permission
   checks, the approval gate and the audit trail all apply without rebuilding.
4. **Carry out the calls**, through the existing deny-by-default dispatcher.
5. **Keep it inside the company wall.** One company's connection is invisible to
   every other, and the tenant a tool acts on comes from the conversation, never
   from anything the model produced.

**Start read-only.** Tools that only read need no approval gate. Tools that change
something must land behind the existing approval step first.

### Phase 5 — Connect Better Stack as the first one

Point the new capability at Better Stack's tool server. Everything it offers is
read-only, which is why it is the right first target.

Ends when an admin can ask Ask Sonae "did anything break today?" and get a real
answer from live data.

### Phase 6 — Decide what may leave the building, and write it down

Logs can contain customer information, so pulling them into an assistant's context
is a decision, not an accident. Set what an admin may retrieve, enforce it, and
document both the monitoring setup and how to connect a tool server.

---

## Acceptance

1. A deliberately broken page in a deployed environment produces an error within a
   minute, with a stack trace naming real files.
2. A deliberately failed agent run or workflow step produces a report — the engine
   is covered, not assumed.
3. A local run with nothing configured initialises no monitoring and makes no
   network call.
4. Stopping the deployed service produces an alert.
5. Changing one configuration value switches vendor without a code change; an
   unknown value fails immediately with a message naming it.
6. A cloned product can be built with no monitoring, or a different vendor from
   Sonae's own, without editing source.
7. An admin can connect a tool server from a screen, without a developer.
8. Tools from a connected server obey the existing permission, tenant and approval
   rules — proven by a test, not by inspection.
9. One company cannot see or use another company's connected server.
10. The Connections screen shows whether monitoring is on and working here, and a
    row per connected tool server.
11. Ask Sonae answers a plain-English question about live monitoring data.

---

## Background — why not the alternatives

Recorded so these are not re-argued from memory.

**Why not the built-in shortcut for the engine.** Convex can forward backend
failures automatically, which would save writing Phase 2. Rejected for two
reasons: it requires **Convex Pro at $25 per developer per month**, and it only
sends to Sentry, PostHog or Datadog — pinning the engine half to three vendors and
undercutting the swappable design above. A clone wanting a different vendor for
its backend would be stuck.

What the shortcut would have added: failures Convex itself notices rather than our
code — a function timing out, a scheduled job never starting. Our own reporting
misses those. **That blind spot is accepted for now**, and the shortcut can be
added later if it proves to matter. The two are not mutually exclusive.

**Why not Sentry.** Deepest error diagnosis available and natively supported by
Convex, but the free allowance is one user and 5,000 errors a month, and every
client-owned build needs its own account. By the fifth install it is expensive.

**Why not PostHog.** Strong free allowance, natively supported by Convex for both
failures and logs, and it adds product analytics. It does **no uptime monitoring
at all**, so it would not have removed the need for a second service. The natural
pairing — PostHog for failures, Better Stack for uptime — means two accounts and
two dashboards for no gain once Phase 2 exists.

**Why not Grafana Cloud.** Most powerful and most open, self-hostable if a client
demands it. Also the most work to set up and built for engineers who want to build
dashboards. Worth revisiting only if a client insists on self-hosting.

---

## Out of scope

- **Paid monitoring tiers.** Free allowances until something forces otherwise.
- **Publishing Sonae's own tool server** so outside AI tools can reach a
  workspace. Valuable and largely the same machinery, but a separate decision.
- **Hand-built connectors for individual services.** Decided 2026-08-23: built per
  clone as a client needs them, not stocked in advance.
- **Writing a second monitoring adapter speculatively.** The seam exists from day
  one; the next adapter is written when a client asks.
- **Tracing and performance monitoring.** This is about knowing what broke.
