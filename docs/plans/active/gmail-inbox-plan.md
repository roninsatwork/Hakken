# The Gmail Inbox That Answers Itself

Status: **Phases A–C built and tested 2026-08-14.** The consent plumbing is
real: authorize and callback routes, single-use random state, server-side
code exchange, AES-256-GCM ciphertext tokens in `connectorOAuthTokens` (no
client-callable reader, held by test), refresh-on-expiry plus an hourly
sweep, and disconnect that revokes at Google before deleting the
ciphertext. The `google-gmail` connector is in the catalogue with working
`gmail.read` and `gmail.reply` handlers — the reply rails all proven by
test — and the once-a-minute watcher answers grounded questions in-thread,
turns everything else into a task + bell + holding reply, and labels
handled mail. What remains is Phase D, which needs Anthony's hands: the
dedicated mailbox, an internal Google Workspace OAuth app, and three
environment values (`CONNECTOR_GOOGLE_CLIENT_ID`,
`CONNECTOR_GOOGLE_CLIENT_SECRET`, `CONNECTOR_TOKEN_ENCRYPTION_KEY`) on the
dev deployment, then the live proof.
Phase 5 of the showcase channels roadmap (`showcase-channels-plan.md`).
Owner: Anthony

Every claim below carries the file it rests on; verify anchors before editing,
because line numbers drift. Follow the repo's working rules in `AGENTS.md`.

## Current implementation state (verified 2026-08-16)

The Gmail mailbox implementation now exists in the app. The connector catalogue
contains `google-gmail` with OAuth, the `gmail.read` and `gmail.reply` tools are
registered, and the admin connector screen can start and disconnect the Google
consent flow. Convex HTTP routes handle provider authorize and callback, tokens
are stored encrypted in `connectorOAuthTokens`, the token getter refreshes on
expiry, and the scheduled refresh sweep keeps idle connections warm.

The once-a-minute Gmail watcher polls connected mailboxes, records inbound
messages in `mailboxMessages` before acting, skips unsafe or already handled
mail, reads whole Gmail threads for context, answers grounded customer questions
through Gmail, labels handled messages, and falls back to a task, notification,
and holding reply when the answer needs a human. The live-proof boundary remains
Phase D: the dedicated mailbox, internal Google Workspace app, deployment
environment values, and real mailbox run still need to be performed outside this
documentation automation.

## The decision

A dedicated Gmail address — ask@ronins.co.uk — with a real, human-openable
inbox. Hakken watches it, reads new mail, and replies from it using the
company's knowledge; when a human is genuinely needed it raises a task and
a notification instead and tells the sender someone will be in touch.
Ronins company policy (all company mail lives on Gmail, no exceptions)
stays intact to the letter, and anyone at Ronins can open the inbox and
see exactly what the agent received and sent.

This phase builds **the platform's first working connector** — the
consent-flow, token, and refresh plumbing that every later connector will
reuse. Recorded decisions, carried from the umbrella plan and this
research:

1. **One dedicated mailbox, never a person's.** The connection is scoped
   to a single Workspace account created for the purpose. MFA is a
   one-time human event at connect; the platform holds a scoped, revocable
   key and never sees a password.
2. **Internal Google app.** Registered as *internal* to Ronins' Google
   Workspace, so Google's public verification process is out of scope;
   future clients connect per-client registrations.
3. **Replies go out through Gmail itself, not Resend.** A reply sent via
   the Gmail API lands in the mailbox's own Sent folder and threads
   correctly under the sender's original mail — the human-inspectable
   record is the point. (Resend's payload shape has no threading headers
   anyway — `convex/resendEmailService.ts:5-20` — and every existing
   Resend caller keeps working untouched.)
4. **Reply-only, to the sender only.** The mailbox never initiates mail
   and never widens an audience — the same fail-closed instinct as the
   agent notification tool's same-tenant rule
   (`convex/aiToolNotificationService.ts:60-92`, whose header explains
   why an agent that can email arbitrary addresses is a phishing tool).

## Pre-build baseline (verified 2026-08-13)

The following notes record the state before Phases A-C were implemented. Keep
them as historical context for why the consent and mailbox work was built; do
not treat them as the current product state.

**The connector catalogue is smaller than folklore says.** 11 connector
definitions containing 23 tool definitions
(`BUILT_IN_TOOL_CONNECTORS`, `convex/toolConnectorDefinitions.ts:30`) —
the "29" in earlier documents is stale (it referred to handler mappings,
`docs/plans/active/platform-hardening-plan.md:1363`). **No Google or
Gmail connector exists, and no definition anywhere uses
`authMode: "OAUTH"`** — the type allows it, nothing exercises it.

**The OAuth half is deliberately, explicitly absent.**
`isConnectorOAuthAvailable()` is hard-coded `return false`
(`convex/aiToolExecutionService.ts:1063`), and its header (L1046-1062)
lists exactly what is missing: the authorize **and** callback routes,
per-provider client credentials, encrypted token storage, and refresh.
The secret resolver states the structural reason
(`convex/connectorSecretResolver.ts:18-21`): env-based secrets are
read-only, and "OAuth … must *write* the tokens it receives, which the
environment cannot do."

**The scaffolding around the hole is real and reusable.**
`toolConnectorOAuthConnections` (`convex/schema.ts:2236-2255`) already
models a connection's lifecycle (`state`, `authorizationUrl`, `status`,
`scopes`, opaque `accountRef`/`tokenRef` — **no token or expiry fields**);
`beginConnectorOAuth` / `completeConnectorOAuth` / `disconnectConnectorOAuth`
exist (`convex/aiTools.ts:435-582`) but `complete` takes **hand-typed
admin refs** — no code path calls a token endpoint — `disconnect` never
revokes at the provider, and **nothing in `src/` calls any of them** (the
only caller is a test). The admin connector screens render no Connect
control (`src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx`).

**Google credentials exist for sign-in only.** `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` power Auth.js login (`convex/auth.ts:24-26`) with no
extra scopes and no retained tokens. The raw-secret guard already knows
what a leaked Google access token looks like
(`ya29.` in `RAW_SECRET_PREFIXES`, `convex/connectorSecretPolicy.ts:18`)
— the DB stores references, never secrets, and this plan keeps that true
by storing **ciphertext**, never plaintext.

**The house has every landing pad the reply loop needs.** A
once-a-minute cron dispatcher is the established polling pattern
(`convex/crons.ts:8-13`); headless agent runs return their text via the
run row (`finalOutput`, `convex/agentRuns.ts:995-1015`); tasks and
notifications are live (`createTaskInternal`, `convex/tasks.ts:400`;
`notifyUserInternal`, `convex/notifications.ts:89`); auditing follows the
direct-insert pattern with the agent metadata builders
(`convex/auditLogService.ts:211`).

## Design commitments (binding on every phase)

1. **Tokens are ciphertext at rest, in one new table, readable by no
   client-callable function.** A new `connectorOAuthTokens` table holds
   encrypted access + refresh tokens keyed to the connection, encrypted
   with a key from the deployment environment. Nothing client-callable
   reads it; only internal functions do. The existing
   `assertSafeSecretRefs` discipline (no raw secrets in reference fields)
   keeps holding everywhere else.
2. **The consent flow is the generic house flow; Google is its first
   provider.** Authorize and callback routes, state validation against
   the stored `state`, token exchange, refresh, and revoke are built
   provider-agnostic, configured per provider — because this plumbing is
   the shared groundwork the umbrella plan promises to later connectors.
3. **Scopes are minimal and named in the connector definition.** One
   Gmail scope covering read, send, and label changes on the connected
   mailbox; listed in `requiredScopes` so the admin screen and the
   consent screen tell the same story.
4. **Disconnect means revoked.** Disconnecting calls Google's revocation
   endpoint, then deletes the ciphertext row, then marks the connection —
   the current local-only disconnect is a defect this plan removes. A
   dead key (password change, admin revoke at Google) surfaces as
   "mailbox disconnected — reconnect", never as silent failure.
5. **Every read and send is audited.** Message subject and counterparty,
   never body text, in the audit metadata — the same restraint
   `recordNotificationDispatch` already shows
   (`convex/aiToolNotificationTools.ts:40-74`).
6. **The mailbox agent can reply by itself, inside hard rails.** The
   reply tool is WRITE and the mailbox agent runs with
   `autonomousToolExecution: true` (the house autonomy flag,
   `convex/schema.ts:2116`) — but the rails live in the handler, beyond
   the model's reach: reply only to the sender of an inbound message,
   never to a no-reply address, a short anti-loop gap between automatic
   replies in one thread, a per-thread daily cap, and a per-day send
   ceiling. Exceeding a rail files a task instead. (Originally drafted as
   one automatic reply per thread per hour; Anthony overruled that on the
   first live test, 2026-08-14 — email is a conversation, and an hour of
   per-thread silence left a customer's follow-up sitting unanswered. The
   gap now only breaks robot ping-pong.)
7. **Processed mail is idempotent.** Every Gmail message id is recorded
   before action; webhook-era double-delivery or cron overlap can never
   answer twice.

## Phase A — The consent plumbing (generic, Google first)

**Goal:** an admin clicks Connect, approves on Google's screen, and the
platform durably holds a working, refreshing, revocable key.

- HTTP routes in `convex/http.ts` (the established registration shape):
  `/api/connectors/oauth/authorize` (redirects to the provider with the
  stored `state`) and `/api/connectors/oauth/callback` (validates state,
  exchanges the code server-side, writes ciphertext, marks the connection
  CONNECTED). The routes carry the rate-limit discipline the existing
  secret-header webhooks lack.
- `connectorOAuthTokens` table + encryption helpers
  (commitment 1); refresh-on-expiry in the internal token getter plus an
  hourly refresh sweep cron for long-idle connections.
- `completeConnectorOAuth` (`convex/aiTools.ts:486`) reworked: the
  callback is its only caller; hand-typed refs are gone.
  `disconnectConnectorOAuth` gains real revocation (commitment 4).
  `isConnectorOAuthAvailable` (`convex/aiToolExecutionService.ts:1063`)
  finally returns something true — gated on the provider's client
  credentials being configured.
- Per-provider client credentials from env
  (`CONNECTOR_GOOGLE_CLIENT_ID`/`_SECRET` beside the existing
  `CONNECTOR_SECRET_*` namespace), validated in
  `scripts/validate-setup.mjs` like every other key.
- Tests first: state mismatch rejected, ciphertext round-trip, refresh on
  expiry, revoke-then-delete ordering, no client-callable token read
  (extend the enumeration-test discipline).

## Phase B — The Gmail connector and the Connect screen

**Goal:** the connector appears in the marketplace, connects to the
dedicated mailbox, and shows its state honestly.

- A `google-gmail` definition in `BUILT_IN_TOOL_CONNECTORS`:
  `authMode: "OAUTH"`, `oauthProvider: "google"`, the minimal scope,
  `tenantAvailability: "TENANT_RESTRICTED"`, two tools —
  `gmail.read` (READ) and `gmail.reply` (WRITE, confirmation per the
  normal policy; autonomy comes from the agent flag, commitment 6).
- Handlers in `REGISTERED_TOOL_HANDLERS` following the house shape
  (tenant from run context never from model args); the reply handler owns
  the commitment-6 rails.
- The connector detail screen gains the Connect / Connected-as /
  Disconnect panel, wired to the real flow — the first UI caller
  `beginConnectorOAuth` has ever had. Connect and disconnect write audit
  entries.

## Phase C — The mailbox answers

**Goal:** mail arrives; correct replies go out; the rest becomes tasks.

- A once-a-minute watcher cron (the `crons.ts` dispatcher pattern) lists
  unprocessed mail on the connected mailbox; each new message id is
  recorded (commitment 7) in a `mailboxMessages` table
  (company, connection, Gmail message + thread ids, sender, subject,
  decision, `taskId?`, timestamps — with its purge pipeline registered
  per the Retention And Purge Plan in the same change).
- Each message runs the answer-versus-task decision through the brain:
  the model answers from company knowledge and declares, structured,
  whether the answer is grounded; grounded → `gmail.reply` sends it in
  the sender's thread; not grounded (or any commitment-6 rail hit) →
  `createTaskInternal` + `TASK_ASSIGNED` bell (assignee from the shared
  per-company "inbound goes to" setting the telephone plan also uses) +
  a short holding reply telling the sender a person will follow up.
- Skip rules, fail-closed: bulk/no-reply senders, Gmail's own
  spam/promotions categories, and anything the mailbox itself sent.
- Processed mail is labelled in Gmail so a human opening the inbox sees
  at a glance what the agent handled.
- Tests: grounded-reply path, task path with holding reply, every skip
  rule, double-delivery idempotency, rail breach → task.

## Phase D — Proof

- Live on dev against a real dedicated mailbox: send a question the
  knowledge answers → threaded reply arrives, visible in the inbox's
  Sent; send one it cannot answer → task + bell + holding reply; disable
  the connection at Google's end → screen shows disconnected, nothing
  crashes, mail waits.
- Done when Anthony can email the address from his phone in front of a
  room and read Hakken's reply aloud a minute later — and then open the
  inbox in Gmail to show the whole exchange sitting there like any
  colleague's mail.

## Out of scope, recorded

- Any second connector (this plumbing enables them; each needs its own
  plan and decision).
- Connecting any personal mailbox (commitment: dedicated account only).
- Outbound campaigns, digests, or any mail not a direct reply.
- Google Pub/Sub push delivery — polling each minute is enough for the
  showcase; push is a later optimisation with its own Google
  infrastructure.
- Attachment handling in mail (read as text where trivial; anything else
  goes the task route — photos-in-email joins a later decision with the
  photo plan).
