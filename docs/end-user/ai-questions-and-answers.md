---
product: Hakken
documentation_type: User guide
feature_area: private AI question tracking and saved answers
audience: workspace users, support and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/ai-questions-and-answers.md
last_reviewed: '2026-10-26T11:13:30+00:00'
reviewed_against: current implementation
status: Current
---
# AI Questions And Saved Answers

> **Product:** Hakken · **Document type:** User guide · **Feature area:** private AI question tracking and saved answers
> **Reviewed:** 26 October 2026, 11:13:30 GMT (Europe/London)
> **Source path:** `docs/end-user/ai-questions-and-answers.md` · **Status:** Current

AI question tracking measures saved answers to questions chosen for a company's website. It helps a team inspect whether an answer recommends, names, warns against or does not name that website, and which sources and search wordings support the observation. This is external-answer evidence collected through the existing collection system. It is separate from asking Hakken's own assistant a question and separate from proof that a customer bought anything because of an answer.

Open a website in Visibility, then Full answers at `/app/sites/[siteId]/ai/answers`. A question selector, engine selector and date range define the evidence being read. The company's list can include paused questions as well as active ones, so the history remains inspectable when recurring collection has stopped. Selecting an address for a question that is not on the list produces an unavailable-list state rather than silently switching to another question.

## Questions Belong To The Company's List

The list belongs to a company's saved website holding. Another company can ask identical words without gaining access to this company's private choices. Underlying purchased answer facts may be shared when the request is reusable, but the caller must still have the question, selected engine and applicable location on its permitted list to read a saved answer.

For a tracked competitor, reports use the paired list context so the company can compare websites against its own chosen questions. That does not expose a rival company's private questions. Check company, website, location and engine before comparing results. A missing answer link can mean the record does not fit that context; it is not evidence that the same question was never asked anywhere else.

Platform operators manage the tracked questions in company website administration. The implemented add, edit, pause/resume and remove writes require super-admin authorization. Having access to the customer answer viewer does not grant access to platform Admin or to those configuration writes. Customer controls that opt into a listed fan-out Google query are a different workflow described in [Google Search Tracking](./google-search-tracking.md).

## Setup And Editing

A tracked question must contain eight through three hundred characters after the common text cleanup. Duplicate questions are rejected case-insensitively within the holding. The website's current prompt limit applies to all its saved questions. An operator chooses answer engines; the known catalog contains ChatGPT, Perplexity, Gemini, Claude and Google AI Mode. That catalog is source support, not proof that every provider is connected and answering successfully in a deployment.

Adding a question creates an active list entry and schedules a recount of compatible answers already held. Consequently an existing saved answer can appear without a new paid request being made at that moment. Adding the list entry does not itself prove collection has run, and a future answer still depends on enabled collection, configuration and provider availability.

Editing can change words and selected engines while keeping the entry's place and paused state. The exact words matter: changed wording moves the list to that new question context; old answer facts are not rewritten as though they answered the edited question. Related fan-out choices and unbought first checks are reconciled in background work. Removing a question takes it off this company's list and figures rather than erasing every shared answer purchased for those words.

Pausing stops the question from being an active recurring choice but does not delete the list entry or all retained history. Resuming makes it eligible again. A successful settings save is not a completed answer from a provider. When an expected result is missing, inspect the owning collection state and dates rather than repeatedly adding, deleting or generating the same question.

## Read Full Answers

The Full answers table displays saved answers inside the chosen date range, normally newest first. The engine filter only applies to an engine selected for that question. Headings sort by observation day; the interface does not pretend to sort every answer by a source count that is loaded only with its text. Standard Sites paging supplies the remembered row choice and exact counts within the returned held set, with a cut notice where the backend reached its read limit.

Text search operates on retained wording for the selected question and engines. It is a bounded word-start search, not an unlimited archive search. Older answers whose full wording expired cannot match a phrase in that removed wording. A small search result is therefore not proof that no historical answer ever used the phrase. Clear the text search and inspect older summary records when investigating a retained mention without its original text.

An answer's stance is a saved classification about the selected website. Recommended, named, warned against and not named are different outcomes. A mention is not necessarily a recommendation, and the presence of a source link is not proof that the answer endorsed the business. Read the actual answer where it is retained and compare it with the classification before using the result in a customer explanation.

## One Answer's Evidence

Open a row to inspect the answer, sources, engine/day and supporting detail. The page can distinguish an answer asked through an app, a model or Google AI Mode's page. These are different collection surfaces; the same engine brand does not prove identical app behavior, model version or location handling on every observation. Do not describe a model response as a captured consumer-app result when its evidence says model.

Where available, the detail shows businesses displayed, pages read, cited sources and searches the collected app reported. A page can be read without being cited, and a named business is not automatically one of this company's websites. A link to the site's own source page opens that page's Hakken record; external sources remain external evidence. The screen's source list is bounded and does not promise every page an engine could have consulted.

Same-day switches offer the other selected engines when retained wording for those answers exists. An unavailable switch is not a current provider outage check. The answer record also lists common search wordings associated with that question/engine; some are aggregated across observations rather than an exact transcript of that one answer's hidden reasoning. App-reported searches are shown separately when the saved extra evidence supports them.

## Retention And Size Limits

Full wording is kept for ninety days under the current collection retention policy. After that, Hakken can retain who the answer named and what it cited while showing that the original wording is no longer available. It does not fabricate text from the summary. The hourly cleanup can lag the cutoff, so a recently expired answer may still show wording until cleanup runs.

Saved wording is capped at sixty thousand characters and forty source addresses per text record. A large original answer can therefore be truncated in storage. Older summaries and saved citations have their own record lifetime. Removing a private list choice or resetting a browser does not by itself establish that all shared answer facts or provider copies were erased.

The list and search reads also have limits. Date browsing reads bounded index/history rows per engine, while text search considers a much smaller candidate window before applying dates and remaining words. A cut indicator should be preserved in an export or customer explanation. Do not claim an exhaustive provider archive or complete historical search merely because the table has numbered pages.

## Use The Evidence Practically

Start with one business question and the correct company/site/place. Check the selected engines and saved observation dates, open an answer and distinguish its wording, stance, sources and app extras. Compare several observations before describing a persistent pattern. Search results and an answer's references can change; the viewer records what was saved rather than guaranteeing what an engine will say to a visitor today.

Use missing or unexpected evidence to choose an investigation, not as permission to run paid collection tests. Relevant changes may involve question wording, engine selection, collection configuration or a separately approved product decision. The report does not automatically edit a website, publish corrective content, change provider answers or demonstrate leads and sales. Those outcomes require their own implemented workflow and evidence.

This guide was checked against question mutations, private-list readers, answer text/index/detail queries, app-extra rendering and retention policy. No question, provider request, export, browser or application test was run. These implemented foundations do not establish that all planned Hakken product outcomes are delivered or that external rename cutover is accepted live. See the [developer guide](../developer/ai-questions-and-answers.md) for module contracts and bounded reads.
