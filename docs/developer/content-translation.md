---
product: Hakken
documentation_type: developer guide
feature_area: content translation
audience: developers and platform content operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/content-translation.md
last_reviewed: '2026-10-26T09:35:56+00:00'
reviewed_against: current implementation
status: Current
---
# Content Translation

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Content translation
> **Reviewed:** 26 October 2026, 09:35:56 GMT (Europe/London)
> **Source path:** `docs/developer/content-translation.md` · **Status:** Current

## Author once and translate eligible reader fields

Hakken's editorial content is written in English and translated by the
CONTENT_TRANSLATOR system agent. The main modules are
`convex/contentTranslation.ts`, `contentTranslationActions.ts`,
`contentTranslationSchema.ts`, `utils/contentTranslator.ts` and
`utils/contentLanguages.ts`. Readers receive a current translation when
available and source English otherwise. Publishing does not require a person
to fill separate language fields.

This is an internal developer/operator service. Customer language behavior is
already described in [Reading Room](../end-user/reading-room.md) and
[Emails From Hakken](../end-user/emails.md); a separate customer configuration
screen or multilingual-authoring workflow is not implied. This review made
no model calls, translated no stored records and ran no application tests.

Keep editorial translation separate from screen wording. `APP_LANGUAGES`
currently contains English and Italian; `SOURCE_LANGUAGE` is English and
`TRANSLATED_LANGUAGES` excludes it. Screen dictionaries in `messages/` have
separate parity checks. A future language needs both supported-language and
UI dictionary work; updating a sentence in this guide would not enable it.
The product's longer-term language ambitions are not present implementation.

## Owner types and publication conditions

`TRANSLATED_OWNERS` is a closed list: knowledge articles, Google updates,
news follows, News items, weekly digest issues, topics, library articles and
classification types. `sourceFields` chooses exactly what reader fields
belong to each owner. A new table is not automatically translated because it
contains an English text field.

Knowledge articles translate title/body only when PUBLISHED. Ordinary News
items translate title, summary and meaning, while a Google-update News item
returns no independent source because its update is translated once through
the update owner. Weekly digest issues translate the opening; topics translate
the name; follow recommendations translate why. Shared text should not be
translated twice through both a parent and its mirrored child.

Helpful content translates Hakken's summary and optional meaning only when
the library article is IN_KNOWLEDGE and has a non-empty summary. It does not
translate and republish the third-party source's full words as a reader
article. Built-in classification types keep their shipped localized names
until renamed; a custom or renamed type uses the content translation path.
Optional meaning fields join only when actually written so an absent value
does not gratuitously invalidate existing translations.

These are platform editorial owner types. The translation helpers do not
independently authorize an arbitrary user's write to an owner. Owning content
mutations/read projections establish access and publication rules; internal
translation operations use server-scheduled work. Do not expose a public
translate-owner action or company-private text through this shared service
without designing and testing its authority boundary.

## Fingerprints and safe fallback

`fingerprint` sorts field keys, serializes names and values and calculates a
short FNV-1a hash. It represents which source wording a translation came
from, not a cryptographic integrity or authentication guarantee. Source-key
ordering alone does not change the fingerprint.

`readerFields` first checks that the requested language is supported for
translation. It loads the owner/language row and requires its `sourceHash`
to match the current English fingerprint. An absent row or stale hash
returns English. For a matching row, non-empty translated values replace
corresponding source keys; an empty translated value leaves English in that
field rather than displaying a blank.

A changed article cannot rely on an older translation simply because it
shares the same owner ID. Publication changes and translated source selection
also matter: an ineligible/draft owner has no current source to translate.
Keep `sourceFields`, the read projection and the writer's scheduling behavior
in step when adding another field. A field copied into the model prompt but
omitted from the fingerprint would undermine stale-translation detection.

`translationProgress` counts stored translated-language hashes that match
current English. It returns zero total when no source is eligible. This is
a stored-work progress measure, not human language-quality acceptance.
A matching hash does not establish that names, links and numerical claims
were translated correctly.

## Immediate work, model selection and response parsing

An owner mutation calls `requestTranslation` to schedule
`contentTranslationActions.translateNow` immediately. That action ensures
the system agent exists and checks its active switch before translating.
Ensuring the agent refreshes its system definition but preserves an
administrator's on/off setting. A disabled Translator can therefore leave
English visible without making the owner's publication fail.

`sourceForInternal` supplies current eligible fields, their hash and missing
languages. `translateOne` resolves the stored `fast-chat` model use case,
serializes the fields and requests each missing language. The prompt asks
for the same field names, preserved Markdown/links/numbers/names and no
extra explanation. Model selection remains configuration-driven.

Each response records its model/provider usage through the staff run ledger.
`parseTranslation` accepts JSON with or without a code fence, requires an
object and requires every expected field to be a string. It returns only
those expected keys; extra keys in an otherwise valid object are ignored.
Do not repeat the stricter prompt wording as though the parser rejects every
extra field. Invalid/missing-string responses are not saved and that
language can remain missing.

`saveTranslationInternal` reloads the owner, recomputes eligible source and
checks the original source hash. If the English changed during the model
request, it returns false rather than overwriting with an outdated result.
Otherwise it replaces the existing owner/language row or inserts a new one.
This guards the source race, while existing indexed lookup/update semantics
avoid intentionally accumulating duplicate translations for the same pair.

## Backlog runs, bounds and recovery limitations

The agent Run/schedule path is `runTranslatorNow`, dispatched through the
agent role runtime. It asks `missingTranslationsInternal` for at most 50
eligible owner rows, translates them sequentially and records a final staff
summary or caught failure. The number of model calls also depends on how
many supported languages each row is missing; 50 rows is not an unrestricted
single-request translation of a database.

Discovery scans only the newest 200 records of each owner kind and visits
owner kinds in a fixed order. It has no persisted full-table pagination
cursor in this scan. Repeated Run calls are consequently not proven to
reach an old untranslated row outside that window, and earlier owner kinds
can fill the returned work limit. A summary saying everything is translated
means no missing rows were found in that bounded scan; it is not proof that
every historical record was checked.

Invalid model output can be skipped without failing the entire run. A
provider exception can abort the remaining sequential work and record a
failure. The inspected action does not schedule automatic continuation when
its 50-row limit is reached. These are operational limits to report rather
than fix by repeatedly invoking paid work during a documentation pass.
A durable full-backlog/resume change needs separate product and code review.

The weekly digest calls immediate translation before queueing but deliberately
continues in English if translation throws or writes nothing. Other readers
also fall back by hash rather than waiting for a human. See
[Email System](./email-system.md) for generation and send-time differences.
No claim that every configured consumer waits for successful translation
should be made from this service's existence.

## Storage, cleanup and verification

`contentTranslations` stores owner type, owner ID, language, string fields,
source hash and translation time. `by_owner_language` supports exact reads;
`by_owner` supports owner cleanup. `removeTranslations` deletes up to 50
translation rows for an owner and is called by relevant owning content paths.
It is not a generic tenant-data purge and does not prove every owner deletion
elsewhere has been wired correctly.

The current supported translated-language set is small enough for ordinary
owner updates, but expanding it should trigger review of query fan-out,
cleanup bounds, model spend and backlog completeness. Do not infer an
unlimited language or historical-retention guarantee from a string field in
the schema. No expiry policy for translations independent of their owner was
established in this review.

`contentTranslation.test.ts` covers published source translation, stale-source
fallback, drafts/disabled behavior, invalid replies, backlog work and key-order
fingerprints. `utils/contentLanguages` is also checked against screen language
availability. Before future code changes, add meaningful cases for source
races, eligibility changes and bounded scans rather than only asserting a
translated string exists. This documentation review inspected the actual
helpers and action flow without executing any model, scheduled run or live
backend mutation.
