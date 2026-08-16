# Email System

Every email the platform sends renders through one shell:
`convex/emailLayoutService.ts`. This document is the contract for changing it.

Governed by [Email Design System Plan](../plans/active/email-design-system-plan.md).
Sender identity and branding resolution are covered separately in
[Email Branding](./email-branding.md). Magic-link URL construction is covered by
`convex/magicLinkUrlService.ts` and [Route Protection And Authentication](./route-protection-and-authentication.md).
The connected inbound Gmail mailbox is a separate channel covered by
[Gmail Mailbox](./gmail-mailbox.md); it replies through Gmail itself rather than
through the shared Resend email shell.

## The one rule

**Callers supply content. Callers never supply markup.**

`renderEmail(content, options)` takes structured data and returns
`{ html, text }`. There is no way to pass HTML through it, which is deliberate:
before this existed, four call sites hand-rolled their own markup, and the two
that looked worst were not the two with escaping bugs. Removing the ability to
pass markup removes both failure modes at once.

If you find yourself wanting to inject a tag, add a field to `EmailContent`
instead.

## Content shape

| Field | Purpose |
| --- | --- |
| `kind` | Uppercase label beside the wordmark: "System health", "Invitation" |
| `preheader` | Inbox preview text. Falls back to `lede`, then `verdict` |
| `verdict` | What happened, in one sentence. Never a metric dump |
| `lede` | One supporting paragraph |
| `paragraphs` | Prose body. Single newlines become breaks |
| `stats` | Up to three tiles. `tone` drives colour |
| `facts` | Term/value rows for a summary block |
| `cards` | One per real event. `severity` drives the left stripe. `link` routes to the record |
| `overflow` | Shown when the card list was capped |
| `actions` | Buttons. The first is primary |
| `quiet` | Small print under the action |
| `footer` | Scope covered, how to change or stop these, the credit line |

Anything optional that is absent renders nothing — a minimal message is just
`{ kind, verdict }`.

## Who sends what

| Surface | Builder | Renders |
| --- | --- | --- |
| Platform alerts | `buildSystemHealthAlertEmail` in `convex/platformAlertService.ts` | Sent from `convex/analyticsCron.ts` |
| Invites | `convex/invites.ts` calls `renderEmail` directly | Template record supplies headline and body |
| Agent notifications | `buildAgentNotificationEmail` in `convex/aiToolNotificationService.ts` | Sent from `convex/aiToolExecutionService.ts` |
| Workflow email nodes | `convex/workflowRuntime.ts` calls `renderEmail` directly | Body is author-written and template-substituted |
| Magic-link and one-time-code auth | Convex Auth email provider plus `convex/oneTimeCodes.ts` | Sign-in links route through `/verify`; typed codes are scanner-safe |

All four pass `{ html, text }` to `sendResendEmail`. A send without a text part
scores worse with spam filters and is unreadable on a watch or through a screen
reader, so do not add a fifth caller that omits it.

## Accessible status colour contract

`EMAIL_PALETTE` in `convex/emailLayoutService.ts` is part of the implementation
contract, not decoration. The current shell is neutral charcoal and the status
signals are:

| Meaning | Token | Hex | Notes |
| --- | --- | --- | --- |
| Healthy / link | `blue` | `#8fc6ff` | Used for good stats and all links. |
| Warning | `gold` | `#fae19e` | Deliberately the brightest signal. |
| Critical | `red` | `#ee6352` | Darker than warning so severity survives without hue. |

Do not reintroduce a green-vs-red status ramp. The 2026-08-04 email accessibility
fix removed the previous forest green/red signalling because red/green colour
blindness made the healthy and failed states collapse into the same perceived
signal. Warning and critical must differ by brightness, not only hue, and colour
must never be the only carrier of severity.

The renderer enforces this in two ways:

- `tone` and severity helpers return both a colour and a dark-mode lock class,
  so clients that rewrite inline colours still preserve the signal.
- A warning or critical card without a caller-supplied badge renders the severity
  as text (`Needs attention` or `Critical`) in both HTML and plain text.

Tests in `convex/emailLayoutService.test.ts` assert WCAG AA contrast, pairwise
signal separation under deuteranopia and protanopia simulation, a brightness gap
between warning and critical, and the no-green signal rule. If a product change
needs new status language or a new tone, update the renderer, preview fixtures,
plain-text output, and those tests together.

## Why the markup looks like 2005

Legacy Outlook renders through Microsoft Word, not a browser. That is not an old
browser engine — it is a word processor, and it drives real design decisions:

- **Nested presentation tables** with fixed pixel widths. No flexbox, no grid,
  no `max-width`, no `position`, no custom properties, no gradients.
- **Spacing on `<td>` only.** Margins and padding on a `<div>` are unreliable.
- **`mso-line-height-rule:exactly` on every text cell**, or Word adds its own
  leading and the stat row stops lining up.
- **No `border-radius`.** Corners are square in Outlook. Radius is decoration
  here, never meaning. The primary button gets a VML `<v:roundrect>` fallback
  inside an `<!--[if mso]>` conditional because that is the one place roundness
  reads as broken when lost.
- **No `text-transform`.** Word ignores it, so uppercase labels would render
  mixed-case there while looking correct everywhere else. `up()` cases the
  string itself.
- **No `letter-spacing`.** Tracking collapses. Labels read through size, weight
  and colour instead.
- **The `<o:PixelsPerInch>96` head conditional is mandatory.** Windows above
  96 DPI silently rescales fixed widths and breaks the 600px column — and it
  does not reproduce at 100% scaling, so without this it ships unnoticed.

Other client constraints:

- **No `<style>` element at all.** Gmail strips it for non-Google accounts, so
  anything that mattered there would matter inconsistently.
- **Nothing is an `<img>`.** External images are blocked by default, so an image
  can never carry meaning. The wordmark is a coloured table cell and a letter.
- **Cards cap at `MAX_CARDS` (8)** with an overflow link, so a noisy alert
  cannot cross Gmail's ~102KB clip threshold.
- **URLs are filtered to http(s) and mailto.** An action URL can reach the shell
  from a workflow definition or an agent's tool arguments, both of which are
  attacker-influenced.

These are enforced by tests in `convex/emailLayoutService.test.ts`, not by
convention. A change that breaks one fails the suite.

## Previewing

```bash
curl http://localhost:3000/api/email-preview
```

Renders every template side by side, built by the real code rather than a copy
of it. Add `?raw=<key>` for the HTML source and `&format=text` for the text
part — useful for pasting into a render service.

Keys: `alert`, `alert-hostile`, `invite`, `agent-notification`, `workflow`.

The `alert-hostile` fixture puts markup in every field, fires 11 signals against
the cap of 8, and uses an oversized provider payload. Check it after any change
to the shell — the failures worth catching are invisible in tidy sample data.

The route is unreachable in production unless `EMAIL_PREVIEW_ENABLED=1`.
`GET /api/email-preview` returns 404 in production unless explicitly enabled.
`?raw=<key>` returns HTML source as `text/plain`; `?raw=<key>&format=text`
returns the plain-text part. Keep the route dev-only unless there is a specific
deployment decision to expose it.

## Adding a new email

1. Build an `EmailContent` object. Lead with a verdict, not a metric.
2. Give it exactly one primary action that routes back into the app.
3. Pass `platformName` from settings. Never hardcode it.
4. Send both `html` and `text`.
5. Add a fixture to `src/app/api/email-preview/fixtures.ts` so it is visible
   without sending mail.
