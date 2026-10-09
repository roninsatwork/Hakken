# Gmail Mailbox — removed

Removed on 2026-10-09: Hakken does not use Gmail (Anthony: "can we disable
gmail this app will never use it"). Its every-minute watcher had been the
platform's largest use of compute, polling for mail that never came.

What went: the mailbox watcher and its schedule, the Gmail connector in the
catalogue and its read and reply tools, the mailbox ledger (`mailboxMessages`)
and its purge, the connection check that asked the inbox, and the company
Mailbox screen.

What stays:

- The shared connector consent flow, `convex/connectorOAuth.ts`, with its
  providers (`convex/connectorOAuthProviders.ts`) and token encryption
  (`convex/connectorTokenCrypto.ts`): Search Console and X use the same
  machinery, and any later OAuth connector would. No connector in the
  catalogue uses it today; `convex/connectorOAuth.test.ts` tests it with a
  stand-in connector of its own.
- The four mailbox Decisions in `convex/decisionRegistry.ts`, switched off and
  never asked: the Decision engine's own tests use them as examples.
- Past purge runs of the mailbox ledger, named in `purgeHistory`.

The design as it was is in git history before 2026-10-09 and in
[the Gmail inbox plan](../plans/active/gmail-inbox-plan.md).
