---
product: Hakken
documentation_type: User guide
feature_area: embedded chat widgets
audience: workspace operators and customer support
source_repository: roninsatwork/Hakken
source_path: docs/end-user/embedded-widgets.md
last_reviewed: '2026-10-26T10:28:26+00:00'
reviewed_against: current implementation
status: Current
---
# Embedded Widgets

> **Product:** Hakken · **Document type:** User guide · **Feature area:** embedded chat widgets
> **Reviewed:** 26 October 2026, 10:28:26 GMT (Europe/London)
> **Source path:** `docs/end-user/embedded-widgets.md` · **Status:** Current

Embedded widgets let a Hakken workspace expose a governed chat assistant on an external site. The current product has two widget setup surfaces:

For production handoff and support troubleshooting, see [Widget Handoff And Troubleshooting](./widget-handoff-and-troubleshooting.md).

- Global widget setup at `/admin/ai/widget`, available to super admins for a system-wide widget.
- Company widget setup at `/admin/companies/[id]/widget`, available to admins who can manage that company.

Each saved widget produces an embed snippet that loads `embed.js` with the widget id. The script creates a floating chat button, opens the widget in an iframe at `/w/[widgetId]`, and can show a greeting bubble when the widget configuration allows it.

## What Admins Configure

Widget setup is split into appearance, welcome, conversation starter, greeting, and integration controls. Depending on whether the widget is global or company-scoped, admins can configure:

- widget name
- allowed domains
- primary color
- logo
- greeting text
- message placeholder
- sound notifications
- popup preview
- name and email gates
- conversation starters
- receptionist screen opt-in
- active status

Company widgets can also be associated with a company agent. When an agent is linked, widget conversations send messages through that agent. If no agent is linked, the widget still opens a chat thread but does not force a dynamic agent id.

## Domain Allowlist

Allowed domains decide where the widget may create a conversation. To allow broad internal testing, configure `*` explicitly. For production, add the customer hostnames that should be allowed. The backend accepts exact hosts and subdomains of configured hosts and rejects hosts that do not match that policy. The supplied source URL is conversation context; it is not the authorization credential.

An empty allowlist is not a production-ready allow-all setting for conversation creation. A directly opened page can render public configuration, but the frame policy denies embedding when the list is empty. The backend thread creation guard also requires `*` or a matching configured domain before a visitor can start chatting.

The browser iframe also checks the host page referrer before sending popup configuration back to the parent page. When Hakken serves `/w/[widgetId]`, the server mints a signed embed pass from the observed referrer host. The backend requires that pass before creating the anonymous widget thread, then checks the host against the widget allowlist. Blocked backend attempts are recorded in audit logs with `BLOCKED_WIDGET_ACCESS`.

Use restricted domains before handing a widget to a customer. A broad allowlist is useful for internal testing but is not the preferred production posture.

## Embed And Sandbox Testing

The integration tab shows the script tag to place on the external site:

```html
<script src="https://your-hakken-host.example/embed.js" data-widget-id="..."></script>
```

The company widget integration section also links to `/sandbox/[widgetId]`. The sandbox loads the public embed script into a simulated host page so admins can inspect branding, greeting behavior, and iframe loading before installing the widget on a real customer site.

The Integration section also contains the Receptionist screen switch. That
turns the same configured widget into a full-screen voice surface at
`/kiosk/[widgetId]`; see [Receptionist Screen](./receptionist-screen.md).

## Visitor Experience

Visitors see a floating chat button. If popup preview and greeting are enabled, the host page can show a greeting bubble before the visitor opens the chat.

Inside the widget iframe:

- inactive or missing widgets show a disabled/not-found state
- configured logos, names, colors, greetings, placeholders, and starters are shown
- name and email gates appear before the first message when required
- the first visitor message includes gateway metadata when name or email was collected
- conversation starters can send the first message
- visitors can attach a photo, send a photo-only message, and confirm a
  suggested follow-up task when Hakken sees something actionable
- the browser keeps a widget-specific session so returning visitors can continue the same browser conversation
- if only half of the saved browser session remains, the widget clears that partial pair; a fully stored but invalid credential can require Reset
- visitors can reset the local widget thread from the iframe

Widget conversations are stored as chat threads with the widget id and source URL. The anonymous browser session also needs its widget thread credential to continue reading or sending messages in that thread, so a copied thread id alone is not enough to reopen a visitor conversation. Company operators can review company chat logs and identify widget-originated conversations.

Anonymous visitors do not see the customer's plan or billing state. If the company AI allocation is exhausted, the widget gives a generic temporary-unavailability message rather than exposing that the plan limit was reached or telling a public visitor to contact an administrator. The platform stores that notice as a system message and displays the Italian version when the visitor's browser language starts with `it`; other languages fall back to the stored English text.

## Uploads

The widget includes upload support for anonymous widget threads. Visitors can attach one image to the next message, preview it, remove it before sending, or send the photo without extra words. Uploads are only accepted for an active widget, a thread that belongs to that widget, and a matching widget session credential. Each thread can request ten upload URLs. Requesting an upload spends one of these slots even if the visitor removes the photo or never sends it. Images must fit the one MiB widget attachment policy, and stored files are validated before finalization.

Widget photo replies can show a suggested follow-up card. The visitor must press
the confirmation button before Hakken files a task for the team. The broader
image-to-task behavior is covered in [Photo Actions](./photo-actions.md).

## Operational Notes

Use the sandbox before distributing an embed snippet. Confirm that:

- the widget is active
- the allowlist includes the target host, or `*` is intentionally set for broad internal testing
- branding and greeting match the customer handoff
- name and email gates match the support process
- linked agents and knowledge have been reviewed
- customer operators know where to inspect widget chat logs

Widget configuration is part of white-label readiness and custom-domain readiness in platform settings. A production handoff should not rely only on a copied snippet; it should include domain allowlist review, branding review, and chat-log ownership.

## Sessions, Privacy And Disabling A Widget

Treat a saved widget conversation as a browser session. The browser stores both a thread identifier and a private credential under keys specific to that widget. Someone using the same browser profile may resume its conversation. The name and email questions are an introduction for the team; they do not verify that the visitor owns that address, sign the visitor into a customer account, or establish a business permission. Avoid asking a public visitor to place account secrets or payment details in these fields.

Reset removes the local conversation selection, credential and staged photo, and lets the browser start again. It does not erase the earlier messages from Hakken's database. Clearing the browser's storage has the same important limitation. Customer requests for deletion need an authorized data-handling process; do not tell a visitor that Reset has completed that request. Deleting a widget configuration is also not a documented conversation-and-file purge: the inspected deletion handler removes the widget record and records an audit event.

Deactivating a widget prevents new public conversation creation and makes the shared anonymous-thread access checks refuse existing sessions while it remains inactive. This is useful when withdrawing a public entry point. It does not remove retained chat history or establish that a website owner removed the snippet. Review the saved widget, the external page and retained conversations as separate handoff responsibilities.

## Limits And Practical Recovery

The widget has a shared allowance of 120 newly created threads per hour and 600 visitor messages per hour across its conversations. A separate per-thread message-rate check and company AI allocation also apply. A busy notice may therefore occur while an individual visitor has sent very little. Starting more threads does not remove the shared widget ceiling. Repeatedly requesting upload URLs also consumes the thread's ten issuance slots, even when the final message has no image.

A browser that suppresses the referring hostname can be refused by a restricted-domain widget. Operators should first compare the real installed hostname and allowlist, then inspect the deployment's frame and signing configuration. Opening the iframe address directly is not the same test as loading it in an allowed website: a direct open without a referrer needs the explicit wildcard setting for conversation creation. Do not broaden production domains merely to make a direct-address test succeed.

Current behavior was checked in `public/embed.js`, `src/app/w/[widgetId]/WidgetIframeClient.tsx`, `convex/widgets.ts`, `convex/chatService.ts` and the embed/domain policy helpers. This is repository evidence. The review did not load a customer website or establish external rename cutover, deployed signing configuration, delivery of a message or provider availability. Keep those acceptance questions visible when arranging a live launch with the team.
