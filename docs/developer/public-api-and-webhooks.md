---
product: Hakken
documentation_type: Developer guide
feature_area: public API keys, run triggers and webhook foundations
audience: integration owners, developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/public-api-and-webhooks.md
last_reviewed: '2026-10-26T10:39:47+00:00'
reviewed_against: current implementation
status: Current
---
# Public API And Webhooks

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Public API keys, run triggers and webhook foundations
> **Reviewed:** 26 October 2026, 10:39:47 GMT (Europe/London)
> **Source path:** `docs/developer/public-api-and-webhooks.md` · **Status:** Current

The public integration surface is implemented by `convex/apiKeys.ts`, `convex/publicApi.ts`, `convex/http.ts`, `convex/webhookDeliveries.ts`, `convex/webhookDeliveryActions.ts`, and the admin settings page for API keys.

## Route Map

Admin UI:

- `src/app/(dashboard)/admin/settings/api-keys/page.tsx` creates, lists, filters, and revokes tenant-scoped API keys.

Convex HTTP routes in `convex/http.ts`:

- `GET /api/public/v1/ping`
- `GET /api/public/v1/run-status`
- `POST /api/public/v1/agent-runs`
- `POST /api/public/v1/workflow-runs`
- `POST /api/webhooks/workflow`
- `POST /apify-webhook`

This document focuses on public API key flow and the unconnected outbound delivery foundation. The workflow webhook endpoint is part of workflow automation, and the Apify webhook supports property research ingestion.

## API Key Model

`convex/schema.ts` defines `apiKeys` and `publicApiRequests`. API keys store company id, name, key prefix, SHA-256 digest, scopes, status, rate limit, creator, creation time, last-used time, optional expiration, and revocation metadata.

The raw secret is generated in `buildOneTimeApiKey` and returned only from `api.apiKeys.create`. The stored prefix supports lookup, and the digest is checked with constant-time comparison during authentication.

Supported scopes are:

- `agent:run`
- `workflow:run`
- `run:read`
- `webhook:deliver` (accepted on existing keys, no longer offered; no endpoint checks it)

`create` and `revoke` require admin access. Super admins must choose a target company for tenant-scoped keys. Company admins are restricted to their active company. Both creation and revocation write audit log rows.

## Public Request Authentication

`internal.apiKeys.authenticatePublicRequest` is the gate for public endpoints. It:

- extracts and validates the `hakken_...` key prefix
- looks up the key by prefix
- hashes the presented key and compares it with the stored digest
- rejects revoked and expired keys
- enforces the required scope
- enforces the key's per-minute rate limit using recent authorized `publicApiRequests`
- updates `lastUsedAt`
- records every allowed or denied request in `publicApiRequests`

The default rate limit is 60 requests per minute. The maximum accepted rate limit is 600 requests per minute.

## Public API Handlers

`convex/publicApi.ts` exposes JSON HTTP handlers:

- `handlePublicApiPing` requires `run:read` and returns authenticated key metadata.
- `handlePublicRunStatus` requires `run:read`, requires a `runId` query parameter, and reads a company-scoped run status via `internal.agentRuns.getPublicRunStatusInternal`. The returned run payload is a bounded summary with run identity, status, trigger type, timing, token/cost fields, output/error previews, replay mode, and counts for steps, approvals, and tool calls.
- `handlePublicAgentRunTrigger` requires `agent:run`, parses JSON, requires `agentId` and `objective`, and creates a company-scoped agent run through `internal.agentRuns.createPublicAgentRunInternal`. The internal helper trims the objective and rejects values over 4,000 characters. Successful responses include `runId`, `status`, and a relative `statusUrl` for polling the public run-status endpoint.
- `handlePublicWorkflowRunTrigger` requires `workflow:run`, parses JSON, requires `workflowId`, stringifies object `initialInput`, and creates a company-scoped workflow run through `internal.workflows.createPublicWorkflowRunInternal`. The internal helper trims input and rejects values over 20,000 characters.

Handlers return `{ ok: false, error }` with appropriate HTTP status codes for auth, scope, rate-limit, parse, and validation failures. Successful run triggers return `202`.

Public trigger targets are tenant-bound. Agent run creation rejects missing, inactive, or cross-company agents through the same not-found/inactive error path. Workflow run creation rejects missing, inactive, non-webhook, or cross-company workflows through the same not-found/not-configured error path. Preserve those indistinguishable failure messages so public callers cannot use an API key from one company to probe records that belong to another company.

## Webhook Delivery Model

`convex/schema.ts` defines `webhookDeliveries` for outbound callback attempts. Rows include company id, event type, destination URL, status, source type/id, request preview, response preview, attempt count, max attempts, next-attempt time, last status/error, delivery time, and timestamps.

`convex/webhookDeliveries.ts` currently exposes internal persistence and dispatch helpers, including `getInternal`, `recordQueuedInternal`, `queueDispatchInternal` and `recordAttemptInternal`. The previous public list/summary monitor described here was not found in the current module. The module itself records that no product destination configuration or normal producer is connected. A non-test backend search found declarations, but no normal callers of queue creation. Preserve that distinction: an internal engine is not an available customer subscription feature.

## Dispatch And Retry

`convex/webhookDeliveryActions.ts` performs outbound delivery in Node:

- sets JSON content type and `Hakken-Webhook-Dispatcher/1.0` user agent
- ignores unsafe caller-supplied `Host` and `Content-Length` headers
- records `DELIVERING` before the outbound request
- records `SUCCESS` for 2xx responses
- records `RETRY_SCHEDULED` with exponential backoff for failed attempts before max attempts
- records `ABANDONED` after the final failed attempt
- stores short response/error previews

Retry delay starts at 60 seconds and caps at 15 minutes. The default maximum attempts is five, and the implementation accepts one to twenty attempts.

## Tests

Current coverage includes:

- `convex/apiKeys.test.ts` for key creation, tenant scoping, scope enforcement, revocation, digest authentication, and rate limiting
- `convex/agentRuns.test.ts` for public agent trigger creation, version snapshot attachment, and cross-company agent rejection
- `convex/workflows.test.ts` for public workflow trigger creation, webhook company scoping, and direct workflow webhook payload limits
- `convex/webhookDeliveries.test.ts` for listing, summaries, status transitions, validation, dispatch success, retry scheduling, and abandonment
- `src/app/(dashboard)/admin/settings/api-keys/page.test.tsx` for API key UI behavior

When changing public endpoints, update authentication tests, run-trigger tests, and handler tests together. When changing delivery status semantics, update the Convex delivery tests and any newly authorized consuming surface.

## Maintenance Notes

Keep runtime model and workflow choices resolved through stored configuration in the downstream agent/workflow systems. Public API handlers should validate request shape and company scope, then delegate to internal run creation helpers rather than duplicating runtime logic.

Do not store raw API keys or full long-lived payload bodies. The current design intentionally stores digests, prefixes, request metadata, and previews so operators can debug integrations without turning the database into a secret or payload archive.

## Admission Logging, Body Bounds And Status Coverage

`PUBLIC_API_MAX_BODY_BYTES` is 128 KiB. The shared bounded request reader handles streamed bodies before JSON parsing and returns the API-specific 413 or 400 response. Authentication runs first in each handler, so an admitted key's malformed or invalid business request still creates an AUTHORIZED request row and consumes rate allowance. The row's stored statusCode of 200 is authentication evidence, not a record of the final trigger response code or downstream success.

`authenticatePublicRequest` hashes a bearer secret and compares its digest after a prefix lookup. It checks active status, expiry and required scope, then counts only AUTHORIZED rows in a rolling minute through `by_api_key_status_requested`. Refusals cannot evict accepted rows and reopen capacity. The default per-minute limit is sixty and the maximum six hundred. Refused request persistence is capped per matched key/status, with unknown keys sharing a bucket; the refusal audit uses a separate limit of five per fifteen minutes. First accepted use emits `API_KEY_FIRST_USED`, and later accepted calls update usage time without repeating that audit event.

`getPublicRunStatusInternal` reads `agentRuns` only and compares exact company ownership before returning a run summary and bounded counts of steps, approvals and tool calls. It is not a workflow execution status API. The workflow trigger returns an `executionId` without `statusUrl`; do not synthesize a URL for it using the agent-only endpoint. Polling status consumes normal key admission capacity. The inspected POST handlers accept no deduplication identifier, so retries can create additional work rather than retrieve the original run.

The public agent helper trims and limits objective text to four thousand characters, rejects inactive/cross-company agents, snapshots the version and schedules runtime execution after inserting QUEUED. The workflow helper requires active WEBHOOK configuration and exact company ownership, limits serialized input to twenty thousand characters, creates an execution under the workflow creator and schedules startup. A response is source evidence of accepted scheduling, not delivery of a resulting external effect.

The direct workflow webhook is a separate route using a workflow id query parameter and `x-hakken-secret`. It refuses an absent stored secret, authenticates through constant-time comparison, reads at most twenty thousand body bytes and reserves one of sixty workflow triggers per hour in its own mutation. A refusal supplies Retry-After and one audit record per exhausted window. API-key workflow admission does not call this direct-webhook reservation helper; the key's own request allowance applies there. Do not document one shared limit across the two routes.

## Outbound Signing, Retry And Unconnected Operations

`webhookSignatureService.ts` supplies `X-Hakken-Signature` and `X-Hakken-Timestamp`. When a non-empty secret is supplied, the signature is HMAC-SHA256 over `v1.<timestampSeconds>.<exactBody>` and is formatted `v1=<hex>`. The suggested replay allowance is three hundred seconds, enforced by the receiving service rather than by the dispatcher. Re-serializing the body before verification changes the signed input. Without a secret the helper returns no signature headers, so signing is optional in this current internal contract.

`dispatchInternal` skips missing or terminal SUCCESS/ABANDONED deliveries, records DELIVERING, and posts the supplied JSON. It does not claim an atomic exclusive delivery lease; concurrent dispatches are not demonstrated deduplicated. The action reads the entire response text before truncating its saved preview to two thousand characters. That saved preview cap is not a streamed response-read bound. The inspected fetch has no explicit timeout or redirect policy, and destination URL normalization is not evidence of a complete network destination safety policy. Report those limits if connecting a new producer requires application changes.

All non-2xx results and caught exceptions can schedule exponential retries beginning at sixty seconds and capped at fifteen minutes, until the configured attempt ceiling, then ABANDONED. This includes statuses such as client errors; it is not limited to transient server failures. Queueing a row without dispatch is distinct from scheduling it. Secrets and payload arguments can be passed through scheduled internal actions, so keep them out of audit previews and documentation. Retry scheduling is not a customer-facing monitor or automatic webhook registration.

`/apify-webhook` is still registered in `http.ts`. It checks `X-Apify-Secret` against `APIFY_WEBHOOK_SECRET` before reading bounded JSON, then delegates successful dataset handling or run status updates. That residual property-related receiver does not establish a current routed property product. Other current HTTP registrations include uploads, collection pingback, voice/telephony, OAuth, email unsubscribe/Resend and Telegram; their domain behavior belongs with those feature guides rather than being implied complete here.

The older unused `webhook:deliver` scope remains accepted in the backend validator and readable on historical keys, while the editor offers only the three active scopes and no endpoint checks that historical scope. API creation/revocation uses admin mutation guards and company checks; list uses admin read guards. Backend availability does not grant company admins platform-Admin navigation. The editor's one-year initial expiry is a UI default, while backend expiry remains optional and must be future-dated when supplied.

API request and webhook-delivery rows default to ninety-day unified retention, subject to saved configuration. Local code/tests do not prove external receiver cutover or live delivery. The inspected current protocol uses Hakken identifiers; PRODUCT.md section 33's external rename debt remains an acceptance concern. This review made no request, key change, dispatch, provider call or test execution. The prior plan is historical intent; current handler code defines the behavior described here.
