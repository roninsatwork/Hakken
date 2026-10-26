---
product: Hakken
documentation_type: end-user guide
feature_area: keyword research
audience: company members and administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/keyword-research.md
last_reviewed: '2026-10-26T09:05:30+00:00'
reviewed_against: current implementation
status: Current
---
# Keyword Research

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Keyword research
> **Reviewed:** 26 October 2026, 09:05:30 GMT (Europe/London)
> **Source path:** `docs/end-user/keyword-research.md` · **Status:** Current

## Purpose and who can use it

Keyword Research helps a company investigate searches before deciding what
to track or which pages deserve attention. It combines keyword overview
figures, search history, Google result observations, related ideas and a view
of what AI assistants say about a question behind the keyword. It also lets
you organize a shortlist and add selected searches to an owned website's
tracking list.

Open `/app/keyword-research` in the company workspace. Eligible company
members can look up, organize and track; platform oversight/read-only roles
can inspect rather than buy or change. The backend enforces those boundaries.
A lookup and research list belong to the company, while the underlying
purchased observation can be shared for reuse. Seeing an observation that was
already bought is not permission to read another company's shortlist.

This guide describes local implementation reviewed on the date above. It is
not a record of a live purchase or assurance that supplier credentials and
credits are available in your deployment. The broader product vision remains
in [PRODUCT.md](../../PRODUCT.md); keyword metrics and sample AI answers do
not establish a complete asset profit-and-loss or causal business result.

## Prepare a lookup

Choose the country and, where useful, one of your company's owned websites
to measure the keyword against. A lookup without a website can still describe
the search, but it cannot establish where your business ranks or which page
it should track. Only offered countries are accepted. The initial country
can come from the selected website's home context; check it before sending
several keywords.

Enter one or more keywords. Empty entries are ignored and equivalent phrases
are normalized and deduplicated. The permitted number in one lookup is
controlled by company/platform limits rather than an unlimited bulk import.
If the request is refused, shorten the batch or ask an administrator to
review the actual configured limit. Do not repeatedly submit a large list
hoping one attempt bypasses the rule.

Country is part of a result's identity. The same phrase in two countries can
have different volume, competition and result pages. Location can be more
specific for a search naming a city, so an older whole-country observation
is not automatically a valid substitute for the requested local result.
Retain that context when exporting or comparing figures.

## Saved results and purchases

**Look up** can start the Keyword research agent for data not already held
and sufficiently fresh. It is not merely a local search box. Where matching
fresh results already exist, Hakken can reuse them rather than buying them
again. The freshness period is configured by limits and can differ from what
you regard as a suitable reporting window.

**Look up again** deliberately requests fresh data even when an earlier
observation is recent. Additional parts, including detailed Google results,
Ideas and What the AI says, can also start purchases when first opened or
when their data needs refresh. Read the displayed cost/context before
opening a new part. Visiting a detail page should not be treated as a
universal free read of a static database.

Supplier cost estimates, actual returned supplier costs and product credits
are different records. The interface's estimate is guidance based on the
implemented pricing model and configured quantities; it is not a guaranteed
current supplier quotation or an invoice. Do not assume a “Test” label on an
old agent setting makes a lookup free. The current research implementation
buys real data unless the platform itself is explicitly configured for its
supplier sandbox. Sandbox samples must be distinguished from real figures.

## Understand the overview

The overview can show search volume, historical monthly demand, cost per
click, advertising competition, ranking difficulty, intent and Google result
features where the supplier returned them. Missing fields remain unknown;
a blank value should not be presented as a measured zero. Advertising
competition describes advertisers, not automatically the difficulty of
organic ranking.

Monthly search history keeps up to twenty-four months of the supplied
history. That history is not a promise that the keyword was tracked daily
for two years or that your website received those visits. A seasonal pattern
in estimated demand should be checked against the business's actual market
and first-party results before deciding to invest in a new page.

When an owned website is selected in the matching country context, Hakken can
relate observations to the website's page, position and competitors.
A lookup in another country may intentionally omit that website-position
comparison rather than reuse a position measured somewhere else. Check the
selected website and country when a familiar ranking is absent.

Use the overview to form a question: whether an existing page serves the
search, whether the topic is relevant, and whether stronger pages dominate.
A difficulty label or traffic estimate is not proof that a new page will
rank or create sales. Follow through to the actual result context and the
company's objectives.

## Google results, ideas and AI answers

The Google result view can show the top results and where the selected
website or its competitors appeared within the top hundred observation.
Additional detail about leading pages includes strength, linking websites,
estimated visits and other searches associated with them. “Not in the top
hundred” is a bounded observation, not a claim that no page from the website
could ever appear for any searcher.

Ideas combines terms matching the topic, question searches and terms leading
pages also rank for. The number retained is limited by company settings.
A suggested phrase is a research candidate, not an automatic addition to a
tracking list and not evidence that your company should publish an article
for every term. Select a coherent shortlist rather than treating a long
ideas table as a ready-made content plan.

**What the AI says** uses a question behind the keyword and asks supported
assistants, alongside Google's AI Overview search information where returned.
The question is a different input from the original short search phrase.
Review it when interpreting which businesses an answer names. A named brand
or citation in one observed answer is not a stable recommendation rate,
representative buyer panel or guaranteed future response.

An explicit refresh of AI answers can buy those observations again. Inspect
both the wording and the time of the saved answer before paying for another
one. The implementation's generated question and shared answers do not
establish delivery of the planned target-blind, versioned prompt-panel
methodology in PRODUCT.md.

## Research lists and tracking

Save useful terms into an existing research list or a named new one. A list
can be associated with one of the company's owned websites. Other company
members can use the same company list within their permissions; it is not a
personal private note or a global list for all Hakken customers.

Lists have bounded capacity, and the backend validates names, membership and
items rather than trusting an edited address. You can rename a list, remove
terms or delete the list through the available controls. Removing a research
list entry is different from erasing the shared purchased observation or
removing an already tracked search from a website.

To use **Track**, the list must identify the owned website it is measured
against. Tracking adds selected new terms to that website's private tracking
list, skips terms already present and respects the website's tracking
limits. It does not retroactively create daily tracking history. If a
tracked count is smaller than the number selected, first check duplicates
and limits before concluding that data was lost.

## Waiting, failures and practical use

A lookup can be waiting while its agent buys and files the requested parts.
The overview, results, ideas and answers have separate readiness states.
A ready overview therefore does not prove that AI answers or all result
details are already complete. Longer work can continue in another scheduled
part of the same run rather than requiring a person to press repeatedly.

A missing or switched-off Keyword research agent is a configuration problem
requiring administrator attention. A provider failure, unsupported country,
exhausted allowance and stale data are different conditions. Read the
reported problem and the relevant part's status. An older observation must
not be silently reported as the successful answer to a failed fresh request.

For a useful research session, choose the website/country, inspect the
existing overview, shortlist relevant ideas, review the result context and
track only the terms that merit ongoing attention. Keep estimates separate
from [Search Console](./search-console.md) clicks and
[Analytics](./google-analytics.md) visits or conversions. Report a failure
with its lookup, part, website, country and visible reason, never provider
credentials. The [developer guide](../developer/keyword-research.md) describes
jobs, tenant checks, shared data and credit hooks. No purchases or live calls
were performed for this documentation review.
