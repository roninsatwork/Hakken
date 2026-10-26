---
product: Hakken
documentation_type: end-user guide
feature_area: Insights findings and analysis foundation
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/insights-findings.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Findings

> **Product:** Hakken · **Document type:** end-user guide · **Feature area:** Insights findings and analysis foundation
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/end-user/insights-findings.md` · **Status:** Current



## What a finding is

Insights brings together saved observations about a company's owned websites
and presents findings worth investigating. A finding connects a story to
specific source figures, a suggested action and a way to check the result.
It is intended to help you decide what to examine next, rather than make you
interpret every source report independently.

Open `/app/insights`, then This week or Findings. Individual findings live at
`/app/insights/findings/<findingId>`. This guide covers the findings workflow,
source evidence, action handoff and review timing. Insights also has summary,
strategy, reports, measurement, planning and other pages; the
[documentation queue](../index.md#prioritized-documentation-queue) tracks
remaining detailed coverage of those related workflows. Their presence in
the menu should not be read as proof that every source is connected or every
analysis has run.

The guide describes reviewed local implementation, not a deployment
acceptance record. It does not establish delivery of the complete product
vision in [PRODUCT.md](../../PRODUCT.md), nor guarantee that an AI explanation
has identified the true cause of a business change. Treat a finding as an
inspectable analysis grounded in its displayed evidence and limitations.

## Select the right company and website

The section is company-scoped. Its normal website list contains the company's
owned sites, with a website filter for focusing the view. Your company's
ability to read a shared competitor observation does not mean you can read
another company's private finding or source connection. A link containing a
foreign finding identifier does not bypass that boundary.

Check the website before comparing one week's story with another. A company
with several owned sites can have different connection quality, markets and
collection dates on each. A finding about an old or incorrect site should
not be treated as a current instruction for the site you are working on.
The page shows the host and the week associated with the finding so you can
keep that context attached to a discussion or export.

The normal reader pages show published findings. Work sent back by the
internal checks is not presented as an approved customer conclusion. An
empty findings view can mean no published finding is available, not that
the business has no issues or that every specialist finished a complete
review. Look at the last analysis timing and source coverage before drawing
that conclusion.

## Read a finding from evidence to action

Begin with the story and the action it proposes. Then inspect the evidence
table: which source supplied the figure, what it measures and which dates
or comparison it represents. The underlying fact record can include country,
unit and whether it is a first-party observation or an estimate. Those
qualifications matter as much as the number.

A Google search click, an Analytics visit, an AI mention and a counted
conversion describe different stages. Supplier estimates of a rival's
traffic should not be compared as though they were your own measured visits.
The implementation includes checks for invalid comparisons and unsupported
numbers, but you should still verify that the question being answered is
relevant to the business decision.

The finding can also show explanations that were considered and ruled out,
a confidence label, a figure at stake and a future check date. A confidence
label is a recorded judgment, not an independent statistical certification.
A figure “at stake” describes the analysis's estimated opportunity or exposure;
it is not money already earned or a guaranteed effect of the recommended
action.

The evidence and ruled-out lists have table controls and downloads. When
sharing an extract, retain the host, period and source context. A downloaded
number detached from its definition can look much more certain than the
original finding. If a live source screen now differs, check when the
finding was saved: it retains the facts used at analysis time rather than
rewriting every old story with today's figures.

## Why the wording is checked

The analysis pipeline asks specialists to refer to named source facts rather
than freely type numerical claims. An internal editor fills the figures and
checks comparisons before publication. It can reject a finding with numbers
that are not tied to its evidence or with incompatible sources, spans and
countries. That is a useful guard against unsupported prose, not a promise
that every possible reasoning error has been eliminated.

One important measurement distinction concerns landing pages. Conversions
associated with visits that started on a page can happen elsewhere during
those visits. They do not establish that the landing page itself completed
every conversion. If an action depends on where conversion happened, inspect
the detailed source rather than treating a landing total as a page-local
transaction count.

The sources themselves can be incomplete, stale or configured differently
from what you expect. Changing Analytics' counted events or included
conversion addresses can change interpretation of historical results. Use
[Google Analytics](./google-analytics.md) for those definitions and
[Search Console](./search-console.md) for search coverage and retained detail.
The editor's checks cannot create missing source measurements.

## Hand an action to Ask Hakken

The finding's primary action can take its proposed work to Ask Hakken.
The implementation records that the finding was acted on and opens a prepared
question in the assistant. Review and send the question, then review any task
proposal the Assistant offers. The handoff is not automatic publication of a
website edit, creation of every suggested task or proof that the underlying
business fix happened.

This distinction matters when reviewing outcomes later. A person following
the handoff has expressed intent, but the actual change may still require
approval, implementation or an external system. Keep a record of what was
really changed and when. Do not report a recommendation as completed merely
because the finding now carries an action-related timestamp.

The Assistant's task proposal is governed by the actual task type, its
website, schedule and delivery channels. Optional task email preferences
also affect notification delivery. See [Ask Hakken](./assistant-chat.md) and
[Emails From Hakken](./emails.md) for those steps. An email being queued or a
question appearing in a conversation is not the same as a saved active
recurring task.

## Check dates and learn from outcomes

Findings can carry a check date, a progress observation and an outcome such
as right, wrong or too early. Review the figure chosen for that check and
when its observation window started. An implementation change on the page
can restart the relevant timing; a calendar deadline alone does not prove
that enough comparable data has accumulated.

The periodic analysis can inspect open findings and relevant page changes.
It records judgments using the source figures available then. A “right”
result under that rule is not a controlled experiment proving every suggested
cause, and a “too early” result should not be presented as failure or success.
Keep external changes, traffic levels and definition changes in view when
explaining what happened to a client.

The source code keeps findings and weekly records for approximately two
years, pruning older weeks when new ones are saved. It also replaces the
same website's existing finding set when analysis is rerun for the same
week. Do not rely on a rerun as an immutable archive of every earlier draft
or sent-back version. A historical finding link can become unavailable after
replacement or cleanup.

## Schedules, missing data and useful next steps

Platform super administrators control a company's Insights schedule. A
company can be switched off or run on a different cadence from another
client. The default company schedule is weekly, while the team dispatcher
can check for due work more often. Seeing no new issue today therefore does
not automatically mean the scheduler has failed.

Source collection and Insights analysis are also separate. An updated
Analytics connection does not prove the Insights team has already analysed
its newest figures. Conversely, an analysis can finish with recorded source
problems or no publishable findings. Use Sources and the last-looked timing
to identify missing coverage before requesting another potentially costly
run.

When asking for help, provide the company, host, finding identifier, week,
source dates and the disputed claim. Ask whether the issue is missing data,
a comparison definition, a failed analysis step or a mistaken interpretation.
Never include provider tokens or another company's private evidence. The
[developer guide](../developer/insights-findings.md) describes the typed facts,
publication checks, schedule and saved-state boundaries. This review ran no
analysis, made no source requests and changed no product behavior.

Related coverage now includes [Reports](./insights-reports-and-exports.md), [Strategy and planning](./insights-strategy-and-planning.md), [Measurement and enquiries](./insights-measurement-and-enquiries.md), [Page reviews and experiments](./page-reviews-and-experiments.md), [Competing pages](./competing-pages-and-search-ownership.md), [Page decisions](./page-decisions-and-create-candidates.md), [Leaderboards](./insights-leaderboards.md) and [AI growth](./ai-search-growth-and-buyer-questions.md). See [Track record](./insights-track-record.md) for change/outcome evidence. Internal editorial operations are documented in the developer and operator directories; they are not additional customer controls.

## Whole-section refresh status

The Insights section can show a refresh notice for each selected owned website. While work is running it counts completed stages; if work finishes without all required stages, it names unfinished sections and keeps successfully saved results available. A saved weekly brief is therefore not enough to conclude that reports, page decisions, buyer questions and every other section refreshed together. An older run without recorded stage evidence is shown separately from a fully recorded completion.

Large history work is split into saved steps. A source quota wait can postpone continuation until its allowance refreshes; repeatedly starting manual runs is not the normal recovery procedure. A later failed step does not erase every successful earlier output. Read the notice alongside the date and evidence in the particular report, and ask the operator to inspect the run if a section remains unfinished. Documentation maintenance inspected these local paths without starting a refresh, querying Google or proving that this version is deployed.
