# Public API And Webhooks

The public integration surface is implemented by `convex/apiKeys.ts`, `convex/publicApi.ts`, `convex/http.ts`, `convex/webhookDeliveries.ts`, `convex/webhookDeliveryActions.ts`, and the admin settings pages for API keys and webhook delivery monitoring.

## Route Map

Admin UI:

- `src/app/(dashboard)/admin/settings/api-keys/page.tsx` creates, lists, filters, and revokes tenant-scoped API keys.
- `src/app/(dashboard)/admin/settings/webhook-deliveries/page.tsx` lists delivery attempts, filters by company/status, and shows a seven-day summary.

Convex HTTP routes in `convex/http.ts`:

- `GET /api/public/v1/ping`
- `GET /api/public/v1/run-status`
- `POST /api/public/v1/agent-runs`
- `POST /api/public/v1/workflow-runs`
- `POST /api/webhooks/workflow`
- `POST /apify-webhook`

This document focuses on the public API key flow and the webhook delivery monitor. The workflow webhook endpoint is part of workflow automation, and the Apify webhook supports property research ingestion.

## API Key Model

`convex/schema.ts` defines `apiKeys` and `publicApiRequests`. API keys store company id, name, key prefix, SHA-256 digest, scopes, status, rate limit, creator, creation time, last-used time, optional expiration, and revocation metadata.

The raw secret is generated in `buildOneTimeApiKey` and returned only from `api.apiKeys.create`. The stored prefix supports lookup, and the digest is checked with constant-time comparison during authentication.

Supported scopes are:

- `agent:run`
- `workflow:run`
- `run:read`
- `webhook:deliver`

`create` and `revoke` require admin access. Super admins must choose a target company for tenant-scoped keys. Company admins are restricted to their active company. Both creation and revocation write audit log rows.

## Public Request Authentication

`internal.apiKeys.authenticatePublicRequest` is the gate for public endpoints. It:

- extracts and validates the `sonae_...` key prefix
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
- `handlePublicRunStatus` requires `run:read`, requires a `runId` query parameter, and reads a company-scoped run status via `internal.agentRuns.getPublicRunStatusInternal`.
- `handlePublicAgentRunTrigger` requires `agent:run`, parses JSON, requires `agentId` and `objective`, and creates a company-scoped agent run through `internal.agentRuns.createPublicAgentRunInternal`.
- `handlePublicWorkflowRunTrigger` requires `workflow:run`, parses JSON, requires `workflowId`, stringifies object `initialInput`, and creates a company-scoped workflow run through `internal.workflows.createPublicWorkflowRunInternal`.

Handlers return `{ ok: false, error }` with appropriate HTTP status codes for auth, scope, rate-limit, parse, and validation failures. Successful run triggers return `202`.

## Webhook Delivery Model

`convex/schema.ts` defines `webhookDeliveries` for outbound callback attempts. Rows include company id, event type, destination URL, status, source type/id, request preview, response preview, attempt count, max attempts, next-attempt time, last status/error, delivery time, and timestamps.

`convex/webhookDeliveries.ts` provides:

- `list` with admin authorization, company filtering, status filtering, pagination, and company-name enrichment
- `getSummary` for a bounded recent summary with next-action text
- `recordQueuedInternal` for recording queued delivery rows without dispatch
- `queueDispatchInternal` for recording and scheduling an immediate dispatch
- `recordAttemptInternal` for state transitions after each dispatch attempt

Company admins are restricted to their active company. Super admins can inspect all companies when no company filter is supplied.

## Dispatch And Retry

`convex/webhookDeliveryActions.ts` performs outbound delivery in Node:

- sets JSON content type and `Sonae-Webhook-Dispatcher/1.0` user agent
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
- `convex/webhookDeliveries.test.ts` for listing, summaries, status transitions, validation, dispatch success, retry scheduling, and abandonment
- `src/app/(dashboard)/admin/settings/api-keys/page.test.tsx` for API key UI behavior
- `src/app/(dashboard)/admin/settings/webhook-deliveries/page.test.tsx` for delivery monitor rendering

When changing public endpoints, update authentication tests and handler tests together. When changing delivery status semantics, update both the Convex delivery tests and the admin page expectations.

## Maintenance Notes

Keep runtime model and workflow choices resolved through stored configuration in the downstream agent/workflow systems. Public API handlers should validate request shape and company scope, then delegate to internal run creation helpers rather than duplicating runtime logic.

Do not store raw API keys or full long-lived payload bodies. The current design intentionally stores digests, prefixes, request metadata, and previews so operators can debug integrations without turning the database into a secret or payload archive.
