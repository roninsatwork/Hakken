---
product: Hakken
documentation_type: Operator runbook
feature_area: News collection and editorial recovery
audience: operator
source_repository: roninsatwork/Hakken
source_path: docs/operator/news-collector-and-editorial-recovery.md
last_reviewed: '2026-10-26T14:15:04+00:00'
reviewed_against: current implementation
status: Current
---
# News Collector And Editorial Recovery

> **Product:** Hakken · **Document type:** Operator runbook · **Feature area:** News collection and editorial recovery
> **Reviewed:** 26 October 2026, 14:15:04 GMT (Europe/London)
> **Source path:** `docs/operator/news-collector-and-editorial-recovery.md` · **Status:** Current

The News Collector reads enabled channels from Who to follow and publishes English news summaries, then requests translations. It is an internal agent operation. Readers use the [Reading room](../end-user/reading-room.md); engineers can inspect [the implementation guide](../developer/news-collector-and-editorial-recovery.md). A collected summary, a retained full article, and an emailed digest are separate outputs.

## Establish the state before acting

Inspect the collector agent's run summary, timeline, configured model, spend limit, and the affected channel's last checked/problem fields. A successful run may have added nothing, skipped an unsupported source, or stopped at a limit. Do not infer collection success solely from its status. The stable role is `NEWS_COLLECTOR`; renaming the display label does not change dispatch.

Collect-enabled websites use feeds first and scraper fallback where needed. YouTube uses channel feeds. LinkedIn is skipped regardless of a saved tick. X account collection requires the configured app token; bookmarks require a connected account. Missing X configuration is reported without reading that account. Never paste tokens or private bookmark contents into a troubleshooting note.

The selection reads up to 100 channel rows before skipping unsupported/missing parents. First reads take five new items; ordinary feed processing takes up to 50; page fallback takes up to ten candidate articles. The collector stops starting work after seven minutes or a recorded spending limit. A large source or old back catalog is not guaranteed to be complete after one run.

## Understand what a later run can recover

The current collector finishes with a summary and relies on a later run for remaining work. It does not schedule an immediate same-run continuation at its time cutoff. This is a documented implementation gap against the project's general automatic-handoff rule. Do not tell customers that a timed-out collector is guaranteed to hand itself on continuously.

Duplicate external keys are excluded, and taken-down items are tombstoned so collection does not simply republish them. Deleting a tombstone or replaying provider requests is not routine housekeeping. Account cursors can advance before all fetched X posts are summarized, and bookmark processing can advance past invalid model output. A later run therefore does not guarantee recovery of every unsaved item.

Read failures retain a readable channel problem and let other channels continue. Invalid model output can incur cost without publication. Successful English publication can precede translation. Check these stages separately before deciding where a fault occurred. Quota refusal is a reason to stop and inspect the allowance, not to run a retry loop.

## Keeping and removing knowledge copies

The In knowledge control is a super-admin action. Existing articles at the same address can be linked without another paid read. Otherwise retention starts an asynchronous full-article fetch. Videos have no article to keep; an X post needs an external article link. Unsafe addresses, failed extraction, and insufficient article words produce explanatory failure states.

An untick can remove the copy created by that story, while independently added articles remain. Taking the story down from News leaves its retained knowledge article in place. If the intention is removal from both places, each actual record and its ownership must be reviewed; do not assume one action cascades through all content.

A story left in Reading after an unexpected action failure needs investigation. The reviewed path has no general automatic retry/watchdog for that state. Before any separately approved recovery, establish whether an article already exists, whether the story is still pending, and whether another fetch will cost money. This documentation pass authorizes no recovery mutations, model/provider requests, or collection runs.

News history is retained indefinitely under the current keep rules, independently of the 90-day raw readership-event policy. Source tests establish local sample behavior only. They do not certify live X, scraping, translations, email delivery, or completion of the external rename cutover listed in [PRODUCT.md](../../PRODUCT.md).
