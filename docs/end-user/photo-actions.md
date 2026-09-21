# Photo Actions

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
- Widget threads: at most ten attachment-bearing messages.

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
