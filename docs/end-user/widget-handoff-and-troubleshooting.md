---
product: Hakken
documentation_type: User guide
feature_area: widget customer handoff and support
audience: customer support and workspace operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/widget-handoff-and-troubleshooting.md
last_reviewed: '2026-10-26T10:28:26+00:00'
reviewed_against: current implementation
status: Current
---
# Widget Handoff And Troubleshooting

> **Product:** Hakken · **Document type:** User guide · **Feature area:** widget customer handoff and support
> **Reviewed:** 26 October 2026, 10:28:26 GMT (Europe/London)
> **Source path:** `docs/end-user/widget-handoff-and-troubleshooting.md` · **Status:** Current

Widget handoff and troubleshooting covers the public embedded chat widget after it has been configured in Hakken. Use this guide before giving a customer an embed snippet, when a widget does not load on a host site, or when a support team needs to understand where widget conversations and failures appear.

For the widget feature overview, see [Embedded Widgets](./embedded-widgets.md). For white-label and domain readiness, see [Platform Operations Settings](./platform-operations-settings.md).

## Where To Find It

- `/admin/ai/widget`: global widget setup for super admins.
- `/admin/companies/[id]/widget`: company widget setup.
- `/sandbox/[widgetId]`: sandbox page for testing the public embed script.
- `/w/[widgetId]`: public iframe route loaded by the embed script.
- `/kiosk/[widgetId]`: full-screen receptionist screen when the widget has
  opted in.
- `/admin/companies/[id]/ai/chat-logs`: company chat logs, including widget-originated conversations.

The global widget is platform-wide. Company widgets belong to a specific tenant. Use the company widget for customer handoffs whenever the widget should be tenant-scoped.

## What To Review Before Handoff

Before sharing an embed snippet, confirm:

- the widget is active
- the widget name matches the customer surface
- allowed domains include the production host
- the allowlist is not broader than necessary
- primary color, logo, greeting, and placeholder match the handoff
- name and email gates match the support process
- conversation starters are appropriate
- the linked agent, knowledge, tools, and rules have been reviewed
- customer operators know where widget chat logs appear

Do not rely on the embed snippet alone as production readiness. Widget launch also depends on tenant settings, agent readiness, domain allowlists, and support ownership.

## Domain Allowlist

Allowed domains decide where the public widget may create conversations.

Current behavior:

- `*` allows all origins and should be reserved for deliberate broad testing
- concrete hostnames allow exact hosts and subdomains
- exact host matches are accepted
- subdomains of allowlisted hosts are accepted
- an empty allowlist denies embedding through the frame policy and does not authorize backend conversation creation
- the backend checks the signed observed host; a supplied source URL alone cannot authorize access
- blocked backend attempts are recorded as `BLOCKED_WIDGET_ACCESS` audit events
- widget thread creation also requires the server-minted embed pass generated
  when `/w/[widgetId]` is served, so a direct mutation call with an invented
  source URL is refused

Use restricted domains for production. Broad settings are useful for internal testing but should not be the default customer handoff posture.

## Sandbox Testing

Use `/sandbox/[widgetId]` before installing the snippet on a customer site. The sandbox loads the same public embed script into a simulated host page.

Check:

- the floating launcher appears
- popup greeting behavior is correct
- the iframe opens and closes
- branding and logo render correctly
- name and email gates appear only when expected
- conversation starters send the expected first message
- the reset action clears the browser's widget session
- sound behavior is acceptable

If the sandbox fails, fix the widget configuration before involving the customer's website.

## Embed Snippet

The integration tab shows a snippet like:

```html
<script src="https://your-hakken-host.example/embed.js" data-widget-id="..."></script>
```

Install it on the allowed host page. The script injects a floating launcher and opens `/w/[widgetId]` inside an iframe.

If the customer has a strict content security policy, they may need to allow the Hakken host for scripts, frames, images, and connections according to their deployment policy.

## Visitor Conversation Behavior

Visitors can open the widget, pass name/email gates when enabled, use conversation starters, send messages, and continue the same browser conversation through the browser's widget session.

Widget threads are stored with the widget id and source URL. Returning visitors on the same browser can continue the stored widget thread while the browser still has the widget session credential. If the browser has only part of the saved widget session, the iframe clears that partial state and starts a fresh thread. Resetting the widget or clearing site storage should remove the local session and start a new thread.

If a widget has a linked agent, visitor messages run with that agent context. If no agent is linked, the widget still creates a chat thread but does not force a dynamic agent id.

## Attachments

Anonymous widget uploads are restricted. The widget must be active, the target thread must belong to the widget, the browser must present the matching widget session credential, and each widget thread can request ten upload URLs, including abandoned or removed previews. Uploaded files are validated before finalization.

If a visitor cannot upload, check whether the widget is active, the thread belongs to the widget, the browser session is still valid, the quota has been reached, and the file type/size matches the widget attachment policy.

## Troubleshooting A Widget That Does Not Load

Check in this order:

1. Confirm the widget id in the snippet matches the saved widget.
2. Confirm the widget is active.
3. Test `/sandbox/[widgetId]`.
4. Confirm the production host matches the allowed domains. If testing broadly, confirm `*` is configured explicitly.
5. Check the browser console for blocked scripts, blocked frames, or content security policy errors.
6. Confirm the Hakken host is reachable from the customer page.
7. Check audit logs for `BLOCKED_WIDGET_ACCESS`.
8. Check company chat logs for created widget threads.

If the iframe shows a disabled or missing state, the widget is inactive, deleted, or not visible through the public config query.

If the iframe loads but no conversation can start, confirm
`WIDGET_EMBED_SIGNING_SECRET` is configured in both the Next.js runtime that
serves `/w/[widgetId]` and the Convex runtime that verifies
`createWidgetThread`.

## Troubleshooting Unexpected Behavior

If the greeting does not show, check whether greeting and popup preview are both enabled.

If name or email gates do not show, check the visitor gate settings and whether the existing browser thread already passed the gate.

If the widget talks like the wrong agent, check the linked agent and whether the company widget or global widget snippet was installed.

If conversations are missing from company chat logs, confirm the widget is company-scoped, the source host is allowed, and the conversation actually created a thread.

If a customer reports repeated old context, ask them to use the widget reset action or clear site storage, then start a new thread. If messages fail after a browser restore or storage migration, reset the widget session so the iframe can create a fresh thread and credential.

## Support Handoff Notes

For customer support teams, record:

- widget id
- installed host page
- allowed domains
- linked company
- linked agent, if any
- whether name/email gates are enabled
- where to inspect chat logs
- who owns widget changes

Do not send customers raw audit metadata, internal thread ids, or sensitive chat excerpts unless the destination is approved for that customer's data.

## Distinguish A Display Problem From An Admission Problem

A missing launcher usually calls for checking the installed script and customer-page policy first. A visible launcher with a blocked frame points toward frame-ancestor or customer-site restrictions. A rendered frame that cannot start a thread calls for checking the signed embed pass, observed hostname, active widget and thread window. A thread that exists but cannot send can instead be at its burst allowance, the widget's shared 600-message hourly ceiling, or company AI allocation. These are different stages; an audit event from one stage does not prove another stage succeeded.

The sandbox is hosted on Hakken's domain. A restricted customer allowlist can refuse it unless that testing host is deliberately included. A direct visit to `/w/[widgetId]` without a referring page also differs from a real embed and needs the explicit wildcard policy for thread creation. Interpret that difference before changing the customer's saved domains. An unavailable backend policy causes the serving layer to refuse framing rather than opening access broadly.

For an upload complaint, check the image policy of one MiB and the ten upload-URL requests per thread. The limit counts the request for a URL before the eventual message, so a visitor who repeatedly changes a photo can reach it without sending ten photos. Do not promise that removing a preview or retrying an upload restores a slot. A photo-only message is valid; a photo task suggestion still needs the visitor's confirmation before it becomes team work.

## Explain Reset And Identity Clearly

A name or email gate gathers visitor-provided information. It does not prove ownership of an email address, establish a logged-in customer identity, or authorize access to that customer's private account. Review support decisions against the actual saved conversation and your customer verification process. Do not treat a plausible email field as permission to disclose sensitive business records.

Reset clears this browser's selected widget thread, session credential and staged state. Earlier server messages remain. Deleting the widget configuration likewise does not establish deletion of every conversation and stored image. Refer an erasure request to the responsible operator and keep it separate from a request to start a fresh chat. Disabling the widget makes anonymous session reads and writes fail the shared active-widget check, but retained records still need their own lifecycle handling.

This handoff guide was checked against the current widget editor, iframe client, embed/domain helpers, upload handlers and chat access helpers. It shares implementation coverage with the [developer widget guide](../developer/embedded-widgets.md); a separate handoff backend does not exist. No external snippet installation, live message, customer-domain acceptance or rename cutover was tested during this documentation review. Record those outcomes separately when an authorized launch check is performed.
