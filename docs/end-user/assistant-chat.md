---
product: Hakken
documentation_type: end-user guide
feature_area: Ask Hakken assistant conversations
audience: signed-in company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/assistant-chat.md
last_reviewed: '2026-10-26T08:48:31+00:00'
reviewed_against: current implementation
status: Current
---
# Assistant Chat User Guide

> **Product:** Hakken · **Document type:** end-user guide · **Feature area:** Ask Hakken assistant conversations
> **Reviewed:** 26 October 2026, 08:48:31 GMT (Europe/London)
> **Source path:** `docs/end-user/assistant-chat.md` · **Status:** Current

## What Assistant Chat Is

Assistant chat is the main place where users ask Hakken for help, analysis, writing, research over uploaded documents, inspecting photos, and other AI-supported work inside the dashboard. It is reached from the sidebar item labelled `Ask Hakken` or `Ask {platform name}`, depending on how the workspace has been branded. The first screen is a clean prompt workspace where you can type a request, attach documents or photos, choose an available AI engine, pick how much reasoning effort the assistant should use, dictate a prompt with your microphone, or start a live spoken conversation. Once you send the first message, Hakken opens a conversation thread at `/app/assistant/{thread}` so you can continue the same discussion.

This guide describes implementation reviewed on the date above. It does not prove that provider credentials, data connections or live voice have been accepted in a particular deployment. Product plans and dated verification records are separate from this behavior guide.

## Who Uses It

Assistant chat is available to signed-in dashboard users. Standard users can ask questions and work with their own conversations. Company admins can also use the assistant from the normal app area, and super admins can use it directly or while impersonating a company workspace. Conversations are personal to the user who created them: another user in the same company does not automatically see your assistant thread. Company-level configuration can still affect the answer, because the assistant uses the active company for plan limits, available models, active rules, company prompts, and company knowledge.

Client administrators should think of assistant chat as a company-scoped AI workspace with personal threads. It is not a shared team inbox, not a complete audit viewer, and not a replacement for the administrative AI configuration screens. Admin configuration happens in the admin area; day-to-day asking, uploading, and following up happens in Assistant chat.

## Starting a Conversation

Open the dashboard and choose `Ask Hakken` from the sidebar. The welcome screen shows a prompt box. Type what you want the assistant to do, such as summarizing a document, drafting copy, comparing options, extracting facts, explaining a report, or answering a question about information available to your workspace. Press the send button or press Enter without Shift to submit. Use Shift+Enter when you want a line break inside the prompt.

You can start with text only, files only, or both. If you submit only files, the app sends a default instruction asking the assistant to analyze the attached documents. After submission, Hakken creates a new conversation and moves you into the thread view. Your original prompt appears on the right side of the conversation, and assistant responses appear on the left. The page automatically scrolls toward the newest message.

The first response may take longer when files are attached because the system uploads the files, extracts text where possible, creates searchable document chunks, and waits for that processing before building the answer. While this is happening, the thread can show status messages such as upload, parsing, vectorizing, or thinking states.

## Continuing a Thread

Inside an active thread, use the bottom composer to send follow-up questions. The assistant receives recent conversation history as context, so you can refer to earlier messages. For example, after asking for a summary, you can ask for a shorter version, a table, a client-facing email, or a list of risks without uploading the same file again. The assistant can also use thread-scoped uploaded documents when they have finished processing.

Each message includes a small timestamp. User messages use your account image when available. Assistant responses support formatted text through Hakken’s markdown renderer, so answers may include headings, lists, code blocks, tables, or links when useful. The product warns that AI can make mistakes, and users should check important answers before relying on them externally.

## Managing Conversation History

On desktop-sized layouts, assistant conversations include a history sidebar. Use the plus button in that sidebar to start a new conversation, or choose an existing conversation title to reopen it. The history loads in pages of 25, with a control to load more. Search asks the server across your own conversation titles, including older conversations; it does not search message bodies or other users' conversations. Evaluation conversations are excluded from this personal list.

Hover over a conversation in the history list to show rename and delete controls. Rename opens an inline title editor; press Enter or use the check button to save, or press Escape to leave edit mode. Delete opens an in-app confirmation modal and, after confirmation, removes the conversation from your history. If you delete the conversation you are currently viewing, the app returns you to the assistant welcome screen.

Thread titles start as `New Conversation` and are normally replaced by an AI-generated short title after the first message. You can rename the title later if the generated name is not useful. Blank manual titles are normalized by the backend rather than stored as empty names.

## Choosing an AI Engine

The model selector shows active chat engines configured by the platform administrators. A workspace may have one model or several. If you do not choose one, Hakken uses the configured default. Model names in the selector come from the admin configuration, so they may be friendly names rather than raw provider model IDs.

The model you choose is sent with the next message. The backend still resolves the final execution model through Hakken’s stored configuration, which means a disabled model may fall back to the current default or platform failsafe. Users should treat the selector as a preference among available engines, not a guarantee that an unavailable provider will be forced. If the selected provider is temporarily unavailable, the assistant may return a provider error message asking you to try again.

Provider support can also differ by message shape. Plain text assistant prompts can use the configured chat provider path, but file-heavy prompts need model and provider support for the inline content Hakken sends alongside the text. If a non-default engine works for text but fails when attachments are included, retry with the default engine or ask an administrator to confirm which providers support the uploaded-file workflow.

Plain-text replies stream into the conversation as they are generated on Google Vertex, OpenAI, Anthropic, and OpenRouter. The app smooths backend chunks into a readable typed reveal, speeds up when text is waiting, and finishes promptly after the provider closes. A conversation opened from history shows completed answers immediately rather than replaying their typing. If a provider fails after part of an answer has arrived, Hakken keeps the partial text, appends a provider failure notice, and stops the streaming indicator. A reply left unfinished by an interrupted backend run is shown as stalled after ten minutes with a prompt to try again.

## Choosing Reasoning Effort

The thinking selector lets you choose the assistant’s reasoning effort for the message. Current options are `Fast`, `Low Focus`, `Deep Focus`, and `Max Focus`. Use `Fast` for short, straightforward tasks where speed matters. Use `Deep Focus` or `Max Focus` when you are asking for comparison, planning, detailed analysis, or work that needs more careful reasoning. Higher effort can take longer and may cost more depending on the configured AI provider.

Reasoning effort is applied per message. You can use a faster setting for a simple follow-up, then switch to a deeper setting for a complex request in the same conversation. If your workspace has strict cost or usage controls, ask an administrator which default is preferred.

## Uploading Documents And Photos

Assistant chat supports document and photo upload from both the welcome screen and active thread composer. Use the plus button or drag files onto the composer. Supported document types are PDF, CSV, plain text, Excel files, and Word documents. Image files can also be attached as photos. The product validates file type and size before adding files to the pending tray. If a file is unsupported or too large, Hakken shows an in-app error message explaining the reason.

Uploaded documents are used in two ways. First, the assistant can send small enough file content directly to the selected model as part of the request. Second, Hakken stores the document in a thread-specific knowledge area, extracts text, breaks it into chunks, and creates vector embeddings so future questions in that thread can retrieve relevant passages. The visible status panel tells you when the system is still processing documents. If processing takes too long or fails, the assistant may answer without fully using that document, and you may need to try a smaller or cleaner file.

For best results with documents, use files with extractable text rather than scanned images. Standard PDFs, text files, CSVs, and DOCX files usually work better than image-only files. A photo is different: it rides with the current message so a vision-capable model can inspect it for that turn. Photos are not added to thread knowledge. If Hakken sees something actionable in a photo, it can show a suggested follow-up task for you to confirm. See [Photo Actions](./photo-actions.md).

## Voice Dictation

The microphone button starts voice dictation through your browser. When recording is active, the composer changes state and the microphone icon indicates that Hakken is listening. Stop recording to transcribe the audio into prompt text. If you submit while recording, the app stops the recorder cleanly before sending. Browser microphone access is required. If the browser blocks access, Hakken shows a modal explaining how to allow the microphone from the browser’s address bar.

Voice dictation is useful for rough drafting and longer natural-language prompts, but you should review the transcribed text before sending sensitive or high-impact requests. The transcription result is added to the prompt field and can be edited like normal text.

Voice transcription is also guarded by backend limits. Hakken accepts supported audio formats, rejects malformed or oversized audio before sending it to the AI provider, and rate-limits repeated transcription attempts by user. Transcription currently uses the platform's global transcription model setting rather than a company-specific override. If dictation repeatedly fails, wait briefly, check browser microphone permissions, and try again with a shorter recording.

## Live Voice Mode

Assistant chat also has a live voice mode. Unlike dictation, live voice opens a spoken session inside the assistant thread: you talk, Hakken answers in speech, captions show both sides, and the completed spoken turns are written back to the same conversation history. Live voice can search company knowledge while the conversation is already running.

Live voice uses the workspace spoken voice chosen by an administrator. It depends on the real-time voice model and relay being configured, so a workspace can have text chat and dictation working before live voice is available. For the broader spoken experience, including inbound phone calls and voice settings, see [Spoken Channels](./spoken-channels.md).

## Permissions, Company Boundaries, and Limits

Assistant chat requires a signed-in user. Your conversation belongs to your user account. Hakken stores the active company on a new thread so the assistant can apply the right company prompt, active AI rules, knowledge, model defaults, and message allocation. If a super admin is impersonating a company workspace, new threads use that company context until impersonation is exited.

The product enforces message and usage limits in the backend. A single message cannot exceed the configured payload size limit. Hakken also rate-limits rapid posting in a thread, currently allowing up to 10 user messages per minute. If your company has used its AI allocation for the current period, Hakken stores your message and replies with a notice that the company allocation is exhausted. Ask your administrator to review the workspace plan or allocation in that case. A billing-managed company also needs current paid access; an unlimited personal allowance cannot bypass an expired company subscription. See [Platform Plans And Quotas](./platform-plans-and-quotas.md).

The assistant is designed not to reveal hidden system prompts, private configuration, secrets, or data from another tenant. Uploaded files and retrieved knowledge are treated as reference material, not as instructions that can override platform safety or company permissions. If a user asks the assistant to bypass permissions or expose protected instructions, it should refuse briefly and suggest a safe alternative.

## What Happens After You Send

After you send a message, Hakken writes your message to the thread and schedules the assistant response in the background. The screen may show an optimistic version of your message while the database catches up. If files are attached, upload and processing status appears before the answer. The assistant then assembles recent conversation context, relevant uploaded or company knowledge, active company rules, the company prompt, and the selected model configuration before generating a response.

If something goes wrong with the AI provider, the thread should show a clear assistant message saying the core assistant is offline or that communication with the provider failed. If a file cannot be processed, the document may show a failed processing state in areas that inspect knowledge documents, and the assistant may answer from the prompt and other available context instead. If the browser upload itself fails, your unsent prompt and pending files are restored where possible so you can try again.

Finished assistant answers can show **Helpful** and **Not right** controls when platform feedback is enabled. A negative rating can be qualified as wrong, missing something, or not helpful, and you can change the rating later. Ratings are only available on your own completed assistant answers, not while text is streaming or on platform notices such as quota refusals. Feedback influences bounded learning signals; it does not rewrite the answer you already received. A typed correction can also be proposed to the company memory review queue when eligible. It is a proposal for review, not an immediate replacement of the company’s approved knowledge.

## Practical Guidance

Write prompts that explain the goal, audience, and desired output. For example, “Summarize this PDF for a customer success manager and include five risks” is more useful than “summarize.” When uploading files, mention what you want Hakken to inspect. Use follow-up questions to refine the answer instead of starting a new thread for each small adjustment.

Use the model and reasoning selectors deliberately. A fast setting is suitable for short edits and simple questions. A deeper setting is better for analysis, multi-step plans, or comparisons across documents. If the answer will be shared with customers, regulators, executives, or anyone outside your team, review it carefully and verify facts against the original source material.

Keep privacy in mind. Hakken includes safety checks and tenant boundaries, but users should still avoid uploading unnecessary sensitive information. If your organization has internal data-handling rules, follow those rules before attaching documents or asking the assistant to process customer data.

## How It Connects to the Rest of Hakken

Assistant chat is connected to Hakken’s company setup, AI model management, knowledge system, plan limits, and admin rules. Admins configure models, global and company prompts, knowledge, rules, and usage controls in the administration area. Users experience those settings through the assistant’s available engines, response style, access to company knowledge, and quota behavior.

The same backend foundations also support widgets, agents, workflows, run logs, and analytics elsewhere in Hakken. Assistant chat is therefore the everyday entry point into the platform’s AI capabilities, while the admin screens control how those capabilities are governed, measured, and extended.


## Choose what the answer is about

The **Answering for** control can focus a new conversation on one of the
company's held websites or all its websites. This is useful when a company has
several sites and a question such as “what changed?” would otherwise be
ambiguous. The choice can be remembered for that company and reflected in the
welcome page's address. Check it before starting another discussion, especially
if your last question concerned a competitor rather than your own site.

A platform super administrator can also choose which client a new conversation
answers for, or a platform context without a client. That is a privileged
capability. Company members cannot choose a foreign company simply by adding
its name or identifier to a prompt or address. A conversation's selected
company and website are stored when it is created. Changing the welcome
screen's choice is not evidence that an old thread has been reassigned.

The answer comes through the built-in Assistant agent, using the shared
knowledge and instruction assembly used by other conversation doors. If the
Assistant is switched off, the product says it cannot answer. A message that
appears in history therefore does not guarantee that a model was successfully
run or that a disabled agent was bypassed.

## Check figures and recurring-work proposals

The Assistant can look up authorized company figures through the same reads
used by application screens. When an answer carries a **Looked up** line,
follow its link to inspect the source screen and dates. It can also attach a
chart built from the underlying figures. A chart or link is useful evidence
for checking a numerical answer; it does not make a suggested cause certain,
and it does not prove a source connection is complete or fresh.

Ask which website, period and source an answer used if those details are
unclear. Search Console clicks, Analytics visits and a counted conversion are
different measurements. A comparison can be misleading when one source holds
fewer days, a different home country or a different definition of conversion.
The dedicated [Google Analytics guide](./google-analytics.md) explains those
measurement choices for Analytics.

The Assistant can propose recurring alerts and reports, such as watching a
website's search performance or sending a regular list of changed pages.
Review the proposal and confirm it using the offered control before expecting
work to run. A draft proposal in a conversation is different from a saved,
active task. The underlying task's schedule, selected channels and email
preferences determine how you hear from it. Turning task emails off on your
profile does not delete the task. See [Emails From Hakken](./emails.md) for
communication choices and delivery timing.

Conversation deletion removes the thread from your history, but the current
backend deletion path only deletes a bounded batch of messages before removing
the root. It must not be treated as a verified complete purge of every related
file, feedback record or long transcript. For a formal data-removal request,
use your organization's data-handling process and the platform's retention or
subject-rights workflow rather than assuming a history-list delete completes
that request.
