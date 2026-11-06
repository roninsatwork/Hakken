---
product: Hakken
documentation_type: end-user guide
feature_area: screen eye and page conversations
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/what-hakken-sees.md
last_reviewed: '2026-11-05T08:41:05+00:00'
reviewed_against: current implementation
status: Current
---
# What Hakken Sees

> **Product:** Hakken · **Document type:** end-user guide · **Feature area:** screen eye and page conversations
> **Reviewed:** 5 November 2026, 08:41:05 GMT (Europe/London)
> **Source path:** `docs/end-user/what-hakken-sees.md` · **Status:** Current

## Read the page with Hakken

The eye in a website screen's top bar opens **What Hakken sees**. It brings together findings from the displayed figures, a written interpretation where available, and a place to ask questions about that page. Use it when you want to understand a change, compare groups, or decide which part of the screen deserves a closer look. It works with the page you are reading rather than requiring you to describe every filter again.

The reviewed implementation covers website data pages in Google Analytics, Search Console, Bing Webmaster, Microsoft Clarity, Visibility and Insights. It is not an eye on every application page. Connection and setup pages are excluded, and a website list is not the same as one website's figures. The panel can also offer a conversation when there is too little saved data for a new interpretation. Its presence is therefore not a promise that collection has completed.

This guide describes repository implementation, not a live acceptance test. No application was opened and no paid answer was requested during this documentation review. Hakken's wider asset and outcome strategy remains in [PRODUCT.md](../../PRODUCT.md); the eye does not establish that every planned product capability has been delivered.

## Choose the website and dates first

Open the relevant section, select your company's website, and check its dates, country and device where those controls exist. These choices matter: an interpretation of mobile visits last month answers a different question from an interpretation of every device over twelve months. Where a page carries several charts or lists, their currently registered figures contribute to the panel. A screen that has not finished loading may have less context than one whose figures are ready.

The shared date menu offers This week, Last week, This month, Last month, Last 3 months, Last 6 months and Last 12 months, plus custom dates on supporting screens. A rolling period ends at the newest day the section holds. The source may lag today. Read the dates beside the figures before deciding that a comparison describes the current calendar day. For Analytics details see [Google Analytics](./google-analytics.md).

Press the eye to open the panel. Close it using its close control, Escape, or the page behind it. Closing the panel is not deleting a conversation or erasing a saved interpretation. If you change the website or dates, check the new context before continuing a question. An answer already written about earlier figures should not be treated as an answer about a later selection merely because its wording still sounds plausible.

## Understand the findings

**What the figures show** presents findings calculated from the page's data. Examples include a headline movement, a group standing above or below the rest, and a large difference between stages. The rules depend on the page: Products concerns the shop's steps and items, while Visits concerns visits and audience groups. A finding is grounded in the figures supplied to that screen; it is not an unrestricted search across every service connected to Hakken.

These findings and the written explanation have different jobs. Code can identify a change or gap before the specialist finishes writing. A specialist then explains what matters in plain words, with checks intended to keep the language tied to recorded evidence. Neither a percentage gap nor a confident sentence establishes why customers behaved that way. Check sample sizes, the comparison period and tracking warnings before acting on an apparent opportunity.

A finding can place a question in the panel's message box when selected. Review or edit that question before sending it. This is useful when a line is unclear: ask which figures support it, whether the comparison is complete, or which page to inspect next. Selecting a finding is not approval to change the website, reconnect a service, or create a recurring task.

## Read the interpretation and its state

Where the screen supports new writing, opening the eye can start a specialist answer. The panel shows progress while the work is underway, then reveals the checked words. Some pages already contain the team's own writing and do not commission another interpretation. A failure to obtain a new piece can leave the page's existing rule-based words available. Do not read those words as proof that a fresh specialist run succeeded.

The specialist is selected for the kind of page. For example, search pages use search expertise, visitor behaviour pages use behaviour expertise, and conversion pages use conversion expertise. The checks restrict unsupported figures and unsuitable advice. They can send writing back for another attempt or leave faulty sentences out. This process improves grounding, but the explanation remains advice to assess alongside the screen, not a guarantee that every possible finding was covered.

On Analytics Live, the eye interprets the current page snapshot. A time beside the written piece tells you when it was written because the live figures can change a minute later. Its usual-half-hour comparison comes from retained last-month figures spread across half hours; it is not a prediction for that exact time of day. The eye does not itself start another Google collection to refresh the snapshot.

## Credits and reuse

A successful new interpretation is charged to the company's credit allowance and attributed to the person who pressed. The configured starting price is eight credits per new written piece; platform pricing can change. A reused answer does not incur another writing charge, and a failed piece is not charged through the successful-writing path. Ordinary Ask Hakken replies in the panel use the Assistant's own charging rules, so a follow-up conversation is separate work.

Written words may be reused for three hours while their keyed page figures still match. This is a reuse window, not a promise to freeze the underlying report. Changed figures can require new words; an answer still being researched is allowed to finish rather than starting a duplicate concurrently. Reopening the same page therefore does not necessarily produce a new interpretation, even though its conversation can start afresh.

If the company lacks enough credits for new writing, the panel says so and links to Billing. Company administrators manage billing from the user application's settings. The eye does not give members access to platform administration or hosted financial records. A platform super administrator has a separate refresh control for checking the writing immediately; that refresh is not charged to the company's credits, although the model work still has an internal cost.

## Ask about this page

Type a question in the message box and send it. The conversation starts with the page, website, dates, findings, shown words and available figures as context. It is an Ask Hakken conversation: you can find it in Ask Hakken's history and continue there. A new press of the eye starts a fresh conversation context; previous conversations remain in the normal history. Reusing an interpretation and starting a new conversation are separate behaviours.

Ask a concrete question such as “Which pages lost the most views?” or “Show that chart as bars.” Charts registered by the current page can be redrawn from their supplied figures. The conversation carries a bounded snapshot, so a chart in an older thread is not automatically refreshed whenever the page later changes. Ask for the source and dates if the result looks different from the screen you are now viewing. See [Assistant Chat](./assistant-chat.md) for the broader conversation workflow.

A supported chart can also lead to a proposal to send a report once or weekly. Read the website, measure, period, time and delivery choices before confirming it. Sending a question alone is not the task confirmation boundary. Manage confirmed work in [Hakken Tasks](./hakken-tasks.md). Redrawing an arbitrary captured chart does not mean every such chart has a supported recurring-report definition.

## Boundaries and useful troubleshooting

Access follows your signed-in company and its website relationship. Watching a rival does not give access to its private Analytics or Clarity data. The page conversation should answer for the website it names, not another company's similarly named property. If the context looks wrong, stop using that answer for a business decision and report the selected company, website and page.

An empty panel can mean missing collection, an unsupported writing state, no usable figures, a failed specialist run, or insufficient credits. Check the screen's own loading and connection messages first. For a misleading sentence, provide its wording, the chosen dates and filters, and the visible figures it disagrees with. Never send access tokens or secrets. Engineers can use [the developer guide](../developer/what-hakken-sees-guide.md) to trace saved answers, findings, checks and run logs without assuming the documentation proves deployed behaviour.
