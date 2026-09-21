# Public API And Webhooks

Hakken includes tenant-scoped API keys, public run-trigger endpoints, public run-status lookup, and webhook delivery monitoring. These features are intended for governed integrations rather than everyday chat use.

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

Webhook deliveries have no listing screen. The delivery engine — queueing, dispatch, retry backoff and per-attempt recording — is built and works, but nothing queues a delivery and there is nowhere in the product to register a destination URL, so the log could never contain anything. The screen was removed rather than left showing an empty log of an event that cannot happen. To make webhooks real: give a company somewhere to store a destination, and call `recordQueuedInternal` when a run finishes.

## Operating Guidance

Use narrow scopes and rotate keys deliberately. For production integrations:

- create a separate key per external system
- set only the scopes the system needs
- use an expiration when the integration is temporary
- keep the one-time secret in the external system's secret manager
- revoke keys instead of sharing or reusing them across environments
- monitor public request logs and webhook delivery status after launch

For webhook incidents, start with failed, abandoned, and retry-scheduled deliveries. Check the destination URL, last HTTP status, last error, attempt count, and next retry time before increasing integration volume.
