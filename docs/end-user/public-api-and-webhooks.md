---
product: Hakken
documentation_type: User guide
feature_area: public API keys, run triggers and webhook foundations
audience: integration owners, developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/public-api-and-webhooks.md
last_reviewed: '2026-10-26T10:39:47+00:00'
reviewed_against: current implementation
status: Current
---
# Public API And Webhooks

> **Product:** Hakken · **Document type:** User guide · **Feature area:** Public API keys, run triggers and webhook foundations
> **Reviewed:** 26 October 2026, 10:39:47 GMT (Europe/London)
> **Source path:** `docs/end-user/public-api-and-webhooks.md` · **Status:** Current

Hakken includes tenant-scoped API keys, public run-trigger endpoints, public run-status lookup, and an internal outbound webhook foundation. These features are intended for governed integrations rather than everyday chat use.

## API Keys

Admins manage API keys from `/admin/settings/api-keys`. A key belongs to a company, has one or more scopes, can expire, and has a per-minute rate limit. Raw key secrets are shown once at creation time. After creation, Hakken stores only a digest and key prefix.

Available scopes are:

- `agent:run` for triggering governed agent runs
- `workflow:run` for triggering governed workflow executions
- `run:read` for reading public run status

API keys can be revoked with an optional reason. Revoked and expired keys stop authenticating immediately.

## Public Endpoints

Public API requests use bearer authentication:

```text
Authorization: Bearer hakken_...
```

Current public endpoints are:

- `GET /api/public/v1/ping`: validates a key with `run:read` and returns company, key prefix, scopes, and rate-limit information.
- `GET /api/public/v1/run-status?runId=...`: validates `run:read` and returns the visible run summary for a run that belongs to the key's company, including status, trigger type, timing, token/cost fields when available, output/error previews, and counts for steps, approvals, and tool calls.
- `POST /api/public/v1/agent-runs`: validates `agent:run` and creates a public agent run from `agentId` and `objective`. The objective is trimmed and must stay within 4,000 characters. Successful responses include the queued run id, status, and a status URL for polling.
- `POST /api/public/v1/workflow-runs`: validates `workflow:run` and creates a public workflow execution from `workflowId` and optional `initialInput`. Object input is stringified before execution, and the final input must stay within 20,000 characters.

Successful run-trigger requests return `202 Accepted`. Invalid JSON, missing required fields, inaccessible runs, revoked keys, missing scopes, expired keys, and rate-limited requests return structured JSON errors.

Public run triggers can only target records owned by the API key's company. A key cannot trigger another company's agent or webhook workflow, even if the caller knows an id. Cross-company targets are reported like missing or inactive records so integrations should treat them as configuration errors, not as evidence that the id exists elsewhere.

Workflow run triggers require the target workflow to be active and configured as `WEBHOOK`. Use the workflow builder's direct webhook endpoint when an external system needs the workflow-specific `x-hakken-secret` flow; use the public API endpoint when the integration should authenticate with a tenant API key and `workflow:run` scope.

## Rate Limits And Audit Trail

Each key has a rate limit, defaulting to 60 requests per minute and capped at 600 requests per minute. Hakken counts recent authorized requests for that key before allowing another request. Public API authentication attempts are logged so operators can inspect allowed, denied, forbidden, and rate-limited usage.

API key creation and revocation are also recorded in audit logs.

## Webhook Deliveries

Webhook deliveries have no listing screen. The repository contains an internal delivery engine for queueing, dispatch, retry backoff and per-attempt recording; live operation was not verified, but nothing queues a delivery and there is nowhere in the product to register a destination URL, so the log could never contain anything. The screen was removed rather than left showing an empty log of an event that cannot happen. To make webhooks real: give a company somewhere to store a destination, and call `recordQueuedInternal` when a run finishes.

## Operating Guidance

Use narrow scopes and rotate keys deliberately. For production integrations:

- create a separate key per external system
- set only the scopes the system needs
- use an expiration when the integration is temporary
- keep the one-time secret in the external system's secret manager
- revoke keys instead of sharing or reusing them across environments
- review authorized request and run evidence after launch; there is no current outbound delivery monitor

An operator investigating internal delivery records can distinguish failed attempts, retry scheduling and abandonment. The product does not currently offer a destination-registration or delivery-monitor screen. Do not send a customer to a screen that is absent.

## Choose The Right Integration Path

The API-key flow creates work inside the key's company. It is useful when a trusted external system should ask an existing tenant-owned agent or webhook workflow to run. It does not create a company, choose a different tenant dynamically, or expose a global assistant through a tenant key. The normal key editor is a platform Admin settings route. Backend key management supports company-scoped admin checks, but that is not evidence that company admins can enter platform Admin; arrange configuration with the authorized platform operator.

The editor initially selects agent execution and run reading, opens the request limit at sixty per minute, and suggests an expiry about a year ahead. These are form defaults rather than a guarantee that every existing key has them. A super admin chooses the company deliberately. Give the key a useful name so its prefix, purpose and eventual revocation can be understood without storing the secret in an audit note.

A key can carry workflow execution permission without receiving a public workflow status endpoint. The current `run-status` endpoint reads agent runs only. An agent trigger returns a run id and polling URL; a workflow trigger returns an execution id and status but no equivalent public polling URL. Do not put a workflow execution id into the agent run-status address and expect a workflow result. Use the authorized workflow execution screen or agree a separate integration design if an external system needs completion evidence.

## Accepted Does Not Mean Completed

A successful trigger responds with HTTP 202. For agents, that means the run row was queued and a background runtime step scheduled. For workflows, it means an execution row exists and startup was scheduled; a RUNNING response is not a proof that every step finished. The downstream system can still wait for approval, encounter missing configuration or fail. Check the returned run/execution evidence before reporting a business outcome such as a sent email or completed external action.

Repeated trigger requests are not protected by a supplied idempotency key in this inspected API. If the client loses the response after a successful request, blindly posting again can create a second run. An integration owner needs to distinguish a deliberate new request from an uncertain prior result and keep the returned identifiers. Polling agent status also consumes the key's rate allowance, so do not poll in a tight loop or assume read-only requests are free of the request ceiling.

POST bodies are bounded at 128 KiB before JSON is accepted. The shorter feature-specific character limits still apply: four thousand characters for an agent objective and twenty thousand for the resulting workflow input. Workflow JSON values other than strings are serialized to text before the runtime receives them. The raw webhook workflow path uses a different body limit and secret, so payloads that work through one route are not guaranteed accepted through the other.

## Errors, Revocation And Evidence

Authentication failures return 401, a missing scope returns 403, and exceeding the key allowance returns 429. Invalid JSON and required-field failures return 400; an oversized public API body returns 413. A key can authenticate successfully and still fail to create a run because the selected target is missing, inactive, owned elsewhere or unsuitable for public execution. Hakken deliberately does not reveal whether an inaccessible id exists in another company.

The request allowance counts accepted authentication events before payload parsing and business validation. An invalid objective after successful authentication still spends an allowance slot. The request log's AUTHORIZED state therefore means the key was admitted, not that a model completed work or that the final HTTP handler necessarily returned success. Refused-request evidence is sampled to avoid unlimited log growth, so a list of refusals is not a complete count of every attempted request.

Revocation is permanent for that key record and repeated revocation returns the existing revoked state. It stops later authentication but does not cancel work already accepted before revocation. Replace a lost raw secret by creating a new key and revoking the old one through the authorized owner. The digest and prefix stored by Hakken cannot be used to recover the original secret. API-request history and delivery history have their own retention; they are not permanent archives simply because a key remains listed.

## Webhook Readiness And Rename Cutover

The direct workflow webhook accepts a workflow id and `x-hakken-secret` header, rather than a bearer key. It has its own allowance of sixty admitted triggers per workflow per hour and responds with Retry-After when exhausted. A secret in the URL is not accepted as an alternative. This path is incoming automation, separate from outbound callbacks and from provider-specific phone, email or collection webhooks.

The internal outbound dispatcher can optionally sign a payload with Hakken signature and timestamp headers, but absent signing configuration means an unsigned dispatch. Source support does not establish that a customer destination exists or that any completed run currently queues a callback. No normal producer calling the queue functions was found in the inspected non-test backend. Do not promise automatic completion callbacks or a working delivery subscription based on those helper functions alone.

PRODUCT.md section 33 records accepted rename cutover issues for external receivers and protocol names. A receiver still expecting old headers, metadata or deployment addresses needs its own coordinated acceptance work. This documentation pass read handlers, key management, workflow admission and dispatch code; it did not issue a key, make an HTTP request, contact a receiver or establish deployed provider acceptance. Share current [developer integration details](../developer/public-api-and-webhooks.md) with the responsible engineer and keep live validation separate from source review.
