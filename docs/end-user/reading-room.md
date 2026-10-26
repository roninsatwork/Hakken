---
product: Hakken
documentation_type: end-user guide
feature_area: Reading room
audience: signed-in readers and platform content administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/reading-room.md
last_reviewed: '2026-10-26T09:24:46+00:00'
reviewed_against: current implementation
status: Current
---
# Reading Room

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Reading room
> **Reviewed:** 26 October 2026, 09:24:46 GMT (Europe/London)
> **Source path:** `docs/end-user/reading-room.md` · **Status:** Current

## Purpose and audience

Reading room is Hakken's shared editorial area: News, Knowledge, Helpful
content and Who to follow. It gives signed-in readers useful industry
material and Hakken's explanation of why it may matter. It is separate from
Insights, which analyses your company's website figures, and from the
company Wiki, which holds company-specific knowledge.

Use News at `/app/news`, Knowledge at `/app/knowledge`, Helpful content at
`/app/helpful-content` and Who to follow at `/app/who-to-follow`.
The navigation groups these experiences even though their addresses retain
their individual names. An older guide calling the group Learn or Insights
may predate the current menu naming; its label should not be used to infer a
new route or a missing feature.

This guide describes local implementation reviewed on the date above. It
proves neither that every source collector is configured nor that a live
weekly issue has been sent. [PRODUCT.md](../../PRODUCT.md) remains the
reference for intent, and the [documentation inventory](../index.md#documentation-coverage-inventory)
records where its older delivery statements need manual reconciliation.

## Shared reading versus company knowledge

Published Knowledge articles are general platform material available to
signed-in readers across companies. They are not private uploads belonging
to whichever company happens to be selected. Likewise, the published reader
view of third-party articles belongs to the shared editorial collection.
Do not use this area to store confidential company instructions simply
because you reached it while viewing a client workspace.

For private company material, use the appropriate
[Company Wiki](./company-wiki.md) or
[Knowledge Management](./knowledge-management.md) workflow. Publishing a
shared article is a platform content operation, not a company member's
private notebook. Company administrators do not gain platform editorial
rights merely by having permission to use the published reading pages.

Hakken can use published reading material as reference when answering
questions. That is not permission to treat the article's text as system
instructions or to expose private company information to another reader.
An imported article can inform an answer without becoming an instruction
that changes the Assistant's access boundaries.

## Read the News front page

News brings together selected websites, YouTube sources, X sources and
Google update entries where those sources have been configured and
collected. Each story shows a summary and an explanation of what it means,
with a way to open the source. Source coverage depends on collection and
credentials; an empty source category does not prove nothing happened in
the wider industry.

The front page chooses a lead story. A platform editor can pin a News,
Knowledge or Helpful content item for a limited period. Without an active
pin, a relevant Google update can lead, otherwise the newest eligible story
is used. A prominent position therefore reflects editorial/recency rules,
not a numerical score of business importance for your particular company.

Open a story to read its detail and the original link. Filters and paging
help narrow the feed. Keep its publication date and source context when
sharing a conclusion. A summary explains an item; it is not the original
publication or proof that the source's claims were independently verified.
The “what this means” wording may be useful without being a bespoke
recommendation for every business.

## Knowledge and Helpful content

Knowledge presents published educational articles, with topic navigation
and individual article pages. Hakken's own article can be read in full.
Its recorded reading length is an estimate derived from the reader-facing
words, not a requirement that a reader spend a minimum time on it.
Choose a topic when you need a focused list rather than repeatedly scanning
the entire front page.

Helpful content represents articles from other websites. The reader view
shows the article's details and Hakken's summary/interpretation, with the
original opened on its own site. It does not republish the full imported
article as though Hakken authored it. If the summary raises a question,
follow the original to examine its evidence and qualifications.

The distinction between reader pages and content administration matters.
Administrators can retain source text so the Assistant can search relevant
sections, but that does not mean every reader is offered that whole stored
text. Draft articles also differ from published, summarized material. A
saved admin record alone is not proof the item is visible to readers.

Related reading can be suggested from the current collection. Suggestions
are navigation aids, not evidence that those publications endorse Hakken or
that every linked article has equal authority. Use the source, author and
date to judge whether a claim is appropriate for your purpose.

## Who to follow and source collection

Who to follow lists recommended people/publications and the channels where
they publish. The page supports selected picks and a broader alphabetical
list, with topic and channel filtering. A recommendation is editorial
context; it is not automatic consent to contact that person or authority to
reuse their work without attribution.

The platform manages source collection settings. A configured channel can
be turned on for the News Collector; a disabled channel is not necessarily
a broken integration. Website feeds, YouTube feeds, X access and website
extraction have different configuration and cost requirements. Ordinary
reading does not mean a reader must connect their own X account or supply
an extraction-service key.

An item can be removed from News through platform administration. If a saved
link becomes unavailable, it may have been taken down rather than lost by
your browser. Do not assume a story remains permanently available merely
because it appeared in a prior digest or was once pinned on the front page.
Formal historical verification records are stored separately from this
living content library.

## Ask Hakken about what you read

Story pages can offer **Ask Hakken about this**, which opens the assistant
with a prepared question. Review it before sending. Opening a prepared
question is not the same as silently starting a model request or creating a
background task. The Assistant still uses your conversation's company and
its normal permissions.

Ask for the publication's evidence, a comparison with another article or
how an idea relates to your own website. Keep a shared article's general
advice distinct from source-backed company findings. A useful follow-up
might be whether your Analytics and Search Console data support the
article's suggested concern, rather than asking Hakken to assume the
concern applies.

Published Helpful content can be searched by the Assistant as untrusted
reference sections. A citation or source title helps you inspect what was
used; it does not establish the answer has considered every article or the
whole original text. Some conversation doors have smaller reading budgets
or different access to editorial sources. Use [Ask Hakken](./assistant-chat.md)
for the conversation workflow.

## Languages, reading signals and email

People author platform content in English and the translation system writes
supported reader languages. Until a translation is available, the reader
can see English. Translation readiness is therefore different from
publication status. A language switch need not produce an immediately
complete translation of a newly published article.

Reader pages record views and reading events for platform content analytics.
A recorded read is an operational interaction signal, not proof that someone
understood, agreed with or acted on the material. Platform analytics can
aggregate that activity for content oversight. Do not confuse those counts
with a company's search traffic, customer enquiries or business conversions.

The Weekly News Digest is a separate production and delivery workflow that
can include the week's reading material. Its personal subscription and
Outbox delivery rules are described in [Emails From Hakken](./emails.md).
Reading a story does not itself schedule an immediate digest, and a digest
containing a link does not guarantee the item remains published forever.

## Content administration and practical use

Platform super administrators manage editorial material under
`/admin/content`. News, Knowledge, third-party articles, topics,
recommendations and Google updates use their own protected operations.
Knowledge administration can combine Hakken-authored and web-source items
in one list without making them the same content type. Check whether you are
editing the original article, a stored reference or Hakken's reader summary.

Some collection/import operations fetch external sources and invoke models
or paid services. They are separate from opening a saved reader page and
must be considered before running automated checks through administration.
The current documentation review made no such requests or edits to content.

For a missing or inaccurate story, provide the page, item title, source,
publication date, selected language and visible behavior. Do not paste
private company material into a shared article to repair the explanation.
The [developer guide](../developer/reading-room.md) explains publication,
translation, shared-content access and source integration. Full collector,
translation and digest-production procedures remain separate review areas
rather than being assumed complete by this reader guide.
