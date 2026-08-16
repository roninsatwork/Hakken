# Embedded Widgets

Embedded widgets let a Sonae workspace expose a governed chat assistant on an external site. The current product has two widget setup surfaces:

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

Allowed domains decide where the widget may create a conversation. To allow broad internal testing, configure `*` explicitly. For production, add the customer hostnames that should be allowed. The backend accepts exact hosts and subdomains of configured hosts and rejects unauthorized source URLs.

An empty allowlist is not a production-ready allow-all setting for conversation creation. The iframe may still load enough public configuration to render, but the backend thread creation guard requires `*` or a matching configured domain before a visitor can start chatting.

The browser iframe also checks the host page referrer before sending popup configuration back to the parent page. When Sonae serves `/w/[widgetId]`, the server mints a signed embed pass from the observed referrer host. The backend requires that pass before creating the anonymous widget thread, then checks the host against the widget allowlist. Blocked backend attempts are recorded in audit logs with `BLOCKED_WIDGET_ACCESS`.

Use restricted domains before handing a widget to a customer. A broad allowlist is useful for internal testing but is not the preferred production posture.

## Embed And Sandbox Testing

The integration tab shows the script tag to place on the external site:

```html
<script src="https://your-sonae-host.example/embed.js" data-widget-id="..."></script>
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
  suggested follow-up task when Sonae sees something actionable
- the browser keeps a widget-specific session so returning visitors can continue the same browser conversation
- if the saved browser session is incomplete or invalid, the widget clears the local session and creates a fresh conversation
- visitors can reset the local widget thread from the iframe

Widget conversations are stored as chat threads with the widget id and source URL. The anonymous browser session also needs its widget thread credential to continue reading or sending messages in that thread, so a copied thread id alone is not enough to reopen a visitor conversation. Company operators can review company chat logs and identify widget-originated conversations.

Anonymous visitors do not see the customer's plan or billing state. If the company AI allocation is exhausted, the widget gives a generic temporary-unavailability message rather than exposing that the plan limit was reached or telling a public visitor to contact an administrator. The platform stores that notice as a system message and displays the Italian version when the visitor's browser language starts with `it`; other languages fall back to the stored English text.

## Uploads

The widget includes upload support for anonymous widget threads. Visitors can attach one image to the next message, preview it, remove it before sending, or send the photo without extra words. Uploads are only accepted for an active widget, a thread that belongs to that widget, and a matching widget session credential. The current quota is ten attachment-bearing messages per widget thread, and uploaded files are validated against the widget attachment policy before being finalized.

Widget photo replies can show a suggested follow-up card. The visitor must press
the confirmation button before Sonae files a task for the team. The broader
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
