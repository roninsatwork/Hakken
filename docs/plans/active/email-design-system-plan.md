# Email Design System Plan

Last reviewed: 2026-07-31
Status: Active. Single source of truth for **every email the platform sends**.
When this plan and any other plan disagree about email rendering, this plan wins.
Owner: Anthony

Standing visual reference (keep updating this same artifact URL, never mint a
new one): https://claude.ai/code/artifact/1aa3075c-7a44-4de9-bf27-832005dd0257

## Scope And Rules

**In scope:** every outbound email — platform alerts, approval requests, invites,
agent notifications, workflow email nodes — plus the sender identity, the plain
text alternative, and the send-time branding resolution they share.

**Out of scope:** in-app notifications, the assistant's own messages, and
anything the movement demo sends. Also out of scope: adding new email *triggers*.
This plan changes how existing mail looks and reads, not when it fires — with the
single exception of the all-clear digest in Phase 7, which is a fatigue fix.

**Working rules:**
- Work on branch `dev`. Read `AGENTS.md` before starting.
- Do not commit or push without Anthony asking.
- Node 24.18.0 for trusted checks; `verify:env` enforces the baseline.
- Every item carries an acceptance test. "It looks right" is not acceptance.
  Rendering is asserted on the returned HTML string, not by eye.
- No real domain may be hardcoded. The footer credit is the literal text
  "Powered by Ronins"; every URL comes from `BASE_URL` or settings.

## Why This Plan Exists

Anthony, 2026-07-31, on receiving a system health alert: *"we have a lovely
beautifully designed web page and a great looking app — but the emails are not
good."*

The alert in question opened with twelve metrics, eight of them zero, then a
four-column table whose widest column dumped raw provider JSON — the same 400
error four times, because nothing groups repeats. It arrived from
`onboarding@resend.dev`.

The underlying problem is not that one template is ugly. **There is no email
layer.** Four call sites each hand-roll their own HTML at three different levels
of care, and one of them accidentally became the house style.

| Surface | Builder | State today |
| --- | --- | --- |
| Platform alerts | `convex/platformAlertService.ts:507` | Bare `<div><ul><table>`, zero styling. Sent from `convex/analyticsCron.ts:1458`. |
| Invites | `convex/invites.ts:250` | The only designed one. Full HTML doc, dark card, button, footer. **Interpolates `template.headline` and `template.body` unescaped** (`:270-271`). |
| Agent notifications | `convex/aiToolNotificationService.ts:122` | Escapes correctly, but emits bare `<p>` tags with no styling. Sent from `convex/aiToolExecutionService.ts:563`. |
| Workflow email nodes | `convex/workflowRuntime.ts:133` | Sends `html: body` raw — unwrapped and unescaped. |

Two further findings from the audit:

- `buildPlatformAlertEmailHtml` (`platformAlertService.ts:469`, the analytics-only
  variant) is **referenced only by its own test**. It is dead in production and
  duplicates the system-health builder almost line for line.
- `ResendEmailPayload` (`resendEmailService.ts:5`) accepts only `html`. No email
  the platform sends has a plain text alternative.

## The Decision

**Forest.** The shell is the product's own forest panel — the website's colour at
the app's value — not the website's cream and not a neutral dark.

Three reasons, recorded so this is not relitigated:

1. **Audience.** Every one of these messages goes to someone who already has an
   account. The website's job is persuading strangers; that is not this job.
2. **Recognition.** The app is neutral dark. A dark email with no colour in it
   looks like every other SaaS alert in the inbox. Forest is recognisably Sonae.
   `public.css:57-60` already states the logic: forest reads as a *colour*, not
   as dark mode.
3. **Survival.** Outlook and Apple Mail force-invert light emails in dark mode
   with no opt-out — that inversion is what mangled the screenshot that started
   this. A dark design is already close to the inverted result and degrades
   gracefully.

The existing invite email is already dark (`#0A0A0A` / `#121212`). This is
therefore a tint and a consolidation, not a reversal.

## Design Contract

Fixed structure, top to bottom. A caller supplies content for slots 2–4 and
**never writes markup** — that constraint is the point of the whole plan.

| # | Slot | Rule |
| --- | --- | --- |
| 1 | Header | Wordmark and message kind. Drawn in HTML, never an image. |
| 2 | Verdict | What happened, in one sentence. Never a metric dump. |
| 3 | Evidence | Stat tiles first, then one card per real event. Severity in a left stripe. |
| 4 | Action | Exactly one primary route back into the app, deep-linked to the record. |
| 5 | Footer | Scope covered, how to change or stop these, "Powered by Ronins". |

**Palette** — all values already exist in `src/app/(public)/public.css`:

| Token | Hex | Use |
| --- | --- | --- |
| Forest | `#103e33` | Card ground |
| Forest deep | `#0b2b23` | Outer page |
| Card inset | `#0c2c24` | Tiles, signal cards |
| Cream | `#fbf7f0` | Type, secondary buttons |
| Sage | `#a8d4b8` | Passed / healthy |
| Sand | `#efd49b` | Needs attention |
| Blush | `#f5c4b2` | Failed |
| Orange | `#ff5a1f` | The one action per email |

The sage/sand/blush ramp is not new — it is the three-band colouring already used
on the runs chart in the website hero (`ProductHero.tsx:36`).

## Client Support Matrix

Anthony, 2026-07-31: *"this has to work across all devices including legacy
Outlook."* That is the binding constraint on the whole build, so it is stated as
tiers with explicit obligations rather than left as a hope.

| Tier | Clients | Obligation |
| --- | --- | --- |
| **A — must be correct** | Outlook 2007/2010/2013/2016/2019 and Microsoft 365 desktop (Windows, Word engine); Outlook.com; Gmail web and mobile apps; Apple Mail macOS and iOS | Pixel-correct at 600px. Every element legible with images off and in forced dark mode. |
| **B — must be usable** | Outlook for Mac, Outlook mobile, Yahoo, Samsung Mail, Thunderbird, ProtonMail | Layout may simplify. No overlap, no clipping, no unreadable contrast. |
| **C — must not break** | Watches, screen readers, plain-text-only clients, webmail previews | The `text` part carries the whole message including every action URL. |

**Legacy Outlook is Tier A and it renders through Microsoft Word.** That is not
"an old browser" — it is a word processor. The consequences are design decisions,
not implementation details:

- **No `border-radius`.** Word squares every corner. The design must be
  acceptable with square cards — so radius is decoration, never a carrier of
  meaning. The one exception is the primary button, which gets a VML
  `<v:roundrect>` fallback inside a `<!--[if mso]>` conditional.
- **No `letter-spacing`.** Our uppercase tracked labels collapse to normal
  tracking. They must still read as labels through size, weight and colour
  alone — do not let tracking do that work.
- **No `text-transform`.** Found while building Phase 1: a label styled
  uppercase renders in whatever case it was authored in, so the wordmark and
  every kicker would come out mixed case in legacy Outlook while looking correct
  everywhere else. Case the string itself — `renderEmail` does this in `up()`,
  and a test asserts the rendered HTML contains no `text-transform` at all.
- **No flexbox, no grid, no `max-width`, no CSS custom properties, no
  `background-image`, no gradients, no `position`.** Layout is nested
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` with
  fixed pixel `width` attributes. Backgrounds are flat `bgcolor` attributes.
- **Padding and margin are unreliable outside `<td>`.** All spacing lives on
  table cells or on spacer rows. Never on a `<div>`.
- **Line height needs `mso-line-height-rule: exactly`**, or Word adds its own
  leading and the stat tiles drift out of alignment.
- **The 120 DPI bug.** Windows at >96 DPI scales fixed widths and breaks the
  600px column. The `<o:OfficeDocumentSettings><o:PixelsPerInch>96` conditional
  block in `<head>` is mandatory, not optional.
- **Images need `display:block; border:0`** or Word inserts phantom spacing
  beneath them.

Other Tier A constraints:

- **Gmail clips at ~102KB.** Everything after the cut becomes "View entire
  message". A long alert is exactly the message most at risk, so the shell caps
  rendered signal cards and links to the rest rather than growing without bound.
- **Gmail strips `<style>` for non-Google accounts.** Every style that matters is
  an inline attribute; a `<style>` block may only carry progressive enhancement
  that nothing depends on. The dark-mode colour lock is the one such block, and
  it qualifies because every rule in it restates a colour already inline on the
  same element — strip it and the design is unchanged.
- **Forced dark mode.** Outlook.com exposes `[data-ogsc]` / `[data-ogsb]` hooks;
  Windows Outlook and Apple Mail invert with no hook at all.

  This plan originally bet that choosing forest meant "the inverted result stays
  close to the intended one". **That bet was wrong, and is now corrected.**
  Anthony, 2026-07-31, comparing the sign-in mail in Apple Mail and Outlook side
  by side: *"the colours on outlook are terrible and hard to read [...] this to
  work in light and dark mode."*

  Outlook rendered the primary button white-on-red. Dark ink on `#ff5a1f` is not
  decoration — white on that fill measures 3.12 and fails AA, which is the whole
  reason `onOrange` exists. Forced dark mode was silently undoing the one
  contrast decision the email most depends on.

  The correction is `COLOUR_LOCK` in `emailLayoutService.ts`: a `prefers-color-scheme`
  block for Apple Mail and iOS, plus `[data-ogsc]`/`[data-ogsb]` rules for
  Outlook.com and new Outlook on Mac and Windows. Legacy Windows Outlook has no
  dark mode for message bodies and Gmail's apps rewrite without tagging; both
  render the inline colours and were already correct.

  **One design, locked in both appearances.** The email does not switch to a
  light variant in light mode — Gmail ignores `prefers-color-scheme` entirely, so
  a switching design would work in Apple Mail and nowhere else. Forest renders
  identically whichever way the reader has their client set.
- **No web fonts.** Bricolage will not load. The mail face is the system stack.
- **Contrast is measured, not judged.** Anthony, 2026-07-31, on the first real
  invite: *"the email design makes it hard to read."* Two pairs were failing
  WCAG AA — the muted tone carrying the footer and every small-print row
  (4.31), and white on the orange button (3.12), the one element the email
  exists to get clicked. `emailLayoutService.test.ts` now computes the ratio for
  every foreground/ground pair and fails below 4.5, and asserts nothing renders
  below 11px. An email is read once, on someone else's screen, at whatever
  brightness they have: there is no hover state or zoom to recover a bad pair.
- **Images cannot carry meaning.** External images are blocked by default — the
  screenshot that started this shows the banner. The wordmark is a coloured table
  cell and a character.
- **600px fixed width**, single column, no horizontal scroll. Below 600px the
  single column is fluid; there is no second breakpoint to get wrong.

The standing mockup uses modern CSS so it stays readable as a design reference.
**Only its structure, palette and copy transfer.** Do not port its CSS.

## Phases

### Phase 0 — Fix the sender — DONE 2026-07-31 (Anthony)

Verified against both deployments:

| | Production | Dev (`silent-axolotl-121`) |
| --- | --- | --- |
| `RESEND_FROM_EMAIL` | `Sonae Auth <auth@ronins.co.uk>` | `anthony@ronins.co.uk` |
| `SITE_URL` | `https://sonae.ronins.co.uk` | `http://localhost:3000` |

DNS on `ronins.co.uk`:

- **DKIM published** — `resend._domainkey.ronins.co.uk` carries a key, so Resend
  signs as the root domain and DKIM aligns with the `From` header.
- **SPF for Resend** — `send.ronins.co.uk` is `v=spf1 include:amazonses.com ~all`
  (Resend sends through SES). The root SPF stays Google-only, which is correct:
  SPF is checked against the envelope sender, and relaxed alignment treats the
  subdomain as the same organizational domain.
- **DMARC present but monitoring only** — `p=none; rua=mailto:admin@ronins.co.uk`.

- [x] Sender is on a domain we control, in both deployments.
- [x] SPF, DKIM and DMARC records exist and are consistent with Resend.
- [ ] Confirm a real send passes SPF and DKIM at the receiving end. Records being
      published is not the same as headers passing; only a delivered message
      proves it. See Phase 8.

**Two follow-ups, neither blocking:**

- [ ] **The display name is wrong now.** `Sonae Auth <auth@ronins.co.uk>` was set
      when authentication was the only mail this platform sent. All four surfaces
      now go through it, so an agent notification about property matches arrives
      from "Sonae Auth". Suggest `Sonae <hello@ronins.co.uk>` or a per-surface
      sender. This is a user-visible label, not plumbing.
- [ ] **`AUTH_EMAIL` is a landmine.** Both deployments still hold
      `Sonae <onboarding@resend.dev>`. It is currently inert —
      `EMAIL_SENDER_ENV_VARS` puts `RESEND_FROM_EMAIL` first — but if that
      variable is ever cleared, every email silently reverts to Resend's shared
      sandbox with no error. Clear it, or set it to the same address.

### Phase 1 — The shell — DONE 2026-07-31

Built as `convex/emailLayoutService.ts` with 26 tests in
`convex/emailLayoutService.test.ts`. Typecheck and lint clean; the existing
alert, notification and Resend tests still pass.

- [x] Add `convex/emailLayoutService.ts` exporting `renderEmail(content)`, where
      `content` is structured data: `{ kind, verdict, lede, stats[], cards[],
      actions[], quiet[], footer }`. It returns `{ html, text }`.
- [x] Table-based layout, inline style attributes, 600px, forest palette resolved
      to literal hex at render time. Nested
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0">`
      throughout; spacing on `<td>` only.
- [x] Ship the Word-engine head block: the
      `<o:OfficeDocumentSettings><o:PixelsPerInch>96` conditional, `bgcolor`
      attributes alongside every background style, and
      `mso-line-height-rule: exactly` on every text cell.
- [x] Primary button rendered twice: a VML `<v:roundrect>` inside
      `<!--[if mso]>` and the styled anchor outside it, so legacy Outlook gets a
      real rounded button and everything else gets the CSS one.
- [x] Cap rendered cards (default 8) and link to the rest, so a noisy alert
      cannot cross Gmail's ~102KB clip threshold.
- [x] All interpolation escaped at the boundary. No caller can inject markup
      because no caller supplies markup.
- [x] Emit the plain-text part from the same content object, so the two can never
      drift.
- [x] Extend `ResendEmailPayload` (`resendEmailService.ts:5`) with `text`.

**Acceptance:** unit tests assert that a `<script>` tag in every content field
arrives escaped in both parts; that the HTML contains exactly one `<style>`
block which declares nothing but colour, introduces no hex outside
`EMAIL_PALETTE`, and restates only values already inline on the elements it
targets; that it contains no `<img>`, no `flex`, no `grid`, and no `var(--`; that every `<table>` carries
`cellpadding="0" cellspacing="0" border="0"`; that the `PixelsPerInch` block and
the VML button fallback are present; that a 40-card fixture renders 8 cards plus
an overflow link and stays under 100KB; and that the text part contains every
verdict, stat and action URL present in the HTML.

### Phase 2 — Platform alerts — DONE 2026-07-31

`buildSystemHealthAlertEmail` in `convex/platformAlertService.ts` renders
through the shell; `convex/analyticsCron.ts` sends `{subject, html, text}`.
Both hand-rolled builders are gone (82 lines). Full suite green: 446 files,
3,507 tests.

The visible win. Content rewrite and restyle together — the content is the larger
half of the problem.

- [x] Group repeated signals. Four identical `thought_signature` errors are one
      fault seen four times: emit `{ cause, occurrences, agent, firstAt, lastAt }`.
- [x] Drop every zero from the body. Replace the eight zero rows with one line:
      "Also checked and clear: …".
- [x] Never render raw provider JSON. Extract the human-readable clause; the
      payload lives behind the deep link.
- [x] Add a deep link per signal into the agent log for that run. The alert is
      currently a dead end — this is the single highest-value addition.
- [x] Move runbook text to small print under its signal, not a fourth column.
- [x] Subject line from content, not shape: "Sonae · 2 issues need attention".
- [x] Resolve `platformName` from settings instead of the hardcoded `[Sonae]`
      prefix at `:439` and `:461`.
- [x] Delete `buildPlatformAlertEmailHtml` (`:469`) and its test — dead code.

**Acceptance:** given the 2026-07-29 report that produced the screenshot, the
built email contains two signal cards not six rows, contains no `{"error"`
substring, contains one deep link per signal, and its subject names the count of
*issues* rather than *signals*.

### Phase 3 — Invites — DONE 2026-07-31

The inline `<!DOCTYPE html>` block is gone, and with it the local
`escapeEmailText` that only ever served its footer.

- [x] Render through the shell. Delete the inline `<!DOCTYPE html>` block at
      `invites.ts:250-277`.
- [x] **Fix the injection**: `template.headline` and `template.body` are
      interpolated unescaped at `:270-271`. Escaping comes free once content goes
      through the shell, but add the regression test explicitly.

**Acceptance:** a template whose headline is `<img src=x onerror=alert(1)>`
renders escaped. Existing invite dispatch tests still pass.

### Phase 4 — Agent notifications — DONE 2026-07-31

`renderNotificationHtml` is replaced by `buildAgentNotificationEmail`.
**Deviation from the written acceptance:** the plan said to keep
`renderNotificationHtml` and wrap its output. That would have meant a caller
handing the shell pre-built markup, which is the one rule the shell exists to
enforce. The function is gone and its two escaping tests now assert against
the shell output instead, so the property they protected is still proven.

- [x] Render `renderNotificationHtml` output through the shell as the body slot,
      keeping the existing paragraph splitting and escaping.
- [x] Footer states plainly that an agent sent this and that it can only reach
      people already in the workspace — the existing recipient policy, surfaced.

**Acceptance:** the escaping tests in `aiToolNotificationService.test.ts:130` and
`:136` still pass against the wrapped output.

### Phase 5 — Workflow email nodes — DONE 2026-07-31

`workflowRuntime.ts` no longer sends `html: body`.

- [x] Route `workflowRuntime.ts:133` through the shell instead of `html: body`.
- [x] Escape the body — it is author-supplied and currently sent raw.
- [x] Approval-shaped workflow emails get the approve/review action pair.

**Acceptance:** a workflow body containing markup is escaped in the delivered
HTML, and the email node's existing execution tests still pass.

### Phase 6 — Preview harness — DONE 2026-07-31

`GET /api/email-preview` renders all five fixtures; `?raw=<key>` returns the
HTML source and `&format=text` the text part. Unreachable in production
unless `EMAIL_PREVIEW_ENABLED=1`. The hostile fixture fires 11 signals
against the cap of 8, so the overflow line is always on screen.

- [x] A dev-only route rendering every template with fixture content, so any
      future change is visible without sending mail.
- [x] Include a deliberately hostile fixture (markup in every field, a 400-char
      error string, twenty signals) so overflow and escaping are always on screen.

**Acceptance:** the route renders all five templates and is unreachable in
production.

### Phase 7 — Alert fatigue — NOT NEEDED, premise was wrong

**Correction, 2026-07-31.** This phase was written on my claim that the platform
sends an all-clear email when nothing is wrong. It does not.
`dispatchPlatformAlerts` returns early on `!decision.shouldAlert`
(`convex/analyticsCron.ts:1425`), so a clean report sends nothing. The
`"[Sonae] Platform alerts healthy"` subject exists on the decision object but is
never dispatched — that string is what I mistook for a send.

The cron is daily at 00:25 UTC (`convex/crons.ts:120`), which matches the 01:25
BST timestamp on the alert that started this work.

So there is no fatigue problem to fix. Adding a weekly digest would be adding a
**new email trigger**, which this plan's scope explicitly excludes — and it is a
product decision, not a cleanup. Left for Anthony to call.

- [ ] **Decision needed:** does a weekly "here is what was checked and it was all
      fine" digest earn its place? Argument for: it proves the alerting is alive,
      so silence can be trusted. Argument against: it is a new recurring email
      nobody asked for, and the shell now makes the real alerts readable enough
      that confidence may not need propping up.

### Phase 8 — Client proof — REDUCED 2026-07-31

Anthony: *"dont worry about 2016 proof i dont have those we can remove those
from the plan."* No Litmus or Email on Acid account, no Windows VM, so the
screenshot grid and the Outlook 2016 gate are struck. What remains is what can
actually be done here, plus what is now carried by construction.

Removed: the Tier A screenshot grid, the Outlook 2016 gate, the 125%/150%
display-scaling check.

**What replaces it.** The Word-engine contract is enforced by unit tests rather
than by looking — no load-bearing `<style>`, no `<img>`, no flex, no grid, no custom
properties, no `max-width` in the layout, no `text-transform`, presentation-table
attributes on every table, `mso-line-height-rule` on every text cell, the
`PixelsPerInch` conditional, and the VML button fallback. That is weaker than a
render, because it proves the markup is *correct* rather than that it *looks*
right. Stated plainly so nobody later mistakes a green suite for having seen it.

- [x] Enforce the legacy Outlook contract in `convex/emailLayoutService.test.ts`.
- [x] Provide the HTML source through the preview route, so any render service
      can be used later without new tooling.
- [ ] Send one real message to a seeded address at each major provider and
      confirm it lands in the inbox, not spam, with SPF, DKIM and DMARC passing.
      **Blocked on Phase 0.**
- [ ] Open the preview in whatever mail clients are actually to hand, with images
      off, and look at it. Cheap, and catches anything the assertions cannot.

**Residual risk, accepted:** nothing has been rendered by the Word engine. If a
customer on legacy Outlook reports a broken layout, that is the gap — and the
preview route gives us the source to hand to a render service at that point.

### Phase 9 — Documentation — DONE 2026-07-31

`docs/developer/email-system.md` and `docs/end-user/emails.md`, both indexed.

- [x] Document the shell and the client matrix in `docs/developer/`, including
      the rule that callers supply content and never markup.
- [x] Add the end-user page covering what each email means and how to turn it off.
- [x] Full suite, lint, typecheck.

## Open Questions

- ~~**Deep-link target.**~~ **Resolved 2026-07-31: per-agent log.** Each card
  links to `/admin/agents/<targetId>/logs`. This needed a new optional
  `targetId` on `OperationalFailureExample`, populated at the five agent-typed
  sites in `analyticsCron.ts` (agent errors, failed transactions, stale runs,
  pending approvals, failed tool calls) — `id` there is the failing *record*,
  which is not routable. Signals with no agent target render no link rather
  than a guess. A dedicated alert-detail screen remains the better answer if
  alerts ever carry more than a handful of signals.
- **Sending domain.** Which domain the mail sends as, and whether alerts and
  agent notifications share it or split (`alerts@` vs `agents@`). Needed for
  Phase 0.

## Decisions Log

- **2026-07-31 — dark ink on the orange button, not white.** White measured
  3.12 against `#ff5a1f`. Darkening the fill until white passed would have
  changed the brand colour; darkening the *label* keeps `#ff5a1f` exactly and
  measures 5.76. The muted tone moved `#8ba099` → `#a3b7ae` (4.31 → 5.65),
  chosen to clear AA while staying visibly quieter than body copy — a test
  asserts that hierarchy so a future fix cannot just make everything white.

- **2026-07-31 — no all-clear email exists.** I told Anthony the platform was
  sending nothing-happened mail and should switch to a digest. It never was;
  I read a subject string that is built but never dispatched. Recorded because
  a plan written on a wrong premise is worse than no plan.
- **2026-07-31 — client proof reduced to what is available.** No render
  service and no Windows VM, so the Outlook contract is carried by unit tests
  and the residual risk is written down rather than papered over.

- **2026-07-31 — every send now carries a plain-text part.** All four call
  sites pass `{html, text}` built from one content object, so the two cannot
  drift. `ResendEmailPayload.text` can stop being optional once nothing else
  sends mail.

- **2026-07-31 — provider payloads arrive already truncated.** The first
  version of the message extractor required balanced JSON quotes and so fell
  back to printing the raw envelope — exactly the failure being fixed.
  `truncateHealthSummary` cuts these strings upstream, so the JSON is usually
  unterminated. The extractor now stops at the first unescaped quote or the
  end of the string. The regression test uses the verbatim payload from
  Anthony's 2026-07-31 alert.

- **2026-07-31 — `text-transform` joins the banned list.** Building Phase 1
  surfaced that Word ignores it, so uppercase labels would have shipped
  mixed-case to the one client this plan exists to satisfy. Casing now
  happens in the string. This is the argument for the whole plan in
  miniature: four hand-rolled templates could each get this wrong
  separately, and no test would have noticed.

- **2026-07-31 — Forest, not cream, not neutral dark.** Anthony asked whether
  emails should follow the app or the website. Neither: forest is the website's
  colour at the app's value. Recorded with reasoning under "The Decision".
- **2026-07-31 — One shell, all five surfaces.** Anthony: *"we need that UI to be
  across all the emails we send."* Callers supply content, never markup.
