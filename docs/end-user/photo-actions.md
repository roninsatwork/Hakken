---
product: Hakken
documentation_type: End-user guide
feature_area: Photo actions
audience: signed-in users and widget visitors
source_repository: roninsatwork/Hakken
source_path: docs/end-user/photo-actions.md
last_reviewed: '2026-10-26T14:32:14+00:00'
reviewed_against: current implementation
status: Current
---
# Photo Actions

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Photo actions
> **Reviewed:** 26 October 2026, 14:32:14 GMT (Europe/London)
> **Source path:** `docs/end-user/photo-actions.md` · **Status:** Current

Photo actions let someone send a photo to Hakken, get an answer about what is in
it, and confirm a suggested follow-up task when the photo shows something that
needs action.

The feature is available in two places:

- Ask Hakken inside the signed-in dashboard.
- Embedded widgets on customer or demo sites.

Photos are treated as evidence for the current message. They are not added to
company knowledge, not embedded for future retrieval, and not used as durable
source material unless a separate workflow deliberately records their contents
elsewhere.

## Sending A Photo In Ask Hakken

In Assistant chat, attach an image from the composer and send it with text, or
send the image by itself. The thread shows a thumbnail, and the photo can be
opened from the message.

When a message contains a photo, Hakken routes the turn to a vision-capable
Google model so the image can be inspected. If the deployment does not have a
usable vision model, Hakken replies with a plain notice instead of silently
ignoring the image.

If the photo shows something actionable, the assistant answer can include a
suggested follow-up. The card shows:

- the proposed task title
- the task detail
- the reason Hakken thinks the photo needs action
- a confirmation button

Nothing is filed until a person confirms the suggestion. In signed-in chat, the
confirmed task is filed for the person who pressed the button and links back to
the assistant thread.

## Sending A Photo Through A Widget

The embedded widget has an attach-photo button. A visitor can upload an image,
add words if they want, and send it. A photo-only message is valid; the photo is
the question.

Widget photos have a smaller upload budget than signed-in chat and are checked
before and after upload. If the photo is too large, not an image, or the thread
has reached its attachment limit, the widget shows an error and does not send
the file.

When Hakken proposes a follow-up from a widget photo, the visitor sees a button
to ask the team to follow up. Confirming it files a task inside the workspace,
assigned through the same inbound handoff route used for phone-call follow-ups.

## Limits And Boundaries

Current limits:

- Ask Hakken chat images: up to 5 MB.
- Widget images: up to 1 MB.
- Widget threads: at most ten upload URL issuances, including abandoned attempts.

Current boundaries:

- Photos do not act by themselves.
- A proposed task must include reasoning before it is shown.
- A second tap does not create a duplicate task.
- The widget path requires the widget thread's session token.
- If a model cannot see images, Hakken says so instead of pretending it read the
  photo.

## When To Use It

Photo actions are useful for delivery notes, damaged parts, price tickets,
whiteboard notes, handwritten reminders, and other visual information that
should become an answer or a follow-up task.

Do not use photo actions as a document-ingestion shortcut. If something should
become durable company knowledge, upload the source through the knowledge or
Wiki flow instead.

## Prepare A Useful Photo

Send a clear image of the thing you want Hakken to examine, with a short explanation when the intended follow-up is not obvious. The model can describe or misread visible information; it does not independently verify the original document, inspect hidden damage, or establish that a handwritten figure is correct. Check important names, dates, quantities, and addresses against the original before confirming a task.

A proposed task is a suggestion drawn from that reply. It is not a separate completed inspection, a purchase order, a submitted claim, or a promise that someone has already acted. The reasoning line is there so you can judge whether the recommendation follows from the image. If it appears unrelated, leave it unconfirmed and clarify the request in chat. There is no need to confirm every proposal merely because a card appeared.

The photograph and the message can remain in the conversation's stored history. Evidence for one turn means it is not automatically indexed as company knowledge; it does not mean the bytes disappear as soon as the reply finishes. A task created from a photo is another stored record with its own lifecycle. Removing or completing a task is not the same operation as removing a conversation or its uploaded image. The current guide makes no universal automatic image-expiry promise.

## Read The Confirmation State

The confirmation control has a filing state while the request is pending, a filed state after the stored task marker is returned, and an error state when filing fails. Wait for that outcome before assuming a colleague received work. Repeating a confirmation for the same stored message returns its existing task reference; it does not create an additional copy simply because a person tapped twice.

The server uses the title, detail, and reasoning already stored with the assistant message. The confirmation button is not a task editor that can substitute new client-side text. To change the work after confirmation, use the actual task workflow where available, or clarify the conversation before confirming a new proposal. A different proposal on a different message is a different filing opportunity and is not deduplicated merely because its wording resembles an earlier task.

In signed-in chat, filing creates an open person task for the confirming user, with a link back to that conversation. The detail includes the proposed work and its reasoning. Normal task handling determines later completion, reassignment, cancellation, and notifications; a photo confirmation does not complete the task. Self-assignment should not be mistaken for a guarantee that another colleague was alerted.

For an anonymous widget visitor, the proposal is filed in the widget conversation's company. Hakken tries the same inbound assignee lookup used for call follow-ups. If no assignee is found, the implementation can still create the task without an assigned person. Do not promise a named response owner or response time merely from the widget's filed confirmation. The workspace team needs to review its actual task queue and inbound ownership configuration.

## Access, Uploads, And Model Availability

The conversation must belong to a usable workspace before confirmation can create a task. A conversation without company context is refused; choosing a company elsewhere does not retroactively change that conversation's ownership. A proposal in another workspace cannot be confirmed just by knowing its message identifier. Anonymous widget confirmation requires the matching thread session credential, and an inaccessible or missing conversation/proposal produces an error.

Ask Hakken and the widget use different image-size policies. The widget also counts upload URL issuances, not just successfully attached messages. Abandoned attempts can therefore consume its ten-upload allowance. Repeatedly selecting and abandoning files is not a reliable way to work around the limit. If an upload fails, check file type/size and the visible session state before starting another attempt.

The plain Assistant image path can select the configured vision job when the chosen model cannot inspect images. The current executable image path uses Google Vertex. The agent path, including widget conversations, checks its own provider and reports an unread-photo notice on unsupported providers. A catalog capability label alone does not mean that image bytes actually reached that runtime. If the notice says the image was not read, do not interpret an accompanying text answer as verified photo analysis.

## Practical Follow-Through And Troubleshooting

After filing, open the workspace's task list and inspect the actual title, detail, ownership, and status. Use the conversation link for context where one is saved. Handle the real-world work separately: the photo flow does not itself contact a supplier, update stock, send an email, or repair a fault. If another integration later acts on the task, that is a separate authorized workflow with its own evidence.

A missing proposal can be expected when no follow-up is needed, the model cannot inspect the image, or its proposed structure was invalid. It does not always mean the upload failed. A missing or blank reasoning field prevents the task card from being offered. An unreadable image is better replaced with a clearer photo or a precise text description than with repeated confirmations of uncertain work.

Use [Assistant chat](./assistant-chat.md), [Hakken tasks](./hakken-tasks.md), and [widget handoff](./widget-handoff-and-troubleshooting.md) for their wider controls. Implementation and local test evidence were reviewed for this guide without uploading images, generating model replies, filing tasks, or opening a live widget. External rename cutover and deployment acceptance remain separate under [PRODUCT.md](../../PRODUCT.md).
