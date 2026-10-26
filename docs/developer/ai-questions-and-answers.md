---
product: Hakken
documentation_type: Developer guide
feature_area: AI question membership and retained answer evidence
audience: backend and frontend developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/ai-questions-and-answers.md
last_reviewed: '2026-10-26T11:13:30+00:00'
reviewed_against: current implementation
status: Current
---
# AI Questions And Saved Answers Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** AI question membership and retained answer evidence
> **Reviewed:** 26 October 2026, 11:13:30 GMT (Europe/London)
> **Source path:** `docs/developer/ai-questions-and-answers.md` · **Status:** Current

Question membership is private to a company holding, while compatible provider answers can be shared. `websiteCanonical.ts` owns question lifecycle, `holdLists.ts` permitted membership reads, `siteAnswers.ts` text/index/list/detail handling and `siteAnswerShown.ts` saved app/model/page extras. `seoAiEngines.ts` maps supported engine identities and location semantics. List-summary aggregation is covered separately with AI visibility metrics; this guide focuses on question configuration and inspectable answer evidence.

## Entry Points And Configuration Writes

Customer routes are `/app/sites/[siteId]/ai/answers` and `/ai/answers/answer`. The list reads `answerQuestions` and `listAnswers`; detail reads `answerRecord` and `answerShown`. Record ids accept either retained text or older answer-summary ids. The customer selector preserves a requested missing question as an error/empty-list state rather than silently choosing another. An engine not selected for that question is not applied as a filter.

Operator routes include company website questions and their question detail editors under `/admin/companies/[id]/websites/site/[companyWebsiteId]/questions`. `addWebsiteQuestion`, `editWebsiteQuestion`, `setWebsiteQuestionActive` and `removeWebsiteQuestion` use `superAdminMutation`. These are platform-operator writes, not permissions granted by an ordinary tenant answer viewer. Read wrappers can admit platform oversight accounts, but that does not broaden the write guard.

`addWebsiteQuestionCore` cleans text, enforces eight through three hundred characters, rejects case-insensitive duplicates in the holding and checks resolved `promptsPerSite`. Invalid engine values are filtered; add defaults to the supported engine catalog when no valid choices remain. Edit preserves existing engines when omitted but refuses an explicitly empty valid set. The current catalog is chatgpt, perplexity, gemini, claude and ai_mode; supplier parameter mappings are not the same setting as Hakken's configurable internal runtime model defaults.

## Private Membership And Shared Answers

`answerQuestions` resolves the company holding with `requireMySite`, reads its list through `holdQuestions(listHold(site), MAX_LIST)` and returns selected engines/active state plus this company's brand names. `listAnswers` verifies the exact prompt through `holdQuestion` before reading shared evidence. `answerRecord` and `answerShown` additionally require the row's engine to remain selected and its location to match `answerPlace`. Guessing a text/answer id does not bypass those checks.

`listHold` supports paired competitor views without exposing another tenant's list. Shared prompt/engine/location indexes identify reusable evidence rather than tenant membership. Do not reverse that relation into a query that discovers which companies asked a prompt. `answerShown` has a direct `websiteKeywords.by_hold_keyword` lookup for its tracked flag; although company-holding scoped, it is outside the repository's prescribed holdLists helper path. Record that structural discrepancy rather than changing backend source during this task.

Engine display distinguishes APP for ai_app operations, PAGE for the AI Mode citation operation and MODEL otherwise. Location mapping follows the actual engine helper, not the website selector label alone. App extras can differ from model responses even under the same engine identifier. Local source support does not prove a current vendor model is available, that a request succeeded or that the saved operation still exists on a provider's side.

## Text And Index Persistence

`aiAnswerTexts` stores pull id, prompt, engine, location, day, capped text, source addresses and creation time. Its indexes include `by_pull` and `by_prompt_day`, plus the `search_text` search index filtered by prompt/engine/location. `aiAnswerIndex` is a light list projection with `by_question` and `by_text`. Older structured `aiAnswers` and citation tables retain named/cited facts separately from wording.

`fileAnswerText` deletes up to five earlier text rows for the same pull through `deleteAnswerText`, trims new text and refuses to store an empty body. It stores at most sixty thousand characters and forty addresses before writing the light index. Thus the viewer's word-for-word presentation is bounded saved text, not an unlimited original supplier payload. An abnormal pull with more than five duplicate old text rows is not proven fully reconciled by that bounded cleanup.

`indexAnswerText` checks `by_text` before inserting its projection. `deleteAnswerText` removes the first corresponding index row, saved app extras for that pull when found and then the text. It does not delete the structured answer or all citations. `keepRules.ts` declares wording cleared after ninety days while structured named-answer evidence is retained; the collection sweep calls this helper. The operation is not an erasure of every shared provider record or an external deletion request.

## Lists, Search And Historical Fallback

Date-only browsing reads up to five thousand plus one index rows per selected engine/place, setting a cut flag when the read exceeds its ceiling. For a range reaching before wording retention, it also reads older structured answer rows and deduplicates pull ids already represented by retained text. This handles the interval where a record is older than policy but its wording has not yet been swept. Within recent dates, an unworded structured record is not automatically a full-answer text-list entry.

Text search uses the longest typed word to query `search_text`, takes fifty candidates per engine, then applies the date range and full word-start matcher. The bound precedes some filtering, so a small final result is not evidence of a complete search. A candidate count equal to the ceiling reports a cut even when the exact number beyond it is unknown. Expired wording cannot be searched by reconstructing it from a retained mention summary.

The combined entries are sorted by day/engine and paged with the shared exact-held-list helper. Full text is fetched only for displayed ids; a missing text row can reduce returned rows relative to the earlier projection count. Structured fallback rows return text null, cited-source addresses and stance. The query's total describes held candidate entries, not a census of every answer a provider ever produced. Keep preparation, missing, expired and cut states distinct in callers.

## Answer Detail And Extras

`answerRecord` resolves the accepted id, rechecks prompt/engine/location membership and returns wording or null, stance, company names, sources and up to twenty-five prompt/engine/place fan-out summaries. A source on the selected host or subdomain maps to a local page path; other sources remain external. The fan-out summaries are persistent question/engine observations and should not be called an exact trace of one answer's reasoning.

`answerShown` adds same-day other-engine text links, operation-kind labels and retained `aiAnswerExtras`. It compares listed business hosts/names to the site's known brand names, marks read pages that were also cited and reports saved searches with current organic position and private tracked state. These fields are only as complete as the saved extraction. The returned same-day links depend on a retained text index; after wording expiry a summary can remain while that switch has no text target.

The UI renders supplier answer text through `HakkenMarkdown`. It is external model output shown as evidence, not an instruction granting tool access or permission to mutate a tenant's configuration. A company brand-name match or stance is not verified commercial endorsement. Errors or missing extras should not cause the caller to synthesize businesses, sources or content that was never saved.

## Lifecycle Side Effects And Background Work

Add schedules `siteListAi.recountQuestion` so already held compatible answers count immediately. Edit keeps row identity and active state, updates exact words/engine set and schedules recount. Changing words also schedules `promptFanOut.forgetQuestion` and a delayed angle rebuild; the five-second ordering delay allows choices to be read before rebuilding. Same words with new engines still rebuild angles and recount the new selected set.

Removal deletes private membership and schedules old-word reconciliation, leaving shared purchased facts for other permitted readers. Pause/resume changes active state and audits the action without deleting the history. Do not document these handlers as a generic provider purge or as proof that all background effects have finished when the mutation returns. The ordinary collection owns new provider work, retries and quotas; answer-viewer queries are reads.

## Validation And Relevant Tests

Source tests include `siteAnswersKept.test.ts`, `siteRecords.test.ts`, `siteFanOut.test.ts`, `privateLists.test.ts`, `siteListCopies.test.ts` and `siteAuditFixes.test.ts`. The retained-answer tests cover ninety-day text cleanup, old-summary viewing, searching current wording and deduplication while cleanup lags. Private-list tests cover separate owners/competitor contexts and hold removal. This documentation pass inspected source/declarations without executing those tests or claiming live acceptance.

No provider credential values are required in this guide, and no app, browser, paid call, collection, data fill, mutation or migration was run. Maintain company membership checks before shared evidence reads and update the index/text cleanup together when changing persistence. Broader source/read/share-of-voice metrics remain a separate reviewed capability; the existence of this pair does not declare all PRODUCT.md Part Three outcomes or external rename cutover complete.
