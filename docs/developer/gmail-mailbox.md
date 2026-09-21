# Gmail Mailbox Developer Guide

The Gmail mailbox is Hakken's implemented OAuth connector and inbound email
automation. It connects one dedicated Gmail account for a workspace, polls new
mail, answers in-thread when company knowledge is enough, and files tasks when a
person must follow up.

This guide describes current behavior only. Planned live proof and operator
setup remain in [The Gmail Inbox That Answers Itself](../plans/active/gmail-inbox-plan.md).
Outbound platform email rendering is covered separately by
[Email System](./email-system.md).

## Implementation Surface

The implemented route, connector, and runtime surface is:

- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx` renders the
  OAuth connected-account panel, Connect mailbox, Disconnect, connector checks,
  and generated tools for installed OAuth connectors.
- `convex/http.ts` exposes `/api/connectors/oauth/authorize` and
  `/api/connectors/oauth/callback`.
- `convex/toolConnectorDefinitions.ts` defines the `google-gmail` connector with
  `authMode: "OAUTH"`, `oauthProvider: "google"`,
  `tenantAvailability: "TENANT_RESTRICTED"`, scope
  `https://www.googleapis.com/auth/gmail.modify`, and two tools:
  `gmail.read` and `gmail.reply`.
- `convex/aiTools.ts` owns connector install/detail state plus
  `beginConnectorOAuth`, callback finalization handoff, and disconnect
  scheduling.
- `convex/connectorOAuth.ts` owns authorize/callback handling, token exchange,
  ciphertext token storage, access-token refresh, provider revoke, and
  disconnect completion.
- `convex/connectorOAuthProviders.ts` owns provider config and credential
  availability.
- `convex/connectorTokenCrypto.ts` encrypts and decrypts OAuth tokens.
- `convex/gmailConnector.ts` reads mailbox summaries, messages, and threads;
  sends threaded replies; applies the processed label; and enforces reply rails.
- `convex/gmailWatcher.ts` is the once-a-minute mailbox agent.
- `convex/gmailWatcherStore.ts` records seen Gmail message ids and decisions.
- `convex/crons.ts` schedules `gmail-mailbox-watcher` every minute and
  `connector-oauth-token-refresh` hourly.

Focused tests include `convex/gmailConnector.test.ts`,
`convex/gmailWatcher.test.ts`, connector OAuth tests where present, and tool
execution tests that cover the registered `gmail.read` and `gmail.reply`
handlers.

## OAuth Contract

OAuth is no longer only schema scaffolding. The current implementation has a
real Google provider path:

1. The connector detail page starts `beginConnectorOAuth`.
2. `aiTools.ts` creates a pending `toolConnectorOAuthConnections` row with a
   single-use random state and an authorize URL.
3. `/api/connectors/oauth/authorize` validates the pending state and redirects
   to Google with the configured scope and callback URL.
4. `/api/connectors/oauth/callback` validates state, exchanges the code
   server-side, stores encrypted access/refresh tokens in
   `connectorOAuthTokens`, marks the connector connected, and redirects back to
   the connector detail screen.
5. Runtime callers use `internal.connectorOAuth.getConnectorAccessToken`, which
   refreshes expiring tokens before returning an access token.
6. `connector-oauth-token-refresh` catches long-idle tokens before expiry.
7. Disconnect schedules `revokeAndDisconnect`, revokes at Google, deletes token
   ciphertext, and marks the connector disconnected.

Do not add a client-callable token reader. Token rows are ciphertext only, and
the intended boundary is that only internal functions can read and decrypt them.

Required deployment values are:

- `CONNECTOR_GOOGLE_CLIENT_ID`
- `CONNECTOR_GOOGLE_CLIENT_SECRET`
- `CONNECTOR_TOKEN_ENCRYPTION_KEY`

`scripts/validate-setup.mjs` checks that connector OAuth is either fully
configured or absent, not partially configured.

## Tool Execution

`convex/aiToolExecutionService.ts` registers concrete handlers:

- `gmail.read` resolves the connector through the invoked tool or company
  context and calls `internal.gmailConnector.readMailbox`.
- `gmail.reply` accepts a Gmail message id and body only. It never accepts a
  recipient address from the model. The recipient is read from the original
  Gmail message on the server.

The connector is tenant-restricted. Keep tenant ownership on the connector
install and tool execution context; do not let model arguments select a company
or mailbox.

## Mailbox Watcher

`convex/gmailWatcher.pollMailboxes` lists installed, active, connected
`google-gmail` connectors with company scope. For each connector it reads
`in:inbox` summaries, records each Gmail message id in `mailboxMessages`, and
processes only messages whose record says `PROCESS`.

Skip rules are fail-closed:

- sent mail from the mailbox
- Gmail spam
- Gmail promotions
- drafts
- messages with a `List-Unsubscribe` header
- no-reply, do-not-reply, bounce, postmaster, and mailer-daemon senders

The decision step reads the whole thread, not only the newest message, then
searches knowledge twice: once for the thread topic and once for the latest
point. This keeps bare follow-ups such as "that did not help" grounded in the
earlier context without losing the latest question.

The model response is structured as `{ reply, needsHuman, language }`. The
system prompt requires the reply to use only company knowledge, write in the
sender's language, avoid invented facts, avoid bespoke commitments, and mark
`needsHuman` when the knowledge does not settle the request.

`dressReply` adds the greeting, thank-you, Ask Hakken sign-off, workspace name,
and AI disclosure in code. The model does not own those legal and product
truthfulness lines.

## Reply Rails

`replyToMessage` owns the rails beyond the model's reach:

- The original Gmail message is fetched server-side.
- The recipient is `Reply-To` or `From`; model arguments cannot provide an
  address.
- Messages with the `SENT` label are refused.
- No-reply addresses are refused.
- Replies stay in the original Gmail thread with `In-Reply-To`, `References`,
  and Gmail `threadId`.
- A conversation cannot be auto-answered again until the short anti-loop gap has
  passed.
- A thread cannot exceed `THREAD_DAILY_REPLY_CAP`.
- A mailbox cannot exceed `DAILY_REPLY_CEILING`.

When a rail blocks an automatic reply and the connector has company scope, the
handler creates a task instead of failing silently.

## Data Model And Retention

Relevant schema tables and fields:

- `toolConnectors`: Gmail connector install, OAuth status, connected account,
  scope, company ownership, and active/test state.
- `toolConnectorOAuthConnections`: pending, connected, error, and disconnected
  OAuth connection metadata.
- `connectorOAuthTokens`: ciphertext access and refresh tokens plus expiry and
  scopes.
- `mailboxMessages`: connector id, company id, Gmail message id, thread id,
  sender, subject, decision, optional decision reason, optional task id,
  optional replied timestamp, and timestamps.
- `tasks`: follow-up work when a human needs to answer.
- `wikiPages` and related wiki tables: customer-page rewrite handoff after a
  known customer's email exchange.

`mailboxMessages` intentionally stores the sender and subject, not the full
message body. The body is read from Gmail when processing the message and is
shortened before being placed into a task.

The purge pipeline includes `mailboxMessages`; `purgeScheduleService.ts` sets a
90-day default retention for that ledger because it contains sender addresses
and subjects.

## Wiki And Task Handoff

If the sender matches an existing customer, the watcher reads the rendered
customer Wiki page and passes it into the reply decision as context. After a
successful reply, it schedules `internal.wikiActions.rewriteCustomerPageAfterEvent`
with source `EMAIL:<gmail id>` so the page can learn from the exchange.

When `needsHuman` is true, a task is created with a bounded detail field. The
assignee is resolved through the shared inbound handoff helper used by telephony
so email and phone can route to the same responsible person.

## Implementation Caveats

Current code proves Phases A-C of the Gmail plan. Phase D live proof still
depends on a real dedicated mailbox and deployment credentials. Do not document
live customer readiness from code alone. Treat connector marketplace presence as
separate from a connected, tested mailbox.

If a future connector reuses the OAuth plumbing, keep provider-specific details
inside `connectorOAuthProviders.ts` and connector-specific runtime behavior in
its own handler module. Do not weaken the Gmail-specific reply rails to make a
generic mail-send abstraction easier.
