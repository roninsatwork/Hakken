---
product: Hakken
documentation_type: End-user guide
feature_area: Platform overview
audience: users administrators and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/platform-overview.md
last_reviewed: '2026-10-26T14:48:56+00:00'
reviewed_against: current implementation
status: Current
---
# Platform Overview

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Platform overview
> **Reviewed:** 26 October 2026, 14:48:56 GMT (Europe/London)
> **Source path:** `docs/end-user/platform-overview.md` · **Status:** Current

Hakken is the product described in [PRODUCT.md](../../PRODUCT.md): understanding which digital assets contribute to leads and sales, identifying a broken stage, and proving improvement. This tour describes workflows found in the current repository, including the inherited platform foundations and newer website/Insights implementation. PRODUCT.md still distinguishes foundations from planned product surface; its older unbuilt statements disagree with some newer code. That needs a product-owner reconciliation. This guide does not declare all of Part Three delivered or change the roadmap.

Use the [documentation front door](../index.md) for current coverage and the audience indexes for detailed guides. A route or saved configuration found locally is evidence of implementation, not proof that a deployed account has enabled modules, accepted provider connections, current data, or completed the rename cutover in PRODUCT.md section 33. The public landing page also retains framework-oriented copy that does not establish product direction.

## Your Workspace And Access

The authenticated customer area is under `/app`. Your company context determines private records and available operations. A platform operator can impersonate a company where the implementation supports it; the selected workspace matters for private lists, tasks, conversations, and company-owned website holdings. Shared supplier measurements do not make a company's tracking choices public to every other company.

Standard users work with the customer features allowed by their role and company. Company administrators additionally manage workspace/team functions and frontend billing. Super-admins operate the platform console. Read-only console readers and auditors have narrower evidence-oriented access where explicitly allowed. A visible menu is guidance, not the server permission boundary; a link can be unavailable because of role, module, or current configuration.

The app landing route contains a platform introduction rather than a complete report of your business. Use the actual navigation destinations and their dated evidence to investigate a website. Do not interpret introductory illustration figures or product prose as measured results for your company. [Access and authentication](./login-access-and-authentication.md) and [Company workspace administration](./company-workspace-administration.md) explain those boundaries in detail.

## Websites And Their Measurement Connections

Sites is the estate and visibility workspace. It distinguishes a website host from a company's holding of that site, its ownership relationship, competitors, and private tracking lists. Begin with [Websites and visibility](./websites-and-visibility.md). The holding is central to access: knowing a shared host or search identifier does not authorize another company's tracked terms or AI questions.

Google Analytics, Search Console, Bing Webmaster, and Microsoft Clarity have their own connection and reporting paths. They differ in provider permissions, stored windows, limits, expiry/disconnection behavior, and what zero or missing data means. A connected account alone is not evidence that a complete year of data exists. Use [Analytics](./google-analytics.md), [Search Console](./search-console.md), [Bing](./bing-webmaster.md), and [Clarity](./microsoft-clarity.md) before interpreting source comparisons.

Visibility reports cover organic keywords/pages, paid search, backlinks, AI answers/citations, brand radar, competitors, local maps/business profiles, reviews, technical audits, and web mentions. The detailed guides describe which values are supplier estimates, held snapshots, personal tracking membership, or inferred recommendations. These are distinct evidence sources rather than a single guaranteed live scan of the internet.

## Insights And Practical Follow-Through

Insights Findings explains a recommendation, supporting facts, alternatives ruled out, an action, and a later check. [Insights findings](./insights-findings.md) covers that core journey. The advanced screens provide reports/exports, strategy/planning, measurement/enquiries, page reviews/experiments, competing-page decisions, page creation candidates, leaderboards, and AI growth/buyer questions. Each guide records current selection bounds rather than assuming every screen is exhaustive.

A recommendation is not automatically a published website edit. Approved local/review/link drafts have a separate preparation and approval path. Task handoff creates work to review and perform; it does not prove a third-party change was accepted. Some experiment and attribution screens have important limits, including saved-period comparisons and shared campaign counts. Read the actual values and evidence notes before presenting a business outcome.

[Track record](./insights-track-record.md) combines findings, acknowledged actions, observed changes, and later figures. Its company and selected-site tally scopes differ. Page replacements can be inferred, campaign totals can overlap across drafts, and aggregate learnings are contextual rather than controlled causal proof. The documented zero-to-zero growth-label edge case is another reason to report figures with labels. A record of advice being right is not a complete sales-attribution or revenue account.

## Assistant, Photos, And Spoken Channels

Ask Hakken stores conversations and can use authorized knowledge, company instructions, skills, and memory. A selected agent can bring governed tools and its own execution path. [Assistant chat](./assistant-chat.md) explains normal conversation flow, attachments, errors, and persistence. Retrieved source text is reference material; it does not grant extra access or automatically become an authorized instruction.

[Photo actions](./photo-actions.md) attach image evidence to a turn and can offer a reasoned follow-up task. Confirmation files the stored proposal; merely seeing the card does not create work. Supported image processing depends on the actual vision path, and the widget uses smaller upload limits. A conversation attachment is not automatically a searchable company document or an immediately deleted file.

Voice, inbound phone calls, Telegram, and embedded widgets are separate channels with their own credentials, delivery/session rules, ownership and external acceptance. Do not assume one successful web answer proves phone, bot, or widget readiness. A widget reset clears local session state rather than certifying removal of every server record. Follow [Spoken channels](./spoken-channels.md), [Telegram](./telegram.md), and [Embedded widgets](./embedded-widgets.md) for the current contracts.

## Knowledge, Reading, And Personal Context

Knowledge management imports documents, text, and supported web material through bounded processing paths. Company Wiki turns approved knowledge into maintained pages with receipts, corrections, links, review questions, and answer context. [Company Wiki](./company-wiki.md) distinguishes human-owned text, source notes, staff maintenance, unanswered demand, and check/report limits. A checked timestamp is not always a declaration that every claim is supported.

The Reading room provides published platform content, retained articles, news, and followed people. Readership analytics is a super-admin editorial tool rather than a customer cross-company report. Keeping a news article and deleting a news story have different retained-copy effects. See [Reading room](./reading-room.md) for customer controls and the operator guide for interpretation of engagement counts.

Personal notes, company memories, and agent memories are separate layers. A count of personal notes learned in a weekly report does not expose their contents to administrators. Account/profile and workspace settings also have different owners. The relevant guide explains how a saved note is applied and how it can be removed; no general promise that all historical prompts or records disappear follows from deleting one current memory.

## Tasks, Automation, And Platform Administration

Customer tasks and Hakken's suggestion/task workflows track assignments and progress. Finishing an application task is a saved state change, not automatic verification of outside work. Notifications can link a person to the record needing attention. [Tasks and notifications](./tasks-and-notifications.md) and [Hakken tasks](./hakken-tasks.md) explain the different sources and audiences.

Platform agents and visual workflows support repeated work, limits, approvals, execution evidence, and recovery. Readiness warnings are advisory in current agent activation. Contract checks, model-graded checks, and rehearsals prove different things, and normal evaluations can invoke real runtime work. A manual workflow run uses its saved graph, while the schedule-list workflow force-run retains a simulation distinction. Use the detailed agent/workflow guides before relying on unattended side effects.

Company administrators use Billing at `/app/settings/billing`; platform setup and oversight are super-admin tasks. Stripe handles hosted payments/invoices. Paid-company and covered-user counts differ from revenue and per-seat billing, and assigned-plan inventory value is only a formula. Supplier credits and model spend are separate again. [Plans and quotas](./platform-plans-and-quotas.md) and [Credits and usage](./credits-and-usage.md) describe those measures.

Governance, audit, health, retention, and settings are evidence and operating controls. Reports are bounded, exports can contain sensitive records, and a successful local test does not establish a deployed deletion or provider acceptance. Known source issues are recorded in the central inventory for separate application decisions. Optional arcade/sandbox experiences remain auxiliary; Sales Data, Properties, movement/posture and Swarm screens were not found in the reviewed current routes. Their residual records require manual review before deletion. This tour was refreshed without running an app, modifying behavior, calling providers, or changing historical plans.
