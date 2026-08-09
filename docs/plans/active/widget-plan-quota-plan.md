# Widget Messages Spend From The Company's Plan

Status: Done 2026-08-09, proven live in a browser the same day.
Owner: Anthony

## The decision

Anonymous widget traffic must be constrained by the plan the company is already
assigned — not by a new, separate cap. One pot: a message is a message, whether
it came from a signed-in user or a visitor on an embedded widget. Anthony's
call, 2026-08-09. It supersedes the earlier suggestion of a per-widget daily
ceiling: that would have been a second knob to configure and explain, when the
plan quota is the knob the business already prices and sells.

## What the code turned out to already do (premise correction)

This plan was written believing the widget path never touched the quota. That
was wrong, and the error is recorded here so the next reader trusts the code
over the plan's first draft. The widget client sends through the same
`api.chat.sendMessage` as signed-in chat; `resolveChatQuota` falls back to
`thread.companyId` for anonymous callers; `createWidgetThread` stamps the
owning company onto every widget thread. Counting, refusal, and the nightly
budget alert therefore already covered widget traffic. What did not exist was
any test proving it — the only quota test was a signed-in one — and the
refusal itself had two real defects:

1. **It leaked billing state to strangers.** An anonymous visitor was told
   "your company has exhausted its AI allocation … ask your administrator" —
   the company's billing state, shown to someone with no company and no
   administrator.
2. **It skipped the PII firewall.** The refused message was stored raw, while
   every accepted message is redacted. Refusal was the one path that could
   write an unredacted email address into a transcript.

## What was done (2026-08-09)

- `quotaRefusalMessage` in `convex/chatService.ts`: anonymous widget visitors
  get an apology with no reason; signed-in users keep the informative message,
  since the plan is theirs to know about.
- Redaction moved above the quota gate in `convex/chat.ts`, so refused and
  accepted messages pass the same firewall.
- Four tests in `convex/chat.test.ts` (`widget visitors spend from the company
  plan`), all proven failing-then-passing against the pre-change code:
  - a visitor's message increments the company's usage;
  - an exhausted plan refuses without any of the words the in-company message
    uses (plan, allocation, administrator, company, exhausted), schedules no
    model call, and costs the company nothing;
  - a refused message is still PII-redacted when the firewall is armed;
  - `messageLimit: -1` is never refused by quota.

## Second pass, same day: locales and live proof

- **Italian refusal text — done.** The refusal row now carries
  `systemKey: "quotaRefusal"` (new optional field on `messages`), and the
  widget renders known system keys in the visitor's own browser language via
  `src/lib/widgetSystemMessages.ts` (en + it, stored English as the fallback
  everywhere else a transcript is read). Unit tests cover Italian variants
  (`it`, `it-IT`, `it-CH`), unknown languages, and unknown future keys.
  Honest limitation: this is the *only* visitor-language-aware string in the
  widget — the rest of its chrome is English with per-widget overrides. Making
  the whole widget speak the visitor's language is its own piece of work.
- **Live proof — done.** Staged an isolated zero-message company and widget in
  the dev deployment (temporary seeding function, since removed along with the
  staged records), opened the real widget in a browser, sent a message
  containing an email address. Observed: the neutral refusal, the address
  stored as `[EMAIL_REDACTED]`, and the company's usage counter unchanged at 0.

## Deliberately not done

- **Per-IP blocking.** Needs request-level context the mutation does not have.
  Separate decision.
- **Live proof of the nightly budget alert** including widget traffic. The
  code path is shared with signed-in chat (same counter, same cron), but the
  cron itself has not been watched firing against a running deployment.

## Noticed in passing, not changed

The chat path's PII firewall defaults to **off** (`defaultPiiConfig.enabled:
false` in `convex/chatService.ts`) while the agent runtime's defaults to **on**
(`DEFAULT_PII_CONFIG.enabled: true` in `convex/utils/pii.ts`). Two defaults for
the same policy, disagreeing. Whether chat should default on is a product
decision for Anthony, not something to flip inside an unrelated change.
